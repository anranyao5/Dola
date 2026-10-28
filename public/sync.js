// The cloud is authoritative. No local edit is reported as saved before acknowledgment.
let cloudCacheEnabled=true;
persist=function(){
 if(!cloudCacheEnabled)return true;
 try{
  const cache=JSON.stringify(cloudPack(state));
  // Keep image bytes out of Web Storage; the authenticated cloud remains authoritative.
  if(cache.length>256*1024){localStorage.removeItem(KEY);return true;}
  localStorage.setItem(KEY,cache);
 }catch{
  // An unavailable local cache must not turn an acknowledged cloud save into a failure.
  try{localStorage.removeItem(KEY);}catch{}
  cloudCacheEnabled=false;
 }
 return true;
};
const CLOUD_SESSION_KEY='dva-family-session-v1',builtinPhotos=new Map(seed().gifts.map(g=>[g.id,g.photo]));
let cloudSession=null,cloudBusy=false,cloudReady=false,cloudVersion=-1,cloudCanonical=null,cloudUrlFiles=new Map(),cloudClockOffset=0,cloudRequestPending=null;
try{cloudSession=JSON.parse(localStorage.getItem(CLOUD_SESSION_KEY)||'null');}catch{}
function cloudStatus(message){$('#cloudStatus').textContent=message;}
async function cloudApi(path,body){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
 try{const r=await fetch(DVA_API_BASE+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(cloudSession?{Authorization:'Bearer '+cloudSession.token}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal,cache:'no-store'});let data;try{data=await r.json();}catch{throw Error('云端未返回有效数据，请检查服务地址');}if(!r.ok){if(r.status===401&&cloudSession){cloudReady=false;document.body.classList.add('cloud-locked');$('#cloudAuth').hidden=false;$('#cloudAuthMessage').textContent='登录已过期，请重新登录';}throw Error(data.error||'同步失败，请重试');}return data;}catch(e){if(e.name==='AbortError'||e instanceof TypeError)throw Error('网络未连接或响应超时，操作尚未确认保存，请联网后重试');throw e;}finally{clearTimeout(timeout);}
}
function cloudPack(value){
 const s=JSON.parse(JSON.stringify(value));
 for(const list of [s.tasks||[],s.gifts||[],s.orders||[]])for(const item of list)for(const field of ['photo','attachment'])if(item[field]){
  if(cloudUrlFiles.has(item[field]))item[field]=cloudUrlFiles.get(item[field]);
  else for(const [id,photo]of builtinPhotos)if(item[field]===photo){item[field]='asset:'+id;break;}
 }
 return s;
}
async function cloudUploadRefs(value){
 if(Array.isArray(value))return Promise.all(value.map(cloudUploadRefs));
 if(value&&typeof value==='object'){const result={};for(const [k,v]of Object.entries(value)){if(['photo','attachment'].includes(k)&&typeof v==='string'&&v.startsWith('data:')){const match=v.match(/^data:(image\/(?:png|jpeg|webp)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/);if(!match)throw Error('文件格式不支持');result[k]=(await cloudApi('/assets',{mime:match[1],data:match[2]})).fileId;}else result[k]=await cloudUploadRefs(v);}return result;}
 return value;
}
function cloudAccept(snapshot){
 const viewed=state.activePetId;
 cloudVersion=snapshot.version;cloudClockOffset=snapshot.serverTime-Date.now();cloudCanonical=JSON.parse(JSON.stringify(snapshot.state));
 state=JSON.parse(JSON.stringify(snapshot.state));cloudUrlFiles=new Map();for(const [file,url]of Object.entries(snapshot.assetUrls||{}))cloudUrlFiles.set(url,file);
 for(const list of [state.tasks,state.gifts,state.orders])for(const item of list)for(const f of ['photo','attachment'])if(typeof item[f]==='string'){
  if(item[f].startsWith('asset:'))item[f]=builtinPhotos.get(item[f].slice(6))||'';
  else if(item[f].startsWith('cloud://'))item[f]=snapshot.assetUrls[item[f]]||'';
 }
 if(state.pets.some(p=>p.id===viewed))state.activePetId=viewed;
 normalizePets();persist();cloudReady=true;document.body.classList.remove('cloud-locked');$('#cloudAuth').hidden=true;$('#cloudBar').hidden=false;
 $('#cloudIdentity').textContent=cloudSession.familyCode+' · '+(cloudSession.role==='parent'?'家长':'孩子');$('#cloudImportLabel').hidden=cloudSession.role!=='parent';
 if(cloudSession.role==='child'&&page==='parent')page='learn';render();cloudStatus('✓ 已同步 · '+new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',second:'2-digit'}));
 if($('#taskDialog').open){const task=taskNow();if(task){refreshCompletion();paintTimer();$$('[data-step]').forEach(c=>{c.checked=!!task.steps[c.dataset.step];c.disabled=task.done;});}else closeDialog('taskDialog');}
}
function cloudInfer(before,after){
 const make=(type,args)=>({id:crypto.randomUUID(),type,args});
 const added=after.tasks.filter(t=>!before.tasks.some(b=>b.id===t.id));if(added.length)return make('tasks.create',{tasks:added});
 for(const t of after.tasks){const b=before.tasks.find(b=>b.id===t.id);if(!b)continue;
  if(!b.done&&t.done)return make('task.complete',{taskId:t.id});
  if(!b.fedAt&&t.fedAt)return make('pet.feed',{taskId:t.id,petId:t.fedPetId});
  for(const step of ['read','quiz'])if(b.steps[step]!==t.steps[step])return make('task.step',{taskId:t.id,step,value:t.steps[step]});
  if(b.started!==t.started||b.elapsed!==t.elapsed)return make('timer',{taskId:t.id,action:t.started?'start':t.elapsed===0?'reset':'pause'});
 }
 const adopted=after.pets.find(p=>!before.pets.some(b=>b.id===p.id));if(adopted)return make('pet.adopt',{petId:adopted.id,name:adopted.name,breed:adopted.breed});
 for(const p of after.pets){const b=before.pets.find(b=>b.id===p.id);if(b.name!==p.name||b.breed!==p.breed)return make('pet.edit',{petId:p.id,name:p.name,breed:p.breed});if(b.lastPettedDay!==p.lastPettedDay)return make('pet.touch',{petId:p.id});}
 const today=dayOf();if(before.partners[today]!==after.partners[today])return make('pet.partner',{petId:after.partners[today]});
 for(const g of after.gifts){const b=before.gifts.find(b=>b.id===g.id);if(!b||['name','cost','description','photo'].some(k=>b[k]!==g[k]))return make('gift.save',{gift:g});if(b.active!==g.active)return make('gift.active',{giftId:g.id,active:g.active});}
 for(const o of after.orders){const b=before.orders.find(b=>b.id===o.id);if(!b)return make('order.request',{giftId:o.giftId,orderId:o.id});if(b.status!==o.status)return make('order.status',{orderId:o.id,status:o.status});}
 return null;
}
async function cloudSubmit(operation){
 cloudRequestPending=operation;
 // Reuse the same operation ID on a lost response. Rewards cannot duplicate.
 for(let attempt=0;attempt<2;attempt++){try{const snapshot=await cloudApi('/operations',operation);cloudRequestPending=null;return snapshot;}catch(e){if(attempt||!e.message.includes('网络'))throw e;}}
}
async function transact(fn){
 if(!cloudReady||!cloudSession){toast('请先连接并登录家庭账号');return false;}if(cloudBusy){toast('正在同步上一项，请稍等');return false;}
 normalizePets();const before=JSON.parse(JSON.stringify(state));let desired,operation;
 try{fn();normalizePets();desired=JSON.parse(JSON.stringify(state));operation=cloudInfer(cloudPack(before),cloudPack(desired));}catch(e){state=before;normalizePets();toast(e.message);return false;}
 state=before;normalizePets();
 if(!operation){state.activePetId=desired.activePetId;normalizePets();persist();return true;}
 cloudBusy=true;document.body.classList.add('cloud-saving');cloudStatus('正在保存到云端…');
 try{
  if(cloudRequestPending)cloudAccept(await cloudSubmit(cloudRequestPending));
  operation=await cloudUploadRefs(operation);const snapshot=await cloudSubmit(operation);state.activePetId=desired.activePetId;cloudAccept(snapshot);return true;
 }catch(e){cloudStatus('⚠ 未确认保存 · 请刷新同步后重试');toast(e.message);return false;}finally{cloudBusy=false;document.body.classList.remove('cloud-saving');}
}
const cloudOriginalRender=render;render=function(){cloudOriginalRender();if(cloudSession?.role==='child'){$('#roleButton').hidden=true;$$('[data-page="parent"]').forEach(b=>b.hidden=true);}else $('#roleButton').hidden=false;};
const cloudOriginalSetPage=setPage;setPage=function(next){if(next==='parent'&&cloudSession?.role!=='parent'){toast('请使用家长账号登录');return;}cloudOriginalSetPage(next);};
timerValue=function(t){return(t.elapsed||0)+(t.started?Math.max(0,Date.now()+cloudClockOffset-t.started):0);};
async function cloudPull(force=false){if(!cloudSession||cloudBusy||(!force&&document.querySelector('dialog[open]')))return;cloudBusy=true;try{if(cloudRequestPending)cloudAccept(await cloudSubmit(cloudRequestPending));cloudAccept(await cloudApi('/state'));}catch(e){cloudStatus('⚠ 同步未连接 · 请检查网络');if(force)toast(e.message);}finally{cloudBusy=false;}}
$('#cloudLogin').elements.mode.onchange=()=>{const create=$('#cloudLogin').elements.mode.value==='create';$$('[data-login]').forEach(e=>e.hidden=create);$$('[data-create]').forEach(e=>e.hidden=!create);};
$('#cloudLogin').onsubmit=async e=>{e.preventDefault();const f=e.target,button=f.querySelector('button');button.disabled=true;$('#cloudAuthMessage').textContent='正在连接家庭…';try{const create=f.elements.mode.value==='create';cloudSession=null;const session=await cloudApi(create?'/families':'/login',create?{parentPassword:f.elements.password.value,childPassword:f.elements.childPassword.value}:{familyCode:f.elements.code.value,role:f.elements.role.value,password:f.elements.password.value});cloudSession=session;localStorage.setItem(CLOUD_SESSION_KEY,JSON.stringify(session));f.elements.password.value='';f.elements.childPassword.value='';cloudRequestPending=null;cloudVersion=-1;cloudAccept(await cloudApi('/state'));page=session.role==='parent'?'parent':'learn';render();if(create)alert('家庭已创建。请保存家庭编号：'+session.familyCode+'。\n孩子在 iPad 上选择“孩子”，输入这个编号和你设置的6位密码。');}catch(error){$('#cloudAuthMessage').textContent=error.message;}finally{button.disabled=false;}};
$('#cloudRefresh').onclick=()=>cloudPull(true);
$('#cloudLogout').onclick=async()=>{if(cloudBusy){toast('请等待当前同步结束');return;}try{await cloudApi('/logout',{});}catch{}cloudSession=null;cloudReady=false;cloudRequestPending=null;localStorage.removeItem(CLOUD_SESSION_KEY);localStorage.removeItem(KEY);location.reload();};
$('#cloudExport').onclick=()=>{const blob=new Blob([JSON.stringify(cloudPack(state))],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Dva-family-backup-'+dayOf()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('#cloudImport').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;if(cloudBusy)return;if(!cloudReady||cloudSession.role!=='parent')return;if(file.size>15*1024*1024){toast('备份文件过大');return;}if(!confirm('仅可导入到尚未使用的空家庭，不会覆盖已有云端作业。确认导入？'))return;cloudBusy=true;try{const imported=cloudPack(JSON.parse(await file.text())),op={id:crypto.randomUUID(),type:'family.import',args:{state:await cloudUploadRefs(imported)}};cloudAccept(await cloudSubmit(op));toast('旧记录已导入并同步');}catch(error){toast(error.message);}finally{cloudBusy=false;}};
window.addEventListener('focus',()=>cloudPull());document.addEventListener('visibilitychange',()=>{if(!document.hidden)cloudPull();});window.addEventListener('online',()=>cloudPull());
setInterval(()=>{if(!document.hidden)cloudPull();},10000);
if(!DVA_API_BASE){$('#cloudAuthMessage').textContent='同步服务还未配置，暂时不能登录。请先部署云函数并填写服务地址。';$('#cloudLogin button').disabled=true;}
else if(cloudSession)cloudPull(true);
