import {randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {mkdir,readFile,writeFile,stat,readdir} from 'node:fs/promises';
import path from 'node:path';
export function d1(database){return {prepare(sql){let values=[];return {bind(...args){values=args;return this;},async first(){return database.prepare(sql).get(...values)||null;},async run(){const result=database.prepare(sql).run(...values);return {success:true,meta:{changes:Number(result.changes)}};},async all(){return {results:database.prepare(sql).all(...values)};}};}};}
export async function localBindings(folder){
 await mkdir(path.join(folder,'media'),{recursive:true});const database=new DatabaseSync(path.join(folder,'portfolio.sqlite'));
 database.exec('CREATE TABLE IF NOT EXISTS local_migrations(name TEXT PRIMARY KEY)');
 if(database.prepare('SELECT name FROM local_migrations WHERE name=?').get('0000_portfolio'))database.prepare('INSERT OR IGNORE INTO local_migrations VALUES(?)').run('0000_portfolio.sql');
 for(const name of (await readdir(new URL('../drizzle/',import.meta.url))).filter(name=>name.endsWith('.sql')).sort()){
  if(!database.prepare('SELECT name FROM local_migrations WHERE name=?').get(name)){
   database.exec(await readFile(new URL('../drizzle/'+name,import.meta.url),'utf8'));
   database.prepare('INSERT INTO local_migrations VALUES(?)').run(name);
  }
 }
 let localPepper=process.env.ADMIN_PASSWORD_PEPPER;
 if(!localPepper){try{localPepper=await readFile(path.join(folder,'admin-pepper.txt'),'utf8');}catch{localPepper=randomBytes(32).toString('hex');await writeFile(path.join(folder,'admin-pepper.txt'),localPepper,{mode:0o600});}}
 const BUCKET={async head(key){try{await stat(path.join(folder,'media',key));return {key};}catch{return null;}},async put(key,bytes,options){await writeFile(path.join(folder,'media',key),bytes);await writeFile(path.join(folder,'media',key+'.json'),JSON.stringify(options.httpMetadata));},async get(key){try{return {body:await readFile(path.join(folder,'media',key)),httpMetadata:JSON.parse(await readFile(path.join(folder,'media',key+'.json'),'utf8')),httpEtag:'"'+key+'"'};}catch{return null;}}};
 return {DB:d1(database),BUCKET,LOCAL_PREVIEW:'1',ADMIN_PHONE:process.env.ADMIN_PHONE||'+8801868333944',ADMIN_PASSWORD_PEPPER:localPepper,ADMIN_SETUP_TOKEN_HASH:process.env.ADMIN_SETUP_TOKEN_HASH,ADMIN_SETUP_EXPIRES:process.env.ADMIN_SETUP_EXPIRES,TWILIO_ACCOUNT_SID:process.env.TWILIO_ACCOUNT_SID,TWILIO_AUTH_TOKEN:process.env.TWILIO_AUTH_TOKEN,TWILIO_VERIFY_SERVICE_SID:process.env.TWILIO_VERIFY_SERVICE_SID};
}
