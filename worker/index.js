import {HttpError,ownerState,authApi} from './auth.js';
const ASSETS = /*__STATIC_ASSETS__*/{};
const categories = ['Brand identity','Logo design','Jersey design','Social media','Print & packaging'];
const enquiryTypes = ['Logo design','Brand identity','Jersey design','Social media design','Print & packaging','Something else'];
const mediaPattern = /^\/media\/[a-f0-9]{64}\.(png|jpg|webp)$/;
const json = (value, status=200) => new Response(JSON.stringify(value), {status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Cookie'}});
function sameOrigin(request) {
 if(request.headers.get('Origin') !== new URL(request.url).origin) throw new HttpError(403,'Refresh this page before trying again.');
}
async function limitedBody(request,limit) {
 if(Number(request.headers.get('Content-Length'))>limit)throw new HttpError(413,'This upload is too large.');
 const reader=request.body?.getReader();if(!reader)return new Uint8Array();
 const chunks=[];let length=0;
 while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>limit){await reader.cancel();throw new HttpError(413,'This upload is too large.');}chunks.push(value);}
 const bytes=new Uint8Array(length);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}return bytes;
}
async function readJson(request,limit) {
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw new HttpError(415,'Send JSON data.');
 try{return JSON.parse(new TextDecoder().decode(await limitedBody(request,limit)));}catch(error){if(error instanceof HttpError)throw error;throw new HttpError(400,'The submitted data is invalid.');}
}
async function requireOwner(request,env) {
 const state=await ownerState(request,env);if(!state.canEdit)throw new HttpError(403,'Only the portfolio owner can change this collection.');return state;
}
export function validateProjects(projects) {
 return Array.isArray(projects)&&projects.length<=100&&new Set(projects.map(p=>p?.id)).size===projects.length&&projects.every(p=>p&&typeof p.id==='string'&&p.id.length>0&&p.id.length<=120&&typeof p.title==='string'&&p.title.trim().length>0&&p.title.length<=90&&typeof p.description==='string'&&p.description.trim().length>0&&p.description.length<=1200&&categories.includes(p.category)&&Array.isArray(p.images)&&p.images.length>=1&&p.images.length<=6&&p.images.every(image=>typeof image==='string'&&mediaPattern.test(image)));
}
function imageType(bytes) {
 if(bytes.length>8&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))return ['png','image/png'];
 if(bytes.length>3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return ['jpg','image/jpeg'];
 if(bytes.length>12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')return ['webp','image/webp'];
 throw new HttpError(415,'Choose a PNG, JPG or WebP image.');
}
const hex=bytes=>[...new Uint8Array(bytes)].map(value=>value.toString(16).padStart(2,'0')).join('');
export async function deliverEnquiry(env,enquiry,origin,fetcher=fetch) {
 let status='failed';
 try {
  const response=await fetcher('https://formsubmit.co/ajax/iamalauddinshamim1086@gmail.com',{
   method:'POST',
   headers:{'Content-Type':'application/json','Accept':'application/json','Origin':origin,'Referer':origin+'/'},
   signal:AbortSignal.timeout(15000),
   body:JSON.stringify({...enquiry,_subject:`New ${enquiry.project_type.toLowerCase()} enquiry — Shamim portfolio`,_replyto:enquiry.email,_template:'table',_url:origin+'/#contact'})
  });
  const result=await response.json().catch(()=>null);
  const message=String(result?.message||'');
  status=/activat/i.test(message)?'pending_activation':response.ok&&(result?.success===true||result?.success==='true')?'accepted':'failed';
  if(status==='failed'){
   // Provider responses can contain submitted fields. Log only fixed categories and the HTTP status.
   const reason=!result?'invalid response':/referr?er|web server|origin/i.test(message)?'site origin rejected':'request rejected';
   console.warn('Enquiry forwarding failed', {httpStatus:response.status,reason});
  }
 }catch(error){
  console.warn('Enquiry forwarding failed', {reason:error?.name==='TimeoutError'?'request timed out':'connection failed'});
 }
 await env.DB.prepare('UPDATE enquiries SET email_status=? WHERE id=?').bind(status,enquiry.id).run();
}
async function api(request,env,ctx,path) {
 if(path.startsWith('/api/auth/'))return authApi(request,env,path,{sameOrigin,readJson,json});
 if(!env.DB||!env.BUCKET)throw new HttpError(503,'Shared storage is temporarily unavailable. Please try again shortly.');
 if(path==='/api/session'&&request.method==='GET'){
  const {canEdit,authenticated}=await ownerState(request,env);return json({cloud:true,canEdit,authenticated});
 }
 if(path==='/api/projects'&&request.method==='GET'){
  const row=await env.DB.prepare("SELECT revision,data FROM portfolio WHERE id='main'").first();return json({projects:row?JSON.parse(row.data):[],revision:row?.revision||0});
 }
 if(path==='/api/projects'&&request.method==='PUT'){
  sameOrigin(request);const owner=await requireOwner(request,env);const body=await readJson(request,500000);
  if(!Number.isSafeInteger(body.revision)||body.revision<0||!validateProjects(body.projects))throw new HttpError(400,'The project collection is invalid.');
  if((owner.row?.revision||0)!==body.revision)throw new HttpError(409,'A newer collection was saved on another device. Back up this draft, then reload before publishing.');
  const images=[...new Set(body.projects.flatMap(p=>p.images))];
  for(let i=0;i<images.length;i+=20){const found=await Promise.all(images.slice(i,i+20).map(image=>env.BUCKET.head(image.slice(7))));if(found.some(item=>!item))throw new HttpError(400,'An artwork upload is missing. Please upload that image again.');}
  const clean=body.projects.map(({id,title,description,category,images})=>({id,title:title.trim(),description:description.trim(),category,images,concept:false}));
  const result=await env.DB.prepare("INSERT INTO portfolio(id,revision,data,owner_id) VALUES('main',1,?,?) ON CONFLICT(id) DO UPDATE SET revision=portfolio.revision+1,data=excluded.data WHERE portfolio.revision=? AND portfolio.owner_id=? RETURNING revision").bind(JSON.stringify(clean),owner.id,body.revision,owner.id).first();
  if(!result)throw new HttpError(409,'A newer collection was saved on another device. Back up this draft, then reload before publishing.');
  return json({projects:clean,revision:result.revision});
 }
 if(path==='/api/media'&&request.method==='POST'){
  sameOrigin(request);const owner=await requireOwner(request,env);
  // Claim ownership before accepting the first file; subsequent authorization uses the Site-scoped ID.
  if(!owner.row){await env.DB.prepare("INSERT INTO portfolio(id,revision,data,owner_id) VALUES('main',0,'[]',?) ON CONFLICT(id) DO NOTHING").bind(owner.id).run();await requireOwner(request,env);}
  const bytes=await limitedBody(request,8*1024*1024);const [extension,type]=imageType(bytes);
  const key=hex(await crypto.subtle.digest('SHA-256',bytes))+'.'+extension;
  if(!await env.BUCKET.head(key))await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:type}});
  return json({url:'/media/'+key},201);
 }
 if(path==='/api/enquiries'&&request.method==='GET'){
  await requireOwner(request,env);const result=await env.DB.prepare('SELECT id,name,email,brand,project_type,message,created_at,email_status FROM enquiries ORDER BY created_at DESC LIMIT 100').all();return json({enquiries:result.results});
 }
 if(path==='/api/enquiries'&&request.method==='POST'){
  sameOrigin(request);const body=await readJson(request,20000);
  if(String(body._honey||'').trim())return json({received:true});
  const fields=['name','email','brand','project_type','message'];const enquiry=Object.fromEntries(fields.map(key=>[key,typeof body[key]==='string'?body[key].trim():'']));
  if(!enquiry.name||enquiry.name.length>80||enquiry.email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(enquiry.email)||enquiry.brand.length>120||enquiry.message.length<20||enquiry.message.length>3000||!enquiryTypes.includes(enquiry.project_type))throw new HttpError(400,'Please check your name, email and project brief.');
  const now=Date.now();const bucket=Math.floor(now/900000);const identity=(request.headers.get('CF-Connecting-IP')||'anonymous')+':'+bucket+':'+(env.OWNER_EMAIL||'portfolio');
  const bucketId=hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity)));
  const limit=await env.DB.prepare('INSERT INTO enquiry_limits(bucket_id,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(bucket_id) DO UPDATE SET attempts=attempts+1 RETURNING attempts').bind(bucketId,(bucket+2)*900000).first();
  if(limit.attempts>5)throw new HttpError(429,'Too many submissions. Please try again in 15 minutes or contact me by email.');
  await env.DB.prepare('DELETE FROM enquiry_limits WHERE expires_at<?').bind(now).run();
  enquiry.id=crypto.randomUUID();enquiry.created_at=new Date(now).toISOString();
  await env.DB.prepare('INSERT INTO enquiries(id,name,email,brand,project_type,message,created_at) VALUES(?,?,?,?,?,?,?)').bind(enquiry.id,enquiry.name,enquiry.email,enquiry.brand,enquiry.project_type,enquiry.message,enquiry.created_at).run();
  ctx.waitUntil(deliverEnquiry(env,enquiry,new URL(request.url).origin));
  return json({received:true,id:enquiry.id},201);
 }
 throw new HttpError(404,'This endpoint does not exist.');
}
export default {
 async fetch(request,env,ctx) {
  try {
   const url=new URL(request.url),path=url.pathname;
   const adminPage=['/admin','/admin/','/admin.html'].includes(path);
   if(adminPage || path==='/admin.js'){
    if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405});
    const state=await ownerState(request,env);
    if(!state.canEdit){
     if(!adminPage)throw new HttpError(401,'Sign in to the admin panel first.');
     return new Response(null,{status:303,headers:{Location:'/admin/login','Cache-Control':'no-store'}});
    }
   }
   if(path.startsWith('/api/'))return await api(request,env,ctx,path);
   if(mediaPattern.test(path)){
    if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405});
    const object=await env.BUCKET.get(path.slice(7));if(!object)return new Response('Artwork not found',{status:404});
    return new Response(request.method==='HEAD'?null:object.body,{headers:{'Content-Type':object.httpMetadata?.contentType||'application/octet-stream','Cache-Control':'public,max-age=31536000,immutable','ETag':object.httpEtag,'X-Content-Type-Options':'nosniff'}});
   }
   if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405});
   if(path==='/robots.txt')return new Response('User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: '+url.origin+'/sitemap.xml\n',{headers:{'Content-Type':'text/plain'}});
   if(path==='/sitemap.xml')return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>'+url.origin+'/</loc></url></urlset>',{headers:{'Content-Type':'application/xml'}});
   const loginPage=['/admin/login','/admin/setup','/login.html'].includes(path);
   const asset=ASSETS[loginPage?'/login.html':adminPage?'/admin.html':path==='/'?'/index.html':path];if(!asset)return new Response('Page not found',{status:404});
   const bytes=Uint8Array.from(atob(asset.body),char=>char.charCodeAt(0));
   let body=bytes;
   if(path==='/'||path==='/index.html')body=new TextDecoder().decode(bytes).replaceAll('__SITE_ORIGIN__',url.origin).replace('<script src="app.js"></script>','<script>window.SHAMIM_CLOUD=true;</script><script src="app.js"></script>');
   return new Response(request.method==='HEAD'?null:body,{headers:{'Content-Type':asset.type,'Cache-Control':loginPage||adminPage||path==='/admin.js'||path==='/login.js'||path==='/'||path==='/index.html'?'no-store':'public,max-age=300','Vary':'Cookie','X-Robots-Tag':loginPage||adminPage||path==='/admin.js'||path==='/login.js'?'noindex, nofollow':'all','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...(loginPage||adminPage?{'Content-Security-Policy':"frame-ancestors 'none'; base-uri 'self'; form-action 'self'"}:{})}});
  }catch(error){return json({error:error instanceof HttpError?error.message:'Something went wrong. Your saved projects have not been changed.'},error instanceof HttpError?error.status:500);}
 }
};
