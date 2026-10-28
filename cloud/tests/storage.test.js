'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {PrivateStorage}=require('../functions/dva-sync/storage');
const path='families/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.jpg';
test('private bucket uses binary upload and authenticated batched signed URLs',async()=>{
 const requests=[];const s=new PrivateStorage({env:'test-environment',key:'test-server-key',fetchImpl:async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>url.includes('/object/sign/')?[{path,signedURL:'/object/sign/dva-family-files/'+path+'?token=test-signature'}]:{Id:'object-id',Key:'dva-family-files/'+path}};}});
 const file=await s.uploadFile({cloudPath:path,fileContent:Buffer.from([255,216,255])});assert.equal(file.fileID,'cloud://dva-family-files/'+path);
 assert.equal(requests[0].options.headers.Authorization,'Bearer test-server-key');assert.equal(requests[0].options.headers['Content-Type'],'image/jpeg');assert.equal(requests[0].options.headers['x-upsert'],'false');assert.ok(Buffer.isBuffer(requests[0].options.body));assert.ok(requests[0].url.includes('/v1/storages/object/dva-family-files/families/'));
 const signed=await s.getTempFileURL({fileList:[{fileID:file.fileID,maxAge:3600}]});assert.equal(signed.fileList[0].fileID,file.fileID);assert.match(signed.fileList[0].tempFileURL,/\/v1\/storages\/object\/sign\/dva-family-files\//);assert.equal(JSON.parse(requests[1].options.body).expiresIn,3600);
 await assert.rejects(s.uploadFile({cloudPath:'../other-family',fileContent:Buffer.alloc(0)}),/Invalid family/);
});
test('private upload errors never expose upstream credentials, preserve legacy references',async()=>{
 const s=new PrivateStorage({env:'test',key:'server-secret',fetchImpl:async()=>({ok:false,status:403,json:async()=>({code:'AccessDenied',message:'secret=server-secret'})})});
 await assert.rejects(s.uploadFile({cloudPath:path,fileContent:Buffer.alloc(1)}),e=>e.code==='STORAGE_AccessDenied'&&!e.message.includes('server-secret'));
 let called=false;const legacy=new PrivateStorage({env:'test',key:'test',legacy:{getTempFileURL:async input=>{called=true;return {fileList:[{fileID:input.fileList[0].fileID,tempFileURL:'https://legacy.example/file'}]};}}});
 const result=await legacy.getTempFileURL({fileList:[{fileID:'cloud://legacy/file'}]});assert.ok(called);assert.equal(result.fileList[0].tempFileURL,'https://legacy.example/file');
});
