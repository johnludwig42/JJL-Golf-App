import test from 'node:test';
import assert from 'node:assert/strict';
import {compactFlamtanaEvidence,formatFlamtanaMatchedSteps} from '../ledger-report/flamtana-evidence.js';

test('printed evidence retains every candidate-set change and does not mutate complete saved steps',()=>{
 const step=(label,remaining)=>({label,remaining,totals:remaining.map(id=>({id,total:4}))});
 const saved=[step('18-hole net total',['T1','T2','T3']),step('Hole 18',['T1','T2','T3']),step('Hole 17',['T1','T2','T3']),step('Hole 16',['T1','T2']),step('Hole 15',['T1','T2']),step('Hole 14',['T1'])];
 const before=JSON.stringify(saved),printed=compactFlamtanaEvidence(saved);
 assert.deepEqual(printed.filter(row=>row.kind==='comparison').map(row=>row.step.label),['18-hole net total','Hole 16','Hole 14']);
 assert.deepEqual(printed.filter(row=>row.kind==='matched').map(row=>formatFlamtanaMatchedSteps(row.labels)),['Holes 18–17 matched.','Hole 15 matched.']);
 assert.equal(JSON.stringify(saved),before);
});

test('exhausted methods retain every matched comparison label in compact ranges',()=>{
 const evidence=[{label:'18-hole net total',remaining:['F1','F2'],totals:[{id:'F1',total:72},{id:'F2',total:72}]},...Array.from({length:18},(_,i)=>({label:'Hole '+(18-i),remaining:['F1','F2'],totals:[{id:'F1',total:4},{id:'F2',total:4}]}))];
 const result=compactFlamtanaEvidence(evidence);
 assert.equal(result.length,2);assert.equal(result[1].labels.length,18);
 assert.equal(formatFlamtanaMatchedSteps(result[1].labels),'Holes 18–1 matched.');
 assert.equal(formatFlamtanaMatchedSteps(['Back nine','Last six','Last three','Hole 18']),'Back nine / Last six / Last three / Hole 18 matched.');
});

test('unknown or changed candidate sets are never hidden',()=>{
 const evidence=[{label:'Total',remaining:['A','B']},{label:'Unknown'},{label:'Changed',remaining:['A','C']},{label:'Again',remaining:['A','B']}];
 assert.equal(compactFlamtanaEvidence(evidence).filter(row=>row.kind==='comparison').length,4);
});
