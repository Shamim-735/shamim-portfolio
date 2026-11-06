import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker,{deliverEnquiry} from '../worker/index.js';
import {d1} from '../scripts/local-bindings.mjs';
import {bundle} from '../scripts/build.mjs';
const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=','base64'));
function setup(handler=worker){
 const db=new DatabaseSync(':memory:');for(const name of ['0000_portfolio','0001_admin_auth'])db.exec(readFileSync(new URL('../drizzle/'+name+'.sql',import.meta.url),'utf8'));
 const files=new Map();const env={ADMIN_PASSWORD_PEPPER:'test-only-pepper-for-authentication-fixtures',ADMIN_PHONE:'+8801868333944',DB:d1(db),BUCKET:{async head(k){return files.get(k)||null;},async put(k,data,opt){files.set(k,{body:data,httpMetadata:opt.httpMetadata,httpEtag:'"'+k+'"'});},async get(k){return files.get(k)||null;}}};
 const hash=value=>createHash('sha256').update(value).digest('hex');
 db.prepare('INSERT INTO admin_sessions VALUES(?,?,?)').run(hash('a'.repeat(64)),Date.now()+3600000,hash('portfolio-admin:'+env.ADMIN_PASSWORD_PEPPER+':'+env.ADMIN_PHONE));
 const jobs=[];const ctx={waitUntil:p=>jobs.push(p)};
 async function request(path,method='GET',body,identity='owner',origin='https://portfolio.test'){
  const headers=new Headers();if(identity){headers.set('oai-authenticated-user-id',identity);headers.set('oai-authenticated-user-email',identity==='owner'?'owner@example.test':'other@example.test');}
  if(identity==='owner')headers.set('Cookie','__Host-shamim-admin='+'a'.repeat(64));
  else if(identity?.startsWith('cookie:'))headers.set('Cookie',identity.slice(7));
  if(method!=='GET')headers.set('Origin',origin);
  if(body!==undefined){headers.set('Content-Type',body instanceof Uint8Array?'image/png':'application/json');body=body instanceof Uint8Array?body:JSON.stringify(body);}
  return handler.fetch(new Request('https://portfolio.test'+path,{method,headers,body}),env,ctx);
 }
 return {db,files,env,jobs,request};
}
const project=image=>({id:'logo-one',title:'Logo project',description:'A distinctive logo.',category:'Logo design',images:[image]});
test('admin pages and script reject anonymous and non-owner visitors before serving editor content',async()=>{
 const app=setup();
 for(const identity of [null,'other']){
  for(const path of ['/admin','/admin/','/admin.html','/admin.js']){
   const response=await app.request(path,'GET',undefined,identity);
   assert.equal(response.status,path==='/admin.js'?401:303,path);
   assert.equal(response.headers.get('Cache-Control'),'no-store');
   const body=await response.text();
   assert.doesNotMatch(body,/id="project-form"|id="owner-enquiries"|function persist/);
   if(path!=='/admin.js')assert.equal(response.headers.get('Location'),'/admin/login');
  }
 }
});
test('bundled admin is owner-only and the portfolio contains no management links or forms',async()=>{
 const {default:handler}=await import('data:text/javascript;base64,'+Buffer.from(await bundle()).toString('base64'));
 const app=setup(handler);
 const publicResponse=await app.request('/','GET',undefined,null);
 assert.equal(publicResponse.status,200);
 const html=await publicResponse.text();
 assert.doesNotMatch(html,/Manage portfolio|Owner sign in|id="open-editor"|id="project-form"|admin\.js/);
 for(const path of ['/admin','/admin/','/admin.html']){
  const response=await app.request(path);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.match(response.headers.get('X-Robots-Tag'),/noindex/);
  const body=await response.text();assert.match(body,/id="project-form"/);assert.match(body,/id="admin-workspace" inert/);
 }
 const script=await app.request('/admin.js');assert.equal(script.status,200);assert.equal(script.headers.get('Cache-Control'),'no-store');
 assert.match(await script.text(),/Your admin session has expired/);
});
test('only the verified owner can upload, publish or read enquiries',async()=>{
 const app=setup();
 for(const identity of [null,'other']){
  for(const [path,method,body] of [['/api/media','POST',png],['/api/projects','PUT',{revision:0,projects:[]}],['/api/enquiries','GET']])assert.equal((await app.request(path,method,body,identity)).status,403);
  assert.equal((await (await app.request('/api/session','GET',undefined,identity)).json()).canEdit,false);
 }
 assert.equal((await (await app.request('/api/session')).json()).canEdit,true);
 assert.equal(app.db.prepare('SELECT count(*) n FROM portfolio').get().n,0,'Reads do not mutate ownership');
});
test('uploads are immutable, deduplicated, and survive project metadata edits',async()=>{
 const app=setup();const upload=await (await app.request('/api/media','POST',png)).json();
 assert.match(upload.url,/^\/media\/[a-f0-9]{64}\.png$/);
 assert.equal((await (await app.request('/api/media','POST',png)).json()).url,upload.url);assert.equal(app.files.size,1);
 const p=project(upload.url);
 const first=await (await app.request('/api/projects','PUT',{projects:[p],revision:0})).json();assert.equal(first.revision,1);
 const second=await (await app.request('/api/projects','PUT',{projects:[{...p,title:'Updated title'}],revision:1})).json();assert.deepEqual(second.projects[0].images,[upload.url]);
 const media=await app.request(upload.url,'GET',undefined,null);assert.equal(media.status,200);assert.equal(media.headers.get('Content-Type'),'image/png');assert.deepEqual(new Uint8Array(await media.arrayBuffer()),png);
 assert.equal((await app.request('/api/media','POST',new TextEncoder().encode('<svg>script</svg>'))).status,415);
});
test('platform identity headers cannot grant editor access',async()=>{
 const app=setup();await app.request('/api/media','POST',png);app.env.OWNER_EMAIL='other@example.test';
 assert.equal((await (await app.request('/api/session')).json()).canEdit,true);
 assert.equal((await app.request('/api/media','POST',png,'other')).status,403);
});
test('revision conflicts and cross-origin requests cannot overwrite saved projects',async()=>{
 const app=setup();const {url}=await (await app.request('/api/media','POST',png)).json();
 await app.request('/api/projects','PUT',{projects:[project(url)],revision:0});
 assert.equal((await app.request('/api/projects','PUT',{projects:[],revision:0})).status,409);
 assert.equal((await app.request('/api/projects','PUT',{projects:[],revision:1},'owner','https://malicious.test')).status,403);
 const shared=await (await app.request('/api/projects','GET',undefined,null)).json();assert.equal(shared.projects.length,1);assert.equal(shared.revision,1);
 const invalid={...project(url),images:['/media/'+'f'.repeat(64)+'.png']};assert.equal((await app.request('/api/projects','PUT',{projects:[invalid],revision:1})).status,400);
});
test('empty image lists and arbitrary URLs are rejected without losing saved work',async()=>{
 const app=setup();for(const images of [[],['https://untrusted.test/image.png'],['data:image/png;base64,YQ==']]){
  assert.equal((await app.request('/api/projects','PUT',{projects:[{...project(''),images}],revision:0})).status,400);
 }
 assert.equal((await app.request('/api/enquiries','POST',{name:'',email:'bad',message:'short'})).status,400);
});
test('enquiries remain in the owner inbox when mail delivery fails or needs activation',async()=>{
 const app=setup();const enquiry={id:'enquiry-one',name:'Client',email:'client@example.test',brand:'Example',project_type:'Logo design',message:'A detailed brief for a new logo design.',created_at:new Date().toISOString()};
 app.db.prepare('INSERT INTO enquiries(id,name,email,brand,project_type,message,created_at) VALUES(?,?,?,?,?,?,?)').run(...Object.values(enquiry));
 await deliverEnquiry(app.env,enquiry,'https://portfolio.test',async()=>{throw new Error('Mail outage');});
 let inbox=await (await app.request('/api/enquiries')).json();assert.equal(inbox.enquiries[0].email_status,'failed');assert.equal(inbox.enquiries[0].message,enquiry.message);
 await deliverEnquiry(app.env,enquiry,'https://portfolio.test',async()=>new Response(JSON.stringify({success:false,message:'Please activate this form'})));
 inbox=await (await app.request('/api/enquiries')).json();assert.equal(inbox.enquiries[0].email_status,'pending_activation');
 assert.equal((await app.request('/api/enquiries','GET',undefined,null)).status,403);
});
test('enquiry receipt is saved before email work and public submissions are rate limited',async()=>{
 const app=setup();const original=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({success:true}));
 try{
  const body={name:'Client',email:'client@example.test',brand:'Example',project_type:'Logo design',message:'A detailed brief for a new logo design.'};
  for(let i=0;i<5;i++)assert.equal((await app.request('/api/enquiries','POST',body,null)).status,201);
  assert.equal(app.db.prepare('SELECT count(*) n FROM enquiries').get().n,5);
  assert.equal((await app.request('/api/enquiries','POST',body,null)).status,429);
  await Promise.all(app.jobs);assert.equal(app.db.prepare("SELECT count(*) n FROM enquiries WHERE email_status='accepted'").get().n,5);
  assert.equal((await app.request('/api/enquiries','POST',{...body,_honey:'spam'},null)).status,200);
  assert.equal(app.db.prepare('SELECT count(*) n FROM enquiries').get().n,5);
 }finally{globalThis.fetch=original;}
});

const setupToken='b'.repeat(64);
const password='a strong test passphrase 5928!';
function setupCredentials(app){app.env.ADMIN_SETUP_TOKEN_HASH=createHash('sha256').update(setupToken).digest('hex');app.env.ADMIN_SETUP_EXPIRES=String(Date.now()+3600000);}
async function register(app){setupCredentials(app);return app.request('/api/auth/setup','POST',{token:setupToken,username:'shamim',password},null);}
const sessionCookie=response=>'cookie:'+response.headers.get('Set-Cookie').split(';')[0];
test('one-time setup stores a salted password hash and grants an HttpOnly session',async()=>{
 const app=setup();const response=await register(app);assert.equal(response.status,200);
 const cookie=response.headers.get('Set-Cookie');assert.match(cookie,/__Host-shamim-admin=/);assert.match(cookie,/Secure/);assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);
 const credentials=app.db.prepare('SELECT * FROM admin_credentials').get();assert.equal(credentials.username,'shamim');assert.notEqual(credentials.password_hash,password);assert.equal(credentials.password_hash.length,64);assert.equal(credentials.salt.length,64);
 assert.equal((await app.request('/api/session','GET',undefined,sessionCookie(response)).then(r=>r.json())).canEdit,true);
 assert.equal((await app.request('/api/auth/setup','POST',{token:setupToken,username:'attacker',password},null)).status,409);
});
test('setup rejects missing, expired, weak, and cross-origin credentials',async()=>{
 const app=setup();setupCredentials(app);
 const body={token:setupToken,username:'shamim',password};
 assert.equal((await app.request('/api/auth/setup','POST',{...body,token:'c'.repeat(64)},null)).status,403);
 assert.equal((await app.request('/api/auth/setup','POST',{...body,password:'short'},null)).status,400);
 assert.equal((await app.request('/api/auth/setup','POST',body,null,'https://evil.test')).status,403);
 app.env.ADMIN_SETUP_EXPIRES='1';assert.equal((await app.request('/api/auth/setup','POST',body,null)).status,403);
 assert.equal(app.db.prepare('SELECT count(*) n FROM admin_credentials').get().n,0);
});
test('password sign-in works independently of platform identity and logout revokes it',async()=>{
 const app=setup();await register(app);
 const body={username:'shamim',password};
 for(const invalid of [{...body,password:'incorrect password'},{...body,username:'other'}]){
  const result=await app.request('/api/auth/password','POST',invalid,null);assert.equal(result.status,401);assert.equal(result.headers.get('Set-Cookie'),null);
 }
 const login=await app.request('/api/auth/password','POST',body,null);assert.equal(login.status,200);
 const identity=sessionCookie(login);assert.equal((await app.request('/api/enquiries','GET',undefined,identity)).status,200);
 const logout=await app.request('/api/auth/logout','POST',{},identity);assert.equal(logout.status,200);assert.match(logout.headers.get('Set-Cookie'),/Max-Age=0/);
 assert.equal((await app.request('/api/enquiries','GET',undefined,identity)).status,403);
});
test('expired, forged and reconfigured sessions cannot access editing',async()=>{
 const app=setup();
 assert.equal((await app.request('/api/enquiries','GET',undefined,'cookie:__Host-shamim-admin='+'c'.repeat(64))).status,403);
 app.db.prepare('UPDATE admin_sessions SET expires_at=1').run();assert.equal((await app.request('/api/enquiries')).status,403);
 app.db.prepare('UPDATE admin_sessions SET expires_at=?').run(Date.now()+10000);app.env.ADMIN_PHONE='+8801000000000';assert.equal((await app.request('/api/enquiries')).status,403);
});
test('password attempts are rate limited without overwriting existing account data',async()=>{
 const app=setup();await register(app);
 for(let i=0;i<8;i++)assert.equal((await app.request('/api/auth/password','POST',{username:'wrong',password:'wrong'},null)).status,401);
 assert.equal((await app.request('/api/auth/password','POST',{username:'shamim',password},null)).status,429);
 assert.equal(app.db.prepare('SELECT username FROM admin_credentials').get().username,'shamim');
});
test('unconfigured OTP stays disabled and never claims to send a code',async()=>{
 const app=setup();let calls=0;const original=globalThis.fetch;globalThis.fetch=async()=>{calls++;throw new Error('Should not send');};
 try{const options=await app.request('/api/auth/options','GET',undefined,null).then(r=>r.json());assert.equal(options.otpReady,false);assert.equal((await app.request('/api/auth/otp/send','POST',{},null)).status,503);assert.equal(calls,0);}finally{globalThis.fetch=original;}
});
test('OTP can send only to the approved number, enforces cooldown and checks approval',async()=>{
 const app=setup();app.env.TWILIO_ACCOUNT_SID='AC'+'a'.repeat(32);app.env.TWILIO_AUTH_TOKEN='test-secret';app.env.TWILIO_VERIFY_SERVICE_SID='VA'+'b'.repeat(32);
 let calls=[];const original=globalThis.fetch;let approve=false;
 globalThis.fetch=async(url,options)=>{calls.push({url,body:new URLSearchParams(options.body)});return new Response(JSON.stringify({status:url.endsWith('/Verifications')?'pending':approve?'approved':'pending'}));};
 try{
  assert.equal((await app.request('/api/auth/otp/send','POST',{phone:'+8801000000000'},null)).status,403);assert.equal(calls.length,0);
  const sent=await app.request('/api/auth/otp/send','POST',{},null);assert.equal(sent.status,200);assert.equal(calls[0].body.get('To'),'+8801868333944');
  assert.equal((await app.request('/api/auth/otp/send','POST',{},null)).status,429);assert.equal(calls.length,1);
  assert.equal((await app.request('/api/auth/otp/check','POST',{code:'123456'},null)).status,401);
  approve=true;const checked=await app.request('/api/auth/otp/check','POST',{code:'123456'},null);assert.equal(checked.status,200);
  assert.equal((await app.request('/api/enquiries','GET',undefined,sessionCookie(checked))).status,200);
 }finally{globalThis.fetch=original;}
});
test('OTP service failures fail closed and never issue an admin session',async()=>{
 const app=setup();app.env.TWILIO_ACCOUNT_SID='AC'+'a'.repeat(32);app.env.TWILIO_AUTH_TOKEN='test-secret';app.env.TWILIO_VERIFY_SERVICE_SID='VA'+'b'.repeat(32);
 const original=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('network failure');};
 try{const response=await app.request('/api/auth/otp/check','POST',{code:'123456'},null);assert.equal(response.status,503);assert.equal(response.headers.get('Set-Cookie'),null);}finally{globalThis.fetch=original;}
});
