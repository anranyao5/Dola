'use strict';
const {randomUUID}=require('node:crypto');
const catalog=require('./catalog.json');
const BREEDS=new Set(['bichon','shiba','corgi','penguin','rabbit','cat']);
const clone=value=>JSON.parse(JSON.stringify(value));
class ApiError extends Error{constructor(status,message){super(message);this.status=status;}}
const fail=(message,status=400)=>{throw new ApiError(status,message);};
const text=(value,max=200)=>{if(typeof value!=='string'||value.length>max)fail('文字格式或长度无效');return value.trim();};
const id=value=>{if(typeof value!=='string'||!/^[\w:-]{1,120}$/.test(value))fail('记录编号无效');return value;};
function day(now=Date.now()){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));const p=Object.fromEntries(parts.map(v=>[v.type,v.value]));return `${p.year}-${p.month}-${p.day}`;}
function shift(value,n){const d=new Date(value+'T12:00:00+08:00');if(!Number.isFinite(+d))fail('日期无效');d.setUTCDate(d.getUTCDate()+n);return day(+d);}
function monday(value){const d=new Date(value+'T12:00:00+08:00');return shift(value,-((d.getUTCDay()+6)%7));}
function validDay(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(+new Date(value+'T12:00:00+08:00'))&&day(+new Date(value+'T12:00:00+08:00'))===value;}
function initialState(now=Date.now()){const pet={id:randomUUID(),name:'豆豆',breed:'bichon',adoptedAt:day(now)};return {version:2,pet,pets:[pet],activePetId:pet.id,partners:{[day(now)]:pet.id},tasks:[],gifts:catalog.map(g=>({...g,description:'一份礼物，具体款式由家长确认。',photo:'asset:'+g.id,emoji:'🎁',active:true})),orders:[],ledger:[],settledWeeks:[],catalogUpdates:['labubu-8-v1','crochet-5-v1','line-dog-puzzle-12-v1','luoxiaohei-8-v1','crystal-stack-three-6-v1','remove-three-example-gifts-v1'],appliedOps:[]};}
const available=s=>s.ledger.reduce((n,l)=>n+l.flowers,0)-s.orders.filter(o=>['pending','fulfilled'].includes(o.status)).reduce((n,o)=>n+o.cost,0);
const points=(s,petId)=>s.ledger.filter(l=>l.petId===petId).reduce((n,l)=>n+l.points,0);
function normalize(s,now){s.partners=s.partners||{};if(!s.partners[day(now)])s.partners[day(now)]=s.pets[0].id;s.appliedOps=s.appliedOps||[];s.activePetId=s.pets.some(p=>p.id===s.activePetId)?s.activePetId:s.pets[0].id;s.pet=s.pets.find(p=>p.id===s.activePetId);}
function credit(s,entry){if(!s.ledger.some(l=>l.id===entry.id))s.ledger.push(entry);}
function settle(s,now){normalize(s,now);const current=monday(day(now));for(const start of new Set(s.tasks.map(t=>monday(t.day)))){if(start>=current||s.settledWeeks.includes(start))continue;const ts=s.tasks.filter(t=>t.day>=start&&t.day<=shift(start,6));if(ts.length&&ts.filter(t=>t.done).length*10>=ts.length*9)credit(s,{id:'week:'+start,flowers:1,points:0,label:'每周达标奖励 · '+start,day:shift(start,7)});s.settledWeeks.push(start);}}
function allDone(s,today){const ts=s.tasks.filter(t=>t.day===today);return ts.length>0&&ts.every(t=>t.done);}
function asset(value,allowed){if(!value)return '';if(typeof value!=='string')fail('图片格式无效');if(catalog.some(g=>value==='asset:'+g.id)||allowed?.has(value))return value;fail('请先上传文件到本家庭云存储');}
function parent(role){if(role!=='parent')fail('这项操作需要家长登录',403);}
function findPet(s,petId){const p=s.pets.find(p=>p.id===petId);if(!p)fail('宠物不存在',404);return p;}
function findTask(s,taskId,today){const t=s.tasks.find(t=>t.id===taskId);if(!t)fail('作业不存在',404);if(t.day!==today)fail('只能完成今天的作业');return t;}
function validateTask(t,now,allowed){if(!validDay(t.day)||t.day<day(now)||t.day>shift(day(now),366))fail('请选择今天至一年内的日期');if(!['checkin','oral','raz-new','raz-review'].includes(t.kind))fail('作业类型无效');return {id:id(t.id),day:t.day,subject:text(t.subject,20),title:text(t.title,150),kind:t.kind,instructions:text(t.instructions||'',10000),attachment:asset(t.attachment,allowed),mime:['image/jpeg','image/png','image/webp','application/pdf'].includes(t.mime)?t.mime:'',done:false,steps:{read:false,quiz:false},elapsed:0,started:null};}
function applyOperation(original,role,op,now=Date.now(),allowed=new Set()){
 const s=clone(original);normalize(s,now);if(!op||typeof op!=='object')fail('操作无效');id(op.id);if(s.appliedOps.includes(op.id))return s;settle(s,now);const a=op.args||{},today=day(now);
 switch(op.type){
 case 'tasks.create':{parent(role);if(!Array.isArray(a.tasks)||!a.tasks.length||a.tasks.length>30||s.tasks.length+a.tasks.length>3000)fail('单次最多布置30项，总数最多3000项');const fresh=a.tasks.map(t=>validateTask(t,now,allowed)),used=new Set(s.tasks.map(t=>t.id));for(const t of fresh){if(!t.title||used.has(t.id)||s.tasks.some(x=>x.day===t.day&&x.title===t.title&&x.kind===t.kind))fail('作业标题为空或重复');if(s.ledger.some(l=>l.id==='day:'+t.day))fail('该日期已经结算，不能追加作业');used.add(t.id);}s.tasks.push(...fresh);break;}
 case 'task.step':{const t=findTask(s,a.taskId,today);if(t.done||t.kind!=='raz-new'||!['read','quiz'].includes(a.step)||typeof a.value!=='boolean')fail('不能修改这项练习');t.steps[a.step]=a.value;break;}
 case 'timer':{const t=findTask(s,a.taskId,today);if(t.done||t.kind!=='oral')fail('不能修改计时');if(a.action==='start'){if(t.started===null)t.started=now;}else if(a.action==='pause'){if(t.started!==null){t.elapsed+=Math.max(0,now-t.started);t.started=null;}}else if(a.action==='reset'){t.elapsed=0;t.started=null;}else fail('计时操作无效');break;}
 case 'task.complete':{const t=findTask(s,a.taskId,today);if(t.done)break;if(t.kind==='raz-new'&&(!t.steps.read||!t.steps.quiz))fail('请先完成点读和Quiz');if(t.kind==='oral'){if(t.started!==null){t.elapsed+=Math.max(0,now-t.started);t.started=null;}if(t.elapsed<1000)fail('请先开始计时');}const petId=s.partners[today];findPet(s,petId);t.done=true;t.finishedAt=new Date(now).toISOString();t.studyPetId=petId;credit(s,{id:'task:'+t.id,flowers:0,points:10,petId,label:'完成 '+t.title,day:today});if(allDone(s,today))credit(s,{id:'day:'+today,flowers:1,points:20,petId,label:'每日全部完成奖励',day:today});break;}
 case 'pet.partner':{findPet(s,a.petId);if(s.ledger.some(l=>l.day===today&&l.points>0))fail('今天已经开始获得积分，明天再换学习伙伴');s.partners[today]=a.petId;break;}
 case 'pet.adopt':{if(s.pets.length>=2||!s.pets.some(p=>points(s,p.id)>=600))fail('达到4级后可领养第二只，最多两只');if(!BREEDS.has(a.breed))fail('宠物形象无效');const name=text(a.name,16);if(!name||s.pets.some(p=>p.name===name||p.id===a.petId))fail('请使用不同名字');s.pets.push({id:id(a.petId),name,breed:a.breed,adoptedAt:today});break;}
 case 'pet.edit':{const p=findPet(s,a.petId),name=text(a.name,16);if(!name||!BREEDS.has(a.breed)||s.pets.some(other=>other.id!==p.id&&other.name===name))fail('名字或宠物形象无效');p.name=name;p.breed=a.breed;break;}
 case 'pet.touch':{const p=findPet(s,a.petId);if(!allDone(s,today))fail('请先完成今天全部作业');p.lastPettedDay=today;break;}
 case 'pet.feed':{findPet(s,a.petId);const t=s.tasks.find(t=>t.id===a.taskId&&t.done&&!t.fedAt);if(!t)fail('这份食物已用过，或作业尚未完成');t.fedAt=new Date(now).toISOString();t.fedPetId=a.petId;t.fedPet=findPet(s,a.petId).breed;break;}
 case 'gift.save':{parent(role);const g=a.gift||{},name=text(g.name,80);if(!name||!Number.isSafeInteger(g.cost)||g.cost<1||g.cost>999)fail('礼物名称或花数无效');const exists=s.gifts.find(x=>x.id===g.id),clean={id:id(g.id),name,cost:g.cost,description:text(g.description||'',1000),photo:asset(g.photo,allowed),emoji:'🎁',active:exists?exists.active:true};if(exists)Object.assign(exists,clean);else {if(s.gifts.length>=100)fail('最多设置100件礼物');s.gifts.push(clean);}break;}
 case 'gift.active':{parent(role);const g=s.gifts.find(g=>g.id===a.giftId);if(!g||typeof a.active!=='boolean')fail('礼物不存在');g.active=a.active;break;}
 case 'order.request':{const g=s.gifts.find(g=>g.id===a.giftId&&g.active);if(!g)fail('礼物已下架');if(s.orders.some(o=>o.id===a.orderId))break;if(available(s)<g.cost)fail('小花不足');s.orders.push({id:id(a.orderId),giftId:g.id,name:g.name,photo:g.photo,cost:g.cost,day:today,status:'pending'});break;}
 case 'order.status':{const o=s.orders.find(o=>o.id===a.orderId);if(!o)fail('申请不存在');if(a.status==='fulfilled')parent(role);if(!['fulfilled','cancelled'].includes(a.status)||o.status!=='pending')fail('申请已经处理');o.status=a.status;o.updatedAt=new Date(now).toISOString();break;}
 case 'family.import':{parent(role);if(s.tasks.length||s.ledger.length||s.orders.length)fail('只有空家庭可导入旧记录，不覆盖已使用的云端家庭',409);const incoming=validateImport(a.state,now,allowed);for(const key of ['pets','activePetId','pet','partners','tasks','gifts','orders','ledger','settledWeeks','catalogUpdates'])s[key]=incoming[key];break;}
 default:fail('不支持的同步操作');
 }
 if(available(s)<0)fail('小花余额不足');s.appliedOps.push(op.id);s.appliedOps=s.appliedOps.slice(-1000);normalize(s,now);return s;
}
function validateImport(input,now,allowed){
 if(!input||!Array.isArray(input.tasks)||!Array.isArray(input.gifts)||!Array.isArray(input.ledger)||!Array.isArray(input.orders))fail('备份文件格式不正确');
 if(input.tasks.length>3000||input.gifts.length>100||input.orders.length>3000||input.ledger.length>10000)fail('备份记录过多');
 const s=clone(input);s.pets=Array.isArray(s.pets)?s.pets:[{...s.pet,id:s.pet?.id||randomUUID()}];if(!s.pets.length||s.pets.length>2)fail('备份最多两只宠物');const ids=new Set();
 for(const p of s.pets){p.id=id(p.id);if(ids.has(p.id))fail('宠物编号重复');ids.add(p.id);p.name=text(p.name,16);if(p.breed==='golden')p.breed='penguin';if(!p.name||!BREEDS.has(p.breed))fail('宠物资料无效');}
 for(const t of s.tasks){id(t.id);if(!validDay(t.day)||!['checkin','oral','raz-new','raz-review'].includes(t.kind))fail('作业资料无效');t.title=text(t.title,150);t.subject=text(t.subject,20);t.instructions=text(t.instructions||'',10000);t.attachment=asset(t.attachment,allowed);t.done=!!t.done;t.steps={read:!!t.steps?.read,quiz:!!t.steps?.quiz};t.elapsed=Number.isSafeInteger(t.elapsed)&&t.elapsed>=0?t.elapsed:0;t.started=null;if(t.fedAt)t.fedAt=String(t.fedAt);}
 for(const g of s.gifts){id(g.id);g.name=text(g.name,80);g.description=text(g.description||'',1000);if(!Number.isSafeInteger(g.cost)||g.cost<1||g.cost>999)fail('礼物价格无效');g.photo=asset(g.photo,allowed);g.active=!!g.active;}
 const ledgerIds=new Set();for(const l of s.ledger){id(l.id);if(ledgerIds.has(l.id))fail('奖励编号重复');ledgerIds.add(l.id);if(!validDay(l.day)||!Number.isSafeInteger(l.points)||l.points<0||l.points>100000||!Number.isSafeInteger(l.flowers)||l.flowers<0||l.flowers>10000)fail('奖励资料无效');l.label=text(l.label||'',500);if(l.points&&!ids.has(l.petId))l.petId=s.pets[0].id;}
 for(const o of s.orders){id(o.id);o.name=text(o.name,80);if(!['pending','fulfilled','cancelled'].includes(o.status)||!Number.isSafeInteger(o.cost)||o.cost<1||o.cost>999||!validDay(o.day))fail('兑换记录无效');o.photo=asset(o.photo,allowed);}
 s.settledWeeks=Array.isArray(s.settledWeeks)?s.settledWeeks.filter(validDay):[];s.partners=s.partners||{};for(const d of Object.keys(s.partners)){if(!validDay(d)||!ids.has(s.partners[d]))delete s.partners[d];}s.catalogUpdates=Array.isArray(s.catalogUpdates)?s.catalogUpdates.filter(x=>typeof x==='string'&&x.length<100):[];if(available(s)<0)fail('备份的小花余额为负');normalize(s,now);return s;
}
module.exports={ApiError,initialState,applyOperation,settle,normalize,day,monday,shift,points,available,clone,validateImport};
