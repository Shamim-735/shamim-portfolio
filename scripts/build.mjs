import {readFile,readdir,mkdir,rm,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function bundle(){
 const assets={};const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'};
 async function visit(folder){for(const entry of await readdir(path.join(root,'public',folder),{withFileTypes:true})){const name=path.posix.join(folder,entry.name);if(entry.isDirectory())await visit(name);else assets['/'+name]={type:types[path.extname(name)]||'application/octet-stream',body:(await readFile(path.join(root,'public',name))).toString('base64')};}}
 await visit('');const auth='const {HttpError,ownerState,authApi}=(()=>{'+(await readFile(path.join(root,'worker/auth.js'),'utf8')).replace(/export /g,'')+';return {HttpError,ownerState,authApi};})();';return (await readFile(path.join(root,'worker/index.js'),'utf8')).replace("import {HttpError,ownerState,authApi} from './auth.js';",()=>auth).replace('/*__STATIC_ASSETS__*/{}',()=>JSON.stringify(assets));
}
