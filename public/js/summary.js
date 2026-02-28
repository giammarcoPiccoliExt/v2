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
      // show ALL bookings to every user: include live + archived
      const myName = localStorage.getItem('passcode_name') || '';
      let archived = [];
      try{ archived = await fetchJson('/api/bookings/archive'); }catch(e){ archived = []; }
      const currentAll = bookings.map(b=> Object.assign({}, b, { deleted: false }));
      const archivedAll = archived.map(b=> Object.assign({}, b, { deleted: true }));
      const merged = currentAll.concat(archivedAll);
      // debug info
      try{ console.log('summary: bookings=', bookings.length, 'archived=', archived.length, 'merged=', merged.length); }catch(e){}
      if(merged.length===0){ content.innerHTML = '<div>Nessuna prenotazione trovata.</div>'; return; }

      // helper per local-ISO date string
      const localISO = (dt)=>{ const d = dt ? new Date(dt) : new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
      // sort by relevant timestamp (deleted_at if present, otherwise start_iso) descending (newest first)
      merged.sort((a,b)=>{
        const ta = (a.deleted && a.deleted_at) ? a.deleted_at : (a.start_iso || a.end_iso || '');
        const tb = (b.deleted && b.deleted_at) ? b.deleted_at : (b.start_iso || b.end_iso || '');
        return (tb.localeCompare(ta));
      });

      // build filter UI (include status filter and small placeholders for date inputs)
      const filters = document.createElement('div'); filters.className = 'summary-filters';
      filters.innerHTML = `
        <label style="display:inline-block;margin-right:6px">Data inizio<br><input type="date" id="filterStart" title="Data inizio (gg/mm/aaaa)"></label>
        <label style="display:inline-block;margin-right:6px">Data fine<br><input type="date" id="filterEnd" title="Data fine (gg/mm/aaaa)"></label>
        <label style="display:inline-block;margin-right:6px">Stato<br>
          <select id="filterStatus">
            <option value="">Tutti</option>
            <option value="in_progress">In corso</option>
            <option value="past">Passato</option>
            <option value="future">Futuro</option>
            <option value="deleted">Eliminata</option>
          </select>
        </label>
        <label style="display:inline-block;margin-right:6px">Auto<br><select id="filterCar"><option value="">Tutte le auto</option></select></label>
        <button id="applyFilters" class="page-btn">Applica</button>
        <button id="resetFilters" class="page-btn secondary">Reset</button>`;
      // populate car select
      const carSelect = filters.querySelector('#filterCar');
      cars.forEach(c=>{ const o = document.createElement('option'); o.value = c.id; o.textContent = `${c.name} ${c.plate?('('+c.plate+')'):''}`; carSelect.appendChild(o); });

      // container for list
      const list = document.createElement('div'); list.className='summary-list';

      function renderList(items){
        list.innerHTML = '';
        const todayIso = localISO(new Date());
        items.forEach(b=>{
          const d = document.createElement('div'); d.className='card';
          if(b.deleted) d.style.opacity = '0.85';
          const title = b.title || b.client_name || 'Prenotazione';
          const carObj = carMap.get(b.car_id) || {};
          const carName = carObj.name || '';
          const carLine = carName ? (carName + (b.client_name ? (' - ' + b.client_name) : '')) : (b.client_name || title);
          const plate = carObj.plate || '';
          const startIso = (b.start_iso||'').slice(0,10);
          const endIso = (b.end_iso||'').slice(0,10);
          const startLabel = b.start_iso ? new Date(b.start_iso).toLocaleDateString('it') : '';
          const endLabel = b.end_iso ? new Date(b.end_iso).toLocaleDateString('it') : '';

          // status: deleted overrides others
          let statusLabel = '';
          let statusColor = '';
          if(b.deleted){ statusLabel = 'Eliminata'; statusColor = '#900'; }
          else {
            if(startIso <= todayIso && endIso >= todayIso){ statusLabel = 'In corso'; statusColor = '#2ea44f'; }
            else if(endIso < todayIso){ statusLabel = 'Passato'; statusColor = '#ff8c00'; }
            else if(startIso > todayIso){ statusLabel = 'Futuro'; statusColor = '#0a66ff'; }
          }

          const creator = b.creator_name ? ('Creato da: ' + b.creator_name) : '';
          const statusHtml = statusLabel ? (` <span class="status-badge" style="color:${statusColor}; font-weight:600; margin-left:8px">(${statusLabel})</span>`) : '';
          d.innerHTML = `<div class="card-row"><div class="card-meta"><div class="title">${carLine}</div><div class="car-plate">${plate}</div><div class="dates">${startLabel} → ${endLabel}${statusHtml}</div><div class="creator">${creator}</div></div><div class="card-actions"></div></div><div class="card-desc">${b.description||''}</div>`;
          list.appendChild(d);
        });
      }

      // initial render with full merged set
      content.innerHTML = '';
      content.appendChild(filters);
      content.appendChild(list);
      renderList(merged);

      // filter behavior
      const applyBtn = filters.querySelector('#applyFilters');
      const resetBtn = filters.querySelector('#resetFilters');
      applyBtn.addEventListener('click', ()=>{
        const fs = filters.querySelector('#filterStart').value; const fe = filters.querySelector('#filterEnd').value; const fc = filters.querySelector('#filterCar').value; const fstatus = filters.querySelector('#filterStatus').value;
        const todayIso = localISO(new Date());
        const filtered = merged.filter(b=>{
          // car filter
          if(fc && String(b.car_id) !== String(fc)) return false;
          // date range filter
          if(fs || fe){
            const s = (b.start_iso||'').slice(0,10); const e = (b.end_iso||'').slice(0,10);
            if(fs && fe){ if(e < fs || s > fe) return false; }
            else if(fs){ if(e < fs) return false; }
            else if(fe){ if(s > fe) return false; }
          }
          // status filter
          if(fstatus){
            let status = '';
            if(b.deleted) status = 'deleted';
            else if((b.start_iso||'').slice(0,10) <= todayIso && (b.end_iso||'').slice(0,10) >= todayIso) status = 'in_progress';
            else if((b.end_iso||'').slice(0,10) < todayIso) status = 'past';
            else if((b.start_iso||'').slice(0,10) > todayIso) status = 'future';
            if(status !== fstatus) return false;
          }
          return true;
        });
        renderList(filtered);
      });
      resetBtn.addEventListener('click', ()=>{ filters.querySelector('#filterStart').value=''; filters.querySelector('#filterEnd').value=''; filters.querySelector('#filterCar').value=''; renderList(merged); });
    }catch(e){ content.innerHTML = '<div>Errore nel caricare il riepilogo.</div>'; }
  }
  render();
  // refresh on realtime booking events
  window.addEventListener('booking:created', render);
  window.addEventListener('booking:deleted', (ev)=>{ render(); });
}
