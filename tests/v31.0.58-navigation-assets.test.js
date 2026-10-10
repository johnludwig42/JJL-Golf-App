import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('every external navigation symbol resolves to an offline-cached decorative asset',()=>{
  const html=fs.readFileSync('index.html','utf8');
  const worker=fs.readFileSync('service-worker.js','utf8');
  const nav=html.match(/<nav class="tabs[\s\S]*?<\/nav>/)[0];
  const symbols=[...nav.matchAll(/<use href="([^"#]+)#([^\"]+)"/g)];
  assert.equal(symbols.length,6);
  assert.equal(new Set(symbols.map(([,path])=>path)).size,6);
  for(const [,path,id] of symbols){
    const svg=fs.readFileSync(path.split('?')[0],'utf8');
    assert.ok(svg.includes(`id="${id}"`),`${path} has its external symbol`);
    assert.ok(worker.includes(`'./${path}'`),`${path} is precached for offline navigation`);
    assert.match(svg,/stroke="currentColor"/,'artwork uses theme ink');
  }
  assert.equal((nav.match(/aria-hidden="true"/g)||[]).length,6);
  assert.equal((nav.match(/focusable="false"/g)||[]).length,6);
});
