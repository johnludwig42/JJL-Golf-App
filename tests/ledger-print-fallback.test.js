import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const renderer=fs.readFileSync('ledger-report/report.js','utf8');
const shell=fs.readFileSync('ledger-report/shell.html','utf8');
const baselineWrites=1; // Transfer removal lives here; acceptance/revision writes remain in unchanged bootstrap.js.

test('Ledger printing provides a status region and passive file fallback',()=>{
 assert.match(shell,/id="printStatus"[^>]*role="status"/);
 assert.match(shell,/id="saveReportFileBtn"/);
 assert.match(shell,/id="printLedgerEntryBtn"[^>]*class="report-primary"/);
 assert.match(shell,/id="reviseLedgerEntryBtn"[^>]*class="report-secondary"/);
 assert.doesNotMatch(shell.slice(shell.indexOf('<nav'),shell.indexOf('</nav>')),/\sdisabled(?:[=>\s])/);
 assert.doesNotMatch(renderer,/button\.disabled\s*=\s*true/);
});

test('print and save handlers retain a synchronous trusted-click path',()=>{
 for(const [name,call]of [['requestPrint','window.print()'],['saveReportFile','navigator.share(']]){
  const start=renderer.indexOf('function '+name+'(');
  assert.ok(start>=0,name+' exists');
  const end=renderer.indexOf(call,start);assert.ok(end>start);
  assert.doesNotMatch(renderer.slice(start,end),/\bawait\b|setTimeout\(|\.then\(|requestAnimationFrame\(/);
 }
 assert.match(renderer,/display-mode: standalone/);
 assert.match(renderer,/navigator\.standalone/);
 assert.equal((renderer.match(/addEventListener\("beforeprint"/g)||[]).length,1);
 assert.equal((renderer.match(/addEventListener\("afterprint"/g)||[]).length,1);
 assert.equal((renderer.match(/(?:localStorage|sessionStorage)\.(?:setItem|removeItem|clear)\(/g)||[]).length,baselineWrites);
});

test('print completion, local font and passive-export boundaries remain explicit',()=>{
 const before=renderer.slice(renderer.indexOf('window.addEventListener("beforeprint"'),renderer.indexOf('window.addEventListener("afterprint"'));
 assert.match(before,/printAttempt=null/);
 assert.match(renderer,/url\.href\.startsWith\(fontRoot\.href\)/);
 const save=renderer.slice(renderer.indexOf('function saveReportFile('),renderer.indexOf('function layoutThenPrint('));
 assert.match(save,/const downloadUrl=URL\.createObjectURL\(exportFile\)/);
 assert.ok(save.indexOf('URL.createObjectURL(exportFile)')<save.indexOf('link.click()'));
 assert.ok(save.indexOf('link.click()')<save.indexOf('URL.revokeObjectURL(downloadUrl)'));
 assert.match(save,/setTimeout\(\(\)=>URL\.revokeObjectURL\(downloadUrl\),60000\)/);
 assert.match(renderer,/policy\.httpEquiv="Content-Security-Policy"/);
 assert.match(renderer,/default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:/);
 assert.doesNotMatch(renderer,/pagehide.*revokeObjectURL/);
});
