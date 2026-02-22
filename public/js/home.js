import { fetchJson, fetchRaw } from './utils.js';

export async function initHome(){
  const container = document.getElementById('calendarContainer');
  const carsCol = document.getElementById('carsCol');
  const calendarWrapper = document.querySelector('.calendar-wrapper');
  const newBookingBtn = document.getElementById('newBookingBtnHome');
  const scrollLeftBtn = document.getElementById('scrollLeftBtn');
  const scrollRightBtn = document.getElementById('scrollRightBtn');

  async function fetchCars(){ return fetchJson('/api/cars'); }
  async function fetchBookings(){ return fetchJson('/api/bookings'); }

  function formatDayLabel(date){
    const d = new Date(date);
    return d.toLocaleDateString('it', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function renderCalendar(cars, bookings, startDate){
    container.innerHTML='';
    carsCol.innerHTML='';
    // placeholder to align car cards with calendar header
    const placeholder = document.createElement('div'); placeholder.className = 'car-card header-placeholder'; placeholder.innerHTML = '&nbsp;';
    carsCol.appendChild(placeholder);
    const days = [];
    const PREV_DAYS = 5;
    const FUTURE_DAYS = 30; // show 30 days into the future
    const start = new Date(startDate || new Date());
    // include PREV_DAYS before start
    start.setDate(start.getDate() - PREV_DAYS);
    const total = PREV_DAYS + FUTURE_DAYS + 1; // +1 to include today
    for(let i=0;i<total;i++){ const d=new Date(start); d.setDate(start.getDate()+i); days.push(d); }

    // header row with day labels (calendar only)
      const headerRow = document.createElement('div'); headerRow.className='row';
      const nameCol = document.createElement('div'); nameCol.className='car-name'; headerRow.appendChild(nameCol);
      const daysWrapHeader = document.createElement('div'); daysWrapHeader.style.display='inline-flex';
      const todayIso = new Date().toISOString().slice(0,10);
      days.forEach(day=>{ const c=document.createElement('div'); c.className='cell'; const dk = day.toISOString().slice(0,10); const wk = day.toLocaleDateString('it', { weekday: 'short' }); const dm = day.toLocaleDateString('it', { day: 'numeric', month: 'short' }); c.innerHTML = `<div class="day-week">${wk}</div><div class="day-date">${dm}</div>`; if(dk===todayIso) c.classList.add('today'); daysWrapHeader.appendChild(c); });
      headerRow.appendChild(daysWrapHeader);
      container.appendChild(headerRow);
      // adjust header-placeholder height so car cards align with calendar rows
      try{
        // measure header row after layout and apply same height to placeholder
        setTimeout(()=>{
          const ph = carsCol.querySelector('.header-placeholder');
          if(ph && headerRow){
            const h = headerRow.getBoundingClientRect().height;
            ph.style.height = h + 'px';
            ph.style.minHeight = h + 'px';
          }
        }, 20);
      }catch(e){}

    cars.forEach(car=>{
      // left column card
      const card = document.createElement('div'); card.className = 'car-card';
      card.innerHTML = `<div class="color-swatch" style="background:${car.color||'#ddd'}"></div><div class="car-info"><strong>${car.name}</strong><div style="font-size:12px;color:#666">${car.plate||''}</div></div>`;
      carsCol.appendChild(card);

      // calendar row for this car
      const r = document.createElement('div'); r.className='row';
      const namePlaceholder = document.createElement('div'); namePlaceholder.className='car-name'; r.appendChild(namePlaceholder);
      const daysWrap = document.createElement('div'); daysWrap.style.display='inline-flex';
        days.forEach(day=>{
          const dayKey = day.toISOString().slice(0,10);
          const c = document.createElement('div'); c.className='cell';
          if(dayKey === todayIso) c.classList.add('today');
          const b = bookings.find(bk=>bk.car_id===car.id && bk.start_iso.slice(0,10)<=dayKey && bk.end_iso.slice(0,10)>=dayKey);
          if(b){
            c.style.background='#ffcdd2';
            // show client name (bigger) and below the creator (smaller)
            const creatorName = b.creator_name || 'Utente';
            const clientLabel = b.client_name || b.title || 'Prenotazione';
            // escape simple HTML
            const esc = (s)=> String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            c.innerHTML = `<div class="booking-client">${esc(clientLabel)}</div><div class="booking-creator">${esc(creatorName)}</div>`;
            c.title = `${clientLabel} — ${creatorName} (${b.start_iso.slice(0,10)}→${b.end_iso.slice(0,10)})`;
          }
          daysWrap.appendChild(c);
        });
      r.appendChild(daysWrap);
      container.appendChild(r);
    });
    // adjust card heights to match calendar cell height
    try{
      setTimeout(()=>{
        const sampleCell = container.querySelector('.row .cell');
        const ph = carsCol.querySelector('.header-placeholder');
        if(sampleCell){
          const ch = Math.round(sampleCell.getBoundingClientRect().height);
          const cards = carsCol.querySelectorAll('.car-card');
          cards.forEach(cd=>{ cd.style.height = ch + 'px'; cd.style.minHeight = ch + 'px'; });
          // also ensure header placeholder matches header
          if(ph){ ph.style.height = ch + 'px'; ph.style.minHeight = ch + 'px'; }
        }
      }, 30);
    }catch(e){}

    return days;
  }

  // adjust heights on window resize so layout stays synced
  window.addEventListener('resize', ()=>{
    try{
      const sampleCell = document.querySelector('#calendarContainer .row .cell');
      const ph = carsCol.querySelector('.header-placeholder');
      if(sampleCell){
        const ch = Math.round(sampleCell.getBoundingClientRect().height);
        const cards = carsCol.querySelectorAll('.car-card');
        cards.forEach(cd=>{ cd.style.height = ch + 'px'; cd.style.minHeight = ch + 'px'; });
        if(ph){ ph.style.height = ch + 'px'; ph.style.minHeight = ch + 'px'; }
      }
    }catch(e){}
  });

  let currentStart = new Date();
  currentStart.setHours(0,0,0,0);
  const sizes = ['mini','normal','big'];
  let sizePriority = null; // null means default order
  const reorderBtn = document.getElementById('reorderSizeBtn');
  if(reorderBtn) reorderBtn.textContent = 'Ordina';
  function cyclePriority(){
    if(sizePriority===null) sizePriority = sizes[0];
    else{
      const idx = sizes.indexOf(sizePriority);
      if(idx<0 || idx===sizes.length-1) sizePriority = null; else sizePriority = sizes[idx+1];
    }
    const sizeNames = { mini:'mini', normal:'normale', big:'grande' };
    reorderBtn.textContent = sizePriority ? `Ordina: ${sizeNames[sizePriority]||sizePriority}` : 'Ordina';
    refresh();
  }
  reorderBtn?.addEventListener('click', cyclePriority);

  async function refresh(){
    const [carsOrig, bookings] = await Promise.all([fetchCars(), fetchBookings()]);
    let cars = carsOrig.slice();
    if(sizePriority){
      cars.sort((a,b)=>{ if(a.size===sizePriority && b.size!==sizePriority) return -1; if(b.size===sizePriority && a.size!==sizePriority) return 1; return 0; });
    }
      const days = renderCalendar(cars, bookings, currentStart);
    // center calendar on today column
    try{
      const todayIso = new Date().toISOString().slice(0,10);
      const todayIndex = days.findIndex(d=> d.toISOString().slice(0,10) === todayIso);
      if(typeof todayIndex === 'number' && todayIndex >= 0 && calendarWrapper){
        // compute cell width from header row
        setTimeout(()=>{
          const headerRows = container.querySelectorAll('.row');
          if(!headerRows || headerRows.length===0) return;
          const headerCells = headerRows[0].querySelectorAll('.cell');
          if(!headerCells || headerCells.length===0) return;
          const cellW = headerCells[0].getBoundingClientRect().width || 120;
          const target = Math.max(0, Math.round(cellW * todayIndex - (calendarWrapper.clientWidth/2) + (cellW/2)));
          calendarWrapper.scrollLeft = target;
        }, 50);
      }
    }catch(e){/* ignore */}
  }

  // Listen for realtime booking events to refresh calendar
  window.addEventListener('booking:created', ()=>{ refresh(); });

  // scroll controls: scroll by 7 cells width
  scrollLeftBtn?.addEventListener('click', ()=>{ calendarWrapper?.scrollBy({ left: -840, behavior:'smooth' }); });
  scrollRightBtn?.addEventListener('click', ()=>{ calendarWrapper?.scrollBy({ left: 840, behavior:'smooth' }); });

  // New booking modal flow
  newBookingBtn?.addEventListener('click', async ()=>{
    // open modal and populate car list grouped by size
    const cars = await fetchCars();
    const select = document.querySelector('#bookingModal select[name="car_id"]');
    select.innerHTML = '';
    const groups = {};
    cars.forEach(c=>{ groups[c.size || 'Unknown'] = groups[c.size || 'Unknown'] || []; groups[c.size || 'Unknown'].push(c); });
    Object.keys(groups).forEach(size=>{
      const optg = document.createElement('optgroup'); optg.label = size;
      groups[size].forEach(c=>{ const o = document.createElement('option'); o.value = c.id; o.textContent = `${c.name} (${c.plate||''})`; optg.appendChild(o); });
      select.appendChild(optg);
    });

    const startInput = document.querySelector('#bookingModal input[name="start_date"]');
    const endInput = document.querySelector('#bookingModal input[name="end_date"]');
    const warning = document.getElementById('overlapWarning');

    function checkOverlap(){
      warning.style.display = 'none';
      const carId = select.value; const s = startInput.value; const e = endInput.value; if(!carId || !s || !e) return;
      const start_iso = s + 'T00:00:00Z'; const end_iso = e + 'T23:59:59Z';
      fetchJson('/api/bookings/check', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ car_id: parseInt(carId), start_iso, end_iso }) })
        .then(json=>{
          if(json.overlap){ warning.style.display='block'; warning.textContent = 'Conflitto: già prenotato: ' + json.rows.map(r=> (r.title||'') + ' ('+r.start_iso.slice(0,10)+'→'+r.end_iso.slice(0,10)+')').join('; '); }
          else warning.style.display='none';
        }).catch(()=>{});
    }

    select.addEventListener('change', checkOverlap);
    startInput.addEventListener('change', checkOverlap);
    endInput.addEventListener('change', checkOverlap);

    // Do NOT auto-fill client_name here; leave the field empty for the user to enter.

    document.getElementById('bookingModal').style.display = 'flex';

    // save handler
    const form = document.getElementById('bookingModalForm');
    const onSubmit = async (e)=>{
      e.preventDefault();
      const data = new FormData(form); const body = Object.fromEntries(data.entries());
      const start_iso = body.start_date + 'T00:00:00Z'; const end_iso = body.end_date + 'T23:59:59Z';
      const car_id = parseInt(body.car_id);
      // check one more time server-side
      const chk = await fetchJson('/api/bookings/check', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ car_id, start_iso, end_iso }) });
      const force = !!body.force_booking;
      if(chk.overlap && !force){ alert('Impossibile salvare la prenotazione: conflitto:\n' + chk.rows.map(r=> (r.title||'')+' '+r.start_iso+'→'+r.end_iso).join('\n')); return; }
      const payload = { car_id, start_iso, end_iso, title: body.description || body.client_name || 'Prenotazione', client_name: body.client_name || null, description: body.description || null, force: force };
      const res = await fetchRaw('/api/bookings', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(payload) });
      if(res.status===409) { alert('Conflitto'); return; }
      if(res.status===403) { alert('Non autorizzato (passcode richiesto)'); return; }
      if(!res.ok) { alert('Salvataggio fallito'); return; }
      document.getElementById('bookingModal').style.display='none';
      form.removeEventListener('submit', onSubmit);
      refresh();
    };
    form.addEventListener('submit', onSubmit);
    document.getElementById('bookingCancelBtn').onclick = ()=>{ document.getElementById('bookingModal').style.display='none'; form.removeEventListener('submit', onSubmit); };
  });

  refresh();
}
