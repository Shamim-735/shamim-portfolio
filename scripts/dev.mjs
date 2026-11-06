// Local preview uses the same password/session authorization as production.
import {randomBytes,createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {bundle} from './build.mjs';
import {localBindings} from './local-bindings.mjs';
const args=process.argv.slice(2),option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const host=option('--host','0.0.0.0'),port=Number(option('--port','3000'));
const env=await localBindings(fileURLToPath(new URL('../.sites-runtime/',import.meta.url)));
let setupToken;
if(!await env.DB.prepare("SELECT username FROM admin_credentials WHERE id='main'").first()){setupToken=randomBytes(32).toString('hex');env.ADMIN_SETUP_TOKEN_HASH=createHash('sha256').update(setupToken).digest('hex');env.ADMIN_SETUP_EXPIRES=String(Date.now()+86400000);}
createServer(async(req,res)=>{
 try{
  const headers=new Headers(Object.entries(req.headers).flatMap(([key,value])=>typeof value==='string'?[[key,value]]:[]));
  headers.delete('oai-authenticated-user-id');headers.delete('oai-authenticated-user-email');
  const origin=`http://${req.headers.host}`,request=new Request(origin+req.url,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:req,duplex:'half'});
  const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(await bundle()).toString('base64'));
  const response=await worker.fetch(request,env,{waitUntil(promise){promise.catch(()=>{});}});
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(500);res.end('Preview error');}
}).listen(port,host,()=>{console.log(`Portfolio preview listening on ${host}:${port}`);if(setupToken)console.log(`Create your local admin account: http://${host==='0.0.0.0'?'localhost':host}:${port}/admin/setup#setup=${setupToken}`);});
