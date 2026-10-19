import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {runAdminProductE2E} from './h1-product-e2e.mjs';
test('self-deactivation races preserve both winner orders and wait for server versions', async () => {
const previousFetch = globalThis.fetch;
try {
for(const winner of ['actor','target']){
const actorId='actor',idA='A',idB='B',cookieActor='abar_admin_session=actor',cookieTarget='abar_admin_session=target';let race=[];let logoutCookie;let revoked=false;let finished=false;
let users=[{id:actorId,active:true,version:2}],sessions=[],audits=[];
const response=(status,data,headers={})=>new Response(status===204?null:JSON.stringify(data??{}),{status,headers:{'cache-control':'no-store',...headers}});
const snapshot=async()=>structuredClone({users,sessions,audits});
globalThis.fetch=async(url,opt)=>{
const p=new URL(url).pathname,method=opt.method,b=opt.body?JSON.parse(opt.body):{},cookie=opt.headers.cookie;
if(p.endsWith('/csrf'))return response(200,{csrfToken:'a'.repeat(43)},{'set-cookie':'abar_auth_context=pre'});
if(p.endsWith('/login')){if(b.password==='new'){sessions.push({id:'s',adminUserId:idA,revokedAt:null});return response(200,{admin:{mustChangePassword:true}},{'set-cookie':'abar_admin_session=target'});}return response(200,{admin:{mustChangePassword:true}},{'set-cookie':'abar_admin_session=target','x-csrf-token':'token'});}
if(p.endsWith('/change-password')){users.find(x=>x.id===idA).version=4;return response(204,null,{'set-cookie':'abar_admin_session=target','x-csrf-token':'token'});}
if(p.endsWith('/logout')){logoutCookie=cookie;finished=true;return response(204);}
if(p.endsWith('/me'))return response((cookie===cookieTarget&&revoked)||finished?401:200,{admin:{id:actorId}});
if(p==='/api/v1/admin/users'&&method==='GET')return cookie===cookieTarget?response(403,{code:'PASSWORD_CHANGE_REQUIRED'}):response(200,{items:[],pageInfo:{page:1}});
if(p==='/api/v1/admin/users'&&method==='POST'){
if(opt.headers.origin==='http://invalid.example'||opt.headers['x-csrf-token']==='A'.repeat(43))return response(403);
if(b.name==='Duplicate')return response(409);
const id=b.name.endsWith('A')?idA:idB;const row={id,version:1,active:true,mustChangePassword:true};users.push(row);return response(201,row);
}
if(p.endsWith('/reset-password')){const row=users.find(x=>x.id===idA);row.version=3;row.mustChangePassword=true;for(const s of sessions)s.revokedAt='now';audits.push({targetAdminUserId:idA,actorAdminUserId:actorId,reason:'H1 real fixture reset'});revoked=true;return response(204);}
if(method==='PATCH'){
const id=p.split('/').at(-1),row=users.find(x=>x.id===id);
if(b.name==='Stale Write')return response(409,{code:'VERSION_CONFLICT'});
if(b.name){row.version=2;return response(200,row);}
if(id===idB){row.active=false;return response(200,row);}
race.push({id,cookie,version:b.expectedVersion});assert.equal(id,cookie===cookieActor?actorId:idA);assert.equal(b.expectedVersion,id===actorId?2:4);
const succeeds=(id===actorId)===(winner==='actor');if(succeeds)row.active=false;
if(race.length===2)revoked=false;
return succeeds?response(200,row):response(409,{code:'LAST_ACTIVE_ADMIN'});
}throw Error('unexpected fixed route');
};
const result=await runAdminProductE2E({baseUrl:'http://127.0.0.1:1',origin:'http://127.0.0.1:1',runId:'a'.repeat(32),actorId,actorCookie:cookieActor,actorCsrf:'token',currentPassword:'current',replacementPassword:'new',deadlineAt:Date.now()+10000,snapshot});
assert.equal(result.passed,true,JSON.stringify(result));assert.equal(race.length,2);assert.equal(logoutCookie,winner==='actor'?cookieTarget:cookieActor);
}
const source=await readFile(new URL('../../odd/checks/h1-browser-real.mjs',import.meta.url),'utf8');
const waits=[...source.matchAll(/await waitFor\(`(document\.querySelector\('\[name="name-\$\{staff\.id\}"\]'\).*?Versión [23]')`\)/g)].map(x=>x[1]);assert.equal(waits.length,2);
for(const [i,expr] of waits.entries()){
let version=i+1;let queried;
const document={querySelector(selector){queried=selector;return{value:'already edited input',closest(){return{querySelector(){return{get innerText(){return 'Versión '+version}}}}}}}};
const code=expr.replace('${staff.id}','A');assert.equal(vm.runInNewContext(code,{document}),false);version=i+2;assert.equal(vm.runInNewContext(code,{document}),true);assert.equal(queried,'[name="name-A"]');
}
} finally { globalThis.fetch = previousFetch; }
});
