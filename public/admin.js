
'use strict';
const $=(s,root=document)=>root.querySelector(s);
const $$=(s,root=document)=>[...root.querySelectorAll(s)];
let projects=[];
const projectStorageKey='projects';
let database,removedProject=null,editingProjectId=null,replacingImageIndex=null;
let editingImages=[],localDraft=null,savingProject=false,persistingProjects=false;
let cloud={enabled:true,ready:false,canEdit:false,revision:0};
const esc=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),4500);}
function renderProjects(){$('#admin-project-count').textContent=projects.length+' / 100 projects';}
// IndexedDB keeps uploaded artwork out of the small localStorage quota.
function openDatabase() {
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open('shamim-portfolio-v1',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('settings');
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
 });
}
async function apiRequest(path,options={}) {
 const response=await fetch(path,{...options,headers:{'Accept':'application/json',...options.headers}});
 let body;try{body=await response.json();}catch{throw new Error('The publishing service could not be reached. Please try again.');}
 if(!response.ok)throw new Error(body.error || 'The change could not be saved.');return body;
}
async function saveLocal(next,key=projectStorageKey) {
 if(!database)throw new Error('Browser storage is unavailable. Export a backup before leaving.');
 await new Promise((resolve,reject)=>{const tx=database.transaction('settings','readwrite');tx.objectStore('settings').put(next,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
}
async function uploadCollection(list) {
 const uploaded=new Map();const result=[];
 for(const project of list){const images=[];for(const image of project.images){
  if(image.startsWith('/media/')){images.push(image);continue;}
  if(!uploaded.has(image)){
   const response=await fetch(image);if(!response.ok)throw new Error('An artwork image could not be read.');
   const blob=await response.blob();if(blob.size>4*1024*1024)throw new Error('This artwork is too large after resizing. Use a smaller JPG or WebP.');const media=await apiRequest('/api/media',{method:'POST',headers:{'Content-Type':blob.type},body:blob});uploaded.set(image,media.url);
  }
  images.push(uploaded.get(image));
 }result.push({...project,images});}return result;
}
async function persist(next) {
 if (persistingProjects) throw new Error('Wait for the current project change to finish.');
 next = next.filter(project => !project.concept);
 if (!validProjects(next)) throw new Error('Project data is invalid or the collection exceeds 100 projects.');
 if(cloud.enabled && (!cloud.ready || !cloud.canEdit))throw new Error('Sign in as the portfolio owner to publish changes.');
 if(!cloud.enabled && !database)throw new Error('Browser storage is unavailable. Export your website before closing this page.');
 const previousSaving=savingProject;savingProject=true;persistingProjects=true;
 try {
  if(cloud.enabled){
   // Keep the draft before uploading. A failed upload or revision conflict cannot erase it.
   try{await saveLocal(next,'pending-projects');}catch{}
   const uploaded=await uploadCollection(next);
   const saved=await apiRequest('/api/projects',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({projects:uploaded,revision:cloud.revision})});
   projects=saved.projects;cloud.revision=saved.revision;localDraft=null;
   try{await saveLocal(projects);await saveLocal(null,'pending-projects');}catch{toast('Published. A local backup could not be saved; download a backup.');}
   updateCloudNotice();
  }else{await saveLocal(next);projects=next;}
  renderProjects();renderEditor();
 }finally{savingProject=previousSaving;persistingProjects=false;}
}
function renderEditor() {
 $('#editor-projects').innerHTML=projects.map((p,index)=>`<div class="editor-row"><img src="${esc(p.images[0])}" alt=""><div>${esc(p.title)}<small>${String(index+1).padStart(2,'0')} / ${esc(p.category)}</small></div><div class="project-row-actions"><button data-move="up" data-project="${esc(p.id)}" aria-label="Move ${esc(p.title)} up" ${index===0?'disabled':''}>↑ Up</button><button data-move="down" data-project="${esc(p.id)}" aria-label="Move ${esc(p.title)} down" ${index===projects.length-1?'disabled':''}>↓ Down</button><button data-edit="${esc(p.id)}" aria-label="Edit ${esc(p.title)}">Edit</button><button data-remove="${esc(p.id)}">Remove</button></div></div>`).join('');
 if (!projects.length) $('#editor-projects').innerHTML = '<p class="editor-info">No projects added yet. Upload your first project above.</p>';
 $$('[data-move]').forEach(button => button.onclick = () => moveProject(button.dataset.project,button.dataset.move));
 $$('[data-edit]').forEach(button => button.onclick = () => {if(!savingProject) startProjectEdit(button.dataset.edit);});
 if(removedProject) $('#editor-projects').insertAdjacentHTML('beforeend','<button class="subtle-button" id="undo-remove">Undo last removal ↶</button>');
 // Bind removal with a stable identifier and keep an undo copy.
 $$('[data-remove]').forEach(b=>b.onclick=async()=>{
  if (savingProject) return;
  const id=b.dataset.remove, item=projects.find(p=>p.id===id), index=projects.findIndex(p=>p.id===id);
  const previousRemoved=removedProject;removedProject={item,index};
  try {await persist(projects.filter(p=>p.id!==id));if(editingProjectId === id) resetProjectForm();toast('Project removed. Undo is available below the list.');} catch(e){removedProject=previousRemoved;toast(e.message);}
 });
 if($('#undo-remove')) $('#undo-remove').onclick=async()=>{if(savingProject)return;const saved=removedProject;const next=[...projects];next.splice(saved.index,0,saved.item);removedProject=null;try{await persist(next);}catch(e){removedProject=saved;renderEditor();toast(e.message);}};
}
async function moveProject(id,direction) {
 if (savingProject) return;
 const index = projects.findIndex(project=>project.id===id);
 const target = index + (direction==='up' ? -1 : 1);
 if (index<0 || target<0 || target>=projects.length) return;
 const next = [...projects];
 [next[index],next[target]] = [next[target],next[index]];
 savingProject = true;
 $$('#editor-projects button').forEach(button=>button.disabled=true);
 try {
  await persist(next);
  toast('Project order saved.');
 }catch(error){toast(error.message || 'Could not save the project order.');}
 finally {
  savingProject = false;
  renderEditor();
  const focusButton = $$('[data-move]').find(button=>button.dataset.project===id && button.dataset.move===direction);
  if (focusButton) {
   const nextFocus = focusButton.disabled ? $$('[data-move]').find(button=>button.dataset.project===id && !button.disabled) : focusButton;
   nextFocus?.focus({preventScroll:true});
  }
 }
}
function resetProjectForm() {
 editingProjectId = null;
 editingImages=[];replacingImageIndex=null;
 const form = $('#project-form');
 form.reset();
 form.elements.namedItem('images').required = true;
 $('button[type=submit]',form).textContent = 'Add project ↗';
 $('#cancel-project-edit').hidden = true;
 $('#current-project-images').innerHTML = '';
 $('#upload-status').textContent = '';
}
function startProjectEdit(id) {
 const project = projects.find(project => project.id === id);
 if (!project) return;
 resetProjectForm();
 editingProjectId = id;
 const form = $('#project-form');
 form.elements.namedItem('title').value = project.title;
 form.elements.namedItem('category').value = project.category;
 form.elements.namedItem('description').value = project.description;
 form.elements.namedItem('images').required = false;
 $('button[type=submit]',form).textContent = 'Save changes ↗';
 $('#cancel-project-edit').hidden = false;
 editingImages=[...project.images];renderEditingImages();
 $('#upload-status').textContent = 'The first image is the cover. Replace, remove, or reorder images before saving.';
 $('#editor').scrollTop = 0;
 form.elements.namedItem('title').focus({preventScroll:true});
}
$('#cancel-project-edit').onclick = () => {if(!savingProject) resetProjectForm();};
function renderEditingImages() {
 $('#current-project-images').innerHTML=editingImages.length ? '<p>Project images · first image is the cover</p><div class="image-editor-grid">'+editingImages.map((src,index)=>`<div class="image-editor-item"><img src="${esc(src)}" alt="Artwork ${index+1}${index===0?' — cover':''}"><small>${index===0?'Cover image':'Image '+(index+1)}</small><div><button type="button" data-image-action="replace" data-index="${index}">Replace</button><button type="button" data-image-action="remove" data-index="${index}">Remove</button><button type="button" data-image-action="up" data-index="${index}" ${index===0?'disabled':''} aria-label="Move image ${index+1} earlier">↑</button><button type="button" data-image-action="down" data-index="${index}" ${index===editingImages.length-1?'disabled':''} aria-label="Move image ${index+1} later">↓</button>${index>0?`<button type="button" data-image-action="cover" data-index="${index}">Make cover</button>`:''}</div></div>`).join('')+'</div>' : '<p>No images selected. Add at least one image before saving.</p>';
 $$('[data-image-action]').forEach(button=>button.onclick=()=>{
  if(savingProject)return;const index=Number(button.dataset.index),action=button.dataset.imageAction;
  if(action==='replace'){replacingImageIndex=index;$('#replace-project-image').click();return;}
  editingImages=changeImageOrder(editingImages,index,action);renderEditingImages();
 });
}
function changeImageOrder(images,index,action) {
 const next=[...images];if(index<0||index>=next.length)return next;
 if(action==='remove')next.splice(index,1);
 if(action==='cover')next.unshift(...next.splice(index,1));
 const target=action==='up'?index-1:action==='down'?index+1:-1;
 if(target>=0&&target<next.length)[next[index],next[target]]=[next[target],next[index]];
 return next;
}
$('#replace-project-image').onchange=async event=>{
 const file=event.target.files[0],index=replacingImageIndex;event.target.value='';
 if(!file||index===null||savingProject)return;
 if(file.size>8*1024*1024||!['image/png','image/jpeg','image/webp'].includes(file.type)){toast('Choose a PNG, JPG or WebP image, up to 8 MB.');return;}
 savingProject=true;$('#upload-status').textContent='Preparing replacement image…';
 try{editingImages[index]=await readImage(file);renderEditingImages();$('#upload-status').textContent='Replacement ready. Save changes to publish it.';}catch(error){toast(error.message);}finally{savingProject=false;}
};
function readImage(file) {
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();reader.onerror=()=>reject(new Error('Could not read this image.'));reader.onload=()=>{
   const image=new Image();image.onerror=()=>reject(new Error('Invalid image file.'));image.onload=()=>{
    try {
     const scale=Math.min(1,2000/Math.max(image.width,image.height));
     const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
     const context=canvas.getContext('2d');if(!context)throw new Error('Image processing is unavailable. Try another browser.');
     context.drawImage(image,0,0,canvas.width,canvas.height);resolve(canvas.toDataURL('image/webp',.9));
    }catch(error){reject(error);}
   };image.src=reader.result;
  };reader.readAsDataURL(file);
 });
}
$('#project-form').onsubmit=async event=>{
 event.preventDefault();
 if (savingProject) return;
 const form = event.currentTarget;
 const data = new FormData(form);
 const files = [...form.elements.namedItem('images').files];
 const button = $('button[type=submit]',form);
 const editId = editingProjectId;
 const title = data.get('title').trim();
 const description = data.get('description').trim();
 if (!title || !description) {$('#upload-status').textContent='Enter a project title and description.';return;}
 if (!editId && !files.length) {$('#upload-status').textContent='Choose at least one project image.';return;}
 if (!editId && projects.length>=100) {$('#upload-status').textContent='This collection supports up to 100 projects. Back up your collection before removing any work.';return;}
 if(files.length>6 || files.some(file=>file.size>8*1024*1024 || !['image/png','image/jpeg','image/webp'].includes(file.type))){$('#upload-status').textContent='Choose up to 6 PNG, JPG or WebP images, 8 MB each.';return;}
 const existing = editId ? projects.find(project=>project.id===editId) : null;
 if (editId && !existing) {$('#upload-status').textContent='This project was removed. Add it again as a new project.';return;}
 const currentImages = existing ? [...editingImages] : [];
 if (!currentImages.length && !files.length){$('#upload-status').textContent='Keep or upload at least one project image.';return;}
 if (currentImages.length + files.length > 6) {$('#upload-status').textContent=`This project already has ${currentImages.length} images. You can keep up to 6 images in total. Your existing images have not changed.`;return;}
 savingProject = true;button.disabled = true;$('#cancel-project-edit').disabled = true;
 $('#upload-status').textContent = files.length ? 'Preparing your artwork…' : 'Saving your changes…';
 try {
  const addedImages = await Promise.all(files.map(readImage));
  const updated = {...existing,id:editId || (crypto.randomUUID?.() || `project-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`),title,category:data.get('category'),description,images:[...currentImages,...addedImages],concept:false};
  const next = editId ? projects.map(project=>project.id===editId ? updated : project) : [updated,...projects];
  await persist(next);
  resetProjectForm();
  $('#upload-status').textContent = cloud.enabled ? 'Project published. Changes are available across devices.' : (editId ? 'Changes saved in this browser.' : 'Project added and saved in this browser.');
  toast(editId ? 'Project updated.' : 'Your project is ready in Selected work.');
 }catch(error){$('#upload-status').textContent=error.message || 'Could not save. Export a backup and free some browser storage.';}
 finally {savingProject=false;button.disabled=false;$('#cancel-project-edit').disabled=false;}
};
function download(name,content,type) {
 const url=URL.createObjectURL(new Blob([content],{type}));
 const a=document.createElement('a');a.href=url;a.download=name;a.hidden=true;
 (document.querySelector('dialog[open]') || document.body).appendChild(a);
 a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
$('#export-data').onclick=async()=>{
 const button=$('#export-data');button.disabled=true;
 try{const portable=await Promise.all(projects.map(async p=>({...p,images:await Promise.all(p.images.map(dataUrl))})));download('shamim-projects.json',JSON.stringify({version:1,projects:portable},null,2),'application/json');}catch(error){toast(error.message);}finally{button.disabled=false;}
};
function validProjects(list) {
 const categories=['Brand identity','Logo design','Jersey design','Social media','Print & packaging'];
 const safeImage=s=>typeof s==='string' && (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s) || /^assets\/[a-z0-9-]+\.(svg|webp)$/.test(s) || /^\/media\/[a-f0-9]{64}\.(png|jpg|webp)$/.test(s));
 return Array.isArray(list)&&list.length<=100&&list.every(p=>p&&typeof p.id==='string'&&typeof p.title==='string'&&p.title.trim().length>0&&p.title.length<=90&&typeof p.description==='string'&&p.description.trim().length>0&&p.description.length<=1200&&categories.includes(p.category)&&Array.isArray(p.images)&&p.images.length>0&&p.images.length<=6&&p.images.every(safeImage))&&new Set(list.map(p=>p.id)).size===list.length;
}
$('#import-data').onchange=async e=>{
 const file=e.target.files[0];if(!file)return;
 try{if(file.size>100*1024*1024)throw new Error('Backup exceeds 100 MB.');const data=JSON.parse(await file.text());if(!validProjects(data.projects))throw new Error('This is not a valid portfolio backup.');if(!confirm('Replace the current project collection with this backup?'))return;if(savingProject)throw new Error('Wait for the current project to finish saving.');await persist(data.projects);removedProject=null;renderEditor();resetProjectForm();toast('Project collection imported.');}catch(error){toast(error.message);}finally{e.target.value='';}
};
async function dataUrl(url) {
 if(url.startsWith('data:'))return url;
 const response=await fetch(url);if(!response.ok)throw new Error('An artwork asset could not be downloaded.');
 const blob=await response.blob();
 return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('An artwork asset could not be read.'));reader.readAsDataURL(blob);});
}
$('#download-site').onclick=async()=>{
 const button=$('#download-site');button.disabled=true;toast('Preparing your complete website…');
 try {
  const [html,css,js]=window.SHAMIM_SOURCE ? [window.SHAMIM_SOURCE.html,window.SHAMIM_SOURCE.css,window.SHAMIM_SOURCE.js] : await Promise.all(['index.html','style.css','app.js'].map(async path=>{const r=await fetch(path);if(!r.ok)throw new Error('Could not prepare the website.');return r.text();}));
  let embeddedCss=css;
  for(const font of ['sora','manrope'])if(embeddedCss.includes(`assets/${font}.woff2`))embeddedCss=embeddedCss.replace(`assets/${font}.woff2`,await dataUrl(`assets/${font}.woff2`));
  const embeddedProjects=await Promise.all(projects.map(async p=>({...p,images:await Promise.all(p.images.map(dataUrl))})));
  const portrait=window.SHAMIM_SOURCE?.portrait || await dataUrl('assets/shamim.webp');
  let output=html.replace('window.SHAMIM_CLOUD=true;','window.SHAMIM_CLOUD=false;').replace('<link rel="stylesheet" href="style.css">',()=>`<style>${embeddedCss}</style>`).replace('src="assets/shamim.webp"',()=>`src="${portrait}"`);
  const projectData=JSON.stringify(embeddedProjects).replace(/</g,'\\u003c');
  const sourceData=JSON.stringify({html,css:embeddedCss,js,portrait}).replace(/</g,'\\u003c');
  const collectionId=`export-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
  output=output.replace('<script src="app.js"></script>',()=>`<script>window.SHAMIM_PROJECTS=${projectData};window.SHAMIM_COLLECTION=${JSON.stringify(collectionId)};window.SHAMIM_SOURCE=${sourceData};<\/script><script>${js.replace(/<\/script/gi,'<\\/script')}<\/script>`);
  download('shamim-portfolio.html',output,'text/html');toast('Website downloaded with all current artwork.');
 }catch(e){toast(e.message);}finally{button.disabled=false;}
};
function updateCloudNotice() {
 if(!cloud.enabled)return;
 const notice=$('#cloud-notice');notice.hidden=false;
 $('#editor-intro').textContent='Only you can edit this portfolio. Published projects are shared across devices. Back up your artwork before making major changes.';
 $('#editor-footer-note').textContent='Changes are published securely to this website. Download website creates a standalone snapshot; Back up projects includes your artwork.';
 $('#publish-local').hidden=!(cloud.canEdit && cloud.revision===0 && projects.length);
 $('#recover-local').hidden=!(cloud.canEdit && cloud.revision>0 && localDraft?.length);
 notice.textContent=cloud.ready?(cloud.revision===0?'Your device collection is not published yet. Review it, then publish it once to make it available across devices.':'Your portfolio is connected. Saved changes are published to every device.'):'Connecting to shared project storage…';
}
$('#publish-local').onclick=async()=>{
 if(savingProject)return;const button=$('#publish-local');button.disabled=true;
 try{await persist(projects);toast('Your collection is published across devices.');}catch(error){toast(error.message);}finally{button.disabled=false;}
};
$('#recover-local').onclick=()=>{
 if(savingProject||!localDraft?.length)return;
 if(!confirm('Load the saved device draft for review? Nothing is published until you choose Publish this collection.'))return;
 projects=localDraft;renderProjects();renderEditor();
 $('#publish-local').hidden=false;$('#recover-local').hidden=true;$('#cloud-notice').textContent='Device draft loaded for review. Publish this collection to replace the shared collection, or reload to discard this review.';
};
$('#load-enquiries').onclick=async()=>{
 const button=$('#load-enquiries');button.disabled=true;
 try{const data=await apiRequest('/api/enquiries');$('#owner-enquiries').innerHTML=data.enquiries.length?data.enquiries.map(item=>`<article class="enquiry-inbox-item"><strong>${esc(item.name)} · ${esc(item.project_type)}</strong><a href="mailto:${esc(item.email)}">${esc(item.email)}</a><small>${esc(new Date(item.created_at).toLocaleString())} · Email: ${esc(({accepted:'accepted by mail service',pending:'sending',pending_activation:'activation needed',failed:'delivery failed'})[item.email_status]||'pending')}</small>${item.brand?`<p><strong>${esc(item.brand)}</strong></p>`:''}<p>${esc(item.message)}</p></article>`).join(''):'<p class="editor-info">No enquiries yet.</p>';}catch(error){toast(error.message);}finally{button.disabled=false;}
};
(async()=>{
 let saved,pending;
 try{
  database=await openDatabase();
  const read=key=>new Promise((resolve,reject)=>{const request=database.transaction('settings').objectStore('settings').get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  saved=await read(projectStorageKey);pending=await read('pending-projects');
  if(!cloud.enabled && saved&&validProjects(saved))projects=saved.filter(project=>!project.concept);
 }catch{console.warn('Browser-local project storage unavailable.');}
 if(cloud.enabled){
  $('#cloud-notice').hidden=false;
  try{
   const [session,collection]=await Promise.all([apiRequest('/api/session'),apiRequest('/api/projects')]);
   if(!session.canEdit)throw new Error('Your admin session has expired. Sign in again.');
   if(!session.cloud||!validProjects(collection.projects)||!Number.isSafeInteger(collection.revision))throw new Error('The shared collection could not be loaded.');
   cloud={enabled:true,ready:true,canEdit:session.canEdit,revision:collection.revision};
   const draft=pending&&validProjects(pending)?pending:saved&&validProjects(saved)?saved:null;
   if(cloud.canEdit && collection.revision===0 && draft?.length)projects=draft.filter(p=>!p.concept);
   else{
    projects=collection.projects;
    if(cloud.canEdit && draft?.length && JSON.stringify(draft)!==JSON.stringify(projects))localDraft=draft;
   }
   $('#load-enquiries').hidden=!session.canEdit;updateCloudNotice();
  }catch(error){
   projects=[];
   $('#cloud-notice').textContent=error.message;$('#cloud-notice').hidden=false;
   toast(error.message);return;
  }
 }
 renderProjects();renderEditor();$('#admin-workspace').inert=false;$('#admin-loading').hidden=true;
})();

$('#admin-logout').onclick=async()=>{try{await apiRequest('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});location.replace('/admin/login');}catch(error){toast(error.message);}};
