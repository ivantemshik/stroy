import {randomBytes, scrypt as scryptCb, timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {db} from './db.js';

const scrypt = promisify(scryptCb);
const KEY_LENGTH = 64;
const COST = {N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024};

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(String(password), salt, KEY_LENGTH, COST);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, saltB64, keyB64] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(String(password), Buffer.from(saltB64, 'base64'), expected.length, COST);
  return timingSafeEqual(key, expected);
}

export function randomToken(bytes = 24) {
  return randomBytes(bytes).toString('base64url');
}

export function validatePasswordStrength(password) {
  const value = String(password || '');
  if (value.length < 10) return 'Пароль должен быть не короче 10 символов';
  if (!/[a-zа-яё]/i.test(value) || !/\d/.test(value)) return 'Добавьте в пароль буквы и цифры';
  return null;
}

// Скользящее окно по ключу: true, если лимит превышен. Событие записывается всегда.
export async function rateLimited(key, {limit, windowSeconds}) {
  const sql = db();
  const [{count}] = await sql`
    select count(*)::int as count from rate_events
    where key = ${key} and at > now() - make_interval(secs => ${windowSeconds})`;
  await sql`insert into rate_events (key) values (${key})`;
  return count >= limit;
}

export async function audit({userId = null, actor = null, ipHash = null, action, entity = null, entityId = null, details = {}}) {
  try {
    await db()`insert into audit_log (user_id, actor, ip_hash, action, entity, entity_id, details)
      values (${userId}, ${actor}, ${ipHash}, ${action}, ${entity}, ${entityId === null ? null : String(entityId)}, ${db().json(details)})`;
  } catch (error) {
    console.error('audit failed', error);
  }
}
