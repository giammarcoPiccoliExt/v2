import { fetchJson } from './utils.js';

export function initSummary(){
  const el = document.getElementById('summary');
  if(!el) return;
  const content = document.getElementById('summaryContent');
  async function render(){
    try{
      const bookings = await fetchJson('/api/bookings');
      const myName = localStorage.getItem('passcode_name') || '';
      const mine = bookings.filter(b=> b.client_name === myName || b.creator_name === myName);
      if(mine.length===0){ content.innerHTML = '<div>Nessuna prenotazione trovata a tuo nome.</div>'; return; }
      const list = document.createElement('div'); list.className='summary-list';
      mine.forEach(b=>{
        const d = document.createElement('div'); d.className='card';
        d.innerHTML = `<div class="card-row"><div><strong>${b.title || b.client_name || 'Prenotazione'}</strong><div class="card-meta"><div class="dates">${b.start_iso.slice(0,10)} → ${b.end_iso.slice(0,10)}</div></div></div><div class="card-actions"></div></div>`;
        list.appendChild(d);
      });
      content.innerHTML = ''; content.appendChild(list);
    }catch(e){ content.innerHTML = '<div>Errore nel caricare il riepilogo.</div>'; }
  }
  render();
  // refresh on realtime booking events
  window.addEventListener('booking:created', render);
  window.addEventListener('booking:deleted', render);
}
