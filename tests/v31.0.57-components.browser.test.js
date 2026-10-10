import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import puppeteer from 'puppeteer-core';import {chrome,startServer,openVisualPage} from './support/design-browser.js';
import {textContrast} from './support/text-contrast.js';
test('component states, footer ink and overlay reachability work in both appearances',{skip:!chrome,timeout:240000},async t=>{
 const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});const url=`http://127.0.0.1:${server.address().port}/`;
 try{
  for(const dark of [false,true])for(const scenario of ['setup','preferences','library','quick-charts','balance','player-stats','classic'])await t.test(`${scenario} ${dark?'dark':'light'}`,async()=>{
   const page=await openVisualPage(browser,url,scenario,375,false,dark);
   const small=await page.$$eval('button',nodes=>nodes.filter(n=>n.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&!n.classList.contains('tab')&&n.getBoundingClientRect().height<43.9).map(n=>({id:n.id,text:n.textContent.trim().slice(0,35),height:n.getBoundingClientRect().height})));
   const footer=(await textContrast(page)).filter(n=>n.selector==='#appVersionFooterBuild');
   if(scenario!=='player-stats')assert.equal(footer.length,1);
   if(footer.length)assert.ok(footer[0].ratio>=4.5);
   assert.deepEqual(small,[],'visible controls have a 44px minimum height');
   if(scenario==='preferences'){
    await page.keyboard.press('Tab');await page.focus('#resetPlayerPreferencesBtn');
    assert.notEqual(await page.$eval('#resetPlayerPreferencesBtn',n=>getComputedStyle(n).outlineStyle),'none');
   }
   if(scenario==='balance'){
    await page.click('#balanceExplanationCloseBtn');assert.equal(await page.$eval('#balanceExplanationDialog',n=>n.open),false);
   }
   fs.mkdirSync('tmp/report-qa/v57',{recursive:true});if(['setup','preferences','library','player-stats'].includes(scenario)){
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    await page.screenshot({path:`tmp/report-qa/v57/${scenario}-${dark?'dark':'light'}.png`,fullPage:true});
    await page.screenshot({path:`tmp/report-qa/v57/${scenario}-${dark?'dark':'light'}-viewport.png`});
   }
   await page.close();
  });
  await t.test('memory sheet remains scrollable above a keyboard-sized viewport',async()=>{
   const page=await openVisualPage(browser,url,'player-stats',375);
   await page.addStyleTag({content:'html{font-size:24px!important}'});
   await page.evaluate(()=>{const dialog=document.getElementById('addMemoryDialog');dialog.classList.remove('hidden');dialog.setAttribute('aria-hidden','false');});
   await page.setViewport({width:375,height:440,deviceScaleFactor:1});
   const metrics=await page.$eval('#addMemoryDialog .sheet-card',n=>({top:n.getBoundingClientRect().top,bottom:n.getBoundingClientRect().bottom,height:innerHeight,scroll:n.scrollHeight,client:n.clientHeight}));
   assert.ok(metrics.top>=-1&&metrics.bottom<=metrics.height+1);
   await page.$eval('#addMemoryDialog .sheet-card',n=>n.scrollTop=n.scrollHeight);
   const close=await page.$eval('#addMemoryCancelBtn',n=>({top:n.getBoundingClientRect().top,bottom:n.getBoundingClientRect().bottom,height:innerHeight}));
   assert.ok(close.top>=-1&&close.bottom<=close.height+1,'Cancel remains visible while the sheet scrolls');
   await page.click('#addMemoryCancelBtn');
   assert.ok(await page.$eval('#addMemoryDialog',n=>n.classList.contains('hidden')));
   await page.close();
  });
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
