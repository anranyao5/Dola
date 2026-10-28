'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {PGlite}=require('../functions/dva-sync/node_modules/@electric-sql/pglite');
const {PgStore}=require('../functions/dva-sync/postgres');
const {createHandler}=require('../functions/dva-sync/index');
const E=require('../functions/dva-sync/engine');
let pg,store,handler,clock=Date.now(),uploaded=new Map();
const ORIGIN='https://dva.test';
before(async()=>{
 pg=new PGlite();await pg.waitReady;await pg.exec('create role anon;create role authenticated;create role service_role;');
 const sql=fs.readFileSync(path.join(__dirname,'../schema.sql'),'utf8');await pg.exec(sql);await pg.exec(sql);
 store=new PgStore({rpc:async(name,p)=>{try{const r=await pg.query('select public.dva_rpc($1,$2::jsonb) as result',[p.p_action,JSON.stringify(p.p_args)]);return {data:r.rows[0].result,error:null};}catch(error){return {data:null,error:{code:error.code}};}}});
 handler=createHandler({store,now:()=>clock,origins:[ORIGIN],storage:{uploadFile:async({cloudPath,fileContent})=>{const fileID='cloud://test/'+cloudPath;uploaded.set(fileID,fileContent);return {fileID};},getTempFileURL:async({fileList})=>({fileList:fileList.map(f=>({fileID:f.fileID,tempFileURL:'https://files.test/'+encodeURIComponent(f.fileID)}))})}});
});
after(async()=>{await pg.close();});
async function request(method,url,body,token,origin=ORIGIN){const r=await handler({httpMethod:method,path:'/api/dva'+url,headers:{origin,...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body),requestContext:{sourceIp:'test-'+Math.random()}});return {status:r.statusCode,...JSON.parse(r.body)};}
async function family(){const r=await request('POST','/families',{parentPassword:'parent-test-password',childPassword:'123456'});assert.equal(r.status,201);const child=await request('POST','/login',{familyCode:r.familyCode,password:'123456',role:'child'});assert.equal(child.status,200);return {parent:r,child};}
const operation=(type,args)=>({id:randomUUID(),type,args});
async function state(token){const r=await request('GET','/state',undefined,token);assert.equal(r.status,200);return r;}
async function op(token,type,args){return request('POST','/operations',operation(type,args),token);}
function task(name,kind='checkin'){return {id:randomUUID(),day:E.day(clock),subject:'英语',title:name,kind,instructions:'Read.',attachment:'',mime:''};}

test('real PostgreSQL schema is additive, RLS blocks browser roles, CAS rejects stale writes',async()=>{
 assert.equal((await store.health()).ok,true);await pg.exec('set role anon');await assert.rejects(pg.query('select * from public.dva_families'),/permission denied/);await assert.rejects(pg.query("select public.dva_rpc('health','{}')"),/permission denied/);await pg.exec('reset role');
 await pg.exec('set role service_role');assert.equal((await pg.query("select public.dva_rpc('health','{}') as r")).rows[0].r.ok,true);await pg.exec('reset role');
 const {parent}=await family(),f=await store.family(parent.familyCode);assert.notEqual(f.parent_hash,'parent-test-password');assert.notEqual(f.child_hash,'123456');assert.equal((await store.cas(f.id,0,f.state)).version,1);assert.equal(await store.cas(f.id,0,f.state),null);
});
test('parent and child see same state, child cannot edit gifts/tasks, families stay isolated',async()=>{
 const {parent,child}=await family(),other=await family();const t=task('Read RAZ');assert.equal((await op(parent.token,'tasks.create',{tasks:[t]})).status,200);assert.equal((await state(child.token)).state.tasks[0].title,'Read RAZ');
 assert.equal((await op(child.token,'tasks.create',{tasks:[task('bad')]})).status,403);assert.equal((await op(child.token,'gift.save',{gift:{id:'fake',name:'gift',cost:1}})).status,403);
 assert.equal((await op(other.child.token,'task.complete',{taskId:t.id})).status,404);assert.equal((await state(other.child.token)).state.tasks.length,0);
 assert.equal((await request('GET','/state')).status,401);assert.equal((await request('GET','/state',undefined,child.token,'https://evil.test')).status,403);
});
test('concurrent two-device completion grants each task once and daily flower/bonus once',async()=>{
 const {parent,child}=await family(),a=task('A'),b=task('B');await op(parent.token,'tasks.create',{tasks:[a,b]});
 const duplicate=operation('task.complete',{taskId:a.id});const responses=await Promise.all([request('POST','/operations',duplicate,child.token),request('POST','/operations',duplicate,parent.token),op(child.token,'task.complete',{taskId:b.id})]);assert.ok(responses.every(r=>r.status===200));
 const s=(await state(parent.token)).state;assert.equal(s.ledger.reduce((n,l)=>n+l.points,0),40);assert.equal(E.available(s),1);assert.equal(s.ledger.filter(l=>l.id.startsWith('day:')).length,1);assert.ok(s.tasks.every(t=>t.done));
});
test('RAZ prerequisites, server timer and shared food are authoritative',async()=>{
 const {parent,child}=await family(),raz=task('RAZ','raz-new'),oral=task('口算','oral');await op(parent.token,'tasks.create',{tasks:[raz,oral]});
 assert.equal((await op(child.token,'task.complete',{taskId:raz.id})).status,400);await op(child.token,'task.step',{taskId:raz.id,step:'read',value:true});await op(child.token,'task.step',{taskId:raz.id,step:'quiz',value:true});assert.equal((await op(child.token,'task.complete',{taskId:raz.id})).status,200);
 assert.equal((await op(child.token,'task.complete',{taskId:oral.id,elapsed:9999999})).status,400);await op(child.token,'timer',{taskId:oral.id,action:'start'});clock+=1300;await op(child.token,'timer',{taskId:oral.id,action:'pause'});clock+=5000;await op(child.token,'timer',{taskId:oral.id,action:'start'});clock+=1200;await op(child.token,'task.complete',{taskId:oral.id});
 let s=(await state(child.token)).state;assert.equal(s.tasks.find(t=>t.id===oral.id).elapsed,2500);const pid=s.pets[0].id;
 const fed=await Promise.all([op(child.token,'pet.feed',{taskId:raz.id,petId:pid}),op(parent.token,'pet.feed',{taskId:raz.id,petId:pid})]);assert.equal(fed.filter(r=>r.status===200).length,1);assert.equal(E.available((await state(child.token)).state),1);
});
test('gift price is server-side, concurrent requests cannot overspend; only parent fulfills',async()=>{
 const {parent,child}=await family();let snapshot=(await state(parent.token)).state;snapshot.ledger.push({id:'imported',points:600,petId:snapshot.pets[0].id,flowers:8,day:E.day(clock),label:'旧记录'});
 assert.equal((await op(parent.token,'family.import',{state:snapshot})).status,200);
 const r=await Promise.all([op(child.token,'order.request',{orderId:'one',giftId:'gift-labubu',cost:0}),op(parent.token,'order.request',{orderId:'two',giftId:'gift-labubu',cost:0})]);assert.equal(r.filter(x=>x.status===200).length,1);
 let s=(await state(parent.token)).state;assert.equal(E.available(s),0);const order=s.orders[0];assert.equal(order.cost,8);
 assert.equal((await op(child.token,'order.status',{orderId:order.id,status:'fulfilled'})).status,403);await op(child.token,'order.status',{orderId:order.id,status:'cancelled'});assert.equal(E.available((await state(child.token)).state),8);
 await op(child.token,'order.request',{orderId:'three',giftId:'gift-labubu'});await op(parent.token,'order.status',{orderId:'three',status:'fulfilled'});s=(await state(child.token)).state;assert.equal(E.available(s),0);assert.equal(E.points(s,s.pets[0].id),600);
});
test('migration is parent-only, empty-family-only; second pet starts zero and receives daily points separately',async()=>{
 const {parent,child}=await family();let s=(await state(parent.token)).state;s.ledger.push({id:'old',points:600,petId:s.pet.id,flowers:3,day:E.shift(E.day(clock),-1),label:'旧记录'});
 assert.equal((await op(child.token,'family.import',{state:s})).status,403);assert.equal((await op(parent.token,'family.import',{state:s})).status,200);assert.equal((await op(parent.token,'family.import',{state:s})).status,409);
 const second=randomUUID();await op(child.token,'pet.adopt',{petId:second,name:'棉花',breed:'rabbit'});s=(await state(child.token)).state;assert.equal(E.points(s,second),0);assert.equal(E.available(s),3);
 await op(child.token,'pet.partner',{petId:second});const t=task('today');await op(parent.token,'tasks.create',{tasks:[t]});await op(child.token,'task.complete',{taskId:t.id});s=(await state(child.token)).state;assert.equal(E.points(s,second),30);assert.equal(E.points(s,s.pets[0].id),600);
 assert.equal((await op(child.token,'pet.partner',{petId:s.pets[0].id})).status,400);assert.equal((await op(child.token,'pet.adopt',{petId:'third',name:'third',breed:'cat'})).status,400);
 await op(child.token,'pet.touch',{petId:second});assert.equal((await state(parent.token)).state.pets[1].lastPettedDay,E.day(clock));
});
test('uploads belong to a family, reject bad types, and expose signed URLs only to authenticated family',async()=>{
 const {parent,child}=await family(),other=await family();const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1kAAAAASUVORK5CYII=','base64');
 assert.equal((await request('POST','/assets',{mime:'image/png',data:png.toString('base64')},child.token)).status,403);
 assert.equal((await request('POST','/assets',{mime:'image/png',data:Buffer.from('fake').toString('base64')},parent.token)).status,400);
 const upload=await request('POST','/assets',{mime:'image/png',data:png.toString('base64')},parent.token);assert.equal(upload.status,201);
 const gift={id:'private-photo',name:'照片',cost:1,description:'test',photo:upload.fileId};assert.equal((await op(other.parent.token,'gift.save',{gift})).status,400);assert.equal((await op(parent.token,'gift.save',{gift})).status,200);
 const snap=await state(child.token);assert.ok(snap.assetUrls[upload.fileId]);assert.equal((await state(other.child.token)).assetUrls[upload.fileId],undefined);
});
test('weekly 90% boundary and China calendar: one award, no rewards for an empty week',()=>{
 const now=Date.parse('2026-10-26T16:30:00Z');assert.equal(E.day(now),'2026-10-27');let s=E.initialState(now);const start=E.shift(E.monday(E.day(now)),-7);s.tasks=Array.from({length:10},(_,i)=>({...task(String(i)),day:start,done:i<9}));E.settle(s,now);E.settle(s,now);assert.equal(E.available(s),1);s=E.initialState(now);E.settle(s,now);assert.equal(E.available(s),0);
});
test('logout revokes only the current token; wrong password attempts are limited',async()=>{
 const {parent,child}=await family();assert.equal((await request('POST','/logout',{},child.token)).status,200);assert.equal((await request('GET','/state',undefined,child.token)).status,401);assert.equal((await state(parent.token)).role,'parent');
 let last;for(let i=0;i<13;i++)last=await request('POST','/login',{familyCode:parent.familyCode,password:'incorrect',role:'parent'});assert.equal(last.status,429);
});


test('health diagnostic never exposes raw SDK errors or credentials',async()=>{
 const {diagnostic,createHandler}=require('../functions/dva-sync/index');
 const secret='secret-example-value';
 const failure=Object.assign(new Error('permission denied; token='+secret),{code:'42501'});
 assert.deepEqual(diagnostic(failure),{code:'42501',reason:'SERVICE_PERMISSION'});
 const h=createHandler({store:{health:async()=>{throw failure;}},storage:{}});
 const r=await h({httpMethod:'GET',path:'/health',headers:{}});
 assert.equal(r.statusCode,503);assert.ok(!r.body.includes(secret));assert.equal(JSON.parse(r.body).diagnostic.code,'42501');
 assert.equal(diagnostic({code:secret+' / unexpected',message:'token='+secret}).code,'UNKNOWN');
});
