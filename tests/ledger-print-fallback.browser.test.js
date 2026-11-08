import test from 'node:test';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {loadLiveEngine} from '../scripts/live-engine-adapter.js';
import {scrambleFixture} from './support/scramble-fixture.js';
import {chrome,startServer} from './support/design-browser.js';

function fixture(){
 const engine=loadLiveEngine(),data=scrambleFixture();
 data.match.status='complete';data.match.date='2026-11-08';data.match.name='Print Fixture';
 data.match.roundRecapFinal='A synthetic Story for the print fallback acceptance.';
 data.match.players.forEach(p=>p.scores.forEach(s=>s.gross=4));
 const live=engine.seedState({players:data.players,courses:[data.course],matches:[data.match]}).matches[0];
 const report=engine.buildLedgerEntryReportModel(live);
 report.meta.status='final';report.meta.story=data.match.roundRecapFinal;report.meta.acceptanceStatus='accepted';
 return report;
}

test('Ledger print, export and toolbar contracts (Chrome simulation, not iPhone acceptance)',{skip:!chrome,timeout:90000},async t=>{
 const server=await startServer(),origin=`http://127.0.0.1:${server.address().port}`;
 const browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu','--disable-background-networking']});
 const report=fixture();
 async function open(options={}){
  const page=await browser.newPage();page.setDefaultTimeout(4000);await page.setViewport({width:375,height:812});
  if(options.ios)await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Version/26.6 Mobile Safari/604.1');
  const errors=[],external=[],fetchRequests=[],heldFonts=[];let fontsReleased=!options.holdFonts;
  page.on('pageerror',e=>errors.push(String(e)));
  await page.setRequestInterception(true);
  page.on('request',r=>{
   if(r.url()===origin+'/return-fixture'){void r.respond({status:200,contentType:'text/html',body:'<!doctype html><title>Returned to synthetic match</title><p>Match fixture</p>'});return;}
   if(!r.url().startsWith(origin+'/')&&!r.url().startsWith('data:')&&!r.url().startsWith('blob:')){external.push(r.url());void r.abort();return;}
   if(['fetch','xhr'].includes(r.resourceType())){
    fetchRequests.push({url:r.url(),type:r.resourceType(),headers:r.headers()});
    if(!fontsReleased){heldFonts.push(r);return;}
    if(options.failFonts){void r.abort();return;}
    if(options.font404){void r.respond({status:404,contentType:'font/woff2',body:''});return;}
   }
   void r.continue();
  });
  const data=structuredClone(report);Object.assign(data.meta,options.meta||{});
  await page.evaluateOnNewDocument((data,options)=>{
   if(!location.pathname.endsWith('/ledger-report/shell.html'))return;
   window.printCalls=[];window.shared=[];window.downloads=[];window.listeners={};window.accepts=0;window.revisions=0;
   window.restorations=[];window.documentIdentity=Math.random();window.createdUrls=[];window.revokedUrls=[];
   const createUrl=URL.createObjectURL.bind(URL),revokeUrl=URL.revokeObjectURL.bind(URL);
   URL.createObjectURL=file=>{const url=createUrl(file);window.createdUrls.push(url);return url;};
   URL.revokeObjectURL=url=>{window.revokedUrls.push(url);return revokeUrl(url);};
   const add=window.addEventListener.bind(window);
   window.addEventListener=(name,...args)=>{window.listeners[name]=(window.listeners[name]||0)+1;return add(name,...args);};
   add('pageshow',event=>window.restorations.push(event.persisted));
   Object.defineProperty(navigator,'standalone',{value:options.standalone!==false,configurable:true});
   if(options.ipadDesktop){Object.defineProperty(navigator,'platform',{value:'MacIntel'});Object.defineProperty(navigator,'maxTouchPoints',{value:5});}
   if(options.holdLayout){let release;const ready=new Promise(r=>release=r);Object.defineProperty(document.fonts,'ready',{value:ready});window.releaseLayout=release;}
   window.print=()=>{
    window.printCalls.push({active:navigator.userActivation.isActive,status:document.getElementById('printStatus')?.textContent});
    if(options.print==='throw')throw Error('Synthetic print exception');
    if(options.print==='events'){dispatchEvent(new Event('beforeprint'));dispatchEvent(new Event('afterprint'));}
    if(options.print==='beforeOnly')dispatchEvent(new Event('beforeprint'));
    if(options.print==='afterOnly')dispatchEvent(new Event('afterprint'));
   };
   Object.defineProperty(navigator,'canShare',{configurable:true,value:options.download?undefined:()=>true});
   Object.defineProperty(navigator,'share',{configurable:true,value:payload=>{
    window.shared.push({active:navigator.userActivation.isActive,type:payload.files[0].type,name:payload.files[0].name,size:payload.files[0].size});
    window.exportText=payload.files[0].text();
    if(options.shareError)return Promise.reject(options.shareError==='TypeError'?new TypeError('Synthetic share failure'):new DOMException('Synthetic share failure',options.shareError));
    return options.cancelShare?Promise.reject(new DOMException('Cancelled','AbortError')):Promise.resolve();
   }});
   const click=HTMLAnchorElement.prototype.click;
   HTMLAnchorElement.prototype.click=function(){if(this.download){window.downloads.push({active:navigator.userActivation.isActive,href:this.href,name:this.download});if(!options.realDownload)return;}return click.call(this);};
   localStorage.setItem('print-protected-round',JSON.stringify({scores:[4,4],story:data.meta.story,frozen:true}));
   sessionStorage.setItem('print-protected-session','unchanged');
   sessionStorage.setItem('print-fixture',JSON.stringify({report:data,createdAt:new Date().toISOString(),autoPrint:!!options.autoPrint,returnUrl:location.origin+'/return-fixture'}));
  },data,options);
  await page.goto(origin+'/ledger-report/shell.html?reportKey=print-fixture',{waitUntil:'load'});
  return {page,errors,external,fetchRequests,releaseFonts:async()=>{fontsReleased=true;await Promise.all(heldFonts.splice(0).map(r=>r.continue()));}};
 }
 const snapshot=p=>p.evaluate(()=>({local:{...localStorage},session:{...sessionStorage}}));
 const ready=p=>p.waitForSelector('.page');
 const status=p=>p.$eval('#printStatus',n=>n.textContent);
 const settle=()=>new Promise(r=>setTimeout(r,1700));
 const fileReady=p=>p.waitForFunction(()=>document.getElementById('saveReportFileBtn').dataset.ready==='true');
 const fontNames=['archivo-latin-500-normal.woff2','archivo-latin-600-normal.woff2','archivo-latin-700-normal.woff2','inter-latin-400-normal.woff2','inter-latin-500-normal.woff2','inter-latin-600-normal.woff2','ibm-plex-mono-latin-400-normal.woff2','ibm-plex-mono-latin-500-normal.woff2','ibm-plex-mono-latin-600-normal.woff2'];
 async function assertPassiveExport(page,html,fontCount){
  assert.ok(Buffer.byteLength(html,'utf8')<=2*1024*1024);
  assert.doesNotMatch(html,/<(?:script|noscript|iframe|object|embed|form|button|input|select|textarea|dialog)\b|\son\w+\s*=|javascript:|contenteditable|tabindex|reportKey|print-fixture|dye-ledger-report-|__DYE_|sessionStorage|localStorage|return-fixture|data-font-fallback/i);
  for(const text of [report.meta.story,report.meta.course,report.meta.date])assert.ok(html.includes(text));
  const texts=await page.$$eval('#doc .page',nodes=>nodes.map(n=>n.textContent.replace(/\s+/g,' ').trim()));
  const copy=await browser.newPage(),requests=[];
  try{
   await copy.setJavaScriptEnabled(false);await copy.setRequestInterception(true);copy.on('request',r=>{if(!r.url().startsWith('data:'))requests.push(r.url());void r.abort();});
   await copy.setContent(html,{waitUntil:'load'});
   assert.deepEqual(await copy.$$eval('#doc .page',nodes=>nodes.map(n=>n.textContent.replace(/\s+/g,' ').trim())),texts);
   assert.equal(await copy.$$eval('script,noscript,iframe,object,embed,form,button,input,select,textarea,dialog,[hidden],.report-nav,#probe,.page-overflow-diagnostic,[tabindex],[contenteditable]',n=>n.length),0);
   assert.equal(await copy.$$eval('*',nodes=>nodes.every(n=>[...n.attributes].every(a=>!/^on/i.test(a.name)&&(!['src','href','xlink:href','poster','background','srcset'].includes(a.name)||/^(data:|#)/.test(a.value))))),true);
   assert.equal(await copy.$eval('meta[http-equiv="Content-Security-Policy"]',n=>n.content),"default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:");
   assert.equal(requests.length,0);assert.equal((html.match(/@font-face/g)||[]).length,fontCount);
   for(const match of html.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/gi))assert.ok(/^(data:|#)/i.test(match[1]),'Every resource is embedded');
  }finally{await copy.close();}
 }
 try{
  await t.test('no-op, repeat taps, late events and share preserve report storage',async()=>{
   const {page,errors,external,fetchRequests}=await open();try{
    await ready(page);const before=await snapshot(page);
    await page.click('#printLedgerEntryBtn');await page.click('#printLedgerEntryBtn');
    assert.equal(await page.evaluate(()=>printCalls.length),1);
    assert.deepEqual(await page.evaluate(()=>printCalls[0]),{active:true,status:'Opening print options…'});
    await settle();assert.match(await status(page),/If the print options/);
    assert.equal(await page.evaluate(()=>document.activeElement.id),'saveReportFileBtn');
    await page.waitForFunction(()=>document.getElementById('printStatus').textContent.includes('Report file ready')||document.getElementById('saveReportFileBtn').dataset.ready==='true');
    const pageTexts=await page.$$eval('#doc .page',nodes=>nodes.map(n=>n.textContent.replace(/\s+/g,' ').trim()));
    await page.click('#saveReportFileBtn');const shared=await page.evaluate(()=>shared);
    assert.equal(shared.length,1);assert.equal(shared[0].active,true);assert.equal(shared[0].type,'text/html');assert.ok(shared[0].size<=2*1024*1024);assert.match(shared[0].name,/^Dye-Ledger-.+-\d{4}-\d{2}-\d{2}\.html$/);
    const html=await page.evaluate(()=>exportText);
    await assertPassiveExport(page,html,9);
    assert.deepEqual(fetchRequests.map(r=>r.url).sort(),fontNames.map(name=>origin+'/ledger-report/fonts/'+name).sort());
    assert.ok(fetchRequests.every(r=>r.type==='fetch'&&!('cookie' in r.headers)&&!('authorization' in r.headers)));
    assert.doesNotMatch(html,/<(?:script|noscript|iframe|object|embed|form|button|input|select|textarea|dialog)\b|\son\w+\s*=|javascript:|contenteditable|tabindex|reportKey|dye-ledger-report-|__DYE_|sessionStorage|localStorage|return-fixture/i);
    assert.ok(html.includes(report.meta.story));assert.ok(html.includes(report.meta.course));assert.ok(html.includes(report.meta.date));
    const copy=await browser.newPage(),requests=[];await copy.setJavaScriptEnabled(false);await copy.setRequestInterception(true);copy.on('request',r=>{if(!r.url().startsWith('data:'))requests.push(r.url());void r.abort();});
    await copy.setContent(html,{waitUntil:'load'});
    assert.deepEqual(await copy.$$eval('#doc .page',nodes=>nodes.map(n=>n.textContent.replace(/\s+/g,' ').trim())),pageTexts);
    assert.equal(await copy.$$eval('script,[hidden],.report-nav,#probe,.page-overflow-diagnostic,[tabindex]',n=>n.length),0);assert.equal(requests.length,0);
    assert.ok((html.match(/@font-face/g)||[]).length<=9);
    for(const match of html.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/gi)) assert.ok(/^(?:data:|#)/i.test(match[1]),'Every resource is embedded');
    await copy.close();
    await page.click('#printLedgerEntryBtn');assert.equal(await page.evaluate(()=>printCalls.length),2);await page.evaluate(()=>dispatchEvent(new Event('beforeprint')));assert.equal(await status(page),'');await page.evaluate(()=>dispatchEvent(new Event('afterprint')));assert.equal(await status(page),'');
    assert.deepEqual(await page.evaluate(()=>({before:listeners.beforeprint,after:listeners.afterprint})),{before:1,after:1});
    assert.deepEqual(await snapshot(page),before);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    await page.click('#returnToMatchBtn');await page.waitForFunction(()=>location.pathname==='/return-fixture');
   }finally{await page.close();}
  });
  await t.test('throwing print offers fallback; cancel leaves storage and status unchanged',async()=>{
   const {page,errors}=await open({print:'throw',cancelShare:true});try{
    await ready(page);const before=await snapshot(page);await page.click('#printLedgerEntryBtn');assert.match(await status(page),/If the print options/);
    await page.waitForFunction(()=>document.getElementById('saveReportFileBtn').dataset.ready==='true');const prior=await status(page);await page.click('#saveReportFileBtn');await page.evaluate(()=>Promise.resolve());assert.equal(await status(page),prior);assert.deepEqual(await snapshot(page),before);assert.deepEqual(errors,[]);
   }finally{await page.close();}
  });
  await t.test('events clear feedback; automatic print is standalone-only suppressed',async()=>{
   for(const standalone of [true,false]){const {page}=await open({print:'events',autoPrint:true,standalone});try{
    await ready(page);await new Promise(r=>setTimeout(r,400));assert.equal(await page.evaluate(()=>printCalls.length),standalone?0:1);
    await page.click('#printLedgerEntryBtn');assert.equal(await status(page),'');await settle();assert.equal(await status(page),'');
   }finally{await page.close();}}
  });
  await t.test('readiness requires a fresh trusted tap, no disabled control',async()=>{
   const {page}=await open({holdLayout:true});try{
    await page.click('#printLedgerEntryBtn');assert.equal(await page.evaluate(()=>printCalls.length),0);assert.match(await status(page),/Preparing/);assert.equal(await page.$$('.report-nav :disabled').then(n=>n.length),0);
    await page.evaluate(()=>releaseLayout());await ready(page);assert.match(await status(page),/Ready/);await page.click('#printLedgerEntryBtn');assert.equal(await page.evaluate(()=>printCalls[0].active),true);
   }finally{await page.close();}
  });
  await t.test('download fallback and unavailable fonts produce a self-contained file',async()=>{
   const {page,errors}=await open({download:true,failFonts:true});try{
    await ready(page);await page.click('#printLedgerEntryBtn');await settle();await page.waitForFunction(()=>document.getElementById('saveReportFileBtn').dataset.ready==='true');const before=await snapshot(page);await page.click('#saveReportFileBtn');assert.equal(await page.evaluate(()=>downloads.length),1);assert.equal(await page.evaluate(()=>downloads[0].active),true);assert.match(await page.evaluate(()=>downloads[0].href),/^blob:/);assert.deepEqual(await snapshot(page),before);assert.deepEqual(errors,[]);
   }finally{await page.close();}
  });
  await t.test('delayed file preparation requires a fresh activated Save tap',async()=>{
   const {page,releaseFonts,fetchRequests}=await open({print:'throw',holdFonts:true});try{
    await ready(page);const before=await snapshot(page);await page.click('#printLedgerEntryBtn');await page.click('#saveReportFileBtn');
    assert.equal(await status(page),'Preparing the report file — tap again in a moment.');assert.deepEqual(await page.evaluate(()=>[shared.length,downloads.length]),[0,0]);
    for(let i=0;fetchRequests.length<9&&i<100;i++)await new Promise(r=>setTimeout(r,20));assert.equal(fetchRequests.length,9);
    await releaseFonts();await fileReady(page);assert.match(await status(page),/Report file ready — tap Save report file/);assert.equal(await page.evaluate(()=>shared.length),0);
    await page.click('#saveReportFileBtn');assert.equal(await page.evaluate(()=>shared.length),1);assert.equal(await page.evaluate(()=>shared[0].active),true);assert.deepEqual(await snapshot(page),before);
   }finally{await page.close();}
  });
  await t.test('non-cancellation share failures keep the report and storage',async()=>{
   for(const shareError of ['NotAllowedError','TypeError']){const {page,errors}=await open({shareError,print:'throw'});try{
    await ready(page);await fileReady(page);const before=await snapshot(page);await page.click('#printLedgerEntryBtn');await page.click('#saveReportFileBtn');
    await page.waitForFunction(()=>document.getElementById('printStatus').textContent.includes("The share sheet didn't open"));assert.doesNotMatch(await status(page),/Report file ready/);assert.ok(await page.$('#doc .page'));assert.deepEqual(await snapshot(page),before);assert.deepEqual(errors,[]);
   }finally{await page.close();}}
  });
  await t.test('font 404 and abort keep the complete passive export contract',async()=>{
   for(const failure of [{font404:true},{failFonts:true}]){const {page,errors,external}=await open({...failure,print:'throw'});try{
    await ready(page);await fileReady(page);const before=await snapshot(page);assert.equal(await page.$eval('#saveReportFileBtn',n=>n.dataset.fontFallback),'true');await page.click('#printLedgerEntryBtn');await page.click('#saveReportFileBtn');
    await assertPassiveExport(page,await page.evaluate(()=>exportText),0);assert.deepEqual(await snapshot(page),before);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
   }finally{await page.close();}}
  });
  await t.test('missing afterprint and isolated afterprint never lock later Print taps',async()=>{
   for(const print of ['beforeOnly','afterOnly']){const {page}=await open({print});try{
    await ready(page);const before=await snapshot(page);await page.click('#printLedgerEntryBtn');assert.equal(await status(page),'');await settle();assert.equal(await status(page),'');
    await page.click('#printLedgerEntryBtn');assert.equal(await page.evaluate(()=>printCalls.length),2);assert.equal(await status(page),'');assert.deepEqual(await snapshot(page),before);
   }finally{await page.close();}}
  });
  await t.test('iPad desktop mode hides desktop-only guidance',async()=>{
   const {page}=await open({ipadDesktop:true});try{await ready(page);assert.equal(await page.$eval('#desktopPrintTip',n=>n.hidden),true);}finally{await page.close();}
  });
  await t.test('real download completes after actual back-forward-cache restoration',async()=>{
   const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dye-print-download-'));t.diagnostic('Retained synthetic downloads: '+dir);
   const {page}=await open({download:true,realDownload:true,print:'throw'});const client=await browser.target().createCDPSession();
   try{
    await client.send('Browser.setDownloadBehavior',{behavior:'allowAndName',downloadPath:dir,eventsEnabled:true});
    await ready(page);await fileReady(page);const identity=await page.evaluate(()=>documentIdentity);const before=await snapshot(page);
    assert.equal(await page.evaluate(()=>createdUrls.length),0);await page.goto(origin+'/return-fixture',{waitUntil:'load'});await page.goBack({waitUntil:'load'});
    assert.equal(await page.evaluate(()=>documentIdentity),identity,'same live document restored');assert.equal(await page.evaluate(()=>restorations.at(-1)),true,'real persisted pageshow, not a synthetic event');
    assert.deepEqual(await snapshot(page),before);await page.click('#printLedgerEntryBtn');
    const completed=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{client.off('Browser.downloadProgress',listener);reject(Error('Synthetic download did not complete'));},5000);function listener(event){if(event.state==='completed'){clearTimeout(timer);client.off('Browser.downloadProgress',listener);resolve(event.guid);}}client.on('Browser.downloadProgress',listener);});
    await page.click('#saveReportFileBtn');const guid=await completed;const html=fs.readFileSync(path.join(dir,guid),'utf8');
    assert.equal(await page.evaluate(()=>downloads[0].active),true);assert.equal(await page.evaluate(()=>createdUrls.length),1);assert.equal(await page.evaluate(()=>revokedUrls.length),0,'URL remains live until browser consumes the download');
    await assertPassiveExport(page,html,9);assert.deepEqual(await snapshot(page),before);
   }finally{await client.detach();await page.close();}
  });
  await t.test('accepted, preview and incomplete toolbars preserve accept and unlock authority',async()=>{
   for(const meta of [{acceptanceStatus:'accepted'},{acceptanceStatus:'',storyApprovalRequired:true},{acceptanceStatus:'',status:'provisional'},{acceptanceStatus:'',status:'final'}]){
    const {page}=await open({meta,ios:true});try{
     await ready(page);assert.equal(await page.$$('.report-nav :disabled').then(n=>n.length),0);assert.equal(await page.$eval('#desktopPrintTip',n=>n.hidden),true);
     assert.ok(await page.$$eval('.report-nav button',nodes=>nodes.filter(n=>!n.hidden).every(n=>n.getBoundingClientRect().height>=44)));
     if(meta.acceptanceStatus==='accepted'){
      assert.equal(await page.$eval('#ledgerAcceptanceStatus',n=>n.tagName),'SPAN');assert.match(await page.$eval('#ledgerAcceptanceStatus',n=>n.textContent),/✓ Accepted/);
      await page.evaluate(()=>{window.__DYE_LEDGER_QUEUE_REVISION__=()=>{window.revisions++;return true;};window.confirm=()=>false;});await page.click('#reviseLedgerEntryBtn');assert.equal(await page.evaluate(()=>revisions),0);
      await page.evaluate(()=>window.confirm=()=>true);await page.click('#reviseLedgerEntryBtn');assert.equal(await page.evaluate(()=>revisions),1);assert.equal(await page.$eval('#acceptLedgerEntryBtn',n=>n.hidden),true);
     }else if(meta.status==='final'){
      await page.evaluate(()=>window.__DYE_LEDGER_QUEUE_ACCEPTANCE__=()=>{window.accepts++;return true;});await page.click('#acceptLedgerEntryBtn');assert.equal(await page.evaluate(()=>accepts),1);assert.match(await page.$eval('#ledgerAcceptanceStatus',n=>n.textContent),/Accepted/);
     }else assert.equal(await page.$eval('#acceptLedgerEntryBtn',n=>n.hidden),true);
    }finally{await page.close();}
   }
   const {page}=await open();try{await ready(page);assert.equal(await page.$eval('#desktopPrintTip',n=>n.hidden),false);}finally{await page.close();}
  });
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
