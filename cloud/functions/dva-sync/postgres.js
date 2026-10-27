'use strict';
class PgStore{
 constructor(rdb){this.rdb=rdb;}
 async rpc(action,args={}){const {data,error}=await this.rdb.rpc('dva_rpc',{p_action:action,p_args:args});if(error){const e=new Error('数据库操作失败，请确认schema.sql及服务身份RPC执行权限');e.code=error.code;throw e;}return data;}
 health(){return this.rpc('health');} family(code){return this.rpc('family',{code});} register(args){return this.rpc('register',args);} state(id){return this.rpc('state',{id});} cas(id,version,state){return this.rpc('cas',{id,version,state});}
 putSession(args){return this.rpc('put_session',args);} session(hash){return this.rpc('session',{hash});} logout(hash){return this.rpc('logout',{hash});} rate(key,max,expires){return this.rpc('rate',{key,max,expires});} assets(id){return this.rpc('assets',{id});} addAsset(id,file,mime){return this.rpc('asset_add',{id,file,mime});}
}
module.exports={PgStore};
