/* Device-local exception audit. No score uploads or frozen-record writes. */
(function(root){
  'use strict';
  const clone=value=>JSON.parse(JSON.stringify(value));
  const canonical=value=>JSON.stringify(sort(value));
  function sort(value){
    if(Array.isArray(value))return value.map(sort);
    if(value && typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,sort(value[key])]));
    return value;
  }
  async function hash(value){
    if(!root.crypto?.subtle)throw new Error('Secure local review storage is unavailable. Scores remain preserved.');
    const bytes=new TextEncoder().encode(canonical(value));
    return Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  }
  const fields=['gross','putts','fairway','green','up_and_down','sandy','entry_status'];
  const values=entry=>entry?Object.fromEntries(fields.filter(key=>entry[key]!==undefined).map(key=>[key,entry[key]])):null;
  function frozenValue(record,playerId,hole){
    const score=record?.holes?.find(row=>Number(row.holeNumber)===Number(hole))?.scores?.find(row=>String(row.playerId)===String(playerId));
    return score?.gross ?? null;
  }
  function groups(match,operations,record,teamScored){
    const result=new Map();
    for(const op of operations){
      const player=match.players?.find(p=>String(p.playerId)===String(op.playerId));
      const id=(teamScored?'team:'+player?.team:'player:'+op.playerId)+':'+op.holeNumber;
      if(!result.has(id))result.set(id,{id,team:player?.team,hole:Number(op.holeNumber),playerIds:teamScored?(match.players || []).filter(p=>p.team===player?.team).map(p=>String(p.playerId)):[String(op.playerId)],operations:[]});
      result.get(id).operations.push(op);
    }
    return [...result.values()].map(group=>{
      const candidates=group.operations.flatMap(op=>[op.scoreEntry?.gross,op.localScoreEntry?.gross]).filter(v=>v!==undefined && v!==null);
      const unique=[...new Set(candidates.map(Number))];
      return {...group,candidates:unique,mismatch:unique.length>1,
        frozen:group.playerIds.map(id=>({playerId:id,gross:frozenValue(record,id,group.hole)}))};
    });
  }
  function auditStore(indexedDB=root.indexedDB){
    let opening;
    async function open(){
      if(!indexedDB)throw new Error('Local audit storage is unavailable. No scores were cleared.');
      if(!opening)opening=new Promise((resolve,reject)=>{
        const req=indexedDB.open('the-dye-ledger-score-review-v1',1);
        req.onupgradeneeded=()=>{const store=req.result.createObjectStore('receipts',{keyPath:'id'});store.createIndex('matchId','matchId');};
        req.onerror=()=>{opening=null;reject(req.error || new Error('Cannot open local audit'));};
        req.onblocked=()=>{opening=null;reject(new Error('Close other Dye Ledger tabs and retry local audit storage.'));};
        req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>{db.close();opening=null;};resolve(db);};
      });
      return opening;
    }
    async function transaction(mode,action){
      const db=await open();return new Promise((resolve,reject)=>{
        const tx=db.transaction('receipts',mode),request=action(tx.objectStore('receipts'));let value;
        request.onsuccess=()=>{value=request.result;};
        tx.oncomplete=()=>resolve(value);tx.onabort=tx.onerror=()=>reject(tx.error || new Error('Local audit could not be saved. No scores were cleared.'));
      });
    }
    return {usage:async()=>{const rows=await transaction('readonly',store=>store.getAll());return {receipts:rows.length,bytes:canonical(rows).length*2};},put:receipt=>transaction('readwrite',store=>store.put(receipt)),list:matchId=>transaction('readonly',store=>store.index('matchId').getAll(String(matchId)))};
  }
  function pressure(storage,outbox,{deliveryBytes=256*1024,totalBytes=2*1024*1024}={}){
    let total=0;
    for(let i=0;i<storage.length;i++){const key=storage.key(i);total+=(String(key).length+String(storage.getItem(key) || '').length)*2;}
    const bytes=canonical(outbox).length*2;
    return {pending:outbox.operations?.length || 0,review:outbox.preservedForHostReview?.length || 0,deliveryBytes:bytes,totalBytes:total,warning:bytes>=deliveryBytes || total>=totalBytes};
  }
  // Audit is written before the caller may remove payloads. IDs and fingerprints
  // make cleanup recoverable without discarding a changed/replaced operation.
  async function prepare({matchId,selected,decision,reason,actor,record,choices={},statsEnabled=false,sourceLabels={}}){
    if(!['already-reflected','discard'].includes(decision))throw new Error('Choose Already reflected or Discard.');
    if(!String(reason || '').trim())throw new Error('Enter a reason for this decision.');
    if(!selected.length)throw new Error('Select the exact rows to resolve.');
    const rows=[],origins=[];
    const originFor=op=>{
      const value={deviceId:op.deviceId || 'unknown',deviceLabel:sourceLabels[op.deviceId] || op.deviceId || 'Unknown device',participantId:op.participantId || '',preservedAt:op.preservedAt || null};
      let index=origins.findIndex(row=>canonical(row)===canonical(value));
      if(index<0){index=origins.length;origins.push(value);}return index;
    };
    for(const group of selected){
      const choice=choices[group.id]===undefined || choices[group.id]===''?group.candidates[0]:Number(choices[group.id]);
      if(group.mismatch && (!Number.isInteger(choice) || choice<1 || choice>25 || choices[group.id]===undefined || choices[group.id]===''))throw new Error('Choose a consistent team review value for each mismatched row. This does not change the frozen result.');
      if(decision==='already-reflected' && (statsEnabled || !group.frozen.length || group.frozen.some(row=>row.gross===null || Number(row.gross)!==choice)))throw new Error(statsEnabled?'Per-hole statistics cannot be verified from this frozen record. Use Discard with an explanation.':'The frozen record does not carry the selected review value. Use Discard with an explanation.');
      rows.push({groupId:group.id,team:group.team ?? null,hole:group.hole,players:group.playerIds,reviewValue:choice ?? null,final:group.frozen,
        sources:await Promise.all(group.operations.map(async op=>({id:op.operationId,fingerprint:await hash(op),playerId:op.playerId,queuedAt:op.queuedAt,origin:originFor(op),proposed:values(op.scoreEntry),local:canonical(values(op.localScoreEntry))===canonical(values(op.scoreEntry))?null:values(op.localScoreEntry),localEqualsCaptured:canonical(values(op.localScoreEntry))===canonical(values(op.scoreEntry))})))});
    }
    return {schemaVersion:1,id:root.crypto.randomUUID(),matchId:String(matchId),phase:'prepared',decision,reason:String(reason).trim(),actor:clone(actor),decidedAt:new Date().toISOString(),baseHash:record?await hash(record):null,origins,rows};
  }
  root.DyeLedgerPreservedReview={canonical,hash,groups,frozenValue,values,auditStore,pressure,prepare};
})(globalThis);
