// Сквозная проверка: заявка с сайта, вход в админку, заявка в списке. node scripts/e2e.mjs <url> <screens-dir>
import './load-env.mjs';
import {chromium} from '@playwright/test';
import {existsSync, mkdirSync} from 'node:fs';
const [base = 'http://127.0.0.1:5173', out = '/tmp'] = process.argv.slice(2);
mkdirSync(out, {recursive: true});
const login = process.env.E2E_LOGIN || process.env.ADMIN_LOGIN_SRG;
const password = process.env.E2E_PASSWORD || process.env.ADMIN_PASSWORD_SRG;
const local = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(existsSync);
const browser = await chromium.launch(local ? {executablePath: local} : {});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
page.on('pageerror', e => console.log('PAGE ERROR', e.message));
await page.addInitScript(() => localStorage.setItem('dm_consent', JSON.stringify({v: 1, ts: Date.now(), analytics: false})));
const stamp = Date.now().toString().slice(-6);
await page.goto(`${base}/?utm_source=e2e&utm_medium=test&utm_campaign=check`, {waitUntil: 'networkidle'});
await page.fill('#h-name', `Тест ${stamp}`);
await page.fill('#h-phone', `+7 900 ${stamp.slice(0, 3)}-${stamp.slice(3, 5)}-${stamp.slice(5)}0`);
await page.fill('#h-area', '150');
await page.fill('#h-message', 'Проверка формы: дом из газобетона, участок в Истре');
await page.click('label[for="h-p2"]');
await page.waitForTimeout(3000);
await page.check('input[name="consent"]');
await page.click('form[data-lead-form="request-home"] button[type="submit"]');
await page.waitForSelector('.form-done', {timeout: 30000});
const done = await page.textContent('.form-done h3');
console.log('FORM:', done);
await page.screenshot({path: `${out}/e2e-form-done.jpg`, type: 'jpeg', quality: 70});

await page.goto(`${base}/admin/`, {waitUntil: 'networkidle'});
await page.fill('input[autocomplete="username"]', login);
await page.fill('input[type="password"]', password);
await page.click('button[type="submit"]');
await page.waitForSelector('.side-nav', {timeout: 15000});
await page.screenshot({path: `${out}/admin-dashboard.jpg`, type: 'jpeg', quality: 70, fullPage: true});
for (const [name, hash] of [['leads', '#/leads'], ['stats', '#/stats'], ['content', '#/content'], ['kb', '#/kb'], ['settings', '#/settings'], ['users', '#/users'], ['audit', '#/audit'], ['profile', '#/profile']]) {
  await page.goto(`${base}/admin/${hash}`, {waitUntil: 'networkidle'});
  await page.waitForTimeout(800);
  await page.screenshot({path: `${out}/admin-${name}.jpg`, type: 'jpeg', quality: 70, fullPage: true});
}
await page.goto(`${base}/admin/#/leads`, {waitUntil: 'networkidle'});
await page.fill('input[type="search"]', `Тест ${stamp}`);
await page.waitForTimeout(1500);
const row = await page.textContent('.a-table tbody tr');
console.log('ADMIN ROW:', row?.replace(/\s+/g, ' ').slice(0, 160));
await page.click('.a-table tbody tr');
await page.waitForSelector('.grid-lead', {timeout: 10000});
await page.screenshot({path: `${out}/admin-lead.jpg`, type: 'jpeg', quality: 70, fullPage: true});
await browser.close();
