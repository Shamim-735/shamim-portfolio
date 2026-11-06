import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {once} from 'node:events';

test('local preview starts in a path with spaces, percent signs and Unicode and stores data in that project',async()=>{
 const temporary=await mkdtemp(path.join(tmpdir(),'portfolio-path-'));
 const project=path.join(temporary,'My Portfolio 100%','শামীম');await mkdir(project,{recursive:true});
 const source=fileURLToPath(new URL('../',import.meta.url));let child;
 try{
  for(const name of ['scripts','worker','public','drizzle','package.json'])await cp(path.join(source,name),path.join(project,name),{recursive:true});
  const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  child=spawn(process.execPath,['scripts/dev.mjs','--host','127.0.0.1','--port',String(port)],{cwd:project,stdio:['ignore','pipe','pipe'],env:{...process.env,ADMIN_PASSWORD_PEPPER:'test-only-local-preview-pepper',ADMIN_SETUP_TOKEN_HASH:'',ADMIN_SETUP_EXPIRES:''}});
  await new Promise((resolve,reject)=>{
   let text='';const timer=setTimeout(()=>reject(new Error('Local preview did not start.')),15000);
   child.stdout.on('data',data=>{text+=data;if(text.includes('Portfolio preview listening')){clearTimeout(timer);resolve();}});
   child.once('error',error=>{clearTimeout(timer);reject(error);});
   child.once('exit',code=>{clearTimeout(timer);if(code!==null)reject(new Error('Local preview exited before startup: '+code));});
  });
  const response=await fetch('http://127.0.0.1:'+port+'/');assert.equal(response.status,200);assert.match(await response.text(),/Syed Alauddin Shamim/);
  assert.ok((await stat(path.join(project,'.sites-runtime','portfolio.sqlite'))).isFile(),'The database must be inside the actual project directory, not a URL-encoded sibling');
 }finally{
  if(child&&child.exitCode===null){const closed=once(child,'close');child.kill();await closed;}
  await rm(temporary,{recursive:true,force:true});
 }
});
