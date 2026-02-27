import { fetchJson } from './utils.js';

export function initSummary(){
  const el = document.getElementById('summary');
  if(!el) return;
  const content = document.getElementById('summaryContent');
  async function render(){
    try{
      const bookings = await fetchJson('/api/bookings');
      const cars = await fetchJson('/api/cars');
      const carMap = new Map(cars.map(c=>[c.id, c]));
      const myName = localStorage.getItem('passcode_name') || '';
      // fetch archived bookings for this user from server
      let archived = [];
      try{ archived = await fetchJson('/api/bookings/archive?name=' + encodeURIComponent(myName)); }catch(e){ archived = []; }
      // include bookings that are either created by / for me, or archived bookings that refer to me
      const mineCurrent = bookings.filter(b=> b.client_name === myName || b.creator_name === myName).map(b=> Object.assign({}, b, { deleted: false }));
      const mineDeleted = archived.map(b=> Object.assign({}, b, { deleted: true }));
      const merged = mineCurrent.concat(mineDeleted);
      if(merged.length===0){ content.innerHTML = '<div>Nessuna prenotazione trovata a tuo nome.</div>'; return; }
      // sort by relevant timestamp (deleted_at if present, otherwise start_iso) descending (newest first)
      merged.sort((a,b)=>{
        const ta = (a.deleted && a.deleted_at) ? a.deleted_at : (a.start_iso || a.end_iso || '');
        const tb = (b.deleted && b.deleted_at) ? b.deleted_at : (b.start_iso || b.end_iso || '');
        return (tb.localeCompare(ta));
      });

      const list = document.createElement('div'); list.className='summary-list';
      merged.forEach(b=>{
        const d = document.createElement('div'); d.className='card';
        if(b.deleted) d.style.opacity = '0.85';
        // mirror the same info as the edit modal: "nome auto - cliente", plate, dates, creator, description
        const title = b.title || b.client_name || 'Prenotazione';
        const carObj = carMap.get(b.car_id) || {};
        const carName = carObj.name || '';
        const carLine = carName ? (carName + (b.client_name ? (' - ' + b.client_name) : '')) : (b.client_name || title);
        const plate = carObj.plate || '';
        const dates = `${(b.start_iso||'').slice(0,10)} → ${(b.end_iso||'').slice(0,10)}`;
        const creator = b.creator_name ? ('Creato da: ' + b.creator_name) : '';
        d.innerHTML = `<div class="card-row"><div class="card-meta"><div class="title">${carLine}</div><div class="car-plate">${plate}</div><div class="dates">${dates}${b.deleted?(' <span style="color:#900;">(Eliminata)</span>'):''}</div><div class="creator">${creator}</div></div><div class="card-actions"></div></div><div class="card-desc">${b.description||''}</div>`;
        list.appendChild(d);
      });
      content.innerHTML = ''; content.appendChild(list);
    }catch(e){ content.innerHTML = '<div>Errore nel caricare il riepilogo.</div>'; }
  }
  render();
  // refresh on realtime booking events
  window.addEventListener('booking:created', render);
  window.addEventListener('booking:deleted', (ev)=>{ render(); });
}
