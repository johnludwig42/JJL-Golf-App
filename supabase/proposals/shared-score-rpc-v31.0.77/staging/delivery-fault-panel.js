/* Staging review tool only. Never included by the published application shell.
 * Opt-in through the preview launcher AND ?deliveryReview=1. No auth values,
 * headers, passwords or session responses are inspected or exported. */
(() => {
  'use strict';
  const settings=window.__DYE_SUPABASE_CONFIG__;
  const targetOrigin='https://darbakmabpbkikisadop.supabase.co';
  if(location.hostname!=='127.0.0.1' || !['5087','5088'].includes(location.port)
    || new URLSearchParams(location.search).get('deliveryReview')!=='1'
    || settings?.url!==targetOrigin || settings?.accountAuth?.environment!=='staging'
    || settings?.accountAuth?.expectedProjectRef!=='darbakmabpbkikisadop')return;
  const storageKey='dye-staging-delivery-review-v1';
  let saved={};try{saved=JSON.parse(sessionStorage.getItem(storageKey) || '{}');}catch{}
  const events=Array.isArray(saved.events)?saved.events:[];
  const payloads=new Map(Array.isArray(saved.payloads)?saved.payloads:[]);
  let mode=saved.mode==='offline'?'offline':'pass',forceDirect=saved.forceDirect===true,release=null,memberClient=null,memberChannel=null,anonymousClient=null;
  const nativeFetch=window.fetch.bind(window);
  const panel=document.createElement('details');panel.id='stagingDeliveryReview';panel.open=true;
  panel.style.cssText='position:fixed;right:12px;bottom:12px;width:min(540px,95vw);max-height:65vh;overflow:auto;z-index:10000;background:#fff9da;color:#162b20;border:3px solid #9b7400;padding:12px;font:14px system-ui;box-shadow:0 2px 15px #3335';
  panel.innerHTML='<summary><strong>STAGING delivery fault review</strong></summary>'+
    '<p>Only DYE-682947 synthetic active round. No production, baseline rounds or credentials.</p>'+
    '<button type="button" id="reviewDropAck">Lose next successful score acknowledgement</button> '+
    '<button type="button" id="reviewDisconnect">Disconnect next score request before send</button> '+
    '<button type="button" id="reviewOffline">Block score delivery until cancelled</button> '+
    '<button type="button" id="reviewHold">Hold next score request</button> '+
    '<button type="button" id="reviewAuth">Send next score request with invalid bearer</button> '+
    '<button type="button" id="reviewAttribution">Inspect canonical score attribution</button> '+
    '<button type="button" id="reviewDirect">Use direct-upload review path</button> '+
    '<button type="button" id="reviewActual">Use server-reported transport</button> '+
    '<button type="button" id="reviewRelease">Release held request</button> '+
    '<button type="button" id="reviewCancel">Cancel armed fault</button> '+
    '<button type="button" id="reviewSubscribe">Subscribe as member</button> '+
    '<button type="button" id="reviewAnonymous">Check anonymous access</button> '+
    '<button type="button" id="reviewStop">Stop review listeners</button> '+
    '<p id="reviewMode" role="status">Observe only</p><pre id="reviewEvidence" style="white-space:pre-wrap;max-height:220px;overflow:auto"></pre>';
  document.body.append(panel);
  const output=panel.querySelector('#reviewEvidence'),status=panel.querySelector('#reviewMode');
  status.textContent=mode==='offline'?'Score delivery blocked until cancelled':'Observe only';
  function record(event,details={}){
    events.push({at:new Date().toISOString(),event,...details});
    output.textContent=JSON.stringify(events,null,2);
    try{sessionStorage.setItem(storageKey,JSON.stringify({events,payloads:[...payloads],mode,forceDirect}));}
    catch{status.textContent='Evidence storage failed. Copy the visible log before reload.';}
  }
  function arm(next){if(release){status.textContent='Release the held request first.';return;}mode=next;status.textContent='Armed: '+mode;record('fault-armed',{mode});}
  panel.querySelector('#reviewDropAck').onclick=()=>arm('drop-ack');
  panel.querySelector('#reviewDisconnect').onclick=()=>arm('disconnect');
  panel.querySelector('#reviewOffline').onclick=()=>arm('offline');
  panel.querySelector('#reviewHold').onclick=()=>arm('hold');
  panel.querySelector('#reviewAuth').onclick=()=>arm('invalid-bearer');
  panel.querySelector('#reviewDirect').onclick=()=>{forceDirect=true;record('direct-review-enabled');};
  panel.querySelector('#reviewActual').onclick=()=>{forceDirect=false;record('direct-review-disabled');};
  panel.querySelector('#reviewRelease').onclick=()=>{if(release){const resume=release;release=null;resume();record('request-released');}};
  panel.querySelector('#reviewCancel').onclick=()=>{mode='pass';status.textContent='Observe only';record('fault-cancelled');};
  window.fetch=async(input,init)=>{
    const url=new URL(typeof input==='string'?input:input.url,location.href);
    if(url.origin!==targetOrigin)return nativeFetch(input,init);
    if(url.pathname==='/auth/v1/token' && url.searchParams.get('grant_type')==='refresh_token'){
      const response=await nativeFetch(input,init);record('auth-refresh',{status:response.status});return response;
    }
    const rpc=url.pathname==='/rest/v1/rpc/submit_shared_score_operations';
    const direct=url.pathname==='/rest/v1/score_entries' && String(init?.method || '').toUpperCase()==='POST';
    if(!rpc && !direct)return nativeFetch(input,init);
    let body;try{body=JSON.parse(init?.body);}catch{return nativeFetch(input,init);}
    if(rpc && body.p_match_id==='DYE-682947' && forceDirect){
      record('rpc-unavailable-injected',{count:body.p_operations?.length || 0});
      return new Response(JSON.stringify({code:'PGRST202',message:'STAGING review: RPC unavailability injected; direct requests still reach staging.'}),{status:404,headers:{'Content-Type':'application/json'}});
    }
    const operations=rpc?body.p_operations:Array.isArray(body)?body.map(row=>({operation_id:row.id,score_entry:row})):[];
    if((rpc && body.p_match_id!=='DYE-682947') || (direct && (!Array.isArray(body) || body.some(row=>row.match_id!=='DYE-682947')))
      || !Array.isArray(operations) || !operations.length)return nativeFetch(input,init);
    const fault=mode;if(mode!=='offline')mode='pass';status.textContent=mode==='offline'?'Score delivery blocked until cancelled':'Observe only';
    const ids=operations.map(op=>op.operation_id),replays=[];
    for(const op of operations){
      const serialized=JSON.stringify(op.score_entry),previous=payloads.get(op.operation_id);
      if(previous!==undefined)replays.push({id:op.operation_id,identical:previous===serialized});
      else payloads.set(op.operation_id,serialized);
    }
    record(rpc?'score-request':'direct-score-request',{fault,count:ids.length,ids,replays,cells:operations.map(op=>({player:op.score_entry.player_id,team:op.score_entry.team_number,hole:op.score_entry.hole_number,gross:op.score_entry.gross}))});
    if(['disconnect','offline'].includes(fault)){record('injected-disconnect',{count:ids.length});throw new TypeError('STAGING injected connection loss before send');}
    if(fault==='hold'){record('request-held',{count:ids.length});await new Promise(resolve=>{release=resolve;});}
    // Replace only this synthetic request's bearer with a fixed invalid value.
    // Never read, print or retain the real credential. The app performs recovery.
    let outgoing=init;
    if(fault==='invalid-bearer'){
      const headers=new Headers(init?.headers);headers.set('Authorization','Bearer staging-review-invalid');
      outgoing={...init,headers};
    }
    const response=await nativeFetch(input,outgoing);
    let result;try{result=await response.clone().json();}catch{}
    const receipts=Array.isArray(result)?result:(result?.receipts || []);
    record(rpc?'score-response':'direct-score-response',{status:response.status,code:result?.code || '',receipts:rpc?receipts.map(row=>({id:row.operation_id,revision:row.match_revision,acceptedAt:row.accepted_at})):[]});
    if(fault==='drop-ack' && response.ok){record('acknowledgement-discarded',{count:receipts.length});throw new TypeError('STAGING injected lost acknowledgement after server commit');}
    return response;
  };
  async function member(){
    if(!memberClient){
      const key=window.DyeLedgerIdentitySecurity?.ACCOUNT_AUTH_STORAGE_KEY;
      if(!key)throw new Error('Account client is unavailable');
      memberClient=window.supabase.createClient(settings.url,settings.anonKey,{auth:{storageKey:key,persistSession:true,autoRefreshToken:false,detectSessionInUrl:false}});
    }
    const session=await memberClient.auth.getSession();
    if(session.error || !session.data?.session)throw new Error('Sign into staging first');
    return memberClient;
  }
  panel.querySelector('#reviewAttribution').onclick=async()=>{
    try{
      const client=await member();
      const [scores,match,memberships]=await Promise.all([
        client.from('score_entries').select('player_id,hole_number,gross,updated_by').eq('match_id','DYE-682947').eq('hole_number',1),
        client.from('matches').select('meta:course_snapshot->sharedMatchMeta').eq('id','DYE-682947').single(),
        client.from('match_memberships').select('id,user_id,role,status').eq('match_id','DYE-682947')
      ]);
      if(scores.error || match.error || memberships.error){record('attribution-unavailable',{code:scores.error?.code || match.error?.code || memberships.error?.code});return;}
      const participants=match.data?.meta?.participants || [];
      record('canonical-attribution',{participantCount:participants.length,activeMembershipCount:memberships.data?.filter(row=>row.status==='active').length,
        rows:(scores.data || []).map(row=>({player:row.player_id,hole:row.hole_number,gross:row.gross,
          accountParticipantCandidates:participants.filter(p=>String(p.userId || '')===String(row.updated_by || '') && !!row.updated_by).map(p=>p.participantId),
          accountMembershipRoles:(memberships.data || []).filter(m=>m.user_id===row.updated_by && m.status==='active').map(m=>m.role)}))});
    }catch{record('attribution-unavailable');}
  };
  panel.querySelector('#reviewSubscribe').onclick=async()=>{
    try{
      const client=await member();if(memberChannel)await client.removeChannel(memberChannel);
      await client.realtime.setAuth();
      memberChannel=client.channel('shared-match:DYE-682947',{config:{private:true}})
        .on('broadcast',{event:'INSERT'},notice).on('broadcast',{event:'UPDATE'},notice)
        .subscribe(state=>record('member-channel',{state}));
      function notice(message){
        const payload=message.payload || {};
        record('member-notification',{broadcastEvent:message.event,record:payload.record || null,oldRecord:payload.old_record || null,keys:Object.keys(payload)});
      }
    }catch{record('member-channel-unavailable');}
  };
  panel.querySelector('#reviewAnonymous').onclick=async()=>{
    try{
      anonymousClient=window.supabase.createClient(settings.url,settings.anonKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
      const result=await anonymousClient.from('score_entries').select('id').eq('match_id','DYE-682947');
      record('anonymous-score-read',{code:result.error?.code || '',count:result.data?.length ?? null});
      anonymousClient.channel('shared-match:DYE-682947',{config:{private:true}}).subscribe(state=>record('anonymous-channel',{state}));
    }catch{record('anonymous-check-unavailable');}
  };
  panel.querySelector('#reviewStop').onclick=async()=>{
    if(memberClient)await memberClient.removeAllChannels();if(anonymousClient)await anonymousClient.removeAllChannels();
    memberChannel=null;record('review-listeners-stopped');
  };
  record('review-loaded',{version:'3',target:'DYE-682947',port:location.port});
})();
