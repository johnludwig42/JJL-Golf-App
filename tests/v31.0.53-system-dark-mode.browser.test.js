import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import puppeteer from 'puppeteer-core';
import {chrome,startServer,openVisualPage,computedPaint} from './support/design-browser.js';
import {textContrast} from './support/text-contrast.js';

test('system dark appearance has computed AA text contrast and preserves geometry', {skip:!chrome,timeout:240000}, async t => {
  const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
  const url=`http://127.0.0.1:${server.address().port}/`;
  const failures=[],measurements=[];
  try {
    for(const width of [375,1280])for(const scenario of ['setup','games','classic','player','player-expanded','player-stats','overflow','results','scorecards','library','preferences','support','insights','quick','balance'])await t.test(`${scenario} at ${width}px`,async()=>{
      const page=await openVisualPage(browser,url,scenario,width,false,true);
      const appearance=await page.evaluate(()=>({scheme:getComputedStyle(document.documentElement).colorScheme,background:getComputedStyle(document.body).backgroundColor,foreground:getComputedStyle(document.body).color}));
      assert.equal(appearance.scheme,'dark');
      assert.equal(appearance.background,'rgb(17, 24, 20)');
      assert.equal(appearance.foreground,'rgb(238, 244, 240)');
      const geometry = paint => paint.map(({normal,...node})=>({tag:node.tag,id:node.id,className:node.className,...Object.fromEntries(['width','height','fontSize','padding','margin'].map(prop=>[prop,normal[prop]]))}));
      const darkGeometry=geometry(await computedPaint(page));
      const contrast=await textContrast(page);
      assert.ok(contrast.length>10,'actual visible text was measured');
      measurements.push({scenario,width,textNodes:contrast.length,minimumBodyContrast:Math.min(...contrast.filter(item=>item.required===4.5).map(item=>item.ratio))});
      const bad=contrast.filter(item=>item.ratio<item.required);
      if(bad.length)failures.push({scenario,width,bad});
      mkdirSync('tmp/report-qa/design',{recursive:true});
      if(width===375)await page.screenshot({path:`tmp/report-qa/design/dark-${scenario}.png`,fullPage:true});
      await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'}]);
      assert.deepEqual(geometry(await computedPaint(page)),darkGeometry,'appearance changes preserve layout');
      await page.close();
      assert.deepEqual(bad,[],`${scenario}: AA contrast`);
    });
    await t.test('system preference updates without reload, including native controls',async()=>{
      const page=await openVisualPage(browser,url,'classic',375);
      await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'dark'}]);
      assert.equal(await page.$eval('input',node=>getComputedStyle(node).colorScheme),'dark');
      await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'}]);
      assert.equal(await page.$eval('body',node=>getComputedStyle(node).backgroundColor),'rgb(243, 246, 244)');
      await page.close();
    });
    await t.test('focused score input and hover states retain AA contrast',async()=>{
      const page=await openVisualPage(browser,url,'player-expanded',375,false,true);
      await page.focus('.player-mode-more-score input');
      assert.notEqual(await page.$eval('.player-mode-more-score input',node=>getComputedStyle(node).color),'rgba(0, 0, 0, 0)');
      assert.deepEqual((await textContrast(page)).filter(item=>item.ratio<item.required),[]);
      await page.close();
      const setup=await openVisualPage(browser,url,'preferences',375,false,true);
      await setup.click('#settings [data-experience-back]');
      await setup.hover('#settings .experience-destination-card');
      assert.deepEqual((await textContrast(setup)).filter(item=>item.ratio<item.required),[]);
      await setup.close();
    });
    await t.test('Ledger Entry keeps light computed paint in dark screen and print media',async()=>{
      for(const print of [false,true]){
        const pages=[];
        for(const appearance of ['light','dark']){
          const page=await browser.newPage();await page.setViewport({width:820,height:1100});
          await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:appearance}]);
          if(print)await page.emulateMediaType('print');
          await page.goto(url+'reports/ledger-entry-v31.0.02-reference.html',{waitUntil:'networkidle0'});
          await page.evaluate(()=>document.fonts.ready);
          await page.waitForFunction(()=>document.querySelector('.page')?.getBoundingClientRect().height>0);
          await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
          pages.push(page);
        }
        // Paper ink/backgrounds must match; print preview may center pages
        // differently as Chrome computes its paged viewport.
        const paint = values => values.map(node=>({tag:node.tag,id:node.id,className:node.className,...Object.fromEntries(['normal','before','after'].map(pseudo=>[pseudo,Object.fromEntries(Object.entries(node[pseudo]).filter(([property])=>!['width','height','padding','margin'].includes(property)))]))}));
        assert.deepEqual(paint(await computedPaint(pages[0])),paint(await computedPaint(pages[1])));
        if(!print)assert.equal(Buffer.compare(await pages[0].screenshot(),await pages[1].screenshot()),0);
        for(const page of pages)await page.close();
      }
    });
  }finally{
    mkdirSync('tmp/report-qa/design',{recursive:true});writeFileSync('tmp/report-qa/design/contrast-failures.json',JSON.stringify(failures,null,2));
    writeFileSync('tmp/report-qa/design/contrast-measurements.json',JSON.stringify(measurements,null,2));
    await browser.close();await new Promise(done=>server.close(done));
  }
});
