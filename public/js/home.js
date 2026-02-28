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

  // scale booking text inside fixed-height cells so cells remain constant height
  function scaleBookingText(rootEl){
    try{
      const root = rootEl || container;
      const cells = root.querySelectorAll('.cell');
      cells.forEach(cell=>{
        const client = cell.querySelector('.booking-client');
        const creator = cell.querySelector('.booking-creator');
        if(!client) return;
        // reset
        client.style.fontSize = '';
        client.style.whiteSpace = 'normal';
        client.style.overflow = '';
        client.style.textOverflow = '';
        if(creator){ creator.style.fontSize = ''; creator.style.whiteSpace = 'normal'; creator.style.overflow = ''; creator.style.textOverflow = ''; }

        const cellH = cell.clientHeight - 4; // buffer
        let clientSize = parseFloat(getComputedStyle(client).fontSize) || 14;
        let creatorSize = creator ? (parseFloat(getComputedStyle(creator).fontSize) || 11) : 0;
        const MIN_CLIENT = 8; const MIN_CREATOR = 8;

        function combinedHeight(){
          return (client.getBoundingClientRect().height || client.offsetHeight) + (creator ? (creator.getBoundingClientRect().height || creator.offsetHeight) : 0);
        }

        // try shrinking progressively (small steps) while allowing wrapping
        let loops = 0;
        while(combinedHeight() > cellH && loops < 40 && (clientSize > MIN_CLIENT || creatorSize > MIN_CREATOR)){
          if(clientSize > MIN_CLIENT){ clientSize = Math.max(MIN_CLIENT, clientSize - 0.8); client.style.fontSize = clientSize + 'px'; }
          if(creator && creatorSize > MIN_CREATOR){ creatorSize = Math.max(MIN_CREATOR, creatorSize - 0.6); creator.style.fontSize = creatorSize + 'px'; }
          loops++;
        }

        // if still overflowing, apply ellipsis and force single-line truncation
        if(combinedHeight() > cellH){
          client.style.whiteSpace = 'nowrap'; client.style.overflow = 'hidden'; client.style.textOverflow = 'ellipsis';
          if(creator) { creator.style.whiteSpace = 'nowrap'; creator.style.overflow = 'hidden'; creator.style.textOverflow = 'ellipsis'; }
        }
      });
    }catch(e){/* ignore */}
  }

  // soften a hex color by mixing it with white (amount 0..1)
  function softenHex(hex, amount){
    try{
      if(!hex) return '';
      hex = hex.replace('#','');
      if(hex.length===3) hex = hex.split('').map(h=>h+h).join('');
      const r = parseInt(hex.substring(0,2),16);
      const g = parseInt(hex.substring(2,4),16);
      const b = parseInt(hex.substring(4,6),16);
      const mix = (v) => Math.round(v + (255 - v) * amount);
      return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
    }catch(e){ return hex; }
  }

  function renderCalendar(cars, bookings, startDate){
    container.innerHTML = '';
    carsCol.innerHTML = '';
    // add a sticky placeholder header in the cars column
    const placeholder = document.createElement('div'); placeholder.className = 'car-card header-placeholder'; placeholder.innerHTML = '&nbsp;';
    carsCol.appendChild(placeholder);

    const PREV_DAYS = 5;
    const FUTURE_DAYS = 30; // show 30 days into the future
    const start = new Date(startDate || new Date());
    start.setDate(start.getDate() - PREV_DAYS);
    const total = PREV_DAYS + FUTURE_DAYS + 1;
    const days = [];
    for(let i=0;i<total;i++){ const d = new Date(start); d.setDate(start.getDate()+i); days.push(d); }

    // header row with day labels (calendar only)
    const headerRow = document.createElement('div'); headerRow.className = 'row';
    const nameCol = document.createElement('div'); nameCol.className = 'car-name'; headerRow.appendChild(nameCol);
    const daysWrapHeader = document.createElement('div'); daysWrapHeader.className = 'days-wrap';
    const todayIso = new Date().toISOString().slice(0,10);
    days.forEach(day=>{
      const c = document.createElement('div'); c.className = 'cell';
      const dk = day.toISOString().slice(0,10);
      const wk = day.toLocaleDateString('it', { weekday: 'short' });
      const dm = day.toLocaleDateString('it', { day: 'numeric', month: 'short' });
      c.innerHTML = `<div class="day-week">${wk}</div><div class="day-date">${dm}</div>`;
      if(dk === todayIso) c.classList.add('today');
      daysWrapHeader.appendChild(c);
    });
    headerRow.appendChild(daysWrapHeader);
    container.appendChild(headerRow);

    // rows per car
    cars.forEach(car=>{
      // left column card
      const card = document.createElement('div'); card.className = 'car-card';
      const sw = document.createElement('div'); sw.className = 'color-swatch'; if(car.color) sw.style.background = car.color || '#ddd';
      const info = document.createElement('div'); info.className = 'car-info';
      const nameEl = document.createElement('strong'); nameEl.textContent = car.name;
      const plateEl = document.createElement('div'); plateEl.className = 'car-plate'; plateEl.textContent = car.plate || '';
      info.appendChild(nameEl); info.appendChild(plateEl);
      card.appendChild(sw); card.appendChild(info);
      carsCol.appendChild(card);

      // calendar row for this car
      const r = document.createElement('div'); r.className = 'row';
      const namePlaceholder = document.createElement('div'); namePlaceholder.className = 'car-name'; r.appendChild(namePlaceholder);
      const daysWrap = document.createElement('div'); daysWrap.className = 'days-wrap';
      for(let i=0;i<days.length;i++){
        const day = days[i];
        const dayKey = day.toISOString().slice(0,10);
        // find a booking that covers this day
        const b = bookings.find(bk=>bk.car_id===car.id && bk.start_iso.slice(0,10) <= dayKey && bk.end_iso.slice(0,10) >= dayKey);
        if(!b){
          const c = document.createElement('div'); c.className = 'cell'; if(dayKey === todayIso) c.classList.add('today');
          daysWrap.appendChild(c);
          continue;
        }
        // if previous day is part of same booking, skip rendering here (it was rendered earlier as a span)
        if(i>0){ const prevKey = days[i-1].toISOString().slice(0,10); const prevB = bookings.find(bk=>bk.car_id===car.id && bk.start_iso.slice(0,10) <= prevKey && bk.end_iso.slice(0,10) >= prevKey); if(prevB && prevB.id === b.id) continue; }

        // compute span length (how many consecutive days this booking covers starting at i)
        let span = 1; for(let j=i+1;j<days.length;j++){ const k = days[j].toISOString().slice(0,10); if(b.start_iso.slice(0,10) <= k && b.end_iso.slice(0,10) >= k) span++; else break; }

        const c = document.createElement('div'); c.className = 'cell booking-span';
        if(dayKey === todayIso) c.classList.add('today');
        // span width using CSS variable for cell width
        c.style.width = `calc(var(--cell-width) * ${span})`;
        c.classList.add('booked');
        if(car && car.color){ const bg = softenHex(car.color, 0.72); c.style.background = bg; c.style.borderColor = 'rgba(0,0,0,0.06)'; c.style.color = '#111'; }
        const creatorName = b.creator_name || 'Utente';
        const clientLabel = b.client_name || b.title || 'Prenotazione';
        const esc = (s)=> String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        // center the booking label across the span
        c.innerHTML = `<div class="booking-client">${esc(clientLabel)}</div><div class="booking-creator">${esc(creatorName)}</div>`;
        c.title = `${clientLabel} — ${creatorName} (${b.start_iso.slice(0,10)}→${b.end_iso.slice(0,10)})`;
        daysWrap.appendChild(c);
        // advance index by span-1 because we've consumed these days
        i += span - 1;
      }
      r.appendChild(daysWrap);
      container.appendChild(r);
    });

    // scale text after layout
    setTimeout(()=>scaleBookingText(), 30);
    return days;
  }

  // on resize, re-run text-scaling to adapt to new dimensions
  window.addEventListener('resize', ()=>{ setTimeout(()=>scaleBookingText(), 60); });

  let currentStart = new Date();
  currentStart.setHours(0,0,0,0);
  const sizes = ['all','piccola','media','grande','soccorso'];
  // persist selected filter across pages
  const FILTER_KEY = 'car_size_filter';
  function getSavedFilter(){ return localStorage.getItem(FILTER_KEY) || 'all'; }
  function saveFilter(v){ localStorage.setItem(FILTER_KEY, v); }
  let sizeFilter = getSavedFilter();
  const reorderBtn = document.getElementById('reorderSizeBtn');
  const sizeLabels = { all:'Tutti', piccola:'Piccola', media:'Media', grande:'Grande', soccorso:'Soccorso' };
  if(reorderBtn) reorderBtn.textContent = sizeFilter && sizeFilter !== 'all' ? `Filtra: ${sizeLabels[sizeFilter]||sizeFilter}` : 'Filtra: Tutti';
  function cycleFilter(){
    const idx = sizes.indexOf(sizeFilter || 'all');
    const next = (idx < 0 || idx === sizes.length-1) ? 0 : idx + 1;
    sizeFilter = sizes[next];
    saveFilter(sizeFilter);
    if(reorderBtn) reorderBtn.textContent = sizeFilter && sizeFilter !== 'all' ? `Filtra: ${sizeLabels[sizeFilter]||sizeFilter}` : 'Filtra: Tutti';
    refresh();
  }
  reorderBtn?.addEventListener('click', cycleFilter);
  // listen to filter changes from other pages
  window.addEventListener('car:filterChanged', (ev)=>{ try{ sizeFilter = ev.detail || 'all'; saveFilter(sizeFilter); if(reorderBtn) reorderBtn.textContent = sizeFilter && sizeFilter !== 'all' ? `Filtra: ${sizeLabels[sizeFilter]||sizeFilter}` : 'Filtra: Tutti'; refresh(); }catch(e){} });

  async function refresh(){
    const [carsOrig, bookings] = await Promise.all([fetchCars(), fetchBookings()]);
    let cars = carsOrig.slice();
    if(sizeFilter && sizeFilter !== 'all'){
      cars = cars.filter(c=> (c.size||'') === sizeFilter);
    }
      const days = renderCalendar(cars, bookings, currentStart);
    // center calendar on today column
    try{
      // center on tomorrow so today appears slightly to the left of center
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
      const todayIso = tomorrow.toISOString().slice(0,10);
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

    // set today's date as placeholder and default if empty
    try{
      const today = new Date().toISOString().slice(0,10);
      if(startInput){ startInput.placeholder = today; if(!startInput.value) startInput.value = today; }
      if(endInput){ endInput.placeholder = today; if(!endInput.value) endInput.value = today; }
    }catch(e){}

    function checkOverlap(){
      warning.classList.add('hidden');
      const carId = select.value; const s = startInput.value; const e = endInput.value; if(!carId || !s || !e) return;
      const start_iso = s + 'T00:00:00Z'; const end_iso = e + 'T23:59:59Z';
      fetchJson('/api/bookings/check', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ car_id: parseInt(carId), start_iso, end_iso }) })
        .then(json=>{
           if(json.overlap){
             const overlapping = (json.rows || []).filter(r=> !(r.end_iso < start_iso || r.start_iso > end_iso));
             if(overlapping.length){
               warning.classList.remove('hidden');
               warning.textContent = 'Conflitto: già prenotato: ' + overlapping.map(r=> (r.title||'') + ' ('+r.start_iso.slice(0,10)+'→'+r.end_iso.slice(0,10)+')').join('; ');
             } else {
               // fallback if server reported overlap but no rows match locally
               warning.classList.remove('hidden');
               warning.textContent = 'Conflitto: già prenotato.';
             }
           } else warning.classList.add('hidden');
        }).catch(()=>{});
    }

    select.addEventListener('change', checkOverlap);
    startInput.addEventListener('change', checkOverlap);
    endInput.addEventListener('change', checkOverlap);

    // Do NOT auto-fill client_name here; leave the field empty for the user to enter.

    document.getElementById('bookingModal').classList.remove('hidden');

    // save handler
    const form = document.getElementById('bookingModalForm');
    const onSubmit = async (e)=>{
      e.preventDefault();
      const data = new FormData(form); const body = Object.fromEntries(data.entries());
      // require fields: car_id, start_date, end_date, client_name
      if(!body.car_id || !body.start_date || !body.end_date || !(body.client_name && body.client_name.trim())){
        alert('Compila tutti i campi obbligatori: auto, data inizio, data fine e nome cliente.');
        return;
      }
      const sDate = new Date(body.start_date);
      const eDate = new Date(body.end_date);
      if(isNaN(sDate) || isNaN(eDate) || sDate > eDate){ alert('Date non valide: assicurati che la data di inizio sia <= data di fine.'); return; }
      const start_iso = body.start_date + 'T00:00:00Z'; const end_iso = body.end_date + 'T23:59:59Z';
      const car_id = parseInt(body.car_id);
      // check one more time server-side
      const chk = await fetchJson('/api/bookings/check', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ car_id, start_iso, end_iso }) });
      const force = !!body.force_booking;
      if(chk.overlap && !force){
        const overlapping = (chk.rows || []).filter(r=> !(r.end_iso < start_iso || r.start_iso > end_iso));
        alert('Impossibile salvare la prenotazione: conflitto:\n' + overlapping.map(r=> (r.title||'')+' '+r.start_iso+'→'+r.end_iso).join('\n'));
        return;
      }
      const payload = { car_id, start_iso, end_iso, title: body.description || body.client_name || 'Prenotazione', client_name: body.client_name || null, description: body.description || null, force: force };
      const res = await fetchRaw('/api/bookings', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(payload) });
      if(res.status===409) { alert('Conflitto'); return; }
      if(res.status===403) { alert('Non autorizzato (passcode richiesto)'); return; }
      if(!res.ok) { alert('Salvataggio fallito'); return; }
      document.getElementById('bookingModal').classList.add('hidden');
      form.removeEventListener('submit', onSubmit);
      refresh();
    };
    form.addEventListener('submit', onSubmit);
    const bookingCancelBtn = document.getElementById('bookingCancelBtn');
    if(bookingCancelBtn) bookingCancelBtn.onclick = ()=>{ document.getElementById('bookingModal').classList.add('hidden'); form.removeEventListener('submit', onSubmit); };
  });

  refresh();
}
