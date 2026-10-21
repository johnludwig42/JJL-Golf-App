import {loadLiveEngine} from '../../scripts/live-engine-adapter.js';
import {scrambleFixture} from './scramble-fixture.js';
export const plain=value=>JSON.parse(JSON.stringify(value));
export function memory(){const values=new Map();return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};}
export function fixture(count=8,{rpcModel=true}={}){
 const engine=loadLiveEngine(),data=scrambleFixture(),host=engine.getSharedDeviceId(),storage=memory();
 Object.assign(data.match,{sharedHostDeviceId:host,sharedMatchId:'DYE-DELIVERY',sharedScoreOutboxInitialized:true});data.match.sharedDevices[0].id=host;data.match.sharedParticipants[0].deviceId=host;
 if(count!==8){delete data.match.teamScoringPolicyVersion;delete data.match.assignedTeamIndexPolicyVersion;data.match.teamCount=count;data.match.playersPerTeam=1;data.players=Array.from({length:count},(_,i)=>({id:'p'+i,name:'Golfer '+i,index:0}));data.match.players=data.players.map((p,i)=>({playerId:p.id,team:i+1,teeId:'t',scores:Array.from({length:18},(_,i)=>({holeNumber:i+1,gross:4}))}));}
 data.match.players.forEach(p=>{p.scores.forEach(s=>s.gross=4);data.match.sharedPlayerAssignments[p.playerId]='hp';});
 const match=engine.seedState({players:data.players,courses:[data.course],matches:[data.match]}).matches[0];
 const queue=(players=match.players)=>{for(const p of players)for(const s of p.scores)engine.stampSharedScoreWrite(match,p.playerId,s.holeNumber,{storage});};
 const client={auth:{getSession:async()=>({data:{session:{user:{id:'same-user'}}}}),refreshSession:async()=>({data:{session:{user:{id:'same-user'}}}})},rpc:async(name,args)=>({data:args.p_operations.map((op,i)=>({operation_id:op.operation_id,match_revision:i+1}))})};
 if(rpcModel){let rpc=client.rpc;Object.defineProperty(client,'rpc',{get:()=>async(name,args)=>args.p_operations.length?rpc(name,args):{error:{code:'22023',message:'Score operation batch must contain 1 through 64 operations'}},set:value=>{rpc=value;}});}
 return {engine,match,storage,client,queue,data};
}

