// Independent portfolio authentication. Platform identity headers never grant editor access.
export class HttpError extends Error {constructor(status,message){super(message);this.status=status;}}
const encoder=new TextEncoder();
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const unhex=text=>Uint8Array.from(text.match(/../g)||[],pair=>parseInt(pair,16));
const randomToken=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const digest=async text=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(text)));
function equal(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0;}
const cookieName=env=>env.LOCAL_PREVIEW==='1'?'shamim_admin_dev':'__Host-shamim-admin';
const cookie=(env,value,age)=>`${cookieName(env)}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${env.LOCAL_PREVIEW==='1'?'':'; Secure'}`;
function tokenFrom(request,env){const item=(request.headers.get('Cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName(env)+'='));return item?.slice(cookieName(env).length+1)||'';}
const configured=env=>typeof env.ADMIN_PASSWORD_PEPPER==='string'&&env.ADMIN_PASSWORD_PEPPER.length>=32;
const phoneConfigured=env=>configured(env)&&/^\+[1-9]\d{7,14}$/.test(env.ADMIN_PHONE||'')&&/^AC[a-f\d]{32}$/i.test(env.TWILIO_ACCOUNT_SID||'')&&/^VA[a-f\d]{32}$/i.test(env.TWILIO_VERIFY_SERVICE_SID||'')&&Boolean(env.TWILIO_AUTH_TOKEN);
const scope=env=>digest('portfolio-admin:'+env.ADMIN_PASSWORD_PEPPER+':'+(env.ADMIN_PHONE||''));
async function passwordHash(password,salt,iterations,env){
 const pepper=await crypto.subtle.importKey('raw',encoder.encode(env.ADMIN_PASSWORD_PEPPER),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const material=await crypto.subtle.sign('HMAC',pepper,encoder.encode(password));
 const key=await crypto.subtle.importKey('raw',material,'PBKDF2',false,['deriveBits']);
 return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:unhex(salt),iterations},key,256));
}
async function throttle(request,env,action,max,windowMs,global=false){
 const now=Date.now(),bucket=Math.floor(now/windowMs),ip=global?'all':request.headers.get('CF-Connecting-IP')||'local';
 const key=await digest(action+':'+ip+':'+bucket);
 const result=await env.DB.prepare('INSERT INTO admin_limits(bucket_key,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(bucket_key) DO UPDATE SET attempts=attempts+1 RETURNING attempts').bind(key,(bucket+2)*windowMs).first();
 if(result.attempts>max)throw new HttpError(429,'Too many attempts. Please wait before trying again.');
 await env.DB.prepare('DELETE FROM admin_limits WHERE expires_at<?').bind(now).run();
}
async function createSession(request,env){
 const token=randomToken(),expires=Date.now()+12*60*60*1000;
 await env.DB.prepare('DELETE FROM admin_sessions WHERE expires_at<?').bind(Date.now()).run();
 await env.DB.prepare('INSERT INTO admin_sessions(token_hash,expires_at,scope) VALUES(?,?,?)').bind(await digest(token),expires,await scope(env)).run();
 return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Set-Cookie':cookie(env,token,12*60*60),'X-Content-Type-Options':'nosniff'}});
}
export async function ownerState(request,env){
 const row=await env.DB.prepare("SELECT owner_id,revision,data FROM portfolio WHERE id='main'").first();
 const token=tokenFrom(request,env);
 let authenticated=false;
 if(configured(env)&&/^[a-f\d]{64}$/.test(token)){
  const session=await env.DB.prepare('SELECT expires_at,scope FROM admin_sessions WHERE token_hash=?').bind(await digest(token)).first();
  authenticated=Boolean(session&&session.expires_at>Date.now()&&equal(session.scope,await scope(env)));
 }
 return {row,id:authenticated?(row?.owner_id||'portfolio-admin'):null,canEdit:authenticated,authenticated};
}
async function verifyRequest(env,path,values){
 let response;
 try{response=await fetch('https://verify.twilio.com/v2/Services/'+env.TWILIO_VERIFY_SERVICE_SID+'/'+path,{method:'POST',headers:{'Authorization':'Basic '+btoa(env.TWILIO_ACCOUNT_SID+':'+env.TWILIO_AUTH_TOKEN),'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(values),signal:AbortSignal.timeout(15000)});}catch{throw new HttpError(503,'The SMS service could not be reached. Try password login.');}
 let data;try{data=await response.json();}catch{throw new HttpError(503,'The SMS service could not be reached. Try password login.');}
 if(!response.ok){if(path==='VerificationCheck'&&[400,404].includes(response.status))throw new HttpError(401,'That code is invalid or expired.');throw new HttpError(503,'SMS delivery is unavailable. Try password login.');}
 return data;
}
export async function authApi(request,env,path,helpers){
 const {sameOrigin,readJson,json}=helpers;
 if(!env.DB)throw new HttpError(503,'Admin storage is temporarily unavailable.');
 if(path==='/api/auth/options'&&request.method==='GET'){
  const credentials=await env.DB.prepare("SELECT username FROM admin_credentials WHERE id='main'").first();
  return json({passwordReady:configured(env)&&!!credentials,otpReady:phoneConfigured(env),setupAvailable:configured(env)&&!credentials&&Boolean(env.ADMIN_SETUP_TOKEN_HASH)&&Number(env.ADMIN_SETUP_EXPIRES)>Date.now(),phoneHint:env.ADMIN_PHONE?'•••• '+env.ADMIN_PHONE.slice(-4):null});
 }
 if(request.method!=='POST')throw new HttpError(405,'Use POST for this action.');
 sameOrigin(request);
 if(path==='/api/auth/logout'){
  const token=tokenFrom(request,env);
  if(/^[a-f\d]{64}$/.test(token))await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash=?').bind(await digest(token)).run();
  return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':cookie(env,'',0)}});
 }
 if(!configured(env))throw new HttpError(503,'Admin login has not been configured yet.');
 const body=await readJson(request,8192);
 if(!body||typeof body!=='object'||Array.isArray(body))throw new HttpError(400,'Check the login details.');
 if(path==='/api/auth/setup'){
  await throttle(request,env,'setup',10,3600000);
  const existing=await env.DB.prepare("SELECT username FROM admin_credentials WHERE id='main'").first();
  if(existing)throw new HttpError(409,'Your admin account is already set up. Sign in instead.');
  if(typeof body.token!=='string'||body.token.length!==64||!env.ADMIN_SETUP_TOKEN_HASH||Number(env.ADMIN_SETUP_EXPIRES)<=Date.now()||!equal(await digest(body.token),env.ADMIN_SETUP_TOKEN_HASH))throw new HttpError(403,'This setup link is invalid or expired.');
  const username=typeof body.username==='string'?body.username.trim().toLowerCase():'';
  if(!/^[a-z0-9_.-]{3,48}$/.test(username)||typeof body.password!=='string'||body.password.length<14||body.password.length>128)throw new HttpError(400,'Use a username of 3–48 letters, digits, dots, underscores or hyphens, and a password of 14–128 characters.');
  const salt=randomToken(),iterations=100000,hash=await passwordHash(body.password,salt,iterations,env);
  const result=await env.DB.prepare("INSERT INTO admin_credentials(id,username,password_hash,salt,iterations,created_at) VALUES('main',?,?,?,?,?) ON CONFLICT(id) DO NOTHING RETURNING username").bind(username,hash,salt,iterations,Date.now()).first();
  if(!result)throw new HttpError(409,'Your admin account is already set up. Sign in instead.');
  return createSession(request,env);
 }
 if(path==='/api/auth/password'){
  await throttle(request,env,'password',8,900000);
  const credentials=await env.DB.prepare("SELECT username,password_hash,salt,iterations FROM admin_credentials WHERE id='main'").first();
  const username=typeof body.username==='string'?body.username.trim().toLowerCase():'';
  if(typeof body.password!=='string'||body.password.length>128)throw new HttpError(401,'The username or password is incorrect.');
  const result=await passwordHash(body.password,credentials?.salt||'0'.repeat(64),credentials?.iterations||100000,env);
  if(!credentials||!equal(username,credentials.username)||!equal(result,credentials.password_hash))throw new HttpError(401,'The username or password is incorrect.');
  return createSession(request,env);
 }
 if(path==='/api/auth/otp/send'||path==='/api/auth/otp/check'){
  if(!phoneConfigured(env))throw new HttpError(503,'Phone OTP is not activated yet. Please use username and password.');
  if(body.phone!==undefined&&body.phone!==env.ADMIN_PHONE)throw new HttpError(403,'Only the approved admin number can be used.');
  if(path.endsWith('/send')){
   await throttle(request,env,'otp-send',3,900000);await throttle(request,env,'otp-send-global',6,3600000,true);
   const cooldown=await env.DB.prepare("INSERT INTO admin_cooldowns(id,sent_at) VALUES('otp',?) ON CONFLICT(id) DO UPDATE SET sent_at=excluded.sent_at WHERE admin_cooldowns.sent_at<? RETURNING sent_at").bind(Date.now(),Date.now()-60000).first();
   if(!cooldown)throw new HttpError(429,'Wait 60 seconds before requesting another code.');
   const verification=await verifyRequest(env,'Verifications',{To:env.ADMIN_PHONE,Channel:'sms'});
   if(verification.status!=='pending')throw new HttpError(503,'The SMS service could not confirm a code was sent. Try password login.');
   return json({sent:true,retryAfter:60});
  }
  await throttle(request,env,'otp-check',10,900000);await throttle(request,env,'otp-check-global',30,900000,true);
  if(typeof body.code!=='string'||!/^\d{6}$/.test(body.code))throw new HttpError(400,'Enter the six-digit code from your phone.');
  const verification=await verifyRequest(env,'VerificationCheck',{To:env.ADMIN_PHONE,Code:body.code});
  if(verification.status!=='approved')throw new HttpError(401,'That code is invalid or expired.');
  return createSession(request,env);
 }
 throw new HttpError(404,'This login endpoint does not exist.');
}
