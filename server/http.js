import {createHash, createHmac, timingSafeEqual} from 'node:crypto';
import {config} from './env.js';

export class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const baseHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff'
};

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {status, headers: {...baseHeaders, ...headers}});
}

export function text(body, status = 200, headers = {}) {
  return new Response(body, {status, headers: {'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers}});
}

export async function readJson(request, limit = 64 * 1024) {
  const raw = await request.text();
  if (raw.length > limit) throw new HttpError(413, 'Слишком большой запрос');
  if (!raw) return {};
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') throw new Error('not object');
    return data;
  } catch {
    throw new HttpError(400, 'Некорректный JSON');
  }
}

export function clientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for') || '';
  return (forwarded.split(',')[0] || request.headers.get('x-real-ip') || '').trim() || '0.0.0.0';
}

export function hashIp(ip) {
  return createHash('sha256').update(`${config.ipHashSalt}:${ip}`).digest('hex').slice(0, 32);
}

export function parseCookies(request) {
  const header = request.headers.get('cookie') || '';
  const out = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    if (!key) continue;
    try { out[key] = decodeURIComponent(part.slice(index + 1).trim()); } catch { out[key] = part.slice(index + 1).trim(); }
  }
  return out;
}

export function serializeCookie(name, value, {maxAge, path = '/', httpOnly = true, sameSite = 'Lax', secure = true} = {}) {
  let cookie = `${name}=${encodeURIComponent(value)}; Path=${path}; SameSite=${sameSite}`;
  if (maxAge !== undefined) cookie += `; Max-Age=${maxAge}`;
  if (httpOnly) cookie += '; HttpOnly';
  if (secure) cookie += '; Secure';
  return cookie;
}

export function sign(value, secret = config.sessionSecret) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

// Проверка, что изменяющий запрос пришёл с нашего сайта (защита от CSRF вместе с SameSite cookie).
export function assertSameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return;
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  let originHost;
  try { originHost = new URL(origin).host; } catch { throw new HttpError(403, 'Запрос с чужого сайта'); }
  if (originHost !== host) throw new HttpError(403, 'Запрос с чужого сайта');
}
