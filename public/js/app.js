import { fetchText } from './utils.js';

const partials = ['home','bookings','settings','carModal','bookingModal','dayBookingsModal'];

async function loadPartials(){
  let app = document.getElementById('app');
  if(!app){
    app = document.createElement('div');
    app.id = 'app';
    // insert app container before the first .page or at body start
    const firstPage = document.querySelector('.page');
    if(firstPage) document.body.insertBefore(app, firstPage);
    else document.body.insertBefore(app, document.body.firstChild);
  }
  for(const p of partials){
    const html = await fetchText(`/partials/${p}.html`);
    app.insertAdjacentHTML('beforeend', html);
  }
}

// fetch helpers imported from utils

// basic page nav (bottom nav stays in index.html)
function initNav(){
  const pages = document.querySelectorAll('.page');
  document.querySelectorAll('.nav-item').forEach(el=>el.addEventListener('click',()=>{
    document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
    el.classList.add('active');
    const t = el.dataset.target;
    pages.forEach(p=>p.classList.toggle('active', p.id===t));
    // if user clicked 'home', reload the page to ensure fresh data
    if(t === 'home'){
      try{ location.reload(); }catch(e){}
    }
  }));
}

// remaining logic (device registration, push, rendering, modals)
import { initDevice, subscribePush } from './device.js';
import { initHome } from './home.js';
import { initBookings } from './bookings.js';
import { initSettings } from './settings.js';

async function start(){
  // require login: if no passcode token present, redirect to login page
  if(location.pathname !== '/login.html' && !localStorage.getItem('passcode_token')){
    location.href = '/login.html';
    return;
  }
  await loadPartials();
  initNav();
  await initDevice();
  subscribePush();
  initHome();
  initBookings();
  initSettings();

  // WebSocket realtime updates
  (function setupWS(){
    let backoff = 1000;
    function connect(){
      try{
        const ws = new WebSocket((location.protocol==='https:'? 'wss':'ws')+'://'+location.host);
        ws.addEventListener('open', ()=>{ backoff = 1000; console.log('WS open'); });
        ws.addEventListener('message', (ev)=>{
          try{
            const msg = JSON.parse(ev.data);
            if(msg.type === 'booking_created'){
              window.dispatchEvent(new CustomEvent('booking:created', { detail: msg.booking }));
            }
          }catch(e){}
        });
        ws.addEventListener('close', ()=>{ console.log('WS closed, reconnecting in', backoff); setTimeout(connect, backoff); backoff = Math.min(30000, backoff * 1.5); });
        ws.addEventListener('error', ()=>{ ws.close(); });
      }catch(e){ setTimeout(connect, backoff); backoff = Math.min(30000, backoff * 1.5); }
    }
    connect();
  })();

  // Inactivity auto-reload: reload if no user activity for 2 minutes
  (function inactivityReload(){
    let lastActivity = Date.now();
    const reset = ()=>{ lastActivity = Date.now(); };
    ['mousemove','keydown','touchstart','click'].forEach(ev => window.addEventListener(ev, reset, {passive:true}));
    document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) reset(); });
    let reloadWarningHandle = null;
    function showReloadWarning(seconds){
      // create or reuse notification element
      let el = document.getElementById('reloadWarning');
      if(!el){
        el = document.createElement('div'); el.id = 'reloadWarning';
        el.style.position = 'fixed'; el.style.left = '50%'; el.style.top = '12px'; el.style.transform = 'translateX(-50%)';
        el.style.background = 'rgba(0,0,0,0.85)'; el.style.color = '#fff'; el.style.padding = '10px 14px'; el.style.borderRadius = '8px';
        el.style.zIndex = 9999; el.style.fontSize = '13px'; el.style.boxShadow = '0 6px 18px rgba(0,0,0,0.2)';
        const txt = document.createElement('span'); txt.id = 'reloadWarningText'; el.appendChild(txt);
        const btn = document.createElement('button'); btn.textContent = 'Annulla'; btn.style.marginLeft = '10px'; btn.className = 'page-btn'; btn.addEventListener('click', ()=>{ cancelReloadWarning(); });
        el.appendChild(btn);
        document.body.appendChild(el);
      }
      const text = document.getElementById('reloadWarningText');
      let secs = seconds;
      text.textContent = `Ricarico fra ${secs} secondi per inattività...`;
      let interval = setInterval(()=>{
        secs -= 1; if(secs <= 0){ clearInterval(interval); removeReloadWarning(); location.reload(); }
        else text.textContent = `Ricarico fra ${secs} secondi per inattività...`;
      }, 1000);
      reloadWarningHandle = { interval };
      // cancel on any activity
      const activityCancel = ()=>{ cancelReloadWarning(); window.removeEventListener('mousemove', activityCancel); window.removeEventListener('keydown', activityCancel); window.removeEventListener('click', activityCancel); window.removeEventListener('touchstart', activityCancel); };
      window.addEventListener('mousemove', activityCancel, {passive:true}); window.addEventListener('keydown', activityCancel, {passive:true}); window.addEventListener('click', activityCancel, {passive:true}); window.addEventListener('touchstart', activityCancel, {passive:true});
    }
    function cancelReloadWarning(){ if(reloadWarningHandle){ clearInterval(reloadWarningHandle.interval); reloadWarningHandle = null; } removeReloadWarning(); }
    function removeReloadWarning(){ const el = document.getElementById('reloadWarning'); if(el && el.parentNode) el.parentNode.removeChild(el); }

    setInterval(()=>{
      try{
        // do not reload if booking modal is open
        const bookingModal = document.getElementById('bookingModal');
        const modalOpen = bookingModal && bookingModal.style && bookingModal.style.display && bookingModal.style.display !== 'none';
        if(modalOpen) return;
        if(Date.now() - lastActivity > 2 * 60 * 1000){
          // show 5s warning then reload
          if(!reloadWarningHandle) showReloadWarning(5);
        }
      }catch(e){/* ignore */}
    }, 10 * 1000);
  })();

  // Every 10s check if client has write permission for bookings; if not, request passcode
  (function writePermissionPoll(){
    let modalShown = false;
    function ensureModal(){
      if(document.getElementById('passcodePrompt')) return document.getElementById('passcodePrompt');
      const wrap = document.createElement('div'); wrap.id = 'passcodePrompt';
      wrap.style.position = 'fixed'; wrap.style.left = '0'; wrap.style.top = '0'; wrap.style.right = '0'; wrap.style.bottom = '0'; wrap.style.background = 'rgba(0,0,0,0.45)'; wrap.style.display = 'flex'; wrap.style.alignItems = 'center'; wrap.style.justifyContent = 'center'; wrap.style.zIndex = 10000;
      const box = document.createElement('div'); box.style.background = '#fff'; box.style.padding = '14px'; box.style.borderRadius = '8px'; box.style.minWidth = '320px'; box.style.boxShadow = '0 12px 30px rgba(0,0,0,0.15)';
      box.innerHTML = `<h4 style="margin:0 0 8px 0">Passcode richiesto</h4><div style="margin-bottom:8px">Inserisci la password dell'admin per abilitare modifiche alle prenotazioni.</div>`;
      const input = document.createElement('input'); input.type = 'password'; input.placeholder = 'Password'; input.style.width = '100%'; input.style.padding = '8px'; input.style.marginBottom = '8px'; input.style.boxSizing = 'border-box';
      const actions = document.createElement('div'); actions.style.display='flex'; actions.style.gap='8px'; actions.style.justifyContent='flex-end';
      const cancel = document.createElement('button'); cancel.className='page-btn'; cancel.textContent='Chiudi';
      const submit = document.createElement('button'); submit.className='page-btn primary'; submit.textContent='Invia';
      actions.appendChild(cancel); actions.appendChild(submit);
      box.appendChild(input); box.appendChild(actions); wrap.appendChild(box); document.body.appendChild(wrap);
      cancel.addEventListener('click', ()=>{ wrap.style.display='none'; modalShown=false; });
      submit.addEventListener('click', async ()=>{
        const pw = input.value||'';
        if(!pw) return alert('Inserisci la password');
        try{
          const r = await fetch('/api/login', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ password: pw }) });
          if(!r.ok){ const t = await r.text(); alert('Accesso fallito'); return; }
          const j = await r.json();
          if(j.token) localStorage.setItem('passcode_token', j.token);
          wrap.style.display='none'; modalShown=false;
        }catch(e){ alert('Errore di rete'); }
      });
      return wrap;
    }

    async function check(){
      try{
        const token = localStorage.getItem('passcode_token');
        const res = await fetch('/api/auth/can_write', { headers: token ? { Authorization: 'Bearer '+token } : {} });
        if(res.ok){ /* has write permission */ if(modalShown){ const el = document.getElementById('passcodePrompt'); if(el) el.style.display='none'; modalShown = false; } return; }
        // not allowed -> ask for password
        if(!modalShown){ const m = ensureModal(); m.style.display='flex'; modalShown = true; }
      }catch(e){ /* network error - don't spam modal */ }
    }
    check(); setInterval(check, 10 * 1000);
  })();
}

start().catch(err=>{ console.error('App start error', err); alert('Failed to start app: '+err.message); });
