import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const sources=['app.js','admin.js'].map(name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8'));
const source=sources.join('\n');
function section(start,end){
 const selected=sources.find(text=>text.indexOf(start)>=0&&text.indexOf(end,text.indexOf(start))>text.indexOf(start))||source;
 const from=selected.indexOf(start),to=selected.indexOf(end,from);
 assert.ok(from>=0&&to>from,`Source section exists: ${start}`);
 return selected.slice(from,to);
}
const project={id:'one',title:'Logo',category:'Logo design',description:'A logo project.',images:['data:image/png;base64,YQ=='],concept:false};
const validation=section('function validProjects(',"$('#import-data').onchange");
const persistence=section('async function saveLocal(','function renderEditor(');
const assetReader=section('async function dataUrl(',"$('#download-site').onclick");
const exportHandler=section("$('#download-site').onclick",'function updateCloudNotice(');

class BlobReader{
 readAsDataURL(blob){
  assert.ok(blob instanceof Blob,'FileReader receives a resolved Blob');
  this.result='data:application/octet-stream;base64,YQ==';
  queueMicrotask(()=>this.onload());
 }
}
test('asset embedding resolves the Blob and reports missing files',async()=>{
 const context=vm.createContext({fetch:async()=>new Response('asset'),FileReader:BlobReader});
 vm.runInContext(assetReader,context);
 assert.match(await context.dataUrl('font.woff2'),/^data:/);
 assert.equal(await context.dataUrl(project.images[0]),project.images[0]);
 context.fetch=async()=>new Response(null,{status:404});
 await assert.rejects(context.dataUrl('missing.webp'),/could not be downloaded/);
});

function storageContext(){
 const state={cloud:{enabled:false},savingProject:false,persistingProjects:false,projects:[project],projectStorageKey:'projects:export-test',renderProjects(){},renderEditor(){}};
 state.database={transaction(){
  state.transaction={objectStore(){return {put(value,key){state.written={value,key};}};}};
  return state.transaction;
 }};
 const context=vm.createContext(state);
 vm.runInContext(validation+persistence,context);
 return context;
}
test('project writes are locked until commit and keep the correct collection key',async()=>{
 const context=storageContext();
 const updated=[{...project,title:'Updated'}];
 const pending=context.persist(updated);
 assert.equal(context.savingProject,true);
 assert.equal(context.projects[0].title,'Logo');
 await assert.rejects(context.persist([]),/Wait for the current/);
 assert.equal(context.written.key,'projects:export-test');
 context.transaction.oncomplete();await pending;
 assert.equal(context.projects[0].title,'Updated');
 assert.equal(context.savingProject,false);
 assert.equal(context.persistingProjects,false);
});
test('failed storage writes retain the old collection and release the lock',async()=>{
 const context=storageContext();const pending=context.persist([]);
 context.transaction.error=new Error('Storage full');context.transaction.onabort();
 await assert.rejects(pending,/Storage full/);
 assert.equal(context.projects[0].id,'one');
 assert.equal(context.savingProject,false);
 assert.equal(context.persistingProjects,false);
});
test('oversized collections are rejected before overwriting saved work',async()=>{
 const context=storageContext();
 const many=Array.from({length:100},(_,i)=>({...project,id:String(i)}));
 assert.equal(context.validProjects(many),true);
 await assert.rejects(context.persist([...many,{...project,id:'101'}]),/100 projects/);
 assert.equal(context.transaction,undefined);
 assert.equal(context.projects[0].id,'one');
});
test('canvas failures reject the upload instead of leaving it stuck',async()=>{
 class Reader{readAsDataURL(){this.result='data:image/png;base64,YQ==';this.onload();}}
 class Image{width=10;height=10;set src(value){this.onload();}}
 const context=vm.createContext({FileReader:Reader,Image,document:{createElement:()=>({getContext:()=>null})}});
 vm.runInContext(section('function readImage(',"$('#project-form').onsubmit"),context);
 await assert.rejects(context.readImage({}),/Image processing is unavailable/);
});
test('export preserves special text, embeds assets, and can be exported again offline',async()=>{
 const html='<link rel="stylesheet" href="style.css"><img src="assets/shamim.webp"><script src="app.js"></script>';
 const css="@font-face{src:url('assets/sora.woff2')}@font-face{src:url('assets/manrope.woff2')}";
 const js='window.loaded=true; /* literal $& and $` and $\' */';
 const button={};let output;let fetched=0;
 const context=vm.createContext({window:{},projects:[{...project,title:"Logo $& $` $' </script>"}],$:()=>button,toast(){},FileReader:BlobReader,
  download(name,text){assert.equal(name,'shamim-portfolio.html');output=text;},
  fetch:async path=>{fetched++;return ['index.html','style.css','app.js'].includes(path)?{ok:true,text:async()=>({'index.html':html,'style.css':css,'app.js':js}[path])}:new Response('asset');}});
 vm.runInContext(assetReader+exportHandler,context);await button.onclick();
 assert.ok(output,'The download completes');assert.ok(output.includes(js));
 assert.equal(button.disabled,false);
 assert.ok(!output.includes('src="assets/shamim.webp"'));
 const scripts=[...output.matchAll(/<script>([\s\S]*?)<\/script>/g)];
 assert.equal(scripts.length,2);
 const exported=vm.createContext({window:{}});vm.runInContext(scripts[0][1],exported);
 assert.equal(exported.window.SHAMIM_PROJECTS[0].title,"Logo $& $` $' </script>");
 assert.match(exported.window.SHAMIM_COLLECTION,/^export-/);
 assert.equal(exported.window.SHAMIM_SOURCE.html,html);
 context.window=exported.window;const before=fetched;output=null;await button.onclick();
 assert.ok(output,'A self-contained website can be downloaded again');
 assert.equal(fetched,before,'Offline re-export does not fetch external assets');
});
test('exported snapshots use a separate draft key from the live website',()=>{
 const line=source.match(/^const projectStorageKey = .+$/m)[0];
 const normal=vm.runInNewContext(`${line}\nprojectStorageKey`,{window:{}});
 const exported=vm.runInNewContext(`${line}\nprojectStorageKey`,{window:{SHAMIM_COLLECTION:'export-123'}});
 assert.equal(normal,'projects');assert.equal(exported,'projects:export-123');
});
test('mobile navigation restores its label after a link and closes with Escape',()=>{
 const menu={attributes:{},setAttribute(key,value){this.attributes[key]=value;},focus(){this.focused=true;}};
 const nav={open:false,classList:{toggle(name,value){nav.open=value;},contains(){return nav.open;}}};
 const link={};const listeners={};
 const context=vm.createContext({$:selector=>selector==='#menu'?menu:nav,$$:()=>[link],document:{addEventListener:(type,callback)=>listeners[type]=callback}});
 vm.runInContext(section('function setMenuOpen(','const revealObserver'),context);
 menu.onclick();assert.equal(menu.attributes['aria-label'],'Close navigation');
 link.onclick();assert.equal(menu.attributes['aria-label'],'Open navigation');assert.equal(nav.open,false);
 menu.onclick();listeners.keydown({key:'Escape'});assert.equal(nav.open,false);assert.equal(menu.focused,true);
});
test('the displayed clock can refresh instead of keeping the initial value',()=>{
 const label={};let display='08:30 PM';
 const context=vm.createContext({$:()=>label,Intl:{DateTimeFormat:function(){return {format:()=>display};}}});
 vm.runInContext(section('function updateLocalTime()','setTheme();updateLocalTime();'),context);
 context.updateLocalTime();assert.equal(label.textContent,'YOUR LOCAL TIME / 08:30 PM');
 display='08:31 PM';context.updateLocalTime();assert.equal(label.textContent,'YOUR LOCAL TIME / 08:31 PM');
});
test('downloads are attached to the active dialog and retain the Blob URL long enough',()=>{
 const anchor={click(){assert.equal(this.parent,dialog);},remove(){this.removed=true;}};
 const dialog={appendChild(node){node.parent=this;}};let scheduled;let revoked=false;
 const context=vm.createContext({Blob,document:{querySelector:()=>dialog,createElement:()=>anchor},URL:{createObjectURL:()=> 'blob:test',revokeObjectURL:()=>revoked=true},setTimeout:(callback,delay)=>scheduled={callback,delay}});
 vm.runInContext(section('function download(',"$('#export-data').onclick"),context);
 context.download('portfolio.html','<!doctype html>','text/html');
 assert.equal(anchor.download,'portfolio.html');assert.equal(anchor.removed,true);
 assert.equal(revoked,false);assert.equal(scheduled.delay,60000);scheduled.callback();assert.equal(revoked,true);
});

function enquiryContext(fetchResult){
 const values={name:' Client Name ',email:'client@example.com',brand:' New Brand ',project_type:'Logo design',message:' Please design a clear, distinctive logo for my new brand. ',_honey:''};
 const button={disabled:false},status={dataset:{}},fallback={hidden:true},state={resets:0,requests:[]};
 const form={reportValidity:()=>true,reset:()=>state.resets++,setAttribute(key,value){state[key]=value;},addEventListener(){}};
 const context=vm.createContext({cloud:{enabled:false},AbortController,setTimeout:()=>1,clearTimeout(){},FormData:class{get(key){return values[key];}},
  $:selector=>selector==='#enquiry-form'?form:selector==='#enquiry-status'?status:selector==='#enquiry-email-fallback'?fallback:button,
  fetch:async(url,options)=>{state.requests.push({url,payload:JSON.parse(options.body)});return fetchResult();}});
 vm.runInContext(section('async function submitEnquiry(','function validProjects('),context);
 return {context,form,button,status,fallback,state,values,send:()=>context.submitEnquiry({preventDefault(){},currentTarget:form})};
}
test('project enquiry sends to the specified Gmail only after validation',async()=>{
 const check=enquiryContext(async()=>({ok:true,json:async()=>({success:'true'})}));
 await check.send();assert.equal(check.state.resets,1);assert.equal(check.status.dataset.state,'success');
 assert.equal(check.state.requests[0].url,'https://formsubmit.co/ajax/iamalauddinshamim1086@gmail.com');
 assert.equal(check.state.requests[0].payload._replyto,'client@example.com');
 assert.equal(check.state.requests[0].payload.name,'Client Name');assert.equal(check.state.requests[0].payload.brand,'New Brand');
 assert.equal(check.button.disabled,false);assert.equal(check.state['aria-busy'],'false');
});
test('logo design is a selectable option in the enquiry form',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const select=html.match(/<select id="enquiry-type"[\s\S]*?<\/select>/)[0];
 const options=[...select.matchAll(/<option\b[^>]*>([^<]*)<\/option>/g)].map(match=>match[1]);
 assert.equal(options.length,7);assert.ok(options.includes('Logo design'));
});
test('a provider success string of false never shows a sent confirmation',async()=>{
 const check=enquiryContext(async()=>({ok:true,json:async()=>({success:'false'})}));
 await check.send();assert.equal(check.state.resets,0);assert.equal(check.status.dataset.state,'error');
 assert.match(check.status.textContent,/could not be confirmed/);assert.equal(check.button.disabled,false);
});
test('activation response keeps the brief and explains the fallback',async()=>{
 const check=enquiryContext(async()=>({ok:true,json:async()=>({success:'false',message:'This form needs activation.'})}));
 await check.send();assert.equal(check.state.resets,0);assert.equal(check.status.dataset.state,'error');
 assert.match(check.status.textContent,/being activated/);
});
test('invalid enquiry fields and honeypots do not send a request',async()=>{
 const check=enquiryContext(()=>{throw new Error('Must not send');});
 check.values.message='short';await check.send();assert.equal(check.state.requests.length,0);
 check.values.message='A valid detailed project description.';check.values._honey='spam';await check.send();assert.equal(check.state.requests.length,0);
});
test('duplicate submissions are ignored while sending',async()=>{
 let finish;const response=new Promise(resolve=>finish=resolve);
 const check=enquiryContext(()=>response);const first=check.send();await check.send();
 assert.equal(check.state.requests.length,1);finish({ok:true,json:async()=>({success:true})});await first;
});
test('network and timeout failures preserve the enquiry and restore the send button',async()=>{
 for(const failure of [new TypeError('Failed to fetch'),Object.assign(new Error('Timeout'),{name:'AbortError'})]){
  const check=enquiryContext(async()=>{throw failure;});await check.send();
  assert.equal(check.state.resets,0);assert.equal(check.status.dataset.state,'error');assert.equal(check.button.disabled,false);assert.equal(check.fallback.hidden,false);assert.ok(decodeURIComponent(check.fallback.href).includes('Please design a clear, distinctive logo'));
 }
});


test('project stepping stays in the selected category and wraps in both directions',()=>{
 const projects=[{...project,id:'logo-a'},{...project,id:'jersey',category:'Jersey design'},{...project,id:'logo-b'}];
 const dialog={scrollTop:300};let opened;
 const context=vm.createContext({projects,filter:'Logo design',$:()=>dialog,openProject:id=>opened=id});
 vm.runInContext(section('function visibleProjects()','function openProject('),context);
 context.stepProject(1);assert.equal(opened,'logo-b');assert.equal(dialog.scrollTop,0);
 vm.runInContext('currentProject=2',context);context.stepProject(1);assert.equal(opened,'logo-a');
 vm.runInContext('currentProject=0',context);context.stepProject(-1);assert.equal(opened,'logo-b');
 context.filter='Jersey design';opened=null;context.stepProject(1);assert.equal(opened,null);
});
test('image removal, reordering and cover selection do not mutate saved artwork',()=>{
 const context=vm.createContext({});vm.runInContext(section('function changeImageOrder(',"$('#replace-project-image').onchange"),context);
 const original=['one','two','three'];
 assert.deepEqual([...context.changeImageOrder(original,1,'remove')],['one','three']);
 assert.deepEqual([...context.changeImageOrder(original,2,'cover')],['three','one','two']);
 assert.deepEqual([...context.changeImageOrder(original,0,'down')],['two','one','three']);
 assert.deepEqual([...context.changeImageOrder(original,2,'up')],['one','three','two']);
 assert.deepEqual(original,['one','two','three']);
});
test('shared artwork paths are supported but arbitrary image URLs are rejected',()=>{
 const context=vm.createContext({});vm.runInContext(validation,context);
 assert.equal(context.validProjects([{...project,images:['/media/'+'a'.repeat(64)+'.webp']}]),true);
 for(const image of ['https://external.test/image.png','javascript:alert(1)','/media/../../secret','data:image/svg+xml;base64,YQ=='])assert.equal(context.validProjects([{...project,images:[image]}]),false);
});
test('dialogs have stable accessible names and sharing metadata is present',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/<dialog id="project-dialog"[^>]+aria-labelledby="project-detail-title"/);
 const admin=readFileSync(new URL('../public/admin.html',import.meta.url),'utf8');
 assert.match(admin,/<section id="editor"[^>]+aria-labelledby="editor-title"/);
 assert.doesNotMatch(html,/id="editor"|Manage portfolio|Owner sign in|id="open-editor"/);
 assert.match(source,/<h2 id="project-detail-title">/);
 assert.match(html,/<meta property="og:image"/);assert.match(html,/<meta name="twitter:card"/);
});

test('cloud publication commits shared state before a failed local backup',async()=>{
 const context=storageContext();context.cloud={enabled:true,ready:true,canEdit:true,revision:2};let savedRevision;
 context.toast=()=>{};context.updateCloudNotice=()=>{};context.localDraft=null;
 context.saveLocal=async(value,key)=>{if(key!=='pending-projects')throw new Error('Device quota exceeded');};
 context.uploadCollection=async next=>next;
 context.apiRequest=async(path,options)=>{savedRevision=JSON.parse(options.body).revision;return {projects:JSON.parse(options.body).projects,revision:3};};
 await context.persist([{...project,title:'Published'}]);
 assert.equal(savedRevision,2);assert.equal(context.cloud.revision,3);assert.equal(context.projects[0].title,'Published');assert.equal(context.persistingProjects,false);
});
test('cloud revision failures keep the current collection and the recoverable draft',async()=>{
 const context=storageContext();context.cloud={enabled:true,ready:true,canEdit:true,revision:2};let draft;
 context.saveLocal=async value=>draft=value;context.uploadCollection=async next=>next;context.apiRequest=async()=>{throw new Error('Newer collection saved elsewhere');};
 await assert.rejects(context.persist([{...project,title:'Unsaved draft'}]),/Newer collection/);
 assert.equal(context.projects[0].title,'Logo');assert.equal(draft[0].title,'Unsaved draft');assert.equal(context.cloud.revision,2);assert.equal(context.savingProject,false);
});
test('cloud pages never fall back to browser-only publishing without owner authorization',async()=>{
 const context=storageContext();context.cloud={enabled:true,ready:true,canEdit:false,revision:2};
 await assert.rejects(context.persist([]),/Sign in as the portfolio owner/);assert.equal(context.transaction,undefined);
});
