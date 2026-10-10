import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import postcss from 'postcss';
import { auditStyleContract, expandColorTokens, declarationKey, isColorTokenDeclaration } from '../scripts/css-token-contract.js';

const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const baseline = readFileSync(new URL('./fixtures/design/light-style-baseline.css', import.meta.url), 'utf8');
const exceptions = JSON.parse(readFileSync(new URL('./fixtures/design/style-exceptions.json', import.meta.url), 'utf8'));

test('the frozen baseline and documented token registry remain explicit review artifacts', () => {
  const identity = JSON.parse(readFileSync(new URL('./fixtures/design/light-baseline-identity.json', import.meta.url), 'utf8'));
  assert.equal(createHash('sha256').update(baseline.replace(/\r\n/g,'\n')).digest('hex'), identity.sha256);
  const catalog = JSON.parse(readFileSync(new URL('./fixtures/design/color-token-catalog.json', import.meta.url), 'utf8'));
  const declarations=[];
  postcss.parse(css).walkDecls(declaration=>{
    if(isColorTokenDeclaration(declaration) && declaration.parent.parent.type==='root')declarations.push(`${declaration.prop}: ${declaration.value}`.replace(/\r\n/g,'\n'));
  });
  assert.deepEqual(declarations.sort(),catalog.map(token=>`${token.name}: ${token.value}`.replace(/\r\n/g,'\n')).sort());
  assert.ok(catalog.every(token=>token.family && token.usage.length));
});

test('styles contain no color literals outside semantic tokens and no new px font sizes', () => {
  assert.deepEqual(auditStyleContract(css, exceptions).violations, []);
  assert.deepEqual(exceptions.colors, []);
});

test('dark token overrides are screen-scoped, registered and cannot alter print colors', () => {
  const catalog=JSON.parse(readFileSync(new URL('./fixtures/design/dark-color-token-catalog.json',import.meta.url),'utf8'));
  const light=JSON.parse(readFileSync(new URL('./fixtures/design/color-token-catalog.json',import.meta.url),'utf8'));
  const overrides=[];
  postcss.parse(css).walkAtRules('media',media=>{
    if(!media.params.includes('prefers-color-scheme: dark'))return;
    assert.equal(media.params,'screen and (prefers-color-scheme: dark)');
    media.walkDecls(declaration=>{
      if(!declaration.prop.startsWith('--'))return;
      assert.ok(isColorTokenDeclaration(declaration));
      assert.ok(!declaration.prop.startsWith('--color-print-'));
      assert.ok(light.some(token=>token.name===declaration.prop));
      overrides.push(`${declaration.prop}: ${declaration.value}`);
    });
  });
  assert.deepEqual(overrides.sort(),catalog.map(token=>`${token.name}: ${token.value}`).sort());
  assert.ok(catalog.length>0);
});

test('guardrail detects raw hex, functions, names and variable fallback colors', () => {
  for (const value of ['#123456', 'rgb(1 2 3 / .5)', 'rgb(calc(200 + 5),0,0)', 'hsl(20 50% 50%)', 'rebeccapurple', 'var(--new-color, #abc)']) {
    assert.ok(auditStyleContract(`${css}\n.new-component{color:${value}}`, exceptions).violations.length, value);
  }
  assert.ok(auditStyleContract(`${css}\n:root{color:red}`, exceptions).violations.length);
  assert.equal(auditStyleContract(':root{--color-content-test:red}.x{color:var(--color-content-test)}').violations.length, 0);
});

test('guardrail rejects new and duplicated px declarations and stale exceptions', () => {
  assert.ok(auditStyleContract(`${css}\n.new-component{font-size:13px}`, exceptions).violations.length);
  assert.ok(auditStyleContract(`${css}\n.new-component{font-size:clamp(13px,2vw,1rem)}`, exceptions).violations.length);
  assert.ok(auditStyleContract(`${css}\n.new-component{font:600 12px sans-serif}`, exceptions).violations.length);
  const extra = structuredClone(exceptions);
  extra.pxFontSizes.push({key:'.gone | font-size: 13px',count:1,reason:'Removed component'});
  assert.ok(auditStyleContract(css, extra).violations.some(value=>value.includes('exception count changed')));
  const item = exceptions.pxFontSizes[0];
  assert.ok(item?.key.startsWith('@media print'));
  const repeated=postcss.parse(css);
  let duplicated=false;
  repeated.walkDecls(declaration=>{
    if(!duplicated&&declarationKey(declaration)===item.key){declaration.parent.after(declaration.parent.clone());duplicated=true;}
  });
  const repeat = repeated.toString();
  assert.ok(auditStyleContract(repeat, exceptions).violations.some(value=>value.includes('exception count changed')));
});

test('guardrail rejects numbered color roles and missing color references',()=>{
  assert.ok(auditStyleContract(':root{--color-surface-card-2:white}').violations.some(v=>v.includes('numbered color token')));
  assert.ok(auditStyleContract('.new-component{color:var(--color-not-declared)}').violations.some(v=>v.includes('undefined color role')));
  assert.equal(auditStyleContract(':root{--color-surface-selected:white}.new-component{background:var(--color-surface-selected)}').violations.length,0);
});

test('color token expansion preserves the frozen color declarations and cascade exactly', () => {
  const declarations = source => {
    const result=[];
    const tree=postcss.parse(source),aliases=new Map();
    tree.walkDecls(d=>{if(d.parent.selector===':root'&&/^--(?:bg|card|text|muted|accent|border|shadow|danger)/.test(d.prop))aliases.set(d.prop,d.value);});
    tree.walkDecls(declaration=>{
      const copy=declaration.clone();copy.parent=declaration.parent;
      copy.value=copy.value.replace(/var\((--(?:bg|card|text|muted|accent|border|shadow|danger)[\w-]*)(?:,[^()]*)?\)/g,(all,name)=>aliases.get(name)||all);
      if(/^(?:--(?:bg|card|text|muted|accent|border|shadow|danger)|color$|background|border.*color|outline.*color|.*shadow$|fill$|stroke$|caret-color$)/.test(declaration.prop))result.push(declarationKey(copy));
    });
    return result;
  };
  const normalize=items=>items.map(item=>item.replace(/\bwhite\b/g,'#ffffff').replace(/#[\da-f]{3}\b/gi,hex=>'#'+[...hex.slice(1)].map(c=>c+c).join('')).replace(/rgba?\([^)]*\)/g,value=>value.replace(/[\d.]+/g,n=>String(Number(n))).replace(/\s/g,'')));
  assert.deepEqual(normalize(declarations(expandColorTokens(css))), normalize(declarations(baseline)));
});
