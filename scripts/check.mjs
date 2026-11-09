import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
const url = process.env.CHECK_URL || 'http://127.0.0.1:5173';
const localChrome = 'C:/Users/user/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const browser = await chromium.launch(existsSync(localChrome) ? {executablePath:localChrome} : {});
await mkdir('qa',{recursive:true});
const results=[];
const assert = (value,message) => { if(!value)throw new Error(message); };
try {
  for (const width of [320,375,390,480,600,768,1024,1440,1920]) {
    const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    const response=await page.goto(url,{waitUntil:'networkidle'});
    await page.evaluate(()=>document.fonts.ready);
    // Load every lazy image before checking its status and capturing the complete page.
    await page.evaluate(async()=>{for(const img of document.images){img.loading='eager';await img.decode().catch(()=>{});}});
    assert(response.status()===200,`HTTP ${response.status()}`);
    const metrics=await page.evaluate(()=>({
      width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
      broken:[...document.images].filter(image=>!image.complete||!image.naturalWidth).map(image=>image.src),
      font:document.fonts.check('500 20px Manrope'),
      h1:document.querySelectorAll('h1').length,
      // The rotated plan image is intentionally cropped by its overflow:hidden card.
      overflows:[...document.querySelectorAll('main *, footer *')].filter(e=>!e.matches('.quality-card > img')&&!(e.closest('.projects-track')&&!e.matches('.projects-track'))).filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+1||r.left< -1)}).slice(0,10).map(e=>e.className)
    }));
    assert(metrics.scrollWidth<=width,`Horizontal page overflow at ${width}: ${metrics.scrollWidth}`);
    assert(!metrics.overflows.length,`Content outside viewport at ${width}: ${metrics.overflows}`);
    assert(!metrics.broken.length,`Broken images: ${metrics.broken}`);
    assert(metrics.font,`Font missing at ${width}`);
    assert(metrics.h1===1,'Expected one H1');
    assert(!errors.length,`Browser errors: ${errors}`);
    if([375,390,768,1440].includes(width)) await page.screenshot({path:`qa/page-${width}.png`,fullPage:true});
    if(width===390||width===1440) {
      await page.evaluate(()=>scrollTo(0,0));
      await page.screenshot({path:`qa/hero-${width}.png`});
      await page.locator('.hero-content [data-open="quiz"]').click();
      await page.getByRole('button',{name:'Продолжить'}).click();
      await page.locator('#area').fill('200');
      await page.getByRole('button',{name:'Продолжить'}).click();
      await page.locator('[data-scope="Эскизный проект"]').click();
      await page.getByRole('button',{name:'Продолжить'}).click();
      assert((await page.locator('.estimate').innerText()).replace(/\s/g,'').includes('140000'),'Wrong sketch estimate');
      assert((await page.locator('#mail-link').getAttribute('href')).startsWith('mailto:info@gkvesmir.ru?'),'Missing mail draft');
      await page.screenshot({path:`qa/quiz-${width}.png`});
      await page.keyboard.press('Escape');
      assert(!(await page.locator('#quiz-dialog').evaluate(e=>e.open)),'Escape must close modal');
      await page.locator('.service-row[href="/stroitelstvo-domov/"]').click();
      await page.waitForURL('**/stroitelstvo-domov/');
      assert((await page.locator('h1').innerText()).includes('Строительство'),'Construction page did not open');
      await page.goBack({waitUntil:'networkidle'});
      await page.locator('summary').first().click();
      assert(await page.locator('details').first().evaluate(e=>e.open),'FAQ did not open');
      await page.locator('#contact-email').fill('qa@example.com');
      await page.locator('#contact-form button').click();
      await page.getByRole('button',{name:'Продолжить'}).click();
      await page.getByRole('button',{name:'Продолжить'}).click();
      await page.getByRole('button',{name:'Продолжить'}).click();
      assert(await page.locator('#quiz-email').inputValue()==='qa@example.com','Email was not retained');
      await page.keyboard.press('Escape');
      if(width===390) {
        await page.evaluate(()=>scrollTo(0,0));
        await page.locator('.menu-toggle').click();
        assert(await page.locator('#mobile-menu').isVisible(),'Mobile menu did not open');
        await page.locator('#mobile-menu a[href="#services"]').click();
        assert(!(await page.locator('#mobile-menu').isVisible()),'Mobile menu did not close');
      }
    }
    results.push({width,pass:true,...metrics});
    await page.close();
  }
  await writeFile('qa/results.json',JSON.stringify({url,results},null,2));
  console.log(JSON.stringify(results.map(({width,pass,overflows})=>({width,pass,overflows})),null,2));
} finally {await browser.close();}
