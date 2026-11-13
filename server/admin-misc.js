// Админка: пользователи, роли, настройки, контент сайта, база знаний, журнал.
import {db} from './db.js';
import {HttpError, json, readJson, clientIp, hashIp} from './http.js';
import {requireUser} from './auth.js';
import {audit, hashPassword, validatePasswordStrength, randomToken} from './security.js';
import {PERMISSIONS, LEAD_STATUSES, SERVICES} from './permissions.js';
import {allSettings, setSetting, DEFAULT_SETTINGS} from './settings.js';
import {cleanLine, cleanText} from './validate.js';
import {config} from './env.js';
import {CONTENT_DEFAULTS} from './content-defaults.js';
import {pushToCrm, crmUrlProblem} from './crm.js';

// ---------- Пользователи и роли ----------

// Кто не владелец, выдаёт только те права, что есть у него самого, и не трогает системные роли
// и свою собственную роль. Иначе администратор мог бы добавить себе право на резервные копии
// и через него получить роль владельца.
const isOwner = user => user?.role === 'owner';
function assertGrantable(actor, permissions) {
  if (isOwner(actor)) return;
  const extra = permissions.filter(p => !actor.permissions.includes(p));
  if (extra.length) throw new HttpError(403, `Нельзя выдать права, которых нет у вас: ${extra.map(p => PERMISSIONS[p] || p).join(', ')}`);
}

export async function listUsers({request}) {
  await requireUser(request, ['users.manage', 'leads.assign', 'leads.view_all']);
  const users = await db()`select u.id, u.login, u.name, u.email, u.role_id, r.name as role_name, r.key as role_key, u.is_active,
      u.tg_username, (u.tg_chat_id is not null) as tg_linked, u.notify_new_leads, u.last_login_at, u.created_at
    from users u join roles r on r.id = u.role_id order by u.is_active desc, u.name`;
  const roles = await db()`select * from roles order by id`;
  return json({users, roles, permissions: PERMISSIONS});
}

export async function createUser({request}) {
  const actor = await requireUser(request, 'users.manage');
  const body = await readJson(request);
  const login = cleanLine(body.login, 40).toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(login)) throw new HttpError(400, 'Логин: латиница, цифры, точка, дефис, от 3 символов');
  const name = cleanLine(body.name, 80);
  if (!name) throw new HttpError(400, 'Укажите имя');
  const password = body.password || `${randomToken(9)}7a`;
  const problem = validatePasswordStrength(password);
  if (problem) throw new HttpError(400, problem);
  const sql = db();
  const [role] = await sql`select id, key, permissions from roles where id = ${Number(body.role_id)}`;
  if (!role) throw new HttpError(400, 'Выберите роль');
  if (role.key === 'owner' && !isOwner(actor)) throw new HttpError(403, 'Владельца может добавить только владелец');
  assertGrantable(actor, role.permissions);
  const [exists] = await sql`select id from users where login = ${login}`;
  if (exists) throw new HttpError(409, 'Такой логин уже есть');
  const [user] = await sql`insert into users (login, name, email, role_id, password_hash)
    values (${login}, ${name}, ${cleanLine(body.email, 120) || null}, ${role.id}, ${await hashPassword(password)}) returning id`;
  await audit({userId: actor.id, ipHash: hashIp(clientIp(request)), action: 'user_create', entity: 'user', entityId: user.id, details: {login, role: role.key}});
  return json({id: user.id, password: body.password ? undefined : password});
}

export async function updateUser({request, params}) {
  const actor = await requireUser(request, 'users.manage');
  const id = Number(params.id);
  const body = await readJson(request);
  const sql = db();
  const [target] = await sql`select u.id, r.key as role from users u join roles r on r.id = u.role_id where u.id = ${id}`;
  if (!target) throw new HttpError(404, 'Пользователь не найден');
  if (target.role === 'owner' && actor.role !== 'owner') throw new HttpError(403, 'Владельца меняет только владелец');
  const patch = {};
  if (body.name !== undefined) patch.name = cleanLine(body.name, 80);
  if (body.email !== undefined) patch.email = cleanLine(body.email, 120) || null;
  if (body.role_id !== undefined) {
    const [role] = await sql`select id, key, permissions from roles where id = ${Number(body.role_id)}`;
    if (!role) throw new HttpError(400, 'Нет такой роли');
    if (role.key === 'owner' && !isOwner(actor)) throw new HttpError(403, 'Назначить владельца может только владелец');
    assertGrantable(actor, role.permissions);
    if (id === actor.id && role.key !== actor.role) throw new HttpError(400, 'Нельзя поменять роль самому себе');
    patch.role_id = role.id;
  }
  if (body.is_active !== undefined) {
    if (id === actor.id && !body.is_active) throw new HttpError(400, 'Нельзя отключить самого себя');
    patch.is_active = Boolean(body.is_active);
  }
  if (body.notify_new_leads !== undefined) patch.notify_new_leads = Boolean(body.notify_new_leads);
  let newPassword;
  if (body.reset_password) {
    newPassword = `${randomToken(9)}7a`;
    patch.password_hash = await hashPassword(newPassword);
    patch.password_changed_at = new Date();
  }
  if (body.unlink_telegram) { patch.tg_chat_id = null; patch.tg_username = null; }
  if (!Object.keys(patch).length) return json({ok: true});
  await sql`update users set ${sql(patch)} where id = ${id}`;
  if (patch.is_active === false || newPassword) await sql`delete from sessions where user_id = ${id}`;
  if (patch.is_active === false) await sql`delete from link_tokens where user_id = ${id}`;
  const {password_hash, ...logged} = patch;
  await audit({userId: actor.id, ipHash: hashIp(clientIp(request)), action: 'user_update', entity: 'user', entityId: id, details: {...logged, reset_password: Boolean(newPassword)}});
  return json({ok: true, password: newPassword});
}

export async function updateRole({request, params}) {
  const actor = await requireUser(request, 'users.manage');
  const body = await readJson(request);
  const permissions = (Array.isArray(body.permissions) ? body.permissions : []).filter(p => p in PERMISSIONS);
  const sql = db();
  const [role] = await sql`select * from roles where id = ${Number(params.id)}`;
  if (!role) throw new HttpError(404, 'Роль не найдена');
  if (role.key === 'owner') throw new HttpError(400, 'Права владельца не меняются');
  if (!isOwner(actor) && (role.key === 'admin' || role.id === actor.role_id)) throw new HttpError(403, 'Эту роль может менять только владелец');
  assertGrantable(actor, permissions);
  await sql`update roles set permissions = ${permissions}, name = ${cleanLine(body.name, 40) || role.name} where id = ${role.id}`;
  await audit({userId: actor.id, action: 'role_update', entity: 'role', entityId: role.id, details: {permissions}});
  return json({ok: true});
}

export async function createRole({request}) {
  const actor = await requireUser(request, 'users.manage');
  const body = await readJson(request);
  const name = cleanLine(body.name, 40);
  if (!name) throw new HttpError(400, 'Укажите название роли');
  const key = `custom_${randomToken(4).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  const permissions = (Array.isArray(body.permissions) ? body.permissions : []).filter(p => p in PERMISSIONS);
  assertGrantable(actor, permissions);
  const [role] = await db()`insert into roles (key, name, permissions) values (${key}, ${name}, ${permissions}) returning id`;
  await audit({userId: actor.id, action: 'role_create', entity: 'role', entityId: role.id, details: {name, permissions}});
  return json({id: role.id});
}

// Код для привязки Telegram: ссылка на админ-бот с одноразовым токеном.
export async function telegramLinkCode({request}) {
  const user = await requireUser(request);
  const token = randomToken(12).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
  await db()`insert into link_tokens (token, user_id, purpose, expires_at) values (${token}, ${user.id}, 'link_user', now() + interval '30 minutes')`;
  return json({url: `https://t.me/${config.telegram.adminUsername}?start=link_${token}`, expires_in: 1800});
}

export async function groupBindCode({request}) {
  const user = await requireUser(request, 'settings.manage');
  const token = randomToken(9).replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
  await db()`insert into link_tokens (token, user_id, purpose, expires_at) values (${token}, ${user.id}, 'bind_group', now() + interval '30 minutes')`;
  return json({command: `/bind ${token}`, bot: config.telegram.adminUsername, expires_in: 1800});
}

// ---------- Настройки ----------

const EDITABLE_SETTINGS = new Set(Object.keys(DEFAULT_SETTINGS));

export async function getSettings({request}) {
  const user = await requireUser(request, ['settings.manage', 'ai.manage']);
  const values = await allSettings({fresh: true});
  const {['feeds.token']: _token, ['feeds.leads_token']: _leadsToken, ...safe} = values;
  // Полный адрес вебхука CRM (в нём ключ доступа) видит только тот, кто управляет интеграциями.
  if (!user.permissions.includes('settings.manage') && safe['crm.webhook_url']) {
    try { safe['crm.webhook_url'] = `https://${new URL(safe['crm.webhook_url']).hostname}/…`; } catch { safe['crm.webhook_url'] = 'задан'; }
  }
  return json({
    settings: safe,
    statuses: LEAD_STATUSES,
    services: SERVICES,
    integrations: {
      admin_bot: Boolean(config.telegram.adminToken), client_bot: Boolean(config.telegram.clientToken),
      metrika_counter: config.metrika.counterId || null, metrika_token: Boolean(config.metrika.token),
      ai: {
        groq: Boolean(config.ai.groqKey), openrouter: Boolean(config.ai.openrouterKey), cerebras: Boolean(config.ai.cerebrasKey),
        gemini: Boolean(config.ai.geminiKey), mistral: Boolean(config.ai.mistralKey), yandex: Boolean(config.ai.yandexKey && config.ai.yandexFolder)
      }
    }
  });
}

export async function saveSettings({request}) {
  const user = await requireUser(request, ['settings.manage', 'ai.manage']);
  const body = await readJson(request);
  const changed = [];
  for (const [key, value] of Object.entries(body.settings || {})) {
    if (!EDITABLE_SETTINGS.has(key)) continue;
    if (key.startsWith('ai.') && !user.permissions.includes('ai.manage')) continue;
    if (!key.startsWith('ai.') && !user.permissions.includes('settings.manage')) continue;
    if (key === 'crm.webhook_url' && value) { const problem = crmUrlProblem(value); if (problem) throw new HttpError(400, problem); }
    await setSetting(key, value, user.id);
    changed.push(key);
  }
  await audit({userId: user.id, action: 'settings_update', details: {keys: changed}});
  return json({ok: true, changed});
}

export async function testCrm({request}) {
  await requireUser(request, 'settings.manage');
  const result = await pushToCrm({
    id: 0, created_at: new Date(), channel: 'manual', service: 'construction', name: 'Тестовая заявка', phone: '+70000000000',
    message: 'Проверка интеграции из админки', details: {}, page: '/admin/'
  }, {force: true});
  return json(result);
}

// ---------- Контент сайта ----------

export async function publicContent() {
  const rows = await db()`select key, value from content_blocks`;
  const content = {...CONTENT_DEFAULTS};
  for (const row of rows) content[row.key] = row.value;
  return json(content, 200, {'cache-control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=600'});
}

export async function adminContent({request}) {
  await requireUser(request, 'content.edit');
  const rows = await db()`select key, value, updated_at from content_blocks`;
  const saved = Object.fromEntries(rows.map(row => [row.key, row.value]));
  return json({content: {...CONTENT_DEFAULTS, ...saved}, defaults: CONTENT_DEFAULTS, updated: Object.fromEntries(rows.map(r => [r.key, r.updated_at]))});
}

export async function saveContent({request}) {
  const user = await requireUser(request, 'content.edit');
  const body = await readJson(request, 256 * 1024);
  const sql = db();
  const changed = [];
  for (const [key, value] of Object.entries(body.content || {})) {
    if (!(key in CONTENT_DEFAULTS)) continue;
    const normalized = sanitizeContent(value, CONTENT_DEFAULTS[key]);
    await sql`insert into content_blocks (key, value, updated_by) values (${key}, ${sql.json(normalized)}, ${user.id})
      on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`;
    changed.push(key);
  }
  if (body.reset) {
    for (const key of [].concat(body.reset)) await sql`delete from content_blocks where key = ${key}`;
  }
  await audit({userId: user.id, action: 'content_update', details: {keys: changed, reset: body.reset || null}});
  return json({ok: true, changed});
}

// Контент хранится как текст или массивы объектов из текста: HTML не принимается.
function sanitizeContent(value, sample) {
  if (typeof sample === 'string') return cleanText(value, 3000);
  if (Array.isArray(sample)) {
    const shape = sample[0] || {};
    return (Array.isArray(value) ? value : []).slice(0, 60).map(item => {
      if (typeof shape === 'string') return cleanText(item, 600);
      const out = {};
      for (const field of Object.keys(shape)) out[field] = cleanText(item?.[field], 1500);
      return out;
    });
  }
  if (sample && typeof sample === 'object') {
    const out = {};
    for (const field of Object.keys(sample)) out[field] = cleanText(value?.[field], 1500);
    return out;
  }
  return cleanText(value, 1000);
}

// ---------- База знаний ИИ ----------

export async function listKb({request}) {
  await requireUser(request, ['kb.edit', 'ai.manage']);
  const items = await db()`select k.*, u.name as updated_by_name from kb_articles k left join users u on u.id = k.updated_by order by k.sort, k.id`;
  return json({items});
}

export async function saveKb({request, params}) {
  const user = await requireUser(request, 'kb.edit');
  const body = await readJson(request, 128 * 1024);
  const title = cleanLine(body.title, 160);
  const text = cleanText(body.body, 20000);
  if (!title || !text) throw new HttpError(400, 'Нужны заголовок и текст');
  const tags = (Array.isArray(body.tags) ? body.tags : String(body.tags || '').split(',')).map(t => cleanLine(t, 30)).filter(Boolean).slice(0, 10);
  // Откуда взяты факты статьи: видят сотрудники, в модель не уходит.
  const note = cleanText(body.source_note, 1000) || null;
  const sql = db();
  let id = params.id ? Number(params.id) : null;
  if (id) {
    await sql`update kb_articles set title = ${title}, body = ${text}, tags = ${tags}, is_active = ${body.is_active !== false},
      sort = ${Number(body.sort) || 100}, source_note = ${note}, updated_at = now(), updated_by = ${user.id} where id = ${id}`;
  } else {
    [{id}] = await sql`insert into kb_articles (title, body, tags, is_active, sort, source_note, updated_by)
      values (${title}, ${text}, ${tags}, ${body.is_active !== false}, ${Number(body.sort) || 100}, ${note}, ${user.id}) returning id`;
  }
  await audit({userId: user.id, action: 'kb_save', entity: 'kb', entityId: id, details: {title}});
  return json({id});
}

export async function deleteKb({request, params}) {
  const user = await requireUser(request, 'kb.edit');
  await db()`delete from kb_articles where id = ${Number(params.id)}`;
  await audit({userId: user.id, action: 'kb_delete', entity: 'kb', entityId: params.id});
  return json({ok: true});
}

// ---------- Журнал действий ----------

export async function listAudit({request, url}) {
  await requireUser(request, 'audit.view');
  const page = Math.max(Number(url.searchParams.get('page')) || 1, 1);
  const action = cleanLine(url.searchParams.get('action'), 40);
  const sql = db();
  const where = action ? sql`a.action = ${action}` : sql`true`;
  const items = await sql`select a.id, a.created_at, a.action, a.entity, a.entity_id, a.details, a.actor, u.name as user_name
    from audit_log a left join users u on u.id = a.user_id where ${where} order by a.created_at desc limit 50 offset ${(page - 1) * 50}`;
  const actions = await sql`select distinct action from audit_log order by 1`;
  return json({items, page, actions: actions.map(a => a.action)});
}
