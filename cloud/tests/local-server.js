'use strict';
// Development-only harness: real WASM PostgreSQL, isolated from Tencent production.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('../functions/dva-sync/node_modules/@electric-sql/pglite');
const {PgStore}=require('../functions/dva-sync/postgres');
const {createHandler}=require('../functions/dva-sync/index');
(async()=>{const pg=new PGlite();await pg.waitReady;await pg.exec('create role service_role;');await pg.exec(fs.readFileSync(path.join(__dirname,'../schema.sql'),'utf8'));
const store=new PgStore({rpc:async(name,p)=>{try{const r=await pg.query('select public.dva_rpc($1,$2::jsonb) as result',[p.p_action,JSON.stringify(p.p_args)]);return {data:r.rows[0].result};}catch(error){return {error:{code:error.code}};}}});
const origin='http://127.0.0.1:8876';const handler=createHandler({store,origins:[origin],storage:{uploadFile:async()=>{throw Error('Test upload not enabled');},getTempFileURL:async()=>({fileList:[]})}});
const server=http.createServer(async(req,res)=>{if(req.url.startsWith('/api/dva')){let body='';for await(const chunk of req)body+=chunk;const r=await handler({httpMethod:req.method,path:req.url,headers:req.headers,body,requestContext:{sourceIp:'127.0.0.1'}});res.writeHead(r.statusCode,r.headers);res.end(r.body);return;}if(req.url==='/'||req.url==='/sync.html'){res.setHeader('content-type','text/html; charset=utf-8');res.end(fs.readFileSync(path.join(__dirname,'../../preview/sync-local.html')));}else{res.writeHead(404);res.end();}});
server.listen(8876,'127.0.0.1',()=>console.log('Local isolated sync harness: '+origin));})();
