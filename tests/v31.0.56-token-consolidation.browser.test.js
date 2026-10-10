import test from 'node:test';import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {chrome,startServer,openVisualPage,computedPaint} from './support/design-browser.js';
import {textContrast} from './support/text-contrast.js';

test('token consolidation preserves v31.0.55 light pixels and default action contrast',{skip:!chrome,timeout:240000},async t=>{
 const server=await startServer({foundation:true}),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 const url=`http://127.0.0.1:${server.address().port}/`;
 try{
  for(const width of [375,1280])for(const scenario of ['setup','games','classic','player-stats','results','scorecards','library','preferences','support','insights','quick-charts','balance'])await t.test(`${scenario} light at ${width}px`,async()=>{
   const before=await openVisualPage(browser,url,scenario,width,'tokens'),after=await openVisualPage(browser,url,scenario,width);
   // Diagnostics display each page's deliberately different fixture URL.
   if(scenario==='support')for(const page of [before,after])await page.$eval('#appCurrentUrl',n=>n.textContent='http://127.0.0.1/visual-fixture');
   const oldPaint=await computedPaint(before),newPaint=await computedPaint(after);
   const oldImage=await before.screenshot(),newImage=await after.screenshot();
   await before.close();await after.close();
   assert.deepEqual(newPaint,oldPaint);
   assert.equal(Buffer.compare(newImage,oldImage),0,'light pixels remain exact');
  });
  for(const dark of [false,true])await t.test(`unpatched default action in ${dark?'dark':'light'} appearance`,async()=>{
   const page=await openVisualPage(browser,url,'setup',375,false,dark);
   await page.evaluate(()=>{const button=document.createElement('button');button.id='default-action-probe';button.textContent='Default action';document.body.appendChild(button);});
   const color=await page.$eval('#default-action-probe',n=>({background:getComputedStyle(n).backgroundColor,foreground:getComputedStyle(n).color}));
   assert.equal(color.foreground,'rgb(255, 255, 255)');
   assert.equal(color.background,dark?'rgb(23, 96, 62)':'rgb(11, 93, 59)');
   const probe=(await textContrast(page)).filter(n=>n.selector==='#default-action-probe');
   assert.equal(probe.length,1,'the actual default action was measured');
   assert.deepEqual(probe.filter(n=>n.ratio<n.required),[]);
   await page.close();
  });
  for(const dark of [false,true])await t.test(`fixed paper in ${dark?'dark':'light'} system`,async()=>{
   const before=await openVisualPage(browser,url,'results',375,'tokens',dark,true),after=await openVisualPage(browser,url,'results',375,false,dark,true);
   assert.deepEqual(await computedPaint(after),await computedPaint(before));
   assert.equal(Buffer.compare(await after.screenshot(),await before.screenshot()),0);
   await before.close();await after.close();
  });
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
