// Быстрая проверка вёрстки: горизонтальная прокрутка, битые картинки и ошибки скриптов на 9 ширинах в светлой и тёмной теме.
// Запуск: npm run check -- http://127.0.0.1:5173 (по умолчанию локальный сервер разработки)
// Только одна тема: npm run check -- http://127.0.0.1:5173 dark
import {chromium} from '@playwright/test';
import {existsSync} from 'node:fs';
const base = (process.argv[2] || 'http://127.0.0.1:5173').replace(/\/$/, '');
const pages = ['/', '/otdelka/', '/privacy/', '/soglasie/', '/cookies/', '/admin/'];
const widths = [320, 375, 390, 480, 600, 768, 1024, 1440, 1920];
const schemes = ['light', 'dark'].filter(scheme => !process.argv[3] || process.argv[3] === scheme);
const local = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'].find(existsSync);
const browser = await chromium.launch(local ? {executablePath: local} : {});
let problems = 0;
for (const path of pages) {
  for (const scheme of schemes) for (const width of widths) {
    const page = await browser.newPage({viewport: {width, height: 900}, colorScheme: scheme});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + path, {waitUntil: 'networkidle'});
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 40)); } });
    await page.waitForLoadState('networkidle');
    const result = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      broken: [...document.images].filter(img => img.complete && !img.naturalWidth).map(img => img.getAttribute('src'))
    }));
    const bad = result.overflow > 0 || result.broken.length || errors.length;
    if (bad) { problems += 1; console.log('FAIL', path, scheme, width, JSON.stringify({...result, errors})); }
    await page.close();
  }
  console.log('ok', path);
}
await browser.close();
if (problems) { console.log(`Проблем: ${problems}`); process.exit(1); }
console.log('Все страницы без горизонтальной прокрутки и битых картинок');
