import test from 'node:test';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {chrome,startServer,openVisualPage,visualFixture} from './support/design-browser.js';

async function withBrowser(run){const server=await startServer(),browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});try{await run(browser,`http://127.0.0.1:${server.address().port}/`);}finally{await browser.close();await new Promise(done=>server.close(done));}}
const options={skip:!chrome,timeout:90000};

test('two isolated devices: host rename and clear reach the remote through real metadata parsing and leave scores unchanged',options,async()=>withBrowser(async(browser,url)=>{
 const hostContext=await browser.createBrowserContext(),remoteContext=await browser.createBrowserContext();
 const host=await openVisualPage(hostContext,url,'classic',375),remote=await openVisualPage(remoteContext,url,'classic',375);
 const hostId=await host.evaluate(()=>{const m=getActiveMatch();m.storageMode='shared';m.sharedMatchId='DYE-NAMES';m.sharedHostDeviceId=getSharedDeviceId();return getSharedDeviceId();});
 await remote.evaluate(id=>{const m=getActiveMatch();m.storageMode='shared';m.sharedMatchId='DYE-NAMES';m.sharedHostDeviceId=id;m.sharedHostParticipantId='host';window.scoreBaseline=JSON.stringify(m.players);hasSupabaseConfig=()=>true;window.hostRow=null;
 const client={from(table){const q={select(){return q;},eq(){return q;},order(){return q;},maybeSingle:async()=>({data:hostRow,error:null}),then(resolve,reject){return Promise.resolve({data:table==='matches'?hostRow:[],error:null}).then(resolve,reject);}};return q;}};ensureSupabaseClient=async()=>client;
 },hostId);
 for(const names of [['The Eagles','The Owls'],['','']]){
  const row=await host.evaluate(names=>{const m=getActiveMatch();m.teamNames=names;return buildCloudMatchPayload(m,'owner').matchRow;},names);
  const result=await remote.evaluate(async row=>{hostRow=row;const m=getActiveMatch();const changed=await mergeCloudSharedMetadata(m);persist({skipRender:true});renderAll();return {changed,names:m.teamNames,label:buildPlayFeaturedStatusPair(m,computeMatchMetrics(m)),scores:JSON.stringify(m.players),before:scoreBaseline};},row);
  assert.equal(result.changed,true);assert.deepEqual(result.names,names);assert.equal(result.scores,result.before);
  assert.match(result.label,names[0]?/The Eagles/:/Alex\/Blake/);assert.doesNotMatch(result.label,/Team 1 \(/);
 }
 // Old clients without the additive field must not erase known labels.
 await remote.evaluate(async()=>{getActiveMatch().teamNames=['Keep me','Keep two'];delete hostRow.course_snapshot.sharedMatchMeta.teamNames;await mergeCloudSharedMetadata(getActiveMatch());});
 assert.deepEqual(await remote.evaluate(()=>getActiveMatch().teamNames),['Keep me','Keep two']);
 // Host edits and completed snapshots are not remote label targets.
 await remote.evaluate(async()=>{hostRow.course_snapshot.sharedMatchMeta.teamNames=['Stale','Stale'];const m=getActiveMatch();m.sharedHostDeviceId=getSharedDeviceId();await mergeCloudSharedMetadata(m);});
 assert.deepEqual(await remote.evaluate(()=>getActiveMatch().teamNames),['Keep me','Keep two']);
 await remote.evaluate(async id=>{const m=getActiveMatch();m.sharedHostDeviceId=id;m.status='complete';m.roundRecordSnapshot=buildFrozenRoundRecord(m,computeMatchMetrics(m));window.frozenBefore=JSON.stringify(m.roundRecordSnapshot);await mergeCloudSharedMetadata(m);},hostId);
 assert.equal(await remote.evaluate(()=>JSON.stringify(getActiveMatch().roundRecordSnapshot)===frozenBefore),true);
 assert.deepEqual(await remote.evaluate(()=>getActiveMatch().teamNames),['Keep me','Keep two']);
}));

test('team-name keyboard target and caret survive repeated renders and IME; deferred refresh preserves the draft after blur',options,async()=>withBrowser(async(browser,url)=>{
 const page=await openVisualPage(browser,url,'setup',375);
 await page.waitForSelector('[data-team-name="1"]',{visible:true});
 await page.evaluate(()=>{const input=document.querySelector('[data-team-name="1"]');input.focus();window.originalTeamInput=input;input.value='Birdie Club';input.dispatchEvent(new Event('input',{bubbles:true}));input.setSelectionRange(4,7);});
 for(let n=0;n<6;n++)await page.evaluate(()=>{renderAll();renderTeamNameInputs(2,['stale','']);});
 assert.deepEqual(await page.evaluate(()=>({same:originalTeamInput===document.activeElement,value:originalTeamInput.value,start:originalTeamInput.selectionStart,end:originalTeamInput.selectionEnd})),{same:true,value:'Birdie Club',start:4,end:7});
 await page.evaluate(()=>{originalTeamInput.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));renderAll();originalTeamInput.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));});
 assert.equal(await page.evaluate(()=>originalTeamInput===document.activeElement),true);
 await page.evaluate(()=>originalTeamInput.blur());await page.waitForFunction(()=>!deferredEditingRender);
 assert.equal(await page.$eval('[data-team-name="1"]',input=>input.value),'Birdie Club');
 await page.evaluate(()=>{renderTeamNameInputs(2,['','']);document.getElementById('matchForm').reset();});
 assert.equal(await page.$eval('[data-team-name="1"]',input=>input.value),'','form reset must not resurrect a previous team name');
}));

test('moving between wager fields does not lose the second field to a delayed change refresh',options,async()=>withBrowser(async(browser,url)=>{
 const page=await openVisualPage(browser,url,'games',375);
 const first='[data-game-config="nassau"][data-field="stakesFront"]',second='[data-game-config="nassau"][data-field="stakesBack"]';
 await page.waitForSelector(first,{visible:true});await page.focus(first);await page.keyboard.press('ArrowUp');
 await page.focus(second);await page.keyboard.type('7');
 const original=await page.evaluate(()=>{window.wagerTarget=document.activeElement;const value=wagerTarget.value;renderGamesPicker(collectSelectedGames());renderAll();return value;});
 await page.waitForFunction(()=>wagerTarget===document.activeElement);
 assert.equal(await page.evaluate(()=>wagerTarget.value),original);
 await page.evaluate(()=>{document.activeElement.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));window.dispatchEvent(new Event('blur'));document.activeElement.blur();});
 await page.waitForFunction(()=>!deferredEditingRender && !editingPointerActive && !editingCompositionActive);
 assert.equal(await page.$eval(second,input=>input.value),original);
}));

test('Story editor survives async panel refreshes; click handler reads the intact draft before deferred redraw',options,async()=>withBrowser(async(browser,url)=>{
 const page=await openVisualPage(browser,url,'results',375);
 await page.evaluate(()=>{const m=getActiveMatch();m.roundRecapGenerated='Original story about the round.';uiState.roundRecapEditing=true;openExperienceDestination('leaderboard','story');document.querySelector('#roundStoryCard').open=true;renderRoundRecapControlPanel(m);});
 await page.waitForSelector('#roundRecapEditBox',{visible:true});await page.focus('#roundRecapEditBox');await page.keyboard.type('My edited story. ');
 await page.evaluate(()=>{window.originalStory=document.activeElement;window.storyDraft=originalStory.value;originalStory.setSelectionRange(3,9);for(let n=0;n<5;n++){renderRoundRecapControlPanel();renderAll();}});
 assert.equal(await page.evaluate(()=>originalStory===document.activeElement && originalStory.value===storyDraft && originalStory.selectionStart===3 && originalStory.selectionEnd===9),true);
 // Use a real pointer interaction. The app must not redraw between blur and click.
 await page.evaluate(()=>{const button=document.createElement('button');button.id='testDraftSave';button.textContent='Save draft';button.onclick=()=>{window.clickedStory=document.getElementById('roundRecapEditBox').value;};document.getElementById('roundRecapControls').append(button);});
 await page.click('#testDraftSave');await page.waitForFunction(()=>!deferredEditingRender);
 assert.equal(await page.evaluate(()=>clickedStory===storyDraft && document.getElementById('roundRecapEditBox').value===storyDraft),true);
}));

test('Memory, Library and Setup text fields retain their native keyboard target across reconnect-style renders; Cancel still works',options,async()=>withBrowser(async(browser,url)=>{
 const page=await openVisualPage(browser,url,'classic',375);
 await page.evaluate(()=>openAddMemoryModal());
 await page.waitForSelector('#memoryTextInput',{visible:true});await page.focus('#memoryTextInput');await page.keyboard.type('Long putt on the fourth hole');
 await page.evaluate(()=>{window.memoryInput=document.activeElement;for(let n=0;n<6;n++)renderAll();});
 assert.equal(await page.evaluate(()=>memoryInput===document.activeElement && memoryInput.value==='Long putt on the fourth hole'),true);
 await page.click('#addMemoryCancelBtn');await page.waitForFunction(()=>document.getElementById('addMemoryDialog').classList.contains('hidden'));
 for(const [scenario,selector] of [['library','#courseForm input[name="name"]'],['setup','#matchForm input[name="name"]']]){
  const editPage=await openVisualPage(browser,url,scenario,375);
  if(scenario==='setup')await editPage.evaluate(()=>openSetupDestination('course'));
  await editPage.waitForSelector(selector,{visible:true});await editPage.focus(selector);await editPage.keyboard.type('Captain draft');
  await editPage.evaluate(()=>{window.editTarget=document.activeElement;renderAll();});
  assert.equal(await editPage.evaluate(()=>editTarget===document.activeElement && editTarget.value.includes('Captain draft')),true);
  await editPage.evaluate(()=>document.activeElement.blur());await editPage.waitForFunction(()=>!deferredEditingRender);await editPage.close();
 }
}));

test('Classic and Player score entry retain draft focus during refresh; explicit save/advance behavior remains available',options,async()=>withBrowser(async(browser,url)=>{
 for(const mode of ['CLASSIC','PLAYER']){
  const page=await openVisualPage(browser,url,mode==='CLASSIC'?'classic':'player-expanded',375,false,false,false,visualFixture(mode));
  await page.evaluate(()=>dyeLedgerSaveCurrentHole({targetHole:1,silent:true}));
  if(mode==='PLAYER' && !await page.$('.player-mode-player-detail'))await page.click('.player-mode-player-select');
  await page.evaluate(()=>{const input=document.querySelector('#score input[data-score-player]:not([disabled])');input.focus();input.value='6';input.dispatchEvent(new Event('input',{bubbles:true}));window.scoringTarget=input;renderAll();});
  assert.equal(await page.evaluate(()=>document.activeElement===scoringTarget && scoringTarget.value==='6'),true);
  await page.evaluate(()=>{if(!dyeLedgerSaveCurrentHole({advance:true,silent:true}))throw new Error('Save failed');});await page.waitForFunction(()=>!deferredEditingRender);
  assert.equal(await page.evaluate(()=>currentHole),2);
  assert.equal(await page.$eval('#currentHoleSelect',node=>node.value),'2');
  assert.equal(await page.evaluate(()=>getActiveMatch().players.some(p=>p.scores[0].gross===6)),true);
  const failure=await page.evaluate(()=>{
   const originalPersist=persist,header=document.getElementById('currentHoleSelect');let scrolled=false;
   persist=()=>false;scrollToActiveHoleScoringTop=()=>{scrolled=true;};
   const ok=dyeLedgerSaveCurrentHole({advance:true,silent:true});persist=originalPersist;
   return {ok,scrolled,sameHeader:header===document.getElementById('currentHoleSelect'),shown:header.value};
  });
  assert.deepEqual(failure,{ok:false,scrolled:false,sameHeader:true,shown:'2'},'failed storage must not redraw or scroll to the unsaved next hole');
  await page.close();
 }
}));

test('Account form retains input and selection on token refresh while a real sign-out still replaces it',options,async()=>withBrowser(async(browser,url)=>{
 const page=await openVisualPage(browser,url,'preferences',375);
 await page.evaluate(()=>{
  openExperienceDestination('settings','account');
  window.__DYE_SUPABASE_CONFIG__={url:'https://keyboardtest.supabase.co',anonKey:'public-test-key',accountAuth:{enabled:true,environment:'test',expectedProjectRef:'keyboardtest'}};
  window.accountSession={user:{id:'same-account',email:'golfer@example.test',is_anonymous:false}};
  const client={auth:{onAuthStateChange(callback){window.accountAuthCallback=callback;},getSession:async()=>({data:{session:accountSession}})},from(){const q={select(){return q;},eq(){return q;},maybeSingle:async()=>({data:null,error:null})};return q;}};
  window.__DYE_SUPABASE_CLIENT__=client;window.supabase={createClient:()=>client};
  const root=document.getElementById('accountSecurityPanel');delete root.dataset.accountSecurityMounted;DyeLedgerIdentitySecurity.mountAccountSecurity();
 });
 await page.waitForSelector('#accountIdentityName',{visible:true});await page.focus('#accountIdentityName');await page.keyboard.type('John Golfer');
 const stable=await page.evaluate(()=>{
  const original=document.activeElement;original.setSelectionRange(2,7);
  for(let n=0;n<5;n++)accountAuthCallback('TOKEN_REFRESHED',{...accountSession,access_token:'renewed-'+n});
  return {same:original===document.activeElement,value:original.value,start:original.selectionStart,end:original.selectionEnd};
 });
 assert.deepEqual(stable,{same:true,value:'John Golfer',start:2,end:7});
 await page.evaluate(()=>accountAuthCallback('SIGNED_OUT',null));
 await page.waitForSelector('#accountEmail',{visible:true});assert.equal(await page.$('#accountIdentityName'),null);
}));
