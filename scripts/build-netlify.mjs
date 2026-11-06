import {mkdir,rm,writeFile,copyFile,cp,readFile,access} from 'node:fs/promises';
import {bundle} from './build.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=path.join(root,'netlify-public');
await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});
for(const name of ['app.js','style.css','admin.css','login.js'])await copyFile(path.join(root,'public',name),path.join(output,name));
await cp(path.join(root,'public/assets'),path.join(output,'assets'),{recursive:true});
await writeFile(path.join(output,'404.html'),'<!doctype html><html lang="en"><meta charset="utf-8"><title>Page not found</title><h1>Page not found</h1><a href="/">Back to portfolio</a></html>');
await mkdir(path.join(root,'dist/server'),{recursive:true});await writeFile(path.join(root,'dist/server/index.js'),await bundle());
// The admin HTML, editor script and backend must never be in Netlify's static directory.
for(const name of ['index.html','admin.html','admin.js','worker','netlify','package.json']){
 let found=true;try{await access(path.join(output,name));}catch{found=false;}
 if(found)throw new Error('Private or dynamic source was exposed in the publish folder: '+name);
}
const source=await readFile(path.join(root,'netlify/functions/portfolio.mjs'),'utf8');
if(!source.includes("../../dist/server/index.js"))throw new Error('The Netlify handler is not wired to the built application.');
console.log('Netlify build ready: static assets, protected function routes, and Postgres migrations.');
