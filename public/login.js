'use strict';
const $=selector=>document.querySelector(selector);
const status=$('#login-status');
let options,busy=false,setupToken=new URLSearchParams(location.hash.slice(1)).get('setup')||'';
if(setupToken)history.replaceState(null,'',location.pathname);
async function request(path,data){
 const response=await fetch(path,{method:data?'POST':'GET',headers:{Accept:'application/json',...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined,credentials:'same-origin'});
 const result=await response.json();if(!response.ok)throw new Error(result.error||'Sign-in is temporarily unavailable.');return result;
}
function message(text,error=false){status.textContent=text;status.dataset.error=String(error);}
function showMethod(method){
 $('#password-login').hidden=method!=='password';$('#otp-login').hidden=method!=='otp';
 $('#password-tab').setAttribute('aria-pressed',String(method==='password'));$('#otp-tab').setAttribute('aria-pressed',String(method==='otp'));
 message(method==='otp'&&!options.otpReady?'Phone OTP is not activated yet. Use username and password.':'');
}
$('#password-tab').onclick=()=>{if(!busy)showMethod('password');};
$('#otp-tab').onclick=()=>{if(!busy)showMethod('otp');};
async function submit(form,action){
 if(busy||!form.reportValidity())return;busy=true;
 const controls=[...document.querySelectorAll('button')];controls.forEach(button=>button.disabled=true);form.setAttribute('aria-busy','true');
 try{message('Checking your details…');await action();location.replace('/admin');}
 catch(error){message(error.message,true);}
 finally{busy=false;controls.forEach(button=>button.disabled=false);$('#send-otp').disabled=!options.otpReady||cooldown>0;$('#otp-check button').disabled=!options.otpReady;form.setAttribute('aria-busy','false');}
}
$('#password-login').onsubmit=event=>{event.preventDefault();submit(event.currentTarget,()=>request('/api/auth/password',{username:$('#admin-username').value,password:$('#admin-password').value}));};
$('#admin-setup').onsubmit=event=>{
 event.preventDefault();
 if($('#setup-password').value!==$('#setup-confirm').value){message('The passwords do not match.',true);return;}
 submit(event.currentTarget,()=>request('/api/auth/setup',{token:setupToken,username:$('#setup-username').value,password:$('#setup-password').value}));
};
let cooldown=0;
setInterval(()=>{if(cooldown>0){cooldown--;$('#send-otp').textContent=cooldown?'Resend in '+cooldown+'s':'Send login code';$('#send-otp').disabled=busy||cooldown>0||!options?.otpReady;}},1000);
$('#send-otp').onclick=async()=>{
 if(busy||cooldown||!options.otpReady)return;busy=true;$('#send-otp').disabled=true;
 try{message('Requesting your code…');const result=await request('/api/auth/otp/send',{});cooldown=result.retryAfter||60;message('The SMS provider accepted your code request. Check your phone.');$('#admin-code').focus();}
 catch(error){message(error.message,true);}finally{busy=false;$('#send-otp').disabled=cooldown>0||!options.otpReady;}
};
$('#otp-check').onsubmit=event=>{event.preventDefault();submit(event.currentTarget,()=>request('/api/auth/otp/check',{code:$('#admin-code').value}));};
(async()=>{
 try{
  options=await request('/api/auth/options');
  const setupPage=location.pathname==='/admin/setup';
  if(setupToken&&options.setupAvailable){
   $('#login-heading').textContent='Make it yours.';$('#login-description').textContent='Set up your private portfolio admin account.';$('#admin-setup').hidden=false;message('');
  }else if(setupPage&&!options.passwordReady){message('Open your private setup link to create the admin account.',true);}
  else{
   $('#login-methods').hidden=false;showMethod(!options.passwordReady&&options.otpReady?'otp':'password');
   $('#password-login button').disabled=!options.passwordReady;
   if(!options.passwordReady&&!options.otpReady)message('Admin setup is not complete. Open your private setup link.',true);
  }
  $('#otp-note').textContent=options.otpReady?'Login codes are sent only to your approved number ending '+options.phoneHint.slice(-4)+'.':'SMS login will be available after the verification provider is connected. Use username and password for now.';
  $('#send-otp').disabled=!options.otpReady;$('#otp-check button').disabled=!options.otpReady;
 }catch(error){message(error.message,true);}
})();
