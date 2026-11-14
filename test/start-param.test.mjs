import {test} from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ||= 'postgres://user:pass@localhost:5432/none';
const {parseStartParam} = await import('../server/client-bot.js');

test('ссылка с сайта: страница и ClientID', () => {
  assert.deepEqual(parseStartParam('s_otdelka_1731234567123456789'), {source: 'site', landing: '/otdelka/', clientId: '1731234567123456789'});
  assert.deepEqual(parseStartParam('s_home'), {source: 'site', landing: '/', clientId: null});
});

test('рекламная метка и пустой старт', () => {
  assert.deepEqual(parseStartParam('ad_vk_nov'), {source: 'ad_vk_nov'});
  assert.deepEqual(parseStartParam(''), {source: 'telegram'});
  assert.deepEqual(parseStartParam('<script>'), {source: 'script'});
});
