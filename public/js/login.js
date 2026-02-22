import { fetchJson } from './utils.js';

document.addEventListener('DOMContentLoaded', ()=>{
  const pwd = document.getElementById('pwd');
  const loginBtn = document.getElementById('loginBtn');
  const saveBtn = document.getElementById('saveBtn');
  const msg = document.getElementById('msg');

  // autofill from saved
  const saved = localStorage.getItem('saved_passcode');
  if(saved) pwd.value = saved;

  loginBtn.addEventListener('click', async ()=>{
    msg.textContent = '';
    try{
      const p = pwd.value || '';
      const res = await fetchJson('/api/login', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ password: p }) });
      // store token
      localStorage.setItem('passcode_token', res.token);
      localStorage.setItem('passcode_name', res.name || '');
      // redirect to home
      window.location.href = '/';
    }catch(e){ msg.textContent = 'Accesso fallito'; }
  });

  saveBtn.addEventListener('click', ()=>{
    const p = pwd.value || '';
    if(!p) { msg.textContent = 'Inserisci password da salvare'; return; }
    try{
      localStorage.setItem('saved_passcode', p);
      msg.style.color = '#070';
      msg.textContent = 'Password salvata localmente';
      setTimeout(()=>{ msg.textContent=''; msg.style.color='#b00'; }, 2500);
    }catch(e){
      msg.textContent = 'Salvataggio fallito: ' + (e && e.message ? e.message : String(e));
    }
  });
});
