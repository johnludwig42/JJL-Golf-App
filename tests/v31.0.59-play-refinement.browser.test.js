import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import {chrome,startServer,openVisualPage} from './support/design-browser.js';
test('Play rules follow scoring and header status has room',{skip:!chrome,timeout:240000},async t=>{
 const server=await startServer();const browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 fs.mkdirSync('tmp/report-qa/v59',{recursive:true});
 try{
 for(const mode of ['classic','player-expanded'])for(const width of [320,375,430])for(const dark of [false,true])for(const size of [16,32])await t.test(`${mode} ${width} ${dark} ${size}`,async()=>{
  const page=await openVisualPage(browser,`http://127.0.0.1:${server.address().port}/`,mode,width,false,dark);
  await page.evaluate(()=>{const b=document.querySelector('#quickScoreboardCloseBtn');if(b.checkVisibility())b.click();});
  await page.addStyleTag({content:`html{font-size:${size}px!important}`});
  // Exercise the longest ordinary status from the reported screenshot.
  await page.evaluate(()=>{const c=document.querySelector('#classicHeaderSaveState');c.textContent='Saved · Backup unavailable';c.dataset.tone='warning';const p=document.querySelector('.player-mode-save-state');if(p){p.textContent='Saved · Backup unavailable';p.dataset.tone='warning';}});
  const metrics=await page.evaluate(()=>{
   const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
   const rules=document.querySelector('#playGroupRulesPreview'),action=document.querySelector(document.querySelector('#score').classList.contains('player-input-mode-active')?'#playerModeBottomActions':'#classicHoleActions');
   const status=document.querySelector('#classicHeaderSaveState');
   const select=document.querySelector('#currentHoleSelect'),selectedHole=select.value;select.value='18';
   const font=getComputedStyle(select),canvas=document.createElement('canvas').getContext('2d');canvas.font=font.font;
   const selectorFits=canvas.measureText('Hole 18').width<=select.clientWidth-parseFloat(font.paddingLeft)-parseFloat(font.paddingRight);
   select.value=selectedHole;
   const wordLines=['#prevHoleBtn','#nextHoleBtn'].map(selector=>{const n=document.querySelector(selector),text=n.firstChild,start=text.textContent.search(/Prev|Next/),r=document.createRange();r.setStart(text,start);r.setEnd(text,start+4);return r.getClientRects().length;});
   const playerStatus=document.querySelector('.player-mode-save-state');
   const range=document.createRange();range.selectNodeContents(document.querySelector('.classic-play-overflow'));
   return {selectorFits,wordLines,playerStatusSeparate:!playerStatus||playerStatus.parentElement.id==='playerModeHoleHeader',overflow:document.documentElement.scrollWidth>innerWidth,after:!!(action.compareDocumentPosition(rules)&Node.DOCUMENT_POSITION_FOLLOWING),collapsed:!rules.querySelector('details').open,unique:document.querySelectorAll('#playGroupRulesPreview').length,statusParent:status.parentElement.className,statusFits:status.scrollWidth<=status.clientWidth,nav:['#prevHoleBtn','#currentHoleBadge','#nextHoleBtn'].map(rect),dots:range.getClientRects().length,buttons:[...document.querySelectorAll('#classicHeaderActions button')].filter(n=>n.checkVisibility()).map(n=>n.getBoundingClientRect().height)};
  });
  assert.equal(metrics.overflow,false);assert.equal(metrics.after,true);assert.equal(metrics.collapsed,true);assert.equal(metrics.unique,1);assert.equal(metrics.playerStatusSeparate,true);
  if(mode==='classic'){assert.equal(metrics.selectorFits,true,'Hole 18 fits');assert.deepEqual(metrics.wordLines,[1,1],'Prev and Next remain intact');assert.ok(metrics.nav.every(r=>r.height>=44),'navigation touch targets');assert.equal(metrics.statusParent,'classic-header-secondary');assert.equal(metrics.statusFits,true);assert.equal(metrics.dots,1);assert.ok(metrics.buttons.every(h=>h>=44));assert.ok(metrics.nav.every(r=>Math.abs((r.top+r.bottom)/2-(metrics.nav[0].top+metrics.nav[0].bottom)/2)<5));
   await page.click('[data-play-overflow-trigger="classic"]');assert.equal(await page.$eval('#classicPlayOverflowMenu',n=>n.checkVisibility()),true);await page.keyboard.press('Escape');
   await page.click('#quickScoreboardBtn');assert.equal(await page.$eval('#quickScoreboardCloseBtn',n=>n.checkVisibility()),true);
   await page.click('#quickScoreboardCloseBtn');
  }
  await page.evaluate(()=>window.scrollTo(0,0));
  if(width===375)await page.screenshot({path:`tmp/report-qa/v59/${mode}-${dark?'dark':'light'}-${size}.png`,fullPage:true});
  await page.close();
 });
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
