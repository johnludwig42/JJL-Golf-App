import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import postcss from 'postcss';import {auditStyleContract} from '../scripts/css-token-contract.js';
const base=fs.readFileSync('style.css','utf8'),components=fs.readFileSync('app-components.css','utf8');
test('screen components reuse guarded color and type roles without important overrides',()=>{
 const exceptions=JSON.parse(fs.readFileSync('tests/fixtures/design/style-exceptions.json'));
 assert.deepEqual(auditStyleContract(base+'\n'+components,exceptions).violations,[]);
 let important=0;postcss.parse(components).walkDecls(d=>{if(d.important)important++;});assert.equal(important,0);
 assert.match(fs.readFileSync('index.html','utf8'),/media="screen" href="app-components\.css/);
 assert.match(fs.readFileSync('service-worker.js','utf8'),/app-components\.css/);
});
test('component consolidation reduces total important declarations from the 640 baseline',()=>{
 let count=0;postcss.parse(base+'\n'+components).walkDecls(d=>{if(d.important)count++;});assert.ok(count<640);
});
