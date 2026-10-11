// Reproducible completed-round benchmark using the real engine and finish path.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {loadLiveEngine} from './live-engine-adapter.js';
import {completedFixture} from '../tests/support/storage-footprint-fixture.js';
const baselineRef=process.argv[2] || 'd5a0363';
const baselineSource=execFileSync('git',['show',`${baselineRef}:app.js`],{encoding:'utf8',maxBuffer:8*1024*1024});
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'dye-ledger-footprint-'));
const baselinePath=path.join(temporary,'app.js');fs.writeFileSync(baselinePath,baselineSource);
try{
 const results=[];
 for(const options of [{tracked:false,allTied:false},{tracked:false,allTied:true},{tracked:true,allTied:false}]){
  const {tracked,allTied}=options;
  const beforeEngine=loadLiveEngine(baselinePath),afterEngine=loadLiveEngine();
  const before=completedFixture(beforeEngine,{...options,diagnostics:!tracked}),after=completedFixture(afterEngine,{...options,diagnostics:!tracked});
  assert.equal(JSON.stringify(before.finished.roundRecordSnapshot.games),JSON.stringify(after.finished.roundRecordSnapshot.games));
  assert.equal(JSON.stringify(before.finished.roundRecordSnapshot.players),JSON.stringify(after.finished.roundRecordSnapshot.players));
  const beforeReport=beforeEngine.buildLedgerEntryReportModel(before.finished),afterReport=afterEngine.buildLedgerEntryReportModel(after.finished);
  assert.equal(JSON.stringify(beforeReport.payments),JSON.stringify(afterReport.payments));
  assert.equal(JSON.stringify(beforeReport.players),JSON.stringify(afterReport.players));
  const bytes=value=>Buffer.byteLength(JSON.stringify(value),'utf8');
  const size=match=>({matchBytes:bytes(match),statsBytes:match.players.reduce((total,player)=>total+(player.stats?bytes(player.stats):0),0),diagnosticsBytes:bytes(match.sharedSyncDiagnostics),diagnosticRows:match.sharedSyncDiagnostics.length});
  const result={kind:tracked?'completed tracked individual':allTied?'completed shared Flamtana, exhaustive card-off':'completed shared Flamtana',before:size(before.finished),after:size(after.finished)};
  const legacy=JSON.parse(JSON.stringify(before.finished));
  legacy.sharedSyncDiagnostics=Array.from({length:200},(_,i)=>({reasonCode:'REMOTE_SCORE_ACCEPTED',occurredAt:'2026-10-11T15:00:00Z',playerId:'p0',holeNumber:i%18+1,sourceParticipant:'hp',authorizedParticipantId:'hp',detail:'accepted score write'}));
  const beforeLegacy=bytes(legacy),frozen=JSON.stringify(legacy.roundRecordSnapshot);
  afterEngine.compactPersistentMatches({matches:[legacy]});assert.equal(JSON.stringify(legacy.roundRecordSnapshot),frozen);
  result.legacy200Events={beforeBytes:beforeLegacy,afterBytes:bytes(legacy)};results.push(result);
 }
 const output={baselineRef,currentVersion:loadLiveEngine().version,unit:'UTF-8 bytes of JSON.stringify; excludes backup copies',results};
 fs.writeFileSync('reports/storage-footprint-v31.0.68.json',JSON.stringify(output,null,2)+'\n');
 console.log(JSON.stringify(output,null,2));
}finally{
 fs.unlinkSync(baselinePath);fs.rmdirSync(temporary);
}
