import { fetchJson, fetchRaw } from './utils.js';

export function initBookings(){
  const newBookingBtn = document.getElementById('newBookingBtnBookings');
  const legend = document.getElementById('machinesLegend');
  const monthView = document.getElementById('monthView');
  const FILTER_KEY = 'car_size_filter';
  const sizes = ['all','piccola','media','grande','soccorso'];
  const sizeLabels = { all:'Tutti', piccola:'Piccola', media:'Media', grande:'Grande', soccorso:'Soccorso' };
  function getSavedFilter(){ return localStorage.getItem(FILTER_KEY) || 'all'; }
  function saveFilter(v){ localStorage.setItem(FILTER_KEY, v); }
  let sizeFilter = getSavedFilter();
  // filter button: prefer the sidebar placement if available
  let filterBtn = document.getElementById('filterSizeBtn');
  if(!filterBtn){
    filterBtn = document.createElement('button'); filterBtn.id = 'filterSizeBtn'; filterBtn.className='page-btn';
    const sidebar = document.querySelector('.sidebar');
    if(sidebar) sidebar.insertBefore(filterBtn, sidebar.firstChild);
    else if(legend && legend.parentNode) legend.parentNode.insertBefore(filterBtn, legend);
    else if(monthView && monthView.parentNode) monthView.parentNode.insertBefore(filterBtn, monthView);
    else document.body.insertBefore(filterBtn, document.body.firstChild);
  } else {
    // ensure filter lives inside sidebar when present
    const sidebar = document.querySelector('.sidebar'); if(sidebar && filterBtn.parentNode !== sidebar) sidebar.insertBefore(filterBtn, sidebar.firstChild);
  }
  function updateFilterBtn(){ filterBtn.textContent = sizeFilter && sizeFilter !== 'all' ? `Filtra: ${sizeLabels[sizeFilter]||sizeFilter}` : 'Filtra: Tutti'; }
  updateFilterBtn();
  filterBtn.addEventListener('click', ()=>{ const idx = sizes.indexOf(sizeFilter||'all'); const next = (idx<0 || idx===sizes.length-1)?0:idx+1; sizeFilter = sizes[next]; saveFilter(sizeFilter); updateFilterBtn(); window.dispatchEvent(new CustomEvent('car:filterChanged', { detail: sizeFilter })); render(); });

  function startOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
  function daysInMonth(d){ return new Date(d.getFullYear(), d.getMonth()+1, 0).getDate(); }

  async function render(){
    let cars = await fetchJson('/api/cars');
    const bookings = await fetchJson('/api/bookings');
    if(sizeFilter && sizeFilter !== 'all') cars = cars.filter(c=> (c.size||'') === sizeFilter);

    // legend
    legend.innerHTML = '';
    cars.forEach(c=>{
      const el = document.createElement('div'); el.className='car-card';
      const sw = document.createElement('div'); sw.className = 'color-swatch'; if(c.color) sw.style.background = c.color || '#ddd';
      const info = document.createElement('div'); info.className = 'car-info';
      const nameEl = document.createElement('strong'); nameEl.textContent = c.name;
      const plateEl = document.createElement('div'); plateEl.className = 'car-plate'; plateEl.textContent = c.plate || '';
      info.appendChild(nameEl); info.appendChild(plateEl);
      el.appendChild(sw); el.appendChild(info);
      legend.appendChild(el);
    });

    // render months: previous 1, current, next 3 => total 5 months
    monthView.innerHTML = '';
    const base = new Date();
    const months = [];
    for(let offset=-1; offset<=3; offset++) months.push(new Date(base.getFullYear(), base.getMonth()+offset, 1));

    months.forEach(monthStart=>{
      const monthWrap = document.createElement('div'); monthWrap.className = 'month-wrap';
      const title = document.createElement('div'); title.className = 'month-title'; title.textContent = monthStart.toLocaleString(undefined, { month: 'long', year: 'numeric' });
      monthWrap.appendChild(title);

      const grid = document.createElement('div'); grid.className = 'month-grid';
      // week day headers (Italian)
      const weekDays = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];
      weekDays.forEach(w=>{ const h = document.createElement('div'); h.className = 'weekday-header'; h.textContent = w; grid.appendChild(h); });

      const firstWeekday = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1).getDay();
      const days = new Date(monthStart.getFullYear(), monthStart.getMonth()+1, 0).getDate();
      // empty cells before first
      for(let i=0;i<firstWeekday;i++){ const e = document.createElement('div'); e.className='day-cell'; grid.appendChild(e); }

      for(let d=1; d<=days; d++){
        const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), d);
        const dateKey = date.toISOString().slice(0,10);
        const cell = document.createElement('div'); cell.className='day-cell';
        const dayLabel = document.createElement('div'); dayLabel.className = 'day-label'; dayLabel.textContent = d;
        cell.appendChild(dayLabel);

        // find bookings for that date
        // only include bookings for visible cars (apply size filter)
        const visibleCarIds = new Set(cars.map(c=>c.id));
        const dayBookings = bookings.filter(bk=> bk.start_iso.slice(0,10) <= dateKey && bk.end_iso.slice(0,10) >= dateKey && visibleCarIds.has(bk.car_id));
        if(dayBookings.length){
          if(dayBookings.length > 3){
            const more = document.createElement('div'); more.className = 'more-indicator'; more.textContent = '+';
            more.title = `${dayBookings.length} prenotazioni`;
            cell.appendChild(more);
          } else {
            const dots = document.createElement('div'); dots.className = 'dots';
            dayBookings.slice(0,4).forEach(bk=>{
              const car = cars.find(c=>c.id===bk.car_id);
              const dot = document.createElement('span'); dot.style.background = car?.color || '#999';
              dot.title = (car?car.name:'') + (bk.client_name?(' - '+bk.client_name):(bk.title?(' - '+bk.title):''));
              dots.appendChild(dot);
            });
            cell.appendChild(dots);
          }
        }

        // highlight today
        const todayIso = new Date().toISOString().slice(0,10);
        if(dateKey === todayIso) cell.classList.add('today');

        // click to open day bookings modal
        cell.classList.add('clickable');
        cell.addEventListener('click', ()=>{ openDayBookings(dateKey, cars, bookings); });
        grid.appendChild(cell);
      }

      monthWrap.appendChild(grid);
      monthView.appendChild(monthWrap);
    });
    // after rendering months, scroll calendar-wrapper to current month
    try{
      const today = new Date();
      const curKey = `${today.getMonth()}-${today.getFullYear()}`;
      const monthWraps = Array.from(monthView.querySelectorAll('.month-wrap'));
      let target = null;
      monthWraps.forEach(mw=>{
        const title = mw.querySelector('.month-title');
        if(!title) return;
        const parts = title.textContent.trim().split(' ');
        const monthName = parts[0];
        const year = parts[parts.length-1];
        const dt = new Date(`${monthName} 1, ${year}`);
        if(dt.getMonth() === today.getMonth() && dt.getFullYear() === today.getFullYear()) target = mw;
      });
      const wrapper = document.querySelector('.calendar-wrapper');
      if(target && wrapper){
        const top = target.offsetTop;
        const scrollTo = Math.max(0, Math.round(top - (wrapper.clientHeight/2) + (target.clientHeight/2)));
        wrapper.scrollTop = scrollTo;
      }
    }catch(e){}
  }

  newBookingBtn?.addEventListener('click', ()=>{
    // reuse booking modal if present; set today's date as placeholder/default for date inputs
    const modal = document.getElementById('bookingModal');
    if(modal){
      try{
        const startInput = modal.querySelector('input[name="start_date"]');
        const endInput = modal.querySelector('input[name="end_date"]');
        const select = modal.querySelector('select[name="car_id"]');
        const warning = document.getElementById('overlapWarning');
        const today = new Date().toISOString().slice(0,10);
        if(startInput){ startInput.placeholder = today; if(!startInput.value) startInput.value = today; }
        if(endInput){ endInput.placeholder = today; if(!endInput.value) endInput.value = today; }

        async function checkOverlapLocal(){
          if(!select || !startInput || !endInput) return;
          const carId = select.value; const s = startInput.value; const e = endInput.value; if(!carId || !s || !e) return;
          const start_iso = s + 'T00:00:00Z'; const end_iso = e + 'T23:59:59Z';
          try{
            const json = await fetchJson('/api/bookings/check', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ car_id: parseInt(carId), start_iso, end_iso }) });
            if(json.overlap){
              const overlapping = (json.rows || []).filter(r=> !(r.end_iso < start_iso || r.start_iso > end_iso));
              if(overlapping.length){
                warning.innerHTML = '';
                const title = document.createElement('div'); title.textContent = 'Conflitto: le seguenti prenotazioni si sovrappongono:'; title.style.fontWeight='600'; title.style.marginBottom='6px';
                warning.appendChild(title);
                overlapping.forEach(r => {
                  const row = document.createElement('div'); row.style.display='flex'; row.style.justifyContent='space-between'; row.style.alignItems='center'; row.style.gap='8px'; row.style.marginBottom='6px';
                  const txt = document.createElement('div'); txt.textContent = `${(r.client_name||r.title||'Prenotazione')} (${r.start_iso.slice(0,10)} → ${r.end_iso.slice(0,10)})`;
                  const del = document.createElement('button'); del.type='button'; del.className='page-btn del small'; del.textContent='Elimina';
                  del.addEventListener('click', async ()=>{
                    if(!confirm('Eliminare questa prenotazione?')) return;
                    const res = await fetchRaw(`/api/bookings/${r.id}`, { method:'DELETE' });
                    if(res.status===403){ alert('Non autorizzato: effettua il login con un passcode.'); return; }
                    if(!res.ok){ const j = await res.json(); alert('Errore: '+(j.error||res.status)); return; }
                    await render();
                    checkOverlapLocal();
                  });
                  row.appendChild(txt); row.appendChild(del); warning.appendChild(row);
                });
                warning.classList.remove('hidden');
                return;
              }
            }
            warning.classList.add('hidden'); warning.innerHTML='';
          }catch(e){/* ignore */}
        }
        select?.addEventListener('change', checkOverlapLocal);
        startInput?.addEventListener('change', checkOverlapLocal);
        endInput?.addEventListener('change', checkOverlapLocal);
      }catch(e){}
      modal.classList.remove('hidden');
    }
  });

  // day bookings modal open
  function openDayBookings(dateKey, cars, bookings){
    const modal = document.getElementById('dayBookingsModal');
    const title = document.getElementById('dayBookingsTitle');
    const list = document.getElementById('dayBookingsList');
    if(!modal || !list) return;
    title.textContent = 'Prenotazioni per ' + dateKey;
    list.innerHTML = '';
    const visibleCarIds = new Set(cars.map(c=>c.id));
    const dayBookings = bookings.filter(bk=> bk.start_iso.slice(0,10) <= dateKey && bk.end_iso.slice(0,10) >= dateKey && visibleCarIds.has(bk.car_id));
    if(dayBookings.length===0){ list.innerHTML = '<div>Nessuna prenotazione</div>'; }
    dayBookings.forEach(bk=>{
      const car = cars.find(c=>c.id===bk.car_id);
      const card = document.createElement('div'); card.className='card';
      // find creator
      const creatorName = bk.creator_name || 'Utente';
      const clientLabel = bk.client_name || bk.title || '';
        // build card markup without inline styles
        const row = document.createElement('div'); row.className = 'card-row';
        const meta = document.createElement('div'); meta.className = 'card-meta';
        // title: "nome auto - cliente"
        const titleDiv = document.createElement('div'); titleDiv.className = 'title';
        if(car){ titleDiv.textContent = car.name + (clientLabel ? (' - ' + clientLabel) : ''); }
        else { titleDiv.textContent = clientLabel || '?'; }
        // plate/targa on its own line
        const plateDiv = document.createElement('div'); plateDiv.className = 'car-plate'; plateDiv.textContent = car ? (car.plate || car.targa || '') : '';
        const datesDiv = document.createElement('div'); datesDiv.className = 'dates'; datesDiv.textContent = `${bk.start_iso.slice(0,10)} → ${bk.end_iso.slice(0,10)}`;
        const creatorDiv = document.createElement('div'); creatorDiv.className = 'creator'; creatorDiv.textContent = creatorName ? ('Creato da: ' + creatorName) : '';
        meta.appendChild(titleDiv); meta.appendChild(plateDiv); meta.appendChild(datesDiv); meta.appendChild(creatorDiv);
        const actions = document.createElement('div'); actions.className = 'device-actions';
        const editBtn = document.createElement('button'); editBtn.className = 'page-btn editBooking'; editBtn.textContent = 'Modifica';
        const delBtn = document.createElement('button'); delBtn.className = 'page-btn delBooking danger'; delBtn.textContent = 'Elimina';
        actions.appendChild(editBtn); actions.appendChild(delBtn);
        row.appendChild(meta); row.appendChild(actions);
        card.appendChild(row);
        const desc = document.createElement('div'); desc.className = 'card-desc'; desc.innerHTML = bk.description || '';
        card.appendChild(desc);
      editBtn.addEventListener('click', ()=>{ modal.classList.add('hidden'); openEditBooking(bk, cars); });
      delBtn.addEventListener('click', async ()=>{
        if(!confirm('Eliminare la prenotazione?')) return;
        const res = await fetchRaw(`/api/bookings/${bk.id}`, { method:'DELETE' });
        if(res.ok){ alert('Eliminato'); modal.classList.add('hidden'); render(); }
        else{ const j = await res.json(); alert('Errore: '+(j.error||res.status)); }
      });
      list.appendChild(card);
    });
    document.getElementById('dayBookingsClose')?.addEventListener('click', ()=>{ modal.classList.add('hidden'); });
    modal.classList.remove('hidden');
  }

  // open booking modal to edit existing booking
  function openEditBooking(bk, cars){
    const modal = document.getElementById('bookingModal'); if(!modal) return;
    const form = document.getElementById('bookingModalForm');
    form.querySelector('input[name="start_date"]').value = bk.start_iso.slice(0,10);
    form.querySelector('input[name="end_date"]').value = bk.end_iso.slice(0,10);
    const sel = form.querySelector('select[name="car_id"]'); sel.innerHTML = '';
    // populate car options
    cars.forEach(c=>{ const o = document.createElement('option'); o.value = c.id; o.textContent = c.name; if(c.id===bk.car_id) o.selected=true; sel.appendChild(o); });
    form.querySelector('input[name="client_name"]').value = bk.client_name || '';
    form.querySelector('input[name="description"]').value = bk.description || '';
    // set submit handler to PUT
    const onSubmit = async (e)=>{
      e.preventDefault();
      const data = new FormData(form); const body = Object.fromEntries(data.entries());
      const payload = { car_id: parseInt(body.car_id), start_iso: body.start_date+'T00:00:00Z', end_iso: body.end_date+'T23:59:59Z', title: body.description || body.client_name || 'Prenotazione', client_name: body.client_name || null, description: body.description || null };
      const res = await fetchRaw(`/api/bookings/${bk.id}`, { method:'PUT', headers:{'content-type':'application/json'}, body: JSON.stringify(payload) });
      if(res.ok){ alert('Aggiornato'); modal.classList.add('hidden'); render(); form.removeEventListener('submit', onSubmit); }
      else{ const j = await res.json(); alert('Errore: '+(j.error||res.status)); }
    };
    form.addEventListener('submit', onSubmit);
    const bookingCancelBtn = document.getElementById('bookingCancelBtn');
    if(bookingCancelBtn) bookingCancelBtn.onclick = ()=>{ form.removeEventListener('submit', onSubmit); document.getElementById('bookingModal').classList.add('hidden'); };
    // ensure day selection modal is hidden and bring edit modal to foreground
    document.getElementById('dayBookingsModal')?.classList.add('hidden');
    modal.style.zIndex = 2000;
    modal.classList.remove('hidden');
  }

  // refresh on realtime booking events
  window.addEventListener('booking:created', ()=>{ render(); });

  render();
}
