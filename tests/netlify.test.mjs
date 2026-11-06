import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import worker from '../worker/index.js';
import {postgresQuery,postgresBindings,blobBindings} from '../netlify/server/adapters.mjs';

test('Postgres placeholders preserve quoted values and qualify conflict counters',()=>{
 assert.deepEqual(postgresQuery("SELECT '?' literal, 'it''s ?' escaped WHERE id=? AND revision=?"),{text:"SELECT '?' literal, 'it''s ?' escaped WHERE id=$1 AND revision=$2",parameters:2});
 assert.match(postgresQuery('INSERT INTO admin_limits(bucket_key,attempts) VALUES(?,1) ON CONFLICT(bucket_key) DO UPDATE SET attempts=attempts+1 RETURNING attempts').text,/SET attempts=admin_limits.attempts\+1/);
});
test('Netlify Postgres and Blobs integration supports independent admin, project publishing and enquiries',async t=>{
 const postgres=new PGlite();t.after(()=>postgres.close());
 await postgres.exec(readFileSync(new URL('../netlify/database/migrations/20261106000100_portfolio.sql',import.meta.url),'utf8'));
 const pool={async query(sql,values){const result=await postgres.query(sql,values);return {rows:result.rows,rowCount:result.affectedRows};}};
 const files=new Map();const store={async getMetadata(key){const entry=files.get(key);return entry?{etag:'"'+key+'"',metadata:entry.metadata}:null;},async set(key,data,options){if(options.onlyIfNew&&files.has(key))return {modified:false};files.set(key,{data,metadata:options.metadata});return {modified:true};},async getWithMetadata(key){const entry=files.get(key);return entry?{...entry,etag:'"'+key+'"'}:null;}};
 const token='b'.repeat(64),password='Postgres preview passphrase 5829!';
 const env={DB:postgresBindings(pool),BUCKET:blobBindings(store),ADMIN_PASSWORD_PEPPER:'postgres-integration-test-only-pepper',ADMIN_PHONE:'+8801868333944',ADMIN_SETUP_TOKEN_HASH:createHash('sha256').update(token).digest('hex'),ADMIN_SETUP_EXPIRES:String(Date.now()+3600000)};
 const jobs=[];const ctx={waitUntil:p=>jobs.push(p)};let cookie='';
 async function request(path,method='GET',body,authorized=true){
  const headers=new Headers({Origin:'https://portfolio.netlify.app'});if(authorized&&cookie)headers.set('Cookie',cookie);
  if(body!==undefined){headers.set('Content-Type',body instanceof Uint8Array?'image/png':'application/json');if(!(body instanceof Uint8Array))body=JSON.stringify(body);}
  return worker.fetch(new Request('https://portfolio.netlify.app'+path,{method,headers,body}),env,ctx);
 }
 async function checked(path,method='GET',body,authorized=true,expected=200){const response=await request(path,method,body,authorized);assert.equal(response.status,expected,path+': '+await response.clone().text());return response;}
 await checked('/api/auth/setup','POST',{token,username:'shamim',password:'short'},false,400);
 const setup=await checked('/api/auth/setup','POST',{token,username:'shamim',password},false);cookie=setup.headers.get('Set-Cookie').split(';')[0];
 await checked('/api/auth/password','POST',{username:'shamim',password:'wrong'},false,401);
 const login=await checked('/api/auth/password','POST',{username:'shamim',password},false);cookie=login.headers.get('Set-Cookie').split(';')[0];
 assert.equal((await (await checked('/api/session')).json()).canEdit,true);
 const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=','base64'));
 const upload=await (await checked('/api/media','POST',png,true,201)).json();assert.equal(files.size,1);
 await checked('/api/media','POST',png,true,201);assert.equal(files.size,1,'Artwork is deduplicated');
 const project={id:'logo',title:'Logo project',description:'A distinctive brand identity.',category:'Logo design',images:[upload.url]};
 await checked('/api/projects','PUT',{projects:[project],revision:0});
 const races=await Promise.all([request('/api/projects','PUT',{projects:[{...project,title:'First edit'}],revision:1}),request('/api/projects','PUT',{projects:[{...project,title:'Second edit'}],revision:1})]);
 assert.deepEqual(races.map(r=>r.status).sort(),[200,409]);
 const collection=await (await checked('/api/projects','GET',undefined,false)).json();assert.equal(collection.revision,2);assert.equal(typeof collection.revision,'number');
 assert.equal((await checked(upload.url,'GET',undefined,false)).headers.get('Content-Type'),'image/png');
 await checked('/api/projects','PUT',{projects:[],revision:2},false,403);
 const original=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({success:true}));
 try{
  const body={name:'Client',email:'client@example.test',brand:'Example',project_type:'Logo design',message:'A complete brief for a new brand identity.'};
  for(let i=0;i<5;i++)await checked('/api/enquiries','POST',body,false,201);
  await checked('/api/enquiries','POST',body,false,429);await Promise.all(jobs);
 }finally{globalThis.fetch=original;}
 const inbox=await (await checked('/api/enquiries')).json();assert.equal(inbox.enquiries.length,5);assert.equal(inbox.enquiries[0].email_status,'accepted');
 await checked('/api/enquiries','GET',undefined,false,403);
 await checked('/api/auth/logout','POST',{});await checked('/api/enquiries','GET',undefined,true,403);
});
