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
    setInterval(()=>{
      if(Date.now() - lastActivity > 2 * 60 * 1000){
        console.log('Inactivity >2min, reloading');
        location.reload();
      }
    }, 10 * 1000);
  })();
}

start().catch(err=>{ console.error('App start error', err); alert('Failed to start app: '+err.message); });
