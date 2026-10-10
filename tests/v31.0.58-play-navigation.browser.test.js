import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import {chrome,startServer,openVisualPage,visualFixture} from './support/design-browser.js';

async function settle(page){await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
async function dismissScoreboard(page){
  const visible=await page.$eval('#quickScoreboardCloseBtn',n=>n.checkVisibility({checkVisibilityCSS:true}));
  if(visible)await page.click('#quickScoreboardCloseBtn');
}

test('Play labels, SVG navigation and existing Insights destinations work at phone widths',{skip:!chrome,timeout:240000},async t=>{
  const server=await startServer(),foundation=await startServer({foundation:true});
  const browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
  const url=`http://127.0.0.1:${server.address().port}/`;
  fs.mkdirSync('tmp/report-qa/v58',{recursive:true});
  try{
    for(const width of [320,375,430])for(const dark of [false,true])for(const size of [16,24,32])await t.test(`Player ${width}px ${dark?'dark':'light'} ${size}px text`,async()=>{
      const page=await openVisualPage(browser,url,'player-expanded',width,false,dark);
      await dismissScoreboard(page);
      if(size!==16)await page.addStyleTag({content:`html{font-size:${size}px!important}`});
      await settle(page);
      const metrics=await page.evaluate(()=>{
        const nav=document.querySelector('.top-tabs'),tabs=[...nav.querySelectorAll('.tab')];
        const labels=[...document.querySelectorAll('.player-mode-score-choices button small')].filter(n=>n.checkVisibility()).map(n=>{
          const range=document.createRange();range.selectNodeContents(n);
          return {text:n.textContent,rects:range.getClientRects().length,scroll:n.scrollWidth,client:n.clientWidth,button:n.closest('button').getBoundingClientRect().height};
        });
        return {overflow:document.documentElement.scrollWidth>innerWidth,labels,rowTops:tabs.map(n=>n.getBoundingClientRect().top),tabHeights:tabs.map(n=>n.getBoundingClientRect().height),icons:tabs.map(n=>{const svg=n.querySelector('svg');return {width:svg.getBBox().width,color:getComputedStyle(svg).color,labelColor:getComputedStyle(n.querySelector('.tab-label')).color};}),navWidth:nav.clientWidth,navScroll:nav.scrollWidth};
      });
      assert.equal(metrics.overflow,false);
      assert.ok(metrics.labels.length>=5,'expanded score choices were inspected');
      for(const label of metrics.labels){assert.equal(label.rects,1,`${label.text} remains a single word`);assert.ok(label.scroll<=label.client+1,`${label.text} fits`);assert.ok(label.button>=44);}
      assert.ok(metrics.rowTops.every(top=>Math.abs(top-metrics.rowTops[0])<1),'tabs occupy one row');
      assert.ok(metrics.tabHeights.every(height=>height>=44));
      for(const icon of metrics.icons){assert.ok(icon.width>0,'external SVG artwork renders');assert.equal(icon.color,icon.labelColor);}
      if(size===16)assert.ok(metrics.navScroll<=metrics.navWidth+1,'ordinary text fits without navigation scrolling');
      // Keyboard focus scrolls the row; tab selection maintains one current destination.
      await page.focus('[data-tab="settings"]');await page.keyboard.press('Enter');await settle(page);
      const current=await page.$eval('.top-tabs [aria-current="page"]',n=>({id:n.dataset.tab,left:n.getBoundingClientRect().left,right:n.getBoundingClientRect().right,width:innerWidth}));
      assert.equal(current.id,'settings');assert.ok(current.left>=0&&current.right<=current.width+1);
      assert.equal(await page.$$eval('.top-tabs [aria-current="page"]',n=>n.length),1);
      await page.click('[data-tab="score"]');await dismissScoreboard(page);await page.evaluate(()=>window.scrollTo(0,0));
      if(width===375&&[16,32].includes(size)){
        await settle(page);
        await page.screenshot({path:`tmp/report-qa/v58/player-${dark?'dark':'light'}-${size}.png`,fullPage:true});
        await page.screenshot({path:`tmp/report-qa/v58/player-${dark?'dark':'light'}-${size}-viewport.png`});
      }
      await page.close();
    });
    await t.test('compact chrome recovers a navigation row at ordinary phone text size',async()=>{
      const current=await openVisualPage(browser,url,'classic',375);
      const prior=await openVisualPage(browser,`http://127.0.0.1:${foundation.address().port}/`,'classic',375);
      const height=async page=>page.$eval('.app-chrome',n=>n.getBoundingClientRect().height);
      const gain=(await height(prior))-(await height(current));
      assert.ok(gain>=45,`recovered ${gain}px`);
      fs.writeFileSync('tmp/report-qa/v58/chrome-comparison.json',JSON.stringify({prior:await height(prior),current:await height(current),gain},null,2));
      await current.screenshot({path:'tmp/report-qa/v58/classic-light.png',fullPage:true});await current.close();await prior.close();
    });
    for(const dark of [false,true])await t.test(`Insights existing routes ${dark?'dark':'light'}`,async()=>{
      const page=await openVisualPage(browser,url,'insights',375,false,dark);
      await page.screenshot({path:`tmp/report-qa/v58/insights-${dark?'dark':'light'}.png`,fullPage:true});
      const before=await page.evaluate(()=>localStorage.getItem('the-dye-ledger-v20'));
      await page.click('[data-insights-view="statistics"]');
      assert.equal(await page.$eval('.panel.active',n=>n.id),'leaderboard');
      assert.equal(await page.$eval('#leaderboardWrap',n=>n.dataset.activeDestination),'statistics');
      await page.click('[data-tab="insights"]');await page.click('[data-insights-view="rounds"]');
      assert.equal(await page.$eval('.panel.active',n=>n.id),'courses');
      assert.equal(await page.$eval('#courses',n=>n.dataset.activeDestination),'rounds');
      assert.equal(await page.evaluate(()=>localStorage.getItem('the-dye-ledger-v20')),before,'read-only routes preserve round data');
      await page.close();
    });
    for(const mode of ['classic','player-stats'])await t.test(`${mode} retains score entry and save with keyboard-sized viewport`,async()=>{
      const page=await openVisualPage(browser,url,mode,375);await dismissScoreboard(page);
      await page.addStyleTag({content:'html{font-size:24px!important}'});
      await page.setViewport({width:375,height:440,deviceScaleFactor:1});
      const selector=mode==='classic'?'#score .gross-score-stepper [data-score-player="p0"]':'#score .player-mode-more-score [data-score-player="p0"]';
      await page.focus(selector);await page.$eval(selector,n=>n.select());await page.keyboard.type('6');await page.keyboard.press('Tab');
      await page.click(mode==='classic'?'#nextHoleBtn':'[data-player-mode-save-next]');
      await page.waitForFunction(()=>JSON.parse(localStorage.getItem('the-dye-ledger-v20')).matches[0].players[0].scores[3].gross===6);
      assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('the-dye-ledger-v20')).matches[0].players.map(p=>p.scores[3].gross)),[6,4,5,5]);
      await page.close();
    });
    await t.test('Insights routes remain usable without an active round',async()=>{
      const page=await openVisualPage(browser,url,'insights',375,false,false,false,visualFixture('CLASSIC',true));
      await page.click('[data-insights-view="statistics"]');
      assert.equal(await page.$eval('#leaderboardEmpty',n=>n.checkVisibility()),true);
      await page.click('[data-tab="insights"]');await page.click('[data-insights-view="rounds"]');
      assert.equal(await page.$eval('#courses',n=>n.dataset.activeDestination),'rounds');
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('the-dye-ledger-v20')).matches.length),0);
      await page.close();
    });
    for(const width of [320,1280])await t.test(`long golfer names and game context at ${width}px`,async()=>{
      const fixture=visualFixture('PLAYER',false,true);
      fixture.state.players[0].name='Alexandria Montgomery-Wellington';
      fixture.state.players[0].formalName=fixture.state.players[0].name;
      const page=await openVisualPage(browser,url,'player-stats',width,false,true,false,fixture);
      await dismissScoreboard(page);await settle(page);
      assert.ok(await page.$eval('#score',n=>n.innerText.includes('Alexandria Montgomery-Wellington')));
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert.ok(await page.$eval('#score',n=>n.innerText.includes('Nassau')));
      await page.screenshot({path:`tmp/report-qa/v58/player-long-${width}.png`,fullPage:true});await page.close();
    });
  }finally{await browser.close();await Promise.all([server,foundation].map(s=>new Promise(r=>s.close(r))));}
});
