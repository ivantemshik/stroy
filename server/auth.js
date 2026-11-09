import {db} from './db.js';
import {config} from './env.js';
import {HttpError, json, readJson, parseCookies, serializeCookie, sign, safeEqual, clientIp, hashIp, assertSameOrigin} from './http.js';
import {verifyPassword, hashPassword, randomToken, rateLimited, audit, validatePasswordStrength} from './security.js';

const COOKIE = 'dm_session';
const SESSION_DAYS = 14;
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

function sessionCookie(id, maxAge) {
  return serializeCookie(COOKIE, id ? `${id}.${sign(id)}` : '', {maxAge, secure: config.siteUrl.startsWith('https')});
}

export async function currentUser(request) {
  const raw = parseCookies(request)[COOKIE];
  if (!raw) return null;
  const [id, signature] = raw.split('.');
  if (!id || !signature || !safeEqual(signature, sign(id))) return null;
  const rows = await db()`
    select u.id, u.login, u.name, u.email, u.tg_chat_id, u.tg_username, u.notify_new_leads, u.is_active,
      r.key as role, r.name as role_name, r.permissions, s.id as session_id
    from sessions s join users u on u.id = s.user_id join roles r on r.id = u.role_id
    where s.id = ${id} and s.expires_at > now() and u.is_active`;
  return rows[0] || null;
}

// Достаёт пользователя и проверяет права. Изменяющие запросы дополнительно проверяют Origin.
export async function requireUser(request, permission) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    assertSameOrigin(request);
    if (request.headers.get('x-requested-with') !== 'dm-admin') throw new HttpError(403, 'Нет заголовка админки');
  }
  const user = await currentUser(request);
  if (!user) throw new HttpError(401, 'Нужно войти в админку');
  const required = Array.isArray(permission) ? permission : permission ? [permission] : [];
  if (required.length && !required.some(p => user.permissions.includes(p))) throw new HttpError(403, 'Недостаточно прав');
  return user;
}

export async function login({request}) {
  assertSameOrigin(request);
  const body = await readJson(request, 4096);
  const loginName = String(body.login || '').trim().toLowerCase().slice(0, 64);
  const password = String(body.password || '').slice(0, 200);
  const ipHash = hashIp(clientIp(request));
  if (!loginName || !password) throw new HttpError(400, 'Введите логин и пароль');
  if (await rateLimited(`login:${ipHash}`, {limit: 20, windowSeconds: 900})) throw new HttpError(429, 'Слишком много попыток. Подождите 15 минут');

  const sql = db();
  const [user] = await sql`select id, password_hash, failed_logins, locked_until, is_active from users where login = ${loginName}`;
  if (user?.locked_until && new Date(user.locked_until) > new Date()) {
    throw new HttpError(429, 'Вход временно заблокирован после неудачных попыток. Попробуйте позже');
  }
  const ok = user && user.is_active && await verifyPassword(password, user.password_hash);
  if (!ok) {
    if (user) {
      const failed = user.failed_logins + 1;
      await sql`update users set failed_logins = ${failed},
        locked_until = ${failed >= MAX_FAILED ? sql`now() + make_interval(mins => ${LOCK_MINUTES})` : null}
        where id = ${user.id}`;
    }
    await audit({actor: loginName, ipHash, action: 'login_failed'});
    throw new HttpError(401, 'Неверный логин или пароль');
  }
  const id = randomToken(32);
  await sql`insert into sessions (id, user_id, expires_at, ip_hash, user_agent)
    values (${id}, ${user.id}, now() + make_interval(days => ${SESSION_DAYS}), ${ipHash}, ${(request.headers.get('user-agent') || '').slice(0, 300)})`;
  await sql`update users set failed_logins = 0, locked_until = null, last_login_at = now() where id = ${user.id}`;
  await sql`delete from sessions where expires_at < now()`;
  await audit({userId: user.id, ipHash, action: 'login'});
  return json({ok: true}, 200, {'set-cookie': sessionCookie(id, SESSION_DAYS * 86400)});
}

export async function logout({request}) {
  const user = await currentUser(request);
  if (user) {
    await db()`delete from sessions where id = ${user.session_id}`;
    await audit({userId: user.id, action: 'logout'});
  }
  return json({ok: true}, 200, {'set-cookie': sessionCookie('', 0)});
}

export async function me({request}) {
  const user = await requireUser(request);
  const {session_id, ...safe} = user;
  return json({user: safe, bots: {admin: config.telegram.adminUsername, client: config.telegram.clientUsername}});
}

export async function changePassword({request}) {
  const user = await requireUser(request);
  const body = await readJson(request, 4096);
  const sql = db();
  const [row] = await sql`select password_hash from users where id = ${user.id}`;
  if (!await verifyPassword(String(body.current || ''), row.password_hash)) throw new HttpError(400, 'Текущий пароль указан неверно');
  const problem = validatePasswordStrength(body.next);
  if (problem) throw new HttpError(400, problem);
  await sql`update users set password_hash = ${await hashPassword(body.next)}, password_changed_at = now() where id = ${user.id}`;
  await sql`delete from sessions where user_id = ${user.id} and id <> ${user.session_id}`;
  await audit({userId: user.id, action: 'password_changed', entity: 'user', entityId: user.id});
  return json({ok: true});
}
