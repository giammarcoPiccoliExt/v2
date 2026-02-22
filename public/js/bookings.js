import { fetchJson, fetchRaw } from './utils.js';

export function initBookings(){
  const newBookingBtn = document.getElementById('newBookingBtnBookings');
  const legend = document.getElementById('machinesLegend');
  const monthView = document.getElementById('monthView');
  const FILTER_KEY = 'car_size_filter';
  const sizes = ['all','mini','normal','big'];
  const sizeLabels = { all:'Tutti', mini:'mini', normal:'normale', big:'grande' };
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
      el.innerHTML = `<div class="color-swatch" style="background:${c.color||'#ddd'}"></div><div class="car-info"><strong>${c.name}</strong><div style="font-size:12px;color:#666">${c.plate||''}</div></div>`;
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
      weekDays.forEach(w=>{ const h = document.createElement('div'); h.style.textAlign='center'; h.style.fontSize='11px'; h.style.color='#666'; h.textContent = w; grid.appendChild(h); });

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
        cell.style.cursor = 'pointer';
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
    // reuse booking modal if present
    const modal = document.getElementById('bookingModal'); if(modal) modal.style.display='flex';
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
        card.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><div><div style="font-weight:600;font-size:14px">${clientLabel?('- '+clientLabel):car?car.name:'?'} </div><div style="font-size:12px;color:#666">${bk.start_iso.slice(0,10)} → ${bk.end_iso.slice(0,10)}</div><div style="font-size:11px;color:#333;margin-top:4px">${creatorName}</div></div><div style="display:flex;gap:6px"><button class="page-btn editBooking">Modifica</button><button class="page-btn delBooking" style="color:#900">Elimina</button></div></div><div style="margin-top:6px">${bk.description||''}</div>`;
      const editBtn = card.querySelector('.editBooking');
      const delBtn = card.querySelector('.delBooking');
      editBtn.addEventListener('click', ()=>{ openEditBooking(bk, cars); });
      delBtn.addEventListener('click', async ()=>{
        if(!confirm('Eliminare la prenotazione?')) return;
        const res = await fetchRaw(`/api/bookings/${bk.id}`, { method:'DELETE' });
        if(res.ok){ alert('Eliminato'); modal.style.display='none'; render(); }
        else{ const j = await res.json(); alert('Errore: '+(j.error||res.status)); }
      });
      list.appendChild(card);
    });
    document.getElementById('dayBookingsClose')?.addEventListener('click', ()=>{ modal.style.display='none'; });
    modal.style.display='flex';
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
      if(res.ok){ alert('Aggiornato'); modal.style.display='none'; render(); form.removeEventListener('submit', onSubmit); }
      else{ const j = await res.json(); alert('Errore: '+(j.error||res.status)); }
    };
    form.addEventListener('submit', onSubmit);
    document.getElementById('bookingCancelBtn').onclick = ()=>{ form.removeEventListener('submit', onSubmit); document.getElementById('bookingModal').style.display='none'; };
    modal.style.display='flex';
  }

  // refresh on realtime booking events
  window.addEventListener('booking:created', ()=>{ render(); });

  render();
}
