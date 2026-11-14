// Проверки правок по аудиту: доступ к заявкам и диалогам, CSV без формул, контакты не уходят в модель,
// адреса CRM, прайс и разметка цен.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {toCsv} from '../server/xlsx.js';
import {canAccessLead, canEditLead, canTakeLead, canSeeConversation, canReplyConversation, DEFAULT_ROLES} from '../server/permissions.js';
import {verifyGithubActionsToken, GITHUB_ISSUER} from '../server/github-oidc.js';
import {generateKeyPairSync, sign as cryptoSign} from 'node:crypto';
import {maskContacts, extractContacts, parseStartParam} from '../server/client-bot.js';
import {crmUrlProblem} from '../server/crm.js';
import {renderList, parsePrice, offerCatalog, bakeHtml} from '../src/site/content-render.js';
import {CONTENT_DEFAULTS} from '../server/content-defaults.js';

const manager = {id: 5, permissions: ['leads.view_own', 'leads.edit', 'conversations.view', 'conversations.reply']};
const boss = {id: 1, permissions: ['leads.view_all', 'leads.edit', 'conversations.view', 'conversations.reply']};
const viewer = {id: 9, permissions: ['leads.view_all', 'conversations.view']};

test('CSV: текст клиента не становится формулой', () => {
  const csv = toCsv([{key: 'a', title: 'A'}, {key: 'n', title: 'N'}], [{a: '=HYPERLINK("http://x")', n: 5}, {a: '+7 (916) 123-45-67', n: -3}, {a: '@cmd', n: 0}]);
  const lines = csv.split('\n');
  assert.equal(lines[1], `"'=HYPERLINK(""http://x"")",5`);
  assert.equal(lines[2], `"'+7 (916) 123-45-67",-3`);
  assert.equal(lines[3], `"'@cmd",0`);
});

test('доступ к заявке: свои, все или свободная', () => {
  const own = {id: 1, manager_id: 5};
  const other = {id: 2, manager_id: 7};
  const free = {id: 3, manager_id: null};
  assert.equal(canAccessLead(manager, own), true);
  assert.equal(canAccessLead(manager, other), false);
  assert.equal(canAccessLead(boss, other), true);
  assert.equal(canEditLead(manager, other), false, 'чужую заявку менеджер не меняет');
  assert.equal(canEditLead(manager, free), true, 'свободную можно взять');
  assert.equal(canTakeLead(manager, other), false);
  assert.equal(canTakeLead(viewer, free), false, 'без права менять заявку не взять');
  assert.equal(canAccessLead(manager, free), true, 'свободную заявку менеджер видит, чтобы взять');
  assert.equal(canAccessLead({id: 9, permissions: ['stats.view']}, free), false, 'без права на заявки не видно и свободных');
});

test('роль «Менеджер» по умолчанию видит только свои и свободные заявки', () => {
  const role = DEFAULT_ROLES.find(r => r.key === 'manager');
  assert.ok(role.permissions.includes('leads.view_own') && !role.permissions.includes('leads.view_all'));
});

test('плановая проверка из GitHub Actions: только подписанный токен нашего репозитория и сценария', async () => {
  const {privateKey, publicKey} = generateKeyPairSync('rsa', {modulusLength: 2048});
  const jwk = {...publicKey.export({format: 'jwk'}), kid: 'k1', alg: 'RS256'};
  const sign = (claims, key = privateKey) => {
    const head = Buffer.from(JSON.stringify({alg: 'RS256', kid: 'k1', typ: 'JWT'})).toString('base64url');
    const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return `${head}.${body}.${cryptoSign('RSA-SHA256', Buffer.from(`${head}.${body}`), key).toString('base64url')}`;
  };
  const now = 1_800_000_000;
  const good = {iss: GITHUB_ISSUER, aud: 'dom-mira-tick', exp: now + 300, repository: 'ivantemshik/stroy', workflow_ref: 'ivantemshik/stroy/.github/workflows/tick.yml@refs/heads/main'};
  const opts = {audience: 'dom-mira-tick', repository: 'ivantemshik/stroy', workflow: 'tick.yml', keys: [jwk], now};
  assert.equal(await verifyGithubActionsToken(sign(good), opts), true);
  assert.equal(await verifyGithubActionsToken(sign({...good, repository: 'someone/fork'}), opts), false, 'чужой репозиторий');
  assert.equal(await verifyGithubActionsToken(sign({...good, workflow_ref: 'ivantemshik/stroy/.github/workflows/deploy.yml@refs/heads/main'}), opts), false, 'другой сценарий');
  assert.equal(await verifyGithubActionsToken(sign({...good, exp: now - 1}), opts), false, 'истёк');
  assert.equal(await verifyGithubActionsToken(sign(good, generateKeyPairSync('rsa', {modulusLength: 2048}).privateKey), opts), false, 'чужая подпись');
});

test('диалоги видны и отвечаются по тому же правилу, что заявки', () => {
  assert.equal(canSeeConversation(manager, {manager_id: 5}), true);
  assert.equal(canSeeConversation(manager, {manager_id: 7}), false);
  assert.equal(canSeeConversation(manager, null), false, 'диалог без заявки видят только те, кто видит все заявки');
  assert.equal(canSeeConversation(boss, null), true);
  assert.equal(canReplyConversation(viewer, {manager_id: 7}), false, 'без права отвечать нельзя');
  assert.equal(canReplyConversation(boss, {manager_id: 7}), true);
});

test('телефон и почта из сообщения сохраняются, но в модель не уходят', () => {
  const text = 'Андрей, звоните 8 916 123-45-67 или пишите andrey@mail.ru, дом 150 м² за 10 500 000';
  assert.deepEqual(extractContacts(text), {phone: '+79161234567', email: 'andrey@mail.ru'});
  const masked = maskContacts(text);
  assert.ok(!/916|andrey/.test(masked), masked);
  assert.ok(masked.includes('[телефон]') && masked.includes('[почта]'));
  assert.ok(masked.includes('10 500 000'), 'цены и площади не трогаем');
});

test('CRM: только https и утверждённые адреса', () => {
  assert.equal(crmUrlProblem('https://company.bitrix24.ru/rest/1/abc/'), null);
  assert.equal(crmUrlProblem('https://shop.amocrm.ru/api'), null);
  assert.match(crmUrlProblem('http://company.bitrix24.ru/rest/1/abc/'), /https/);
  assert.match(crmUrlProblem('https://127.0.0.1/hook'), /Внутренние/);
  assert.match(crmUrlProblem('https://evil.example.com/hook'), /не в списке/);
  process.env.CRM_ALLOWED_HOSTS = '*.example.com';
  assert.equal(crmUrlProblem('https://crm.example.com/hook'), null);
  delete process.env.CRM_ALLOWED_HOSTS;
});

test('прайс: 65 позиций, цена с единицей и разметка Offer', () => {
  const keys = ['build.prices', 'finish.prices', 'engineering.prices', 'landscape.prices', 'design.prices'];
  assert.equal(keys.reduce((sum, key) => sum + CONTENT_DEFAULTS[key].length, 0), 65);
  assert.deepEqual(parsePrice('от 6 500 ₽/м³'), {value: 6500, unit: 'м³'});
  assert.deepEqual(parsePrice('от 300 000 ₽/шт.'), {value: 300000, unit: 'шт.'});
  const row = renderList('design.prices', [{code: 'ЭП', name: 'Эскизный проект', price: 'от 700 ₽/м²'}]);
  assert.equal(row, '<tr class="has-code"><th scope="row">ЭП</th><td>Эскизный проект</td><td>от 700 <small>₽/м²</small></td></tr>');
  const catalog = offerCatalog(CONTENT_DEFAULTS, ['build.prices']);
  assert.equal(catalog.itemListElement[0].itemListElement.length, 16);
  assert.equal(catalog.itemListElement[0].itemListElement[0].priceSpecification.minPrice, 70000);
  // Название работы из админки с закрывающим тегом не должно разорвать скрипт разметки.
  const evil = {...CONTENT_DEFAULTS, 'design.prices': [{code: 'X', name: '</script><script>alert(1)</script>', price: 'от 1 ₽/м²'}]};
  const html = bakeHtml('<script type="application/ld+json" data-c-offers="design.prices">{"@type":"Service","name":"x"}</script>', evil);
  assert.equal((html.match(/<\/script>/g) || []).length, 1, 'в JSON внутри скрипта нет закрывающего тега');
  assert.ok(JSON.parse(html.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '')).hasOfferCatalog);
});

test('«О компании»: абзацы и цифры из контента', () => {
  assert.equal(renderList('about.facts', [{value: '8', label: 'направлений'}]), '<li><strong>8</strong><span>направлений</span></li>');
  assert.equal(renderList('about.paras', [{text: 'Текст <b>'}]), '<p>Текст &lt;b&gt;</p>');
});

test('ссылка в бота из окна услуги: услуга, страница и номер посетителя', () => {
  assert.deepEqual(parseStartParam('u_design_home_1234567890'), {source: 'site', landing: '/', clientId: '1234567890', service: 'design'});
  assert.equal(parseStartParam('u_constructor_home').service, null, 'служебные имена объекта не принимаются');
  assert.equal(parseStartParam('u_hack_home').service, null);
  assert.deepEqual(parseStartParam('s_otdelka'), {source: 'site', landing: '/otdelka/', clientId: null});
});
