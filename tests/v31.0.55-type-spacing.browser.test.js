import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import puppeteer from 'puppeteer-core';
import {chrome,startServer,openVisualPage} from './support/design-browser.js';

async function inspect(page){return page.evaluate(()=>{
  const issues=[],fonts=[];
  const allowedScroll='.score-grid-wrap,.hole-grid-wrap,.leader-table-wrap,.scorecard-wrap,.payout-table-wrap,.table-scroll-region,.classic-grid-section,.team-payout-scroll-pane,.quick-scoreboard-table-wrap';
  for(const node of document.querySelectorAll('body *')){
    if(['STYLE','SCRIPT','OPTION'].includes(node.tagName)||!node.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))continue;
    if(node.closest('.sr-only,.visually-hidden'))continue;
    const text=[...node.childNodes].filter(child=>child.nodeType===Node.TEXT_NODE).map(child=>child.textContent.trim()).join(' ').trim();
    if(!text&&!['INPUT','SELECT','TEXTAREA'].includes(node.tagName))continue;
    const style=getComputedStyle(node),box=node.getBoundingClientRect();
    const size=parseFloat(style.fontSize);fonts.push(size);
    if(size<10.99)issues.push({kind:'small text',node:node.id||node.className.baseVal||node.className,text:text.slice(0,45),size});
    if(node.tagName==='text'){
      const matrix=node.getScreenCTM();const physical=size*Math.hypot(matrix.a,matrix.b);
      if(physical<10.95)issues.push({kind:'small SVG text',text,physical});
      const svgBox=node.ownerSVGElement.getBoundingClientRect();
      if(box.left<svgBox.left-1||box.right>svgBox.right+1)issues.push({kind:'SVG label overflow',text,left:box.left,right:box.right});
    }else if(!node.closest(allowedScroll)&&box.width&&box.right>innerWidth+1)issues.push({kind:'page overflow',node:node.id||node.className,text:text.slice(0,45),right:box.right});
    if(text&&!['text','TD','TH'].includes(node.tagName)&&!node.closest(allowedScroll)&&box.width&&node.clientWidth&&node.scrollWidth>node.clientWidth+2&&style.textOverflow!=='ellipsis')issues.push({kind:'clipped text',node:node.id||node.className,text:text.slice(0,45),width:node.clientWidth,scroll:node.scrollWidth});
    if(['INPUT','SELECT','TEXTAREA'].includes(node.tagName)&&!['checkbox','radio','range','hidden'].includes(node.type)&&style.color!=='rgba(0, 0, 0, 0)'){
      const inner=node.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom);
      if(inner<size*.9)issues.push({kind:'clipped control height',node:node.id||node.className,size,inner});
    }
  }
  return {issues,minFont:Math.min(...fonts),root:parseFloat(getComputedStyle(document.documentElement).fontSize)};
});}

test('screen type roles stay readable and reflow at normal and larger root text sizes',{skip:!chrome,timeout:240000},async t=>{
  const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
  const url=`http://127.0.0.1:${server.address().port}/`,failures=[];
  try{
    for(const size of [16,24,32])for(const scenario of ['setup','games','classic','player-stats','results','scorecards','library','preferences','support','insights','quick','quick-charts','balance'])await t.test(`${scenario} at ${size}px root`,async()=>{
      const page=await openVisualPage(browser,url,scenario,375,false,true);
      if(size!==16)await page.addStyleTag({content:`html{font-size:${size}px!important}`});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const view=await inspect(page);assert.equal(view.root,size);
      if(view.issues.length)failures.push({scenario,size,issues:view.issues});
      mkdirSync('tmp/report-qa/v55',{recursive:true});
      if(['player-stats','preferences','results'].includes(scenario))await page.screenshot({path:`tmp/report-qa/v55/${scenario}-${size}.png`,fullPage:true});
      await page.close();assert.deepEqual(view.issues,[],`${scenario} has readable text without page overflow`);
    });
    await t.test('caption and input floors hold when the browser default is smaller',async()=>{
      const page=await openVisualPage(browser,url,'classic',375);
      await page.addStyleTag({content:'html{font-size:12px!important}'});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      assert.deepEqual((await inspect(page)).issues,[]);
      assert.ok(await page.$$eval('#score .score-input',nodes=>nodes.every(node=>parseFloat(getComputedStyle(node).fontSize)>=16)));
      await page.close();
    });
    for(const mode of ['classic','player-stats'])await t.test(`${mode} keeps editable scores with a reduced keyboard viewport`,async()=>{
      const page=await openVisualPage(browser,url,mode,375);
      await page.addStyleTag({content:'html{font-size:24px!important}'});
      const selector=mode==='classic'?'#score .gross-score-stepper [data-score-player="p0"]':'#score .player-mode-more-score [data-score-player="p0"]';
      await page.focus(selector);await page.setViewport({width:375,height:440,deviceScaleFactor:1});
      await page.$eval(selector,node=>node.select());await page.keyboard.type('6');await page.keyboard.press('Tab');
      await page.click(mode==='classic'?'#nextHoleBtn':'[data-player-mode-save-next]');
      await page.waitForFunction(()=>{
        const state=JSON.parse(localStorage.getItem('the-dye-ledger-v20'));
        return state.matches[0].players[0].scores[3].gross===6;
      });
      const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('the-dye-ledger-v20')).matches[0].players.map(player=>player.scores[3].gross));
      assert.deepEqual(saved,[6,4,5,5],'unrendered players retain their facts');
      assert.deepEqual((await inspect(page)).issues,[]);
      await page.close();
    });
    for(const width of [320,430,1280])await t.test(`Player Mode at ${width}px with larger text`,async()=>{
      const page=await openVisualPage(browser,url,'player-stats',width);
      await page.addStyleTag({content:'html{font-size:24px!important}'});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      assert.deepEqual((await inspect(page)).issues,[]);await page.close();
    });
  }finally{
    mkdirSync('tmp/report-qa/v55',{recursive:true});writeFileSync('tmp/report-qa/v55/layout-issues.json',JSON.stringify(failures,null,2));
    await browser.close();await new Promise(done=>server.close(done));
  }
});
