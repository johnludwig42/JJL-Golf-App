import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import postcss from 'postcss';
import {auditStyleContract} from '../scripts/css-token-contract.js';
const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
const exceptions=JSON.parse(readFileSync(new URL('./fixtures/design/style-exceptions.json',import.meta.url),'utf8'));

test('the type, weight, leading and spacing roles match the reviewed registry',()=>{
  const expected=JSON.parse(readFileSync(new URL('./fixtures/design/type-spacing-catalog.json',import.meta.url),'utf8')),actual={};
  postcss.parse(css).walkDecls(d=>{if(/^--(?:type|space|weight|leading)-/.test(d.prop))actual[d.prop]=d.value;});
  assert.deepEqual(actual,expected);
  assert.equal(Object.keys(actual).filter(key=>key.startsWith('--type-')).length,8);
  assert.equal(actual['--type-caption'],'max(.6875rem, 11px)');
  assert.ok(Object.entries(actual).filter(([key])=>key.startsWith('--type-')).every(([,value])=>/^max\([\d.]+rem, (?:11|16)px\)$/.test(value)));
  assert.ok(Object.entries(actual).filter(([key])=>key.startsWith('--space-')).every(([,value])=>value.endsWith('px')));
});

test('paper metrics remain a frozen, separately loaded print asset',()=>{
  const paper=readFileSync(new URL('../app-print.css',import.meta.url),'utf8').replace(/\r\n/g,'\n');
  const identity=JSON.parse(readFileSync(new URL('./fixtures/design/print-metrics-identity.json',import.meta.url),'utf8'));
  assert.equal(createHash('sha256').update(paper).digest('hex'),identity.sha256);
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/<link rel="stylesheet" media="print" href="app-print\.css\?/);
  assert.ok(exceptions.pxFontSizes.every(entry=>entry.key.startsWith('@media print')&&entry.reason.includes('print')));
  assert.equal(exceptions.pxFontSizes.length,4);
});

test('new arbitrary sizes, undefined roles and local token overrides cannot recreate drift',()=>{
  for(const extra of ['.small{font-size:.5rem}','.body{font-size:13px}','.x{font-size:var(--type-unreviewed)}','.x{--type-caption:8px}']){
    assert.ok(auditStyleContract(css+extra,exceptions).violations.length,extra);
  }
  assert.deepEqual(auditStyleContract(css,exceptions).violations,[]);
});
