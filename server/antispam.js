// Защита форм без внешних капч: браузер решает небольшую задачу (перебор числа по SHA-256),
// сервер проверяет подпись, срок и одноразовость. Плюс скрытое поле и минимальное время заполнения.
import {createHash, createHmac, randomBytes, randomInt} from 'node:crypto';
import {db} from './db.js';
import {config} from './env.js';
import {json, safeEqual} from './http.js';

const MAX_NUMBER = 60000;
const TTL_SECONDS = 20 * 60;

const sha256 = value => createHash('sha256').update(value).digest('hex');
const hmac = value => createHmac('sha256', config.powSecret).update(value).digest('hex');

export function createChallenge() {
  const salt = `${randomBytes(12).toString('hex')}?expires=${Math.floor(Date.now() / 1000) + TTL_SECONDS}`;
  const number = randomInt(0, MAX_NUMBER);
  const challenge = sha256(`${salt}${number}`);
  return {algorithm: 'SHA-256', challenge, salt, maxnumber: MAX_NUMBER, signature: hmac(challenge)};
}

export async function challengeRoute() {
  return json(createChallenge());
}

export async function verifyChallenge(payload) {
  if (!payload || typeof payload !== 'object') return 'нет решения задачи';
  const {challenge, salt, number, signature} = payload;
  if (typeof challenge !== 'string' || typeof salt !== 'string' || typeof signature !== 'string') return 'неполное решение';
  if (!safeEqual(signature, hmac(challenge))) return 'неверная подпись';
  const expires = Number(/expires=(\d+)/.exec(salt)?.[1] || 0);
  if (!expires || expires * 1000 < Date.now()) return 'задача устарела';
  if (!Number.isInteger(number) || number < 0 || number > MAX_NUMBER) return 'неверное число';
  if (sha256(`${salt}${number}`) !== challenge) return 'неверное решение';
  const sql = db();
  const inserted = await sql`insert into pow_used (challenge, expires_at) values (${challenge}, to_timestamp(${expires}))
    on conflict do nothing returning challenge`;
  if (!inserted.length) return 'решение уже использовано';
  return null;
}

export function honeypotTriggered(body) {
  return Boolean(String(body?.website || body?.company_site || '').trim());
}

export function tooFast(body, minMs = 2500) {
  const started = Number(body?.started_at || 0);
  if (!started) return false;
  return Date.now() - started < minMs;
}
