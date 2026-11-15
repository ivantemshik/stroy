// Копия сайта на доммира.рф шлёт формы на сервер Vercel: разрешены только адреса из SITE_ORIGINS
// и только открытые адреса сайта. Админка принимает запросы лишь со своего домена.
import {test} from 'node:test';
import assert from 'node:assert/strict';

process.env.SITE_ORIGINS = 'https://xn--80ahmpakr.xn--p1ai, https://www.xn--80ahmpakr.xn--p1ai/';
const {handle} = await import('../server/app.js');
const {assertSameOrigin} = await import('../server/http.js');

const SITE = 'https://xn--80ahmpakr.xn--p1ai';
const request = (path, {method = 'OPTIONS', origin, host = 'dom-mira.vercel.app'} = {}) =>
  new Request(`https://${host}${path}`, {method, headers: {...(origin ? {origin} : {}), host}});

test('предзапрос формы с доммира.рф получает разрешение CORS', async () => {
  const response = await handle(request('/api/leads', {origin: SITE}));
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), SITE);
  assert.match(response.headers.get('access-control-allow-methods'), /POST/);
  assert.match(response.headers.get('access-control-allow-headers'), /content-type/);
});

test('чужой сайт и адреса админки разрешения не получают', async () => {
  const foreign = await handle(request('/api/leads', {origin: 'https://evil.example'}));
  assert.equal(foreign.status, 403);
  assert.equal(foreign.headers.get('access-control-allow-origin'), null);
  const admin = await handle(request('/api/admin/login', {origin: SITE}));
  assert.equal(admin.status, 403);
  assert.equal(admin.headers.get('access-control-allow-origin'), null);
});

test('проверка источника: форме можно с доммира.рф, админке нельзя', () => {
  const fromCopy = request('/api/leads', {method: 'POST', origin: SITE});
  assert.doesNotThrow(() => assertSameOrigin(fromCopy, {allowSite: true}));
  assert.throws(() => assertSameOrigin(fromCopy), /чужого сайта/);
  const fromWww = request('/api/leads', {method: 'POST', origin: 'https://www.xn--80ahmpakr.xn--p1ai'});
  assert.doesNotThrow(() => assertSameOrigin(fromWww, {allowSite: true}));
  const own = request('/api/admin/login', {method: 'POST', origin: 'https://dom-mira.vercel.app'});
  assert.doesNotThrow(() => assertSameOrigin(own));
  const foreign = request('/api/leads', {method: 'POST', origin: 'https://evil.example'});
  assert.throws(() => assertSameOrigin(foreign, {allowSite: true}), /чужого сайта/);
});
