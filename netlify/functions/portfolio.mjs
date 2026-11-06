import {getDatabase} from '@netlify/database';
import {getStore} from '@netlify/blobs';
import worker from '../../dist/server/index.js';
import {postgresBindings,blobBindings} from '../server/adapters.mjs';
const secretKeys=['ADMIN_PASSWORD_PEPPER','ADMIN_PHONE','ADMIN_SETUP_TOKEN_HASH','ADMIN_SETUP_EXPIRES','TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_VERIFY_SERVICE_SID'];
export default async function handler(request,context){
 try{
  const headers=new Headers(request.headers);
  // Use Netlify's verified IP for rate limits, never an incoming spoofable Cloudflare header.
  headers.set('CF-Connecting-IP',context.ip||'unknown');
  headers.delete('oai-authenticated-user-id');headers.delete('oai-authenticated-user-email');
  const forwarded=new Request(request,{headers});
  const database=getDatabase(),store=getStore({name:'portfolio-artwork',consistency:'strong'});
  const env={DB:postgresBindings(database.pool),BUCKET:blobBindings(store)};
  for(const key of secretKeys)if(process.env[key])env[key]=process.env[key];
  const pending=[];
  const response=await worker.fetch(forwarded,env,{waitUntil(promise){if(typeof context.waitUntil==='function')context.waitUntil(promise);else pending.push(promise);}});
  if(pending.length)await Promise.allSettled(pending);
  return response;
 }catch{
  return new Response(JSON.stringify({error:'Website storage is temporarily unavailable. Check the database setup in Netlify.'}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 }
}
export const config={path:['/','/index.html','/admin','/admin/*','/admin.html','/admin.js','/api/*','/media/*','/login.html','/robots.txt','/sitemap.xml']};
