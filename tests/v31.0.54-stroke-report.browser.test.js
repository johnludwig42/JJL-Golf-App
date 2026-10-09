import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import puppeteer from 'puppeteer-core';
import {chrome,startServer} from './support/design-browser.js';
import {reportFixture} from './support/report-fixtures.js';

test('Southern Dunes cover snapshots preserve net/gross graphics, tables and printable packing',{skip:!chrome,timeout:120000},async t=>{
  const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
  const url=`http://127.0.0.1:${server.address().port}/ledger-report/shell.html`;
  try{
    for(const basis of ['net','gross'])await t.test(basis,async()=>{
      const {engine,live}=reportFixture(0);
      live.selectedGames[0].basis=basis;
      const report=engine.buildLedgerEntryReportModel(live,engine.computeMatchMetrics(live));
      report.meta.recap=null;report.meta.story=null;report.meta.status='final';
      const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(String(error)));
      await page.setViewport({width:900,height:1200,deviceScaleFactor:1});
      await page.evaluateOnNewDocument(data=>sessionStorage.setItem('stroke-review',JSON.stringify({createdAt:new Date().toISOString(),report:data})),report);
      await page.goto(url+'?reportKey=stroke-review',{waitUntil:'networkidle0'});
      await page.evaluate(()=>document.fonts.ready);
      await page.waitForSelector('[data-stroke-strip="position"]');
      const view=await page.evaluate(()=>{
        const pages=[...document.querySelectorAll('#doc .page')];
        const cover=pages[0],hc=document.querySelector('[data-handicaps]'),hcPage=pages.indexOf(hc.closest('.page'));
        const color=(selector)=>[...cover.querySelectorAll(selector)].map(node=>getComputedStyle(node).color);
        return {hero:cover.querySelector('h1').textContent,coverText:cover.textContent,handicapPage:hcPage,
          handicapFirst:hcPage===0||pages[hcPage].querySelector('.flow').firstElementChild.textContent.includes('Handicaps'),
          chart:!!cover.querySelector('.stroke-chart'),positions:[...cover.querySelectorAll('[data-stroke-strip="position"] tbody tr')].map(row=>row.textContent),
          par:[...cover.querySelectorAll('[data-stroke-strip="par"] tbody tr')].map(row=>row.textContent),
          ticks:[...cover.querySelectorAll('[data-grid-tick]')].map(node=>node.getAttribute('data-grid-tick')),
          dots:cover.querySelectorAll('[data-stroke-strip="par"] small').length,
          leadFixed:cover.querySelector('[data-lead-fixed]')?.getAttribute('data-lead-fixed')??null,
          colors:color('[data-stroke-strip="position"] tbody th'),
          story:document.querySelector('.prose')?.textContent,
          plotWidth:cover.querySelector('.stroke-chart').getBoundingClientRect().width,
          plottedEnd:Number(cover.querySelector('[data-grid-tick]').getAttribute('x2')),
          legendNames:[...cover.querySelectorAll('[data-entry-legend] b')].map(node=>node.textContent),
          endNames:[...cover.querySelectorAll('[data-entry-label]')].map(node=>[...node.querySelectorAll('[data-name-line]')].map(line=>line.textContent).join(' ')),
          overflow:pages.some(pg=>{const flow=pg.querySelector('.flow');return flow.lastElementChild.getBoundingClientRect().bottom>flow.getBoundingClientRect().bottom+2;})};
      });
      assert.deepEqual(errors,[]);assert.equal(view.chart,true);assert.equal(view.positions.length,4);assert.equal(view.par.length,0);
      assert.equal(view.overflow,false);assert.equal(view.handicapPage,0);assert.equal(view.handicapFirst,true);
      assert.doesNotMatch(view.coverText,/Course net|full CH|No featured competition/);
      assert.ok(view.ticks.every(value=>/^\d+$/.test(value)));
      assert.deepEqual(view.legendNames.slice().sort(),['Mark & Kell','Magic & Crabby Pants','Hush & Lud','Neil & Kappy'].sort());
      assert.deepEqual(view.endNames,[]);assert.equal(view.leadFixed,null);assert.equal(view.plottedEnd,706);
      if(basis==='net'){assert.match(view.hero,/70/);assert.match(view.story,/established at hole 15/);assert.match(view.story,/321 yards, stroke index 14/);assert.equal(view.dots,0);assert.match(view.coverText,/The swing · 7–10/);}
      else {assert.match(view.hero,/71/);assert.equal(view.dots,0);assert.doesNotMatch(view.coverText,/Gross to par by hole/);}
      const snapshot={hero:view.hero,positions:view.positions,par:view.par,ticks:view.ticks,dots:view.dots,leadFixed:view.leadFixed,colors:view.colors,endNames:view.endNames,legendNames:view.legendNames,plottedEnd:view.plottedEnd};
      const path=`tests/fixtures/reports/southern-dunes-${basis}-cover.json`;
      if(process.env.UPDATE_STROKE_SNAPSHOTS==='1'){mkdirSync('tests/fixtures/reports',{recursive:true});writeFileSync(path,JSON.stringify(snapshot,null,2)+'\n');}
      assert.ok(existsSync(path),'reviewed cover snapshot exists');assert.deepEqual(snapshot,JSON.parse(readFileSync(path)));
      mkdirSync('tmp/report-qa/v54',{recursive:true});
      const html=await page.content();writeFileSync(`tmp/report-qa/v54/southern-dunes-${basis}.html`,html);
      await page.$eval('.report-nav',node=>node.style.display='none');
      const cover=await (await page.$('#doc .page')).screenshot({path:`tmp/report-qa/v54/southern-dunes-${basis}-cover.png`});
      const imagePath=`tests/fixtures/reports/southern-dunes-${basis}-cover.png`;
      if(process.env.UPDATE_STROKE_SNAPSHOTS==='1')writeFileSync(imagePath,cover);
      assert.ok(existsSync(imagePath),'reviewed cover image exists');
      assert.equal(Buffer.compare(cover,readFileSync(imagePath)),0,'cover pixels match the reviewed snapshot');
      await page.emulateMediaType('print');
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      if(process.env.WRITE_STROKE_PDF_PREVIEWS==='1')await page.pdf({path:`tmp/report-qa/v54/southern-dunes-${basis}.pdf`,format:'Letter',printBackground:true,preferCSSPageSize:true});
      assert.equal(await page.$eval('.report-nav',node=>getComputedStyle(node).display),'none');
      await page.close();
    });
    await t.test('nonfeatured stroke play renders detail instead of a no-data message',async()=>{
      const {report}=reportFixture(0);
      const stroke=report.games[0];stroke.featured=false;
      report.games.unshift({id:'nassau',name:'Nassau',type:'nassau',basis:'net',featured:true,scope:'team',allowance:{key:'featured',label:'Off low'},bestN:1,
        sides:[{key:'T1',playerIds:['p0']},{key:'T2',playerIds:['p1']}],segments:[{label:'Round',holes:report.holes}],money:{}});
      const page=await browser.newPage();await page.evaluateOnNewDocument(data=>sessionStorage.setItem('side-stroke',JSON.stringify({createdAt:new Date().toISOString(),report:data})),report);
      await page.goto(url+'?reportKey=side-stroke',{waitUntil:'networkidle0'});
      assert.equal(await page.$eval('.stroke-detail',node=>node.querySelectorAll('[data-stroke-strip]').length),1);
      assert.doesNotMatch(await page.$eval('.stroke-detail',node=>node.textContent),/No hole detail/);
      await page.close();
    });
    await t.test('a large handicap table starts page 2 instead of being dropped',async()=>{
      const {report}=reportFixture(0);
      for(let i=0;i<8;i++)report.games.push({id:'extra-'+i,name:'Additional competition '+i,type:'settlement',basis:'net',allowance:{key:'featured',label:('Saved per-competition allowance and allocation detail. ').repeat(5)},handicaps:{p0:i,p1:i+1,p2:i+2,p3:i+3},money:{}});
      const page=await browser.newPage();await page.evaluateOnNewDocument(data=>sessionStorage.setItem('overflow-handicaps',JSON.stringify({createdAt:new Date().toISOString(),report:data})),report);
      await page.goto(url+'?reportKey=overflow-handicaps',{waitUntil:'networkidle0'});
      const state=await page.evaluate(()=>{const pages=[...document.querySelectorAll('#doc .page')],table=document.querySelector('[data-handicaps]');return {page:pages.indexOf(table.closest('.page')),first:pages[1].querySelector('.flow').firstElementChild.textContent.includes('Handicaps'),rows:table.querySelectorAll('tbody tr').length};});
      assert.equal(state.page,1);assert.equal(state.first,true);assert.equal(state.rows,4);
      await page.close();
    });
  }finally{await browser.close();await new Promise(done=>server.close(done));}
});
