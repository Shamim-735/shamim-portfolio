// Run on the owner's computer. Never put these generated values in public files or Git.
import {randomBytes,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),folder=new URL('.sites-runtime/',root),stateFile=new URL('netlify-setup.json',folder);
await mkdir(folder,{recursive:true});
let state;try{state=JSON.parse(await readFile(stateFile,'utf8'));}catch{}
if(!state)state={pepper:randomBytes(32).toString('hex'),token:randomBytes(32).toString('hex'),expires:Date.now()+86400000};
if(state.expires<Date.now()){state.token=randomBytes(32).toString('hex');state.expires=Date.now()+86400000;}
await writeFile(stateFile,JSON.stringify(state),{mode:0o600});
const hash=createHash('sha256').update(state.token).digest('hex');
const env=[`ADMIN_PASSWORD_PEPPER=${state.pepper}`,'ADMIN_PHONE=+8801868333944',`ADMIN_SETUP_TOKEN_HASH=${hash}`,`ADMIN_SETUP_EXPIRES=${state.expires}`].join('\n')+'\n';
const envFile=new URL('.env.netlify',root);await writeFile(envFile,env,{mode:0o600});
console.log('Private settings saved to '+fileURLToPath(envFile));
console.log('Copy its four values into Netlify environment variables with the Functions scope, then redeploy. Do not upload this file to GitHub.');
let origin;try{origin=new URL(process.argv[2]).origin;}catch{}
console.log('After deployment, open your private one-time setup link:');
console.log((origin||'https://YOUR-SITE.netlify.app')+'/admin/setup#setup='+state.token);
console.log('Choose your username and password on that page. The setup link expires in 24 hours.');
