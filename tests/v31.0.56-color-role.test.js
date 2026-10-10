import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import {createHash} from 'node:crypto';
const catalog=JSON.parse(fs.readFileSync(new URL('./fixtures/design/color-token-catalog.json',import.meta.url)));
test('shared palette is distinguished from exact surface and paper roles',()=>{
 const shared=catalog.filter(t=>t.scope==='shared');
 assert.ok(shared.length>=30&&shared.length<=40);
 assert.ok(catalog.every(t=>['shared','surface-specific','print'].includes(t.scope)&&t.purpose&& !/-\d+$/.test(t.name)));
 assert.ok(shared.some(t=>t.name==='--color-content-accent'));
 assert.ok(shared.some(t=>t.name==='--color-action-primary'));
 assert.ok(catalog.some(t=>t.name==='--color-content-navigation-selected-icon'&&t.value==='#f4ecd7'));
});
test('the v31.0.55 pixel baseline remains frozen',()=>{
 const css=fs.readFileSync(new URL('./fixtures/design/token-consolidation-baseline.css',import.meta.url),'utf8').replace(/\r\n/g,'\n');
 const identity=JSON.parse(fs.readFileSync(new URL('./fixtures/design/token-consolidation-baseline-identity.json',import.meta.url)));
 assert.equal(createHash('sha256').update(css).digest('hex'),identity.sha256);
});
