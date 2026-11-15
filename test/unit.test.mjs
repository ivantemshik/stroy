import {test} from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync, strFromU8} from 'fflate';
import {normalizePhone, formatPhone, normalizeEmail, normalizeTelegram, spamScore, cleanDetails, cleanAttribution} from '../server/validate.js';
import {buildXlsx, toCsv} from '../server/xlsx.js';
import {parseJsonLoose} from '../server/ai/llm.js';
import {encrypt, decrypt} from '../server/backup.js';
import {lastWeekPeriod} from '../server/reports.js';

test('телефоны приводятся к +7', () => {
  assert.equal(normalizePhone('8 (916) 123-45-67'), '+79161234567');
  assert.equal(normalizePhone('+7 916 123 45 67'), '+79161234567');
  assert.equal(normalizePhone('9161234567'), '+79161234567');
  assert.equal(normalizePhone('+375 29 123 45 67'), '+375291234567');
  assert.equal(normalizePhone('12345'), null);
  assert.equal(normalizePhone(''), '');
  assert.equal(formatPhone('+79161234567'), '+7 (916) 123-45-67');
});

test('почта и Telegram', () => {
  assert.equal(normalizeEmail('Ivan@Mail.RU '), 'ivan@mail.ru');
  assert.equal(normalizeEmail('ivan@'), null);
  assert.equal(normalizeTelegram('@dom_mira'), 'dom_mira');
  assert.equal(normalizeTelegram('https://t.me/dom_mira'), 'dom_mira');
  assert.equal(normalizeTelegram('a b'), null);
});

test('спам по ссылкам и словам', () => {
  assert.ok(spamScore({message: 'Раскрутка сайта http://x.ru http://y.ru http://z.ru'}) >= 4);
  assert.equal(spamScore({name: 'Анна', message: 'Нужен дом 150 м2 из газобетона'}), 0);
});

test('детали и метки очищаются', () => {
  const details = cleanDetails({area: '150', evil: 'x', object: 'Дом'});
  assert.deepEqual(details, {area: '150', object: 'Дом'});
  const attr = cleanAttribution({utm_source: 'yandex', ym_client_id: 'abc', yclid: '123'});
  assert.equal(attr.utm_source, 'yandex');
  assert.equal(attr.ym_client_id, null);
});

test('XLSX собирается и открывается как zip', () => {
  const bytes = buildXlsx([{name: 'Заявки', columns: [{key: 'a', title: 'А'}, {key: 'b', title: 'Б'}], rows: [{a: 1, b: 'текст <&>'}, {a: new Date('2026-11-09T10:00:00Z'), b: null}]}]);
  const files = unzipSync(bytes);
  assert.ok(files['xl/workbook.xml']);
  const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
  assert.match(sheet, /текст &lt;&amp;&gt;/);
  assert.match(strFromU8(files['xl/workbook.xml']), /Заявки/);
});

test('CSV экранирует запятые и кавычки', () => {
  const csv = toCsv([{key: 'a', title: 'A'}], [{a: 'x, "y"'}]);
  assert.equal(csv, 'A\n"x, ""y"""');
});

test('JSON из ответа модели', () => {
  assert.deepEqual(parseJsonLoose('```json\n{"reply":"ок"}\n```'), {reply: 'ок'});
  assert.deepEqual(parseJsonLoose('Вот ответ: {"reply":"да"} спасибо'), {reply: 'да'});
  assert.equal(parseJsonLoose('без json'), null);
});

test('шифрование резервной копии', () => {
  const data = Buffer.from('секретные заявки');
  const secret = 'a-very-long-backup-secret-key';
  const enc = encrypt(data, secret);
  assert.notDeepEqual(enc, data);
  assert.equal(decrypt(enc, secret).toString(), 'секретные заявки');
  assert.throws(() => decrypt(enc, 'another-very-long-secret-key'));
});

test('неделя отчёта заканчивается в полночь по Москве', () => {
  const {from, to} = lastWeekPeriod(new Date('2026-11-09T07:00:00Z'));
  assert.equal(to.toISOString(), '2026-11-08T21:00:00.000Z');
  assert.equal(from.toISOString(), '2026-11-01T21:00:00.000Z');
});
