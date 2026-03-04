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
      cars.forEach(c=>{
        let label = (c.modello || '');
        if(c.descrizione) label += ' ' + c.descrizione;
        if(c.plate) label += ' (' + c.plate + ')';
        const o = document.createElement('option'); o.value = c.id; o.textContent = label; carSelect.appendChild(o);
      });

      // container for list
      const list = document.createElement('div'); list.className='summary-list';

      // helper to convert hex color to rgba with given alpha
      function hexToRgba(hex, alpha){
        if(!hex) return null;
        // normalize
        hex = String(hex).replace('#','').trim();
        if(hex.length===3) hex = hex.split('').map(c=>c+c).join('');
        const int = parseInt(hex,16);
        if(isNaN(int)) return null;
        const r = (int>>16)&255, g = (int>>8)&255, b = int&255;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      }

      function renderList(items){
        list.innerHTML = '';
        const todayIso = localISO(new Date());
        items.forEach(b=>{
          const carObj = carMap.get(b.car_id) || {};
          const plate = carObj.plate || '';
          const startIso = (b.start_iso||'').slice(0,10);
          const endIso = (b.end_iso||'').slice(0,10);
          const startLabel = b.start_iso ? new Date(b.start_iso).toLocaleDateString('it') : '';
          const endLabel = b.end_iso ? new Date(b.end_iso).toLocaleDateString('it') : '';

          // determine status and color
          let statusLabel = '';
          let statusColor = '';
          if(b.deleted){ statusLabel = 'Eliminata'; statusColor = '#900'; }
          else {
            if(startIso <= todayIso && endIso >= todayIso){ statusLabel = 'In corso'; statusColor = '#2ea44f'; }
            else if(endIso < todayIso){ statusLabel = 'Passato'; statusColor = '#ff8c00'; }
            else if(startIso > todayIso){ statusLabel = 'Futuro'; statusColor = '#0a66ff'; }
          }

          // outer card (rectangle) uses translucent statusColor as background
          const d = document.createElement('div'); d.className = 'summary-rect';
          if(statusColor){ const bg = hexToRgba(statusColor, 0.12) || hexToRgba(statusColor.replace('#',''),0.12); if(bg) d.style.background = bg; }
          if(b.deleted) d.style.opacity = '0.9';
          d.style.padding = '10px'; d.style.marginBottom = '8px'; d.style.borderRadius = '6px'; d.style.display = 'flex'; d.style.alignItems = 'flex-start'; d.style.gap = '12px';

          // left: car card (name + plate) and creator underneath
          const left = document.createElement('div'); left.className = 'summary-car'; left.style.minWidth='120px'; left.style.maxWidth='220px'; left.style.flex='0 0 180px'; left.style.display='flex'; left.style.flexDirection='column'; left.style.gap='6px';
          const carInfo = document.createElement('div'); carInfo.style.display='flex'; carInfo.style.flexDirection='column';
          const carNameEl = document.createElement('div');
          let label = (carObj.modello || '');
          if(carObj.descrizione) label += ' ' + carObj.descrizione;
          carNameEl.textContent = label || 'Auto';
          carNameEl.style.fontWeight='700'; carNameEl.style.fontSize='1em';
          const plateEl = document.createElement('div'); plateEl.textContent = plate; plateEl.style.fontSize='0.85em'; plateEl.style.color='#666';
          carInfo.appendChild(carNameEl); carInfo.appendChild(plateEl);
          left.appendChild(carInfo);
          const creatorUnder = document.createElement('div'); creatorUnder.style.fontSize='0.9em'; creatorUnder.style.color='#444'; creatorUnder.style.marginTop='6px'; creatorUnder.textContent = b.creator_name ? ('Creato da: ' + b.creator_name) : '';
          left.appendChild(creatorUnder);

          // right: main content
          const right = document.createElement('div'); right.style.flex='1'; right.style.display='flex'; right.style.flexDirection='column';
          // top area: client name above dates (two lines)
          const top = document.createElement('div'); top.style.display='flex'; top.style.flexDirection='column'; top.style.alignItems='flex-start';
          const clientName = document.createElement('div'); clientName.textContent = b.client_name || b.title || 'Cliente'; clientName.style.fontSize='1.05em'; clientName.style.fontWeight='700'; clientName.style.marginBottom='4px';
          const dates = document.createElement('div'); dates.innerHTML = `<div style="font-size:0.95em;color:#333">${startLabel}<br>${endLabel}</div>`;
          top.appendChild(clientName); top.appendChild(dates);

          // bottom area: status on the right
          const bottom = document.createElement('div'); bottom.style.display='flex'; bottom.style.justifyContent='flex-end'; bottom.style.alignItems='center'; bottom.style.marginTop='8px';
          const status = document.createElement('div'); status.textContent = statusLabel; status.style.fontWeight='700'; status.style.color = statusColor || '#000';
          bottom.appendChild(status);

          // optional description below top area
          if(b.description){ const desc = document.createElement('div'); desc.textContent = b.description; desc.style.marginTop='8px'; desc.style.color='#333'; desc.style.fontSize='0.95em'; right.appendChild(top); right.appendChild(desc); right.appendChild(bottom); }
          else { right.appendChild(top); right.appendChild(bottom); }

          d.appendChild(left); d.appendChild(right);
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
