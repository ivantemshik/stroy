import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
const base=process.env.CHECK_URL||'http://127.0.0.1:5173';
const url=base.replace(/\/$/,'')+'/stroitelstvo-domov/';
const local='C:/Users/user/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const browser=await chromium.launch(existsSync(local)?{executablePath:local}:{});
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const results=[];
await mkdir('qa',{recursive:true});
try{
 for(const width of [320,375,390,480,600,768,1024,1440,1920]){
  const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const response=await page.goto(url,{waitUntil:'networkidle'});
  await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(async()=>{for(const img of document.images){img.loading='eager';await img.decode().catch(()=>{});}});
  const metrics=await page.evaluate(()=>({
   width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
   h1:document.querySelectorAll('h1').length,
   font:document.fonts.check('500 20px Manrope'),
   broken:[...document.images].filter(img=>!img.naturalWidth).map(img=>img.src),
   overflow:[...document.querySelectorAll('main *,footer *,h1,.breadcrumbs')].filter(el=>{
    const r=el.getBoundingClientRect();return r.width>0&&(r.left< -1||r.right>innerWidth+1);
   }).map(el=>({tag:el.tagName,class:el.className,id:el.id})),
   emojiArrows:/[↗↑↓→←✓↻]/.test(document.body.innerText)
  }));
  assert(response.status()===200,'Construction page HTTP '+response.status());
  assert(metrics.scrollWidth<=width&&!metrics.overflow.length,'Overflow at '+width+': '+JSON.stringify(metrics.overflow));
  assert(metrics.h1===1&&metrics.font,'Heading or font failure');
  assert(!metrics.broken.length,'Broken images: '+metrics.broken);
  assert(!metrics.emojiArrows,'Emoji-style arrow glyphs present');
  assert(!errors.length,'Browser errors: '+errors);
  if([390,768,1440].includes(width))await page.screenshot({path:`qa/construction-page-${width}.png`,fullPage:true});
  if(width===390||width===1440){
   await page.evaluate(()=>scrollTo(0,0));
   await page.screenshot({path:`qa/construction-hero-${width}.png`});
   await page.locator('.construction-hero .hero-content [data-open="quiz"]').click();
   await page.getByRole('button',{name:'Продолжить'}).click();
   await page.locator('#area').fill('200');
   await page.getByRole('button',{name:'Продолжить'}).click();
   await page.getByRole('button',{name:'Продолжить'}).click();
   assert((await page.locator('.estimate').innerText()).replace(/\s/g,'').includes('14000000'),'Construction estimate incorrect');
   assert((await page.locator('#mail-link').getAttribute('href')).startsWith('mailto:info@gkvesmir.ru?'),'Missing estimate email');
   await page.keyboard.press('Escape');
   await page.locator('.building-project').first().click();
   assert(await page.locator('#building-lightbox').evaluate(el=>el.open),'Gallery did not open');
   await page.keyboard.press('ArrowRight');
   assert((await page.locator('#lightbox-title').innerText()).includes('Одноэтажная'),'Gallery next failed');
   await page.keyboard.press('ArrowLeft');
   assert((await page.locator('#lightbox-title').innerText()).includes('панорамным'),'Gallery previous failed');
   await page.screenshot({path:`qa/construction-lightbox-${width}.png`});
   await page.keyboard.press('Escape');
   assert(await page.locator('.building-project').first().evaluate(el=>el===document.activeElement),'Gallery focus not restored');
   await page.locator('.type-card').last().click();
   assert(await page.locator('#building-type').inputValue()==='Коммерческие объекты','Object selection not carried to form');
   await page.locator('#building-name').fill('Тест');
   await page.locator('#building-contact').fill('не контакт');
   await page.locator('#building-form button[type=submit]').click();
   assert((await page.locator('#building-contact').evaluate(el=>el.validationMessage)).includes('Укажите'),'Invalid contact accepted');
   await page.locator('#building-contact').fill('test@example.com');
   assert(await page.locator('#building-contact').evaluate(el=>el.validity.valid),'Valid contact remains invalid');
   if(width===390){
    await page.evaluate(()=>scrollTo(0,0));await page.locator('.menu-toggle').click();
    assert(await page.locator('#mobile-menu').isVisible(),'Mobile menu did not open');
    await page.locator('#mobile-menu a').first().click();
    assert(!await page.locator('#mobile-menu').isVisible(),'Mobile menu did not close');
   }
  }
  results.push({...metrics,pass:true});await page.close();
 }
 await writeFile('qa/construction-results.json',JSON.stringify({url,results},null,2));
 console.log(JSON.stringify(results.map(({width,pass})=>({width,pass})),null,2));
}finally{await browser.close();}
