'use strict';
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
const seedProjects = [];
let projects = (window.SHAMIM_PROJECTS || seedProjects).filter(project => !project.concept);
const projectStorageKey = window.SHAMIM_COLLECTION ? `projects:${window.SHAMIM_COLLECTION}` : 'projects';
let filter = 'All';
let cloud = {enabled:!!window.SHAMIM_CLOUD,ready:false,canEdit:false,revision:0};
const esc = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function toast(message) {
 $('#toast').textContent = message;
 $('#toast').classList.add('show');
 clearTimeout(toast.timer);
 toast.timer = setTimeout(() => $('#toast').classList.remove('show'), 3800);
}
// Preserve line breaks, italic styling and links while revealing words as one wave.
const titleObserver = reduced ? null : new IntersectionObserver(entries => {
 entries.forEach(entry => entry.target.classList.toggle('title-visible', entry.isIntersecting));
}, {threshold:.12, rootMargin:'0px 0px -24px 0px'});
function initTitleFlow(root = document.querySelector('main')) {
 if (!titleObserver || !root) return;
 root.querySelectorAll('h1,h2,h3').forEach(heading => {
  if (heading.dataset.titleFlow) return;
  heading.dataset.titleFlow = 'true';
  heading.classList.add('title-flow');
  const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) {
   if (!walker.currentNode.parentElement.closest('a,.lime-star,.service-plus')) nodes.push(walker.currentNode);
  }
  let index = 0;
  nodes.forEach(node => {
   const fragment = document.createDocumentFragment();
   node.textContent.split(/(\s+)/).forEach(word => {
    if (!word.trim()) {fragment.appendChild(document.createTextNode(word));return;}
    const mask = document.createElement('span');
    mask.className = 'title-word';
    const inner = document.createElement('span');
    inner.className = 'title-word-inner';
    inner.textContent = word;
    inner.style.setProperty('--word-delay', `${Math.min(index++, 8) * 55}ms`);
    mask.appendChild(inner);fragment.appendChild(mask);
   });
   node.replaceWith(fragment);
  });
  titleObserver.observe(heading);
 });
}
initTitleFlow();
function renderProjects() {
 $$('#projects [data-title-flow]').forEach(heading => titleObserver?.unobserve(heading));
 const visible = visibleProjects();
 $('#projects').innerHTML = visible.map((p, i) => `<button class="project-card" data-id="${esc(p.id)}" aria-label="View ${esc(p.title)}" style="animation-delay:${i * .05}s"><div class="project-motion"><div class="project-cover"><img src="${esc(p.images[0])}" alt="${esc(p.title)} design preview" loading="lazy"><div class="focus-blur"></div><span class="cover-label">${p.concept ? 'CONCEPT / DEMO' : 'SELECTED WORK'}</span><span class="cover-open">↗</span></div><div class="project-meta"><div><span class="category">${esc(p.category)}</span><h3>${esc(p.title)}</h3><p>${esc(p.description.split('. ')[0].replace(/\.*$/, '.'))}</p></div><span class="arrow">↗</span></div></div></button>`).join('');
 if (!visible.length) $('#projects').innerHTML = `<p class="project-empty">${projects.length ? 'No projects in this category yet.' : 'Selected work is coming soon.'}</p>`;
 $('.filters button span').textContent = String(projects.length).padStart(2, '0');
 refreshProjectFlow();
 initTitleFlow($('#projects'));
 $$('.project-card').forEach(card => {
  card.addEventListener('click', () => openProject(card.dataset.id));
  card.addEventListener('pointerenter', () => tone('hover'));
  card.addEventListener('pointermove', event => {
   const cover = $('.project-cover', card), r = cover.getBoundingClientRect();
   cover.style.setProperty('--px', `${(event.clientX - r.left) / r.width * 100}%`);
   cover.style.setProperty('--py', `${(event.clientY - r.top) / r.height * 100}%`);
  });
 });
}
$$('[data-filter]').forEach(button => button.addEventListener('click', () => {
 filter = button.dataset.filter;
 $$('[data-filter]').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); });
 renderProjects();
}));
function visibleProjects() {return projects.filter(p => filter === 'All' || p.category === filter);}
let currentProject = 0;
function stepProject(direction) {
 const list=visibleProjects();
 const index=list.findIndex(p=>p.id===projects[currentProject]?.id);
 if(list.length<2 || index<0)return;
 openProject(list[(index+direction+list.length)%list.length].id);
 $('#project-dialog').scrollTop=0;
}
function projectOrderAction(category) {
 if(category==='Jersey design')return {url:'https://www.fiverr.com/s/jyebm07',label:'Order jersey design on Fiverr ↗'};
 if(category==='Logo design')return {url:'https://www.fiverr.com/s/9dG7vAj',label:'Order logo design on Fiverr ↗'};
 return {url:'https://wa.me/8801868333944?text='+encodeURIComponent('Hi Shamim! I would like to discuss a ' + category.toLowerCase() + ' project.'),label:'Discuss a similar project ↗'};
}
function openProject(id) {
 currentProject = projects.findIndex(p => p.id === id);
 const p = projects[currentProject];
 if (!p) return;
 const order=projectOrderAction(p.category);
 $('#project-detail [data-title-flow]').forEach(heading => titleObserver?.unobserve(heading));
 $('#project-detail').innerHTML = `<p class="eyebrow">${esc(p.category)} ${p.concept ? ' / CONCEPT PROJECT' : ''}</p><h2 id="project-detail-title">${esc(p.title)}</h2><p class="detail-desc">${esc(p.description)}</p>${p.images.map(src => `<img class="detail-image" src="${esc(src)}" alt="${esc(p.title)} artwork">`).join('')}<div class="detail-bottom"><a class="button" href="${esc(order.url)}" target="_blank" rel="noopener">${esc(order.label)}</a><button class="subtle-button" id="next-project" ${visibleProjects().length<2?'disabled':''}>Next project →</button></div>`;
 initTitleFlow($('#project-detail'));
 $('#next-project').onclick = () => stepProject(1);
 if (!$('#project-dialog').open) $('#project-dialog').showModal();
 tone('open');
}
$$('dialog').forEach(dialog => {
 $('.close-dialog', dialog).onclick = () => dialog.close();
 dialog.addEventListener('click', e => { if(e.target === dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();} });
});
document.addEventListener('keydown', event => {
 if ($('#project-dialog').open && ['ArrowLeft','ArrowRight'].includes(event.key)) {
  event.preventDefault();
  const direction = event.key === 'ArrowRight' ? 1 : -1;
  stepProject(direction);
 }
});
// Time follows the visitor's device; a manual choice persists across visits.
let themeMode = 'auto';
try { themeMode = localStorage.getItem('shamim-theme') || 'auto'; } catch(e) {}
if (!['auto','light','dark'].includes(themeMode)) themeMode = 'auto';
function setTheme() {
 const hour = new Date().getHours();
 const active = themeMode === 'auto' ? (hour >= 7 && hour < 19 ? 'light' : 'dark') : themeMode;
 document.documentElement.dataset.theme = active;
 $('#theme span').textContent = themeMode[0].toUpperCase() + themeMode.slice(1);
 $('#theme').setAttribute('aria-label', `Theme mode: ${themeMode}. Click to change.`);
 $('meta[name="theme-color"]').content = active === 'dark' ? '#080e0b' : '#f7f9f4';
}
$('#theme').onclick = () => {
 themeMode = ['auto','light','dark'][(['auto','light','dark'].indexOf(themeMode) + 1) % 3];
 try {localStorage.setItem('shamim-theme', themeMode);} catch(e) {}
 setTheme(); toast(themeMode === 'auto' ? 'Automatic theme · light 7am–7pm, dark overnight' : `${themeMode === 'light' ? 'Light' : 'Dark'} theme enabled`);
};
function updateLocalTime() {
 $('#local-time').textContent = 'YOUR LOCAL TIME / ' + new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit'}).format(new Date());
}
setTheme();updateLocalTime();setInterval(()=>{setTheme();updateLocalTime();}, 60000);
$$('.year').forEach(el => el.textContent = new Date().getFullYear());
function setMenuOpen(open) {
 $('.header nav').classList.toggle('open',open);
 $('#menu').setAttribute('aria-expanded',String(open));
 $('#menu').setAttribute('aria-label',open?'Close navigation':'Open navigation');
 $('#menu').textContent = open ? '×' : '☰';
}
$('#menu').onclick = () => setMenuOpen(!$('.header nav').classList.contains('open'));
$$('.header nav a').forEach(link => link.onclick = () => setMenuOpen(false));
document.addEventListener('keydown',event=>{if(event.key==='Escape' && $('.header nav').classList.contains('open')){setMenuOpen(false);$('#menu').focus();}});
const revealObserver = new IntersectionObserver(entries => entries.forEach(e => {if(e.isIntersecting){e.target.classList.add('in');revealObserver.unobserve(e.target);}}),{threshold:.1});
$$('.reveal').forEach(el => revealObserver.observe(el));
// Original, quiet synthesized interface cues. Audio starts only after the toggle is enabled.
let audio, soundEnabled = false, lastScrollSound = 0;
async function toggleSound() {
 try {
  if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
  await audio.resume();soundEnabled = !soundEnabled;
  $('#sound').setAttribute('aria-pressed',String(soundEnabled));
  $('#sound').setAttribute('aria-label',soundEnabled?'Mute interface sounds':'Enable interface sounds');
  $('.muted-slash').style.display = soundEnabled ? 'none' : '';
  if(soundEnabled)tone('open');
  toast(soundEnabled?'Sound on · gentle scroll, tap and hover cues':'Sound muted');
 } catch(e) {toast('Audio is unavailable in this browser.');}
}
function tone(kind) {
 if(!soundEnabled || !audio || document.hidden) return;
 const time = audio.currentTime, oscillator = audio.createOscillator(), gain = audio.createGain();
 const frequency = {tap:420,hover:650,scroll:145,open:360}[kind] || 420;
 const duration = kind === 'open' ? .22 : kind === 'hover' ? .12 : .055;
 oscillator.type = 'sine';oscillator.frequency.setValueAtTime(frequency,time);
 oscillator.frequency.exponentialRampToValueAtTime(frequency*(kind === 'open' ? 1.5 : .6),time+duration);
 gain.gain.setValueAtTime(.0001,time);gain.gain.exponentialRampToValueAtTime(kind === 'scroll' ? .012 : .035,time+.007);gain.gain.exponentialRampToValueAtTime(.0001,time+duration);
 oscillator.connect(gain);gain.connect(audio.destination);oscillator.start(time);oscillator.stop(time+duration+.01);
}
$('#sound').onclick = toggleSound;
document.addEventListener('click',e => {if(e.target.closest('a,button,summary') && !e.target.closest('#sound'))tone('tap');});
let previousScroll = scrollY;
window.addEventListener('scroll',() => {
 const distance = Math.abs(scrollY - previousScroll);previousScroll = scrollY;
 const max = document.documentElement.scrollHeight-innerHeight;
 $('.progress').style.width = `${max>0?scrollY/max*100:0}%`;
 if(distance>3 && performance.now()-lastScrollSound>170 && !document.querySelector('dialog[open]')){tone('scroll');lastScrollSound=performance.now();}
},{passive:true});
// Portrait rotation and delayed cursor ring.
if(finePointer && !reduced) {
 const dot=$('.cursor-dot'), ring=$('.cursor-ring'), stage=$('#portrait-stage'), area=$('#portrait-area');
 let mouseX=-200,mouseY=-200,ringX=-200,ringY=-200,lastX=-200,lastY=-200,tiltX=0,tiltY=0,targetX=0,targetY=0;
 document.addEventListener('pointermove',e => {
  mouseX=e.clientX;mouseY=e.clientY;
  const r=area.getBoundingClientRect();
  targetX=Math.max(-9,Math.min(9,(mouseY-r.top-r.height/2)/r.height*10));
  targetY=Math.max(-10,Math.min(10,(mouseX-r.left-r.width/2)/r.width*-12));
  ring.classList.toggle('view',!!e.target.closest('.project-cover'));
  ring.classList.toggle('link',!!e.target.closest('a,button,summary') && !e.target.closest('.project-cover'));
 },{passive:true});
 document.addEventListener('mouseleave',()=>{mouseX=-200;mouseY=-200;targetX=0;targetY=0;});
 function frame() {
  ringX+=(mouseX-ringX)*.13;ringY+=(mouseY-ringY)*.13;
  const dx=mouseX-lastX,dy=mouseY-lastY,speed=Math.min(Math.hypot(dx,dy),35),angle=Math.atan2(dy,dx)*180/Math.PI;
  dot.style.transform=`translate(${mouseX-2.5}px,${mouseY-2.5}px)`;
  ring.style.transform=`translate(${ringX-ring.offsetWidth/2}px,${ringY-ring.offsetHeight/2}px) rotate(${angle}deg) scale(${1+speed*.009},${1-speed*.005}) rotate(${-angle}deg)`;
  lastX+=(mouseX-lastX)*.2;lastY+=(mouseY-lastY)*.2;
  tiltX+=(targetX-tiltX)*.06;tiltY+=(targetY-tiltY)*.06;
  stage.style.transform=`rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
  requestAnimationFrame(frame);
 }
 requestAnimationFrame(frame);
 // The inner element moves so its layout and hit target stay stable.
 $$('.hero-actions .button,.header-cta,.contact .button').forEach(button => {
  button.addEventListener('pointermove', e=>{const r=button.getBoundingClientRect();button.style.translate=`${(e.clientX-r.left-r.width/2)*.12}px ${(e.clientY-r.top-r.height/2)*.15}px`;});
  button.addEventListener('pointerleave',()=>button.style.translate='0 0');
 });
}
// Shared desktop/touch project motion, following the supplied scroll reference.
// Layout bounds stay fixed while the artwork and captions move independently.
let flowCards = [];
let flowFrame = 0;
let flowLastY = scrollY;
let flowLastTime = performance.now();
let flowTargetSpeed = 0;
let flowSpeed = 0;
let flowLastScroll = 0;
function refreshProjectFlow() {
 flowCards = $$('.project-card').map((card, index) => ({
  card,
  motion:$('.project-motion',card),
  cover:$('.project-cover',card),
  label:$('.category',card),
  category:$('.category',card).textContent,
  side:index % 2 ? 1 : -1,
  enteredAt:null
 }));
 scheduleProjectFlow();
}
function scheduleProjectFlow() {
 if (!reduced && !flowFrame) flowFrame = requestAnimationFrame(updateProjectFlow);
}
function updateProjectFlow(now) {
 flowFrame = 0;
 const elapsed = Math.min(64, Math.max(1, now - flowLastTime));
 flowLastTime = now;
 if (now - flowLastScroll > 80) flowTargetSpeed = 0;
 flowSpeed += (flowTargetSpeed - flowSpeed) * (1 - Math.exp(-elapsed / 115));
 const strength = innerWidth <= 760 ? .8 : 1;
 let entering = false;
 flowCards.forEach(item => {
  const {card,motion,cover,label,category,side} = item;
  const rect = card.getBoundingClientRect();
  const visible = rect.bottom > 0 && rect.top < innerHeight;
  if (!visible) {
   item.enteredAt = null;
   label.textContent = category;
   return;
  }
  if (item.enteredAt === null) item.enteredAt = now;
  const age = now - item.enteredAt;
  const progress = Math.min(1,age / 1400);
  const entrance = Math.pow(1 - progress,4);
  const scrollBend = flowSpeed * strength;
  const y = entrance * 34 * strength - scrollBend * 5;
  motion.style.transform = `translate3d(${side * entrance * 42 * strength}px,${y}px,0) rotate(${side * entrance * 2.5 * strength}deg)`;
  cover.style.transform = `perspective(1000px) rotateY(${side * entrance * 6 * strength}deg) rotateX(${scrollBend * 1.8}deg) skewY(${scrollBend * -.65}deg)`;
  const center = (rect.top + rect.height / 2 - innerHeight / 2) / innerHeight;
  motion.style.setProperty('--flow-pan', `${Math.max(-6,Math.min(6,center * -12))}px`);
  motion.style.setProperty('--flow-zoom', String(Math.min(.025,Math.abs(flowSpeed) * .01)));
  // Resolve the label left-to-right as the artwork settles into view.
  const decode = Math.max(0,Math.min(1,(age - 100) / 600));
  if (decode < 1) {
   const resolved = Math.floor(decode * category.length);
   const glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
   label.textContent = category.split('').map((letter,index) => index < resolved || letter === ' ' || letter === '&' ? letter : glyphs[Math.floor(Math.random()*glyphs.length)]).join('');
  } else if (label.textContent !== category) label.textContent = category;
  entering = entering || progress < 1;
 });
 if (entering || Math.abs(flowSpeed-flowTargetSpeed)>.005 || Math.abs(flowSpeed)>.005) scheduleProjectFlow();
}
window.addEventListener('scroll', () => {
 const now = performance.now();
 const elapsed = Math.max(16,now-flowLastScroll);
 flowTargetSpeed = Math.max(-2.5,Math.min(2.5,(scrollY-flowLastY)/elapsed));
 flowLastY = scrollY;
 flowLastScroll = now;
 scheduleProjectFlow();
},{passive:true});
window.addEventListener('resize',scheduleProjectFlow,{passive:true});
window.addEventListener('pageshow',scheduleProjectFlow);
if (document.fonts) document.fonts.ready.then(scheduleProjectFlow);
async function submitEnquiry(event) {
 event.preventDefault();
 const form=event.currentTarget,button=$('button[type="submit"]',form),status=$('#enquiry-status');
 if(button.disabled || !form.reportValidity())return;
 const fallback=$('#enquiry-email-fallback');fallback.hidden=true;
 const data=new FormData(form);
 if(String(data.get('_honey') || '').trim())return;
 const name=String(data.get('name') || '').trim(),email=String(data.get('email') || '').trim(),message=String(data.get('message') || '').trim();
 const projectType=String(data.get('project_type') || '');
 const types=['Logo design','Brand identity','Jersey design','Social media design','Print & packaging','Something else'];
 if(!name || !email || message.length<20 || !types.includes(projectType)){status.dataset.state='error';status.textContent='Please add your name, email, project type, and a brief of at least 20 characters.';return;}
 const emailBody=[`Name: ${name}`,`Email: ${email}`,`Brand / project: ${String(data.get('brand') || '').trim() || 'Not specified'}`,`Project type: ${projectType}`,'',message].join('\n');
 fallback.href=`mailto:iamalauddinshamim1086@gmail.com?subject=${encodeURIComponent('Project enquiry: '+projectType)}&body=${encodeURIComponent(emailBody)}`;
 button.disabled=true;button.textContent='Sending your details…';form.setAttribute('aria-busy','true');status.dataset.state='pending';status.textContent='Sending your project brief…';
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
 try {
  const response=await fetch(cloud.enabled?'/api/enquiries':'https://formsubmit.co/ajax/iamalauddinshamim1086@gmail.com',{
   method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},signal:controller.signal,
   body:JSON.stringify({name,email,brand:String(data.get('brand') || '').trim(),project_type:projectType,message,_subject:`New ${projectType.toLowerCase()} enquiry — Shamim portfolio`,_replyto:email,_template:'table',_honey:'',_url:'https://shamim-design-studio.milkycurry257.chatgpt.site/#contact'})
  });
  const result=await response.json();
  if(cloud.enabled){if(!response.ok||!result.received)throw new Error(result.error||'Your brief could not be saved. Please try again.');form.reset();status.dataset.state='success';status.textContent='Thank you! Your project brief has been received. I’ll reply by email.';return;}
  if(/activat/i.test(String(result.message || '')))throw new Error('Email delivery is being activated. Please use the email or WhatsApp link for now. Your details are still here.');
  if(!response.ok || !(result.success===true || result.success==='true'))throw new Error('Your message could not be confirmed. Please try again, or use the email or WhatsApp link.');
  form.reset();status.dataset.state='success';status.textContent='Thank you! Your project details have been sent. I’ll reply by email.';
 }catch(error){
  status.dataset.state='error';
  fallback.hidden=false;
  status.textContent=error.name==='AbortError' ? 'Delivery has not been confirmed. Please email me directly rather than submitting again straight away.' : ['TypeError','SyntaxError'].includes(error.name) ? 'The email service could not be reached. Your details are still here. Please try again or email me directly.' : error.message || 'Your message could not be sent. Please email me directly.';
 }finally{
  clearTimeout(timeout);button.disabled=false;button.innerHTML='Send project details <span aria-hidden="true">↗</span>';form.setAttribute('aria-busy','false');
 }
}
$('#enquiry-form').addEventListener('submit',submitEnquiry);

function validProjects(list) {
 const categories=['Brand identity','Logo design','Jersey design','Social media','Print & packaging'];
 const safeImage=s=>typeof s==='string' && (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s) || /^assets\/[a-z0-9-]+\.(svg|webp)$/.test(s) || /^\/media\/[a-f0-9]{64}\.(png|jpg|webp)$/.test(s));
 return Array.isArray(list)&&list.length<=100&&list.every(p=>p&&typeof p.id==='string'&&typeof p.title==='string'&&p.title.trim().length>0&&p.title.length<=90&&typeof p.description==='string'&&p.description.trim().length>0&&p.description.length<=1200&&categories.includes(p.category)&&Array.isArray(p.images)&&p.images.length>0&&p.images.length<=6&&p.images.every(safeImage))&&new Set(list.map(p=>p.id)).size===list.length;
}

(async()=>{
 if(cloud.enabled){
  try{
   const response=await fetch('/api/projects',{headers:{Accept:'application/json'}});
   if(!response.ok)throw new Error('Projects are temporarily unavailable.');
   const collection=await response.json();
   if(!validProjects(collection.projects))throw new Error('The shared collection could not be loaded.');
   projects=collection.projects;
  }catch(error){$('#projects').textContent='Projects are temporarily unavailable. Please reload in a moment.';return;}
 }
 renderProjects();
})();
