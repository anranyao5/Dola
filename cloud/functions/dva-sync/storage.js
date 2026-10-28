'use strict';
// Protocol verified against CloudBase JS SDK 3.10.4 storage-file-api-neo/http sources.
// Private bucket storage uses /v1/storages, rather than legacy storage.getUploadMetadata.
class PrivateStorage {
 constructor({env,key,bucket='dva-family-files',fetchImpl=fetch,legacy}){
  if(!/^[a-z0-9-]+$/.test(env||''))throw new Error('Invalid cloud environment');
  if(!/^[a-z0-9-]+$/.test(bucket))throw new Error('Invalid storage bucket');
  this.base='https://'+env+'.api.tcloudbasegateway.com/v1/storages';this.key=key;this.bucket=bucket;this.fetch=fetchImpl;this.legacy=legacy;
 }
 encode(path){if(!/^families\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(jpg|png|webp|pdf)$/.test(path))throw new Error('Invalid family asset path');return path.split('/').map(encodeURIComponent).join('/');}
 async request(path,{method='POST',body,headers={}}={}){
  if(!this.key){const e=new Error('Storage service identity missing');e.code='STORAGE_IDENTITY';throw e;}
  let r;try{r=await this.fetch(this.base+path,{method,headers:{Authorization:'Bearer '+this.key,...headers},body,redirect:'error',signal:AbortSignal.timeout(2400)});}catch{const e=new Error('Storage connection failed');e.code='STORAGE_CONNECTION';throw e;}
  let data;try{data=await r.json();}catch{const e=new Error('Storage response invalid');e.code='STORAGE_RESPONSE';throw e;}
  if(!r.ok||data?.error){const e=new Error('Private storage request failed');const raw=String(data?.code||data?.error?.code||r.status);e.code='STORAGE_'+(/^[A-Za-z0-9_.-]{1,60}$/.test(raw)?raw:r.status);throw e;}
  return data;
 }
 async uploadFile({cloudPath,fileContent}){
  const suffix=cloudPath.split('.').pop(),mime={jpg:'image/jpeg',png:'image/png',webp:'image/webp',pdf:'application/pdf'}[suffix];
  await this.request('/object/'+this.bucket+'/'+this.encode(cloudPath),{body:fileContent,headers:{'Content-Type':mime,'cache-control':'max-age=3600','x-upsert':'false'}});
  return {fileID:'cloud://'+this.bucket+'/'+cloudPath};
 }
 async getTempFileURL({fileList}){
  const prefix='cloud://'+this.bucket+'/',ours=fileList.filter(f=>f.fileID.startsWith(prefix)),old=fileList.filter(f=>!f.fileID.startsWith(prefix));let fileResults=[];
  if(ours.length){const paths=ours.map(f=>{const p=f.fileID.slice(prefix.length);this.encode(p);return p;});const data=await this.request('/object/sign/'+this.bucket,{headers:{'Content-Type':'application/json'},body:JSON.stringify({expiresIn:3600,paths})});
   if(!Array.isArray(data)){const e=new Error('Signed URLs response invalid');e.code='STORAGE_SIGN_RESPONSE';throw e;}
   fileResults=data.map(item=>{const raw=item.fullSignedURL||item.signedURL;const url=raw?(raw.startsWith('https://')?raw:this.base+(raw.startsWith('/')?'':'/')+raw):'';if(!paths.includes(item.path)||item.error||!url){const e=new Error('Signed URL not available');e.code='STORAGE_SIGN_FAILED';throw e;}return {fileID:prefix+item.path,tempFileURL:url};});
   if(fileResults.length!==ours.length){const e=new Error('Signed URL missing');e.code='STORAGE_SIGN_MISSING';throw e;}
  }
  if(old.length&&this.legacy)fileResults.push(...(await this.legacy.getTempFileURL({fileList:old})).fileList);
  return {fileList:fileResults};
 }
}
module.exports={PrivateStorage};
