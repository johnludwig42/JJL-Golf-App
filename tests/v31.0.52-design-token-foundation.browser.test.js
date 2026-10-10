import test from 'node:test';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {chrome,startServer,openVisualPage,computedPaint} from './support/design-browser.js';

test('semantic tokens preserve light colors across app surfaces and exact fixed print metrics', {skip:!chrome,timeout:240000},async t=>{
  const server=await startServer({foundation:true}),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
  const url=`http://127.0.0.1:${server.address().port}/`;
  try{
    const cases=['setup','games','classic','player','results','library','preferences','insights','quick','balance'];
    for(const width of [375,1280])for(const scenario of cases)await t.test(`${scenario} at ${width}px`,async()=>{
      const before=await openVisualPage(browser,url,scenario,width,true),after=await openVisualPage(browser,url,scenario,width);
      const colorPaint=paint=>paint.map(node=>({tag:node.tag,id:node.id,className:node.className,...Object.fromEntries(['normal','before','after'].map(pseudo=>[pseudo,Object.fromEntries(Object.entries(node[pseudo]).filter(([prop])=>!['fontFamily','fontSize','fontWeight','padding','margin','borderRadius','width','height'].includes(prop)))]))}));
      assert.deepEqual(colorPaint(await computedPaint(after)),colorPaint(await computedPaint(before)),`${scenario}: light colors`);
      const oldImage=await before.screenshot(),newImage=await after.screenshot();
      // Typography/spacing intentionally change in the next foundation phase.
      if(width===375&&scenario==='player'){
        const {mkdirSync,writeFileSync}=await import('node:fs');mkdirSync('tmp/report-qa/design',{recursive:true});
        writeFileSync('tmp/report-qa/design/player-after.png',newImage);writeFileSync('tmp/report-qa/design/player-before.png',oldImage);
      }
      await before.close();await after.close();
    });
    for(const print of [true])await t.test(print?'print stays light in a dark system':'dark system keeps the unchanged light palette in this release',async()=>{
      const light=await openVisualPage(browser,url,'results',375,true,false,print),dark=await openVisualPage(browser,url,'results',375,false,true,print);
      assert.deepEqual(await computedPaint(dark),await computedPaint(light));
      assert.equal(Buffer.compare(await light.screenshot(),await dark.screenshot()),0);
      await light.close();await dark.close();
    });
  }finally{await browser.close();await new Promise(done=>server.close(done));}
});

