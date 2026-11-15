// Скриншоты страниц для проверки вёрстки: node scripts/shoot.mjs <url> <outdir> [ширины через запятую] [sections|full]
import {chromium} from '@playwright/test';
import {existsSync} from 'node:fs';
const [url, out, widthsArg = '1440', mode = 'sections'] = process.argv.slice(2);
const local = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'].find(existsSync);
const browser = await chromium.launch(local ? {executablePath: local} : {});
for (const width of widthsArg.split(',').map(Number)) {
  const page = await browser.newPage({viewport: {width, height: width < 700 ? 844 : 900}, deviceScaleFactor: 1});
  await page.addInitScript(() => localStorage.setItem('dm_consent', JSON.stringify({v: 1, ts: Date.now(), analytics: false})));
  await page.goto(url, {waitUntil: 'networkidle'});
  // Прокручиваем страницу, чтобы загрузились ленивые изображения.
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); } window.scrollTo(0, 0); });
  await page.waitForLoadState('networkidle');
  const tag = new URL(url).pathname.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'home';
  if (mode === 'full') {
    await page.screenshot({path: `${out}/${tag}-full-${width}.jpg`, fullPage: true, type: 'jpeg', quality: 70});
  } else {
    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    const vh = page.viewportSize().height;
    for (let y = 0, i = 0; y < total; y += vh, i += 1) {
      await page.evaluate(top => window.scrollTo(0, top), y);
      await page.waitForTimeout(200);
      await page.screenshot({path: `${out}/${tag}-w${width}-${String(i).padStart(2, '0')}.jpg`, type: 'jpeg', quality: 70});
    }
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const broken = await page.evaluate(() => [...document.images].filter(img => img.complete && !img.naturalWidth).map(img => img.src));
  console.log(tag, width, 'overflow-x', overflow, 'broken images', broken.length, broken.slice(0, 3).join(' '));
  await page.close();
}
await browser.close();
