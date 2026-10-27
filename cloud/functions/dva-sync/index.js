'use strict';
const crypto=require('node:crypto');
const {promisify}=require('node:util');
const scrypt=promisify(crypto.scrypt);
const {ApiError,initialState,applyOperation,settle,clone}=require('./engine');
const {PgStore}=require('./postgres');
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
const DEFAULT_ORIGIN='https://dola-homework-d1ghno6wa0993f682-1517233563.tcloudbaseapp.com';
async function passwordHash(password,salt){return (await scrypt(password,salt,32,{N:16384,r:8,p:1})).toString('hex');}
function validPassword(value,parent){return typeof value==='string'&&(parent?value.length>=8&&value.length<=128:/^\d{6}$/.test(value));}
function parseEvent(event){const headers=Object.fromEntries(Object.entries(event.headers||{}).map(([k,v])=>[k.toLowerCase(),String(v)])),method=String(event.httpMethod||event.requestContext?.http?.method||'GET').toUpperCase();let path=String(event.path||event.rawPath||'/health').split('?')[0];path=path.replace(/^.*\/(?:api\/dva|dva-sync)(?=\/|$)/,'')||'/';let body={};if(event.body){const raw=event.isBase64Encoded?Buffer.from(event.body,'base64'):Buffer.from(typeof event.body==='string'?event.body:JSON.stringify(event.body));if(raw.length>2*1024*1024)throw new ApiError(413,'请求太大，请分批上传');try{body=JSON.parse(raw.toString());}catch{throw new ApiError(400,'请求格式无效');}}if(!body||typeof body!=='object'||Array.isArray(body))throw new ApiError(400,'请求格式无效');return {method,path,headers,body,ip:headers['x-real-ip']||event.requestContext?.sourceIp||event.requestContext?.http?.sourceIp||'unknown'};}
function createHandler({store,storage,origins=[DEFAULT_ORIGIN],now=()=>Date.now()}){
 const tempCache=new Map();
 async function limit(key,max,ms){const t=now(),bucket=Math.floor(t/ms),r=await store.rate(digest(key+':'+bucket),max,(bucket+1)*ms);if(!r.allowed)throw new ApiError(429,'尝试次数太多，请稍后再试');}
 async function issue(familyId,code,role){const token=crypto.randomBytes(32).toString('base64url'),expires=now()+7*86400000;await store.putSession({hash:digest(token),id:familyId,role,expires});return {token,expires,familyCode:code,role};}
 async function authenticate(headers){const token=headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{40,100})$/)?.[1];if(!token)throw new ApiError(401,'请先登录家庭账号');const session=await store.session(digest(token));if(!session)throw new ApiError(401,'登录已过期，请重新登录');return {...session,hash:digest(token)};}
 async function decorate(session,state,version){
  const ids=[...new Set([...state.tasks.map(t=>t.attachment),...state.gifts.map(g=>g.photo),...state.orders.map(o=>o.photo)].filter(v=>typeof v==='string'&&v.startsWith('cloud://')))];const urls={},missing=[];for(const file of ids){const cached=tempCache.get(file);if(cached&&cached.expires>now())urls[file]=cached.url;else missing.push(file);}
  if(missing.length){const result=await storage.getTempFileURL({fileList:missing.map(fileID=>({fileID,maxAge:3600}))});for(const f of result.fileList||[])if(f.tempFileURL){urls[f.fileID]=f.tempFileURL;tempCache.set(f.fileID,{url:f.tempFileURL,expires:now()+1800000});}}
  return {state,version,assetUrls:urls,familyCode:session.code,role:session.role,serverTime:now()};
 }
 async function snapshot(session){for(let i=0;i<5;i++){const row=await store.state(session.familyId);if(!row)throw new ApiError(404,'家庭不存在');const next=clone(row.state);settle(next,now());if(JSON.stringify(next)!==JSON.stringify(row.state)){const saved=await store.cas(session.familyId,row.version,next);if(!saved)continue;return decorate(session,next,saved.version);}return decorate(session,row.state,row.version);}throw new ApiError(409,'另一个设备正在保存，请稍后重试');}
 return async function handler(event){let origin='';try{
  const request=parseEvent(event);origin=request.headers.origin||'';if(origin&&!origins.includes(origin))throw new ApiError(403,'此网站未获允许访问家庭服务');
  const reply=(status,data)=>({statusCode:status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(origin?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{}),'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Authorization,Content-Type'},body:JSON.stringify(data),isBase64Encoded:false});
  if(request.method==='OPTIONS')return reply(204,{});
  if(request.method==='GET'&&request.path==='/health'){await store.health();return reply(200,{ok:true,schema:1});}
  const body=request.body;
  if(request.method==='POST'&&request.path==='/families'){
   await limit('register:'+request.ip,5,3600000);if(!validPassword(body.parentPassword,true)||!validPassword(body.childPassword,false))throw new ApiError(400,'家长密码需8至128位，孩子密码需6位数字');
   const familyId=crypto.randomUUID(),code='DVA-'+crypto.randomBytes(5).toString('hex').toUpperCase(),parentSalt=crypto.randomBytes(16).toString('hex'),childSalt=crypto.randomBytes(16).toString('hex');
   await store.register({id:familyId,code,parent_salt:parentSalt,parent_hash:await passwordHash(body.parentPassword,parentSalt),child_salt:childSalt,child_hash:await passwordHash(body.childPassword,childSalt),state:initialState(now())});return reply(201,await issue(familyId,code,'parent'));
  }
  if(request.method==='POST'&&request.path==='/login'){
   const code=typeof body.familyCode==='string'?body.familyCode.trim().toUpperCase():'',role=body.role==='child'?'child':'parent';if(!/^DVA-[A-Z0-9]{10}$/.test(code)||typeof body.password!=='string'||body.password.length>128)throw new ApiError(401,'家庭编号或密码不正确');
   await limit('login:'+code+':'+role,12,900000);await limit('login-ip:'+request.ip,60,900000);const family=await store.family(code),salt=family?.[role+'_salt']||'dva-missing-family-salt',computed=await passwordHash(body.password,salt),expected=family?.[role+'_hash']||'0'.repeat(64);
   if(!family||!crypto.timingSafeEqual(Buffer.from(computed,'hex'),Buffer.from(expected,'hex')))throw new ApiError(401,'家庭编号或密码不正确');return reply(200,await issue(family.id,code,role));
  }
  const session=await authenticate(request.headers);
  if(request.method==='POST'&&request.path==='/logout'){await store.logout(session.hash);return reply(200,{ok:true});}
  if(request.method==='GET'&&request.path==='/state')return reply(200,await snapshot(session));
  if(request.method==='POST'&&request.path==='/assets'){
   if(session.role!=='parent')throw new ApiError(403,'只有家长能上传文件');await limit('upload:'+session.familyId,100,3600000);
   const suffix={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'}[body.mime];if(!suffix||typeof body.data!=='string'||!/^[-A-Za-z0-9+/]*={0,2}$/.test(body.data))throw new ApiError(400,'请上传图片或PDF');const raw=Buffer.from(body.data,'base64');if(!raw.length||raw.length>1024*1024)throw new ApiError(413,'文件需小于1MB');
   const valid=body.mime==='image/jpeg'?raw.subarray(0,3).equals(Buffer.from([255,216,255])):body.mime==='image/png'?raw.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):body.mime==='image/webp'?raw.toString('ascii',0,4)==='RIFF'&&raw.toString('ascii',8,12)==='WEBP':raw.toString('ascii',0,5)==='%PDF-';if(!valid)throw new ApiError(400,'文件内容与类型不一致');
   const uploaded=await storage.uploadFile({cloudPath:'families/'+session.familyId+'/'+crypto.randomUUID()+'.'+suffix,fileContent:raw});if(!uploaded.fileID)throw new Error('Upload failed');await store.addAsset(session.familyId,uploaded.fileID,body.mime);return reply(201,{fileId:uploaded.fileID});
  }
  if(request.method==='POST'&&request.path==='/operations'){
   await limit('operations:'+session.familyId,300,60000);const assets=await store.assets(session.familyId),allowed=new Set(assets.map(a=>a.fileId));
   for(let i=0;i<8;i++){const row=await store.state(session.familyId);if(!row)throw new ApiError(404,'家庭不存在');const next=applyOperation(row.state,session.role,body,now(),allowed);if(JSON.stringify(next)===JSON.stringify(row.state))return reply(200,await decorate(session,row.state,row.version));const saved=await store.cas(session.familyId,row.version,next);if(saved)return reply(200,await decorate(session,next,saved.version));}
   throw new ApiError(409,'另一个设备正在保存，请重试');
  }
  throw new ApiError(404,'接口不存在');
 }catch(error){const status=error instanceof ApiError?error.status:503;return {statusCode:status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...(origin&&origins.includes(origin)?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{})},body:JSON.stringify({error:status===503?'云端服务暂不可用，请确认数据库表、服务权限和存储配置。':error.message}),isBase64Encoded:false};}}
}
let cloudHandler;
exports.main=async event=>{if(!cloudHandler){const cloudbase=require('@cloudbase/node-sdk');const app=cloudbase.init({env:cloudbase.SYMBOL_CURRENT_ENV});cloudHandler=createHandler({store:new PgStore(app.rdb()),storage:app,origins:(process.env.DVA_ALLOWED_ORIGINS||DEFAULT_ORIGIN).split(',').map(x=>x.trim()).filter(Boolean)});}return cloudHandler(event);};
exports.createHandler=createHandler;
exports.passwordHash=passwordHash;
