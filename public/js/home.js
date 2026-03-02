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
    function localISO(d){ const dt = d || new Date(); const y = dt.getFullYear(); const m = String(dt.getMonth()+1).padStart(2,'0'); const day = String(dt.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; }
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
    const todayIso = localISO(new Date());
    days.forEach(day=>{
      const c = document.createElement('div'); c.className = 'cell';
      const dk = localISO(day);
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
      days.forEach((day, idx)=>{
        const dayKey = localISO(day);
        const c = document.createElement('div'); c.className = 'cell';
        if(dayKey === todayIso) c.classList.add('today');
        const b = bookings.find(bk=>bk.car_id===car.id && bk.start_iso.slice(0,10) <= dayKey && bk.end_iso.slice(0,10) >= dayKey);
        if(b){
          // detect adjacency to make multi-day bookings look merged
          const prevDay = (idx>0) ? days[idx-1] : null;
          const nextDay = (idx < days.length-1) ? days[idx+1] : null;
          const prevKey = prevDay ? localISO(prevDay) : null;
          const nextKey = nextDay ? localISO(nextDay) : null;
          const prevB = prevKey ? bookings.find(bk=>bk.car_id===car.id && bk.start_iso.slice(0,10) <= prevKey && bk.end_iso.slice(0,10) >= prevKey) : null;
          const nextB = nextKey ? bookings.find(bk=>bk.car_id===car.id && bk.start_iso.slice(0,10) <= nextKey && bk.end_iso.slice(0,10) >= nextKey) : null;
          const isPrevSame = prevB && prevB.id === b.id;
          const isNextSame = nextB && nextB.id === b.id;

          c.classList.add('booked');
          if(!isPrevSame && !isNextSame) c.classList.add('booked-single');
          else if(!isPrevSame && isNextSame) c.classList.add('booked-start');
          else if(isPrevSame && !isNextSame) c.classList.add('booked-end');
          else c.classList.add('booked-mid');

          // use car color (softened) for booking background instead of default red
          if(car && car.color){
            const bg = softenHex(car.color, 0.72); // mix heavily with white for softer tone
            c.style.background = bg;
            // set outer border color to car color; middle cells will hide inner borders via CSS
            c.style.borderColor = car.color || 'rgba(0,0,0,0.06)';
            // ensure readable text color
            c.style.color = '#111';
          }
          const creatorName = b.creator_name || 'Utente';
          const clientLabel = b.client_name || b.title || 'Prenotazione';
          const esc = (s)=> String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
          // decide visibility for client and creator names
          let showClient = true;
          let showCreator = true;
          try{
            const toLocalDate = (isoOrDay)=>{ const y = isoOrDay.slice(0,4); const m = isoOrDay.slice(5,7); const d = isoOrDay.slice(8,10); return new Date(parseInt(y,10), parseInt(m,10)-1, parseInt(d,10)); };
            const startDay = (b.start_iso||'').slice(0,10);
            const endDay = (b.end_iso||'').slice(0,10);
            const curDay = dayKey; // localISO(day)
            if(startDay && endDay && curDay){
              const sd = toLocalDate(startDay); const ed = toLocalDate(endDay); const cd = toLocalDate(curDay);
              const len = Math.round((ed - sd) / 86400000) + 1;
              const diff = Math.round((cd - sd) / 86400000);
              if(len <= 3){
                // show once at center (middle index)
                const middle = Math.floor(len/2);
                showClient = (diff === middle);
                showCreator = (diff === middle);
              } else {
                // repeat every 3 days starting on first day
                showClient = (diff % 3) === 0;
                showCreator = (diff % 3) === 0;
              }
            }
          }catch(e){ showClient = true; showCreator = true; }

          const clientHtml = showClient ? `<div class="booking-client">${esc(clientLabel)}</div>` : '<div class="booking-client" style="visibility:hidden;height:1em">&nbsp;</div>';
          const creatorHtml = showCreator ? `<div class="booking-creator">${esc(creatorName)}</div>` : '<div class="booking-creator" style="visibility:hidden;height:1em">&nbsp;</div>';
          c.innerHTML = clientHtml + creatorHtml;
          try{
            const startLabel = b.start_iso ? new Date(b.start_iso).toLocaleDateString('it') : (b.start_iso||'').slice(0,10);
            const endLabel = b.end_iso ? new Date(b.end_iso).toLocaleDateString('it') : (b.end_iso||'').slice(0,10);
            c.title = `${clientLabel} — ${creatorName} (${startLabel} → ${endLabel})`;
          }catch(e){ c.title = `${clientLabel} — ${creatorName}`; }
        }
        daysWrap.appendChild(c);
      });
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
      const localISO = (dt)=>{ const d = dt || new Date(); const y = d.getFullYear(); const m = String(d.getMonth()+1).padStart(2,'0'); const day = String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; };
      const todayIso = localISO(tomorrow);
      const todayIndex = days.findIndex(d=> localISO(d) === todayIso);
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

  // show deletion banner when a booking of the logged-in user is deleted
  function showDeletionBanner(b){
    try{
      const myName = localStorage.getItem('passcode_name') || '';
      if(!(b && (b.client_name === myName || b.creator_name === myName))) return;
      // don't show if dismissed
      const key = 'dismissed_del_' + (b.original_id || b.id || '');
      if(localStorage.getItem(key)) return;
      const hdr = document.querySelector('header') || document.body;
      // remove existing banner for same id
      const existing = document.getElementById('deletedBanner_' + (b.original_id || b.id));
      if(existing) return;
      const banner = document.createElement('div'); banner.id = 'deletedBanner_' + (b.original_id || b.id); banner.className = 'deletion-banner';
      const carId = b.car_id;
      // fetch car name
      fetchCars().then(cars=>{
        const car = cars.find(c=>c.id === carId) || {};
        const carName = car.name || '';
        const start = b.start_iso ? new Date(b.start_iso).toLocaleDateString('it') : '';
        const end = b.end_iso ? new Date(b.end_iso).toLocaleDateString('it') : '';
        banner.innerHTML = `<div>La prenotazione per <strong>${carName}</strong> ${(b.client_name?(' - '+b.client_name):'')} (${start} → ${end}) è stata cancellata.</div>`;
        const close = document.createElement('button'); close.className = 'page-btn'; close.textContent = '✕'; close.style.marginLeft = '8px';
        close.addEventListener('click', ()=>{ try{ localStorage.setItem(key, '1'); }catch(e){}; banner.remove(); });
        banner.appendChild(close);
        hdr.insertAdjacentElement('afterend', banner);
      }).catch(()=>{});
    }catch(e){}
  }

  // listen for realtime deletion events
  window.addEventListener('booking:deleted', (ev)=>{ try{ showDeletionBanner(ev.detail); }catch(e){} });
  // also show banner when navigating to home in case deletion happened while on other page
  window.addEventListener('page:changed', (ev)=>{ try{ if(ev.detail === 'home'){ checkArchivedDeletions(); } }catch(e){} });

  // check archived deletions for this user (in case deletion happened while offline or on other page)
  async function checkArchivedDeletions(){
    try{
      const myName = localStorage.getItem('passcode_name') || '';
      if(!myName) return;
      const rows = await fetchJson(`/api/bookings/archive?name=${encodeURIComponent(myName)}`);
      if(!rows || !rows.length) return;
      rows.forEach(r=>{
        try{ showDeletionBanner(r); }catch(e){}
      });
    }catch(e){/* ignore errors */}
  }

  // run once on init to catch missed deletion events
  try{ checkArchivedDeletions(); }catch(e){}

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
      const today = (function(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
      if(startInput){ startInput.placeholder = today; if(!startInput.value) startInput.value = today; }
      if(endInput){ endInput.placeholder = today; if(!endInput.value) endInput.value = today; }
    }catch(e){}

    function checkOverlap(){
      warning.classList.add('hidden');
      const carId = select.value; const s = startInput.value; const e = endInput.value; if(!carId || !s || !e) return;
      const start_iso = s + 'T00:00:00Z'; const end_iso = e + 'T23:59:59Z';
      // read optional edit id from modal dataset to exclude self when editing
      const editModal = document.getElementById('bookingModal');
      const exclude_id = editModal?.dataset?.editId ? parseInt(editModal.dataset.editId) : null;
      const body = { car_id: parseInt(carId), start_iso, end_iso };
      if(exclude_id) body.exclude_id = exclude_id;
      fetchJson('/api/bookings/check', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) })
        .then(json=>{
          if(json.overlap){
            const overlapping = (json.rows || []).filter(r=> !(r.end_iso < start_iso || r.start_iso > end_iso));
            if(overlapping.length){
              warning.innerHTML = '';
              const title = document.createElement('div'); title.textContent = 'Conflitto: le seguenti prenotazioni si sovrappongono:'; title.style.fontWeight = '600'; title.style.marginBottom = '6px';
              warning.appendChild(title);
              overlapping.forEach(r => {
                const row = document.createElement('div'); row.className = 'overlap-row'; row.style.display='flex'; row.style.justifyContent='space-between'; row.style.alignItems='center'; row.style.gap='8px'; row.style.marginBottom='6px';
                  const txt = document.createElement('div');
                  try{
                    const rStart = r.start_iso ? new Date(r.start_iso).toLocaleDateString('it') : (r.start_iso||'').slice(0,10);
                    const rEnd = r.end_iso ? new Date(r.end_iso).toLocaleDateString('it') : (r.end_iso||'').slice(0,10);
                    txt.textContent = `${(r.client_name||r.title||'Prenotazione')} (${rStart} → ${rEnd})`;
                  }catch(e){ txt.textContent = `${(r.client_name||r.title||'Prenotazione')} (${r.start_iso.slice(0,10)} → ${r.end_iso.slice(0,10)})`; }
                const del = document.createElement('button'); del.type='button'; del.className='page-btn del small'; del.textContent = 'Elimina';
                del.addEventListener('click', async ()=>{
                  if(!confirm('Eliminare questa prenotazione?')) return;
                  try{
                    const res = await fetchRaw(`/api/bookings/${r.id}`, { method:'DELETE' });
                    if(res.status===403) { alert('Non autorizzato: effettua il login con un passcode.'); return; }
                    if(!res.ok){ const j = await res.json(); alert('Errore: '+(j.error||res.status)); return; }
                    // refresh calendar and re-run check
                    await refresh();
                    checkOverlap();
                  }catch(e){ alert('Errore durante eliminazione'); }
                });
                const edit = document.createElement('button'); edit.type='button'; edit.className='page-btn edit small'; edit.textContent = 'Modifica';
                edit.addEventListener('click', ()=>{
                  try{ const bookingModalEl = document.getElementById('bookingModal');
                    // if user is creating a new booking (booking modal open) show change-resolve modal to adjust the new booking
                    if(bookingModalEl && !bookingModalEl.classList.contains('hidden')){
                      // open changeResolveModal
                      const changeModal = document.getElementById('changeResolveModal'); if(!changeModal) return;
                      const carArea = document.getElementById('changeResolveCar');
                      const dateArea = document.getElementById('changeResolveDate');
                      const carSelect = changeModal.querySelector('select[name="car_id"]');
                      const startInputCR = changeModal.querySelector('input[name="start_date"]');
                      const endInputCR = changeModal.querySelector('input[name="end_date"]');
                      const closeBtn = document.getElementById('changeResolveClose');
                      const cancelBtn = document.getElementById('changeResolveCancel');
                      const form = document.getElementById('changeResolveForm');
                      // show both controls immediately (no buttons)
                      try{ changeModal.style.position = 'fixed'; changeModal.style.zIndex = '200001'; }catch(e){}
                      const targetBooking = r;
                      let bmCarVal = targetBooking && targetBooking.car_id ? String(targetBooking.car_id) : null;
                      try{ if(targetBooking && targetBooking.start_iso) startInputCR.value = (targetBooking.start_iso||'').slice(0,10); if(targetBooking && targetBooking.end_iso) endInputCR.value = (targetBooking.end_iso||'').slice(0,10); }catch(e){}
                      // populate car select immediately
                      try{
                        fetchCars().then(carsList=>{
                          carSelect.innerHTML = '';
                          carsList.forEach(c=>{ const o = document.createElement('option'); o.value = c.id; o.textContent = `${c.name} ${c.plate?('('+c.plate+')'):''}`; carSelect.appendChild(o); });
                          if(bmCarVal) try{ carSelect.value = bmCarVal; }catch(e){}
                        }).catch(()=>{});
                      }catch(e){}
                      carArea.classList.remove('hidden'); dateArea.classList.remove('hidden');
                      try{ dateArea.style.display = 'flex'; dateArea.style.flexDirection = 'row'; dateArea.style.alignItems = 'center'; dateArea.style.gap = '8px'; }catch(e){}
                      const cleanup = ()=>{ form.removeEventListener('submit', onSubmit); closeBtn.onclick = null; cancelBtn.onclick = null; try{ dateArea.style.display=''; dateArea.style.flexDirection=''; dateArea.style.alignItems=''; dateArea.style.gap=''; }catch(e){} };
                      const onSubmit = async (ev)=>{
                        ev.preventDefault();
                        try{
                          // If we have a target existing booking, apply changes to that booking via PUT
                          if(targetBooking){
                            // build payload including existing values for mandatory fields
                            const payload = {};
                            // car: if user changed car, use new one, otherwise keep existing
                            try{ payload.car_id = !carArea.classList.contains('hidden') ? parseInt(carSelect.value) : parseInt(targetBooking.car_id); }catch(e){ payload.car_id = parseInt(targetBooking.car_id); }
                            // dates: if user changed dates, use them; otherwise keep existing
                            try{
                              if(!dateArea.classList.contains('hidden')){
                                const s = startInputCR.value; const e = endInputCR.value;
                                if(!s || !e){ alert('Inserisci data inizio e data fine.'); return; }
                                payload.start_iso = s + 'T00:00:00Z'; payload.end_iso = e + 'T23:59:59Z';
                              } else {
                                // preserve existing mandatory dates to avoid NOT NULL constraint
                                payload.start_iso = targetBooking.start_iso; payload.end_iso = targetBooking.end_iso;
                              }
                            }catch(e){ payload.start_iso = targetBooking.start_iso; payload.end_iso = targetBooking.end_iso; }
                            if(!payload.car_id){ alert('Seleziona un\'auto valida.'); return; }
                            const res = await fetchRaw(`/api/bookings/${targetBooking.id}`, { method:'PUT', headers:{ 'content-type':'application/json' }, body: JSON.stringify(payload) });
                            if(res.status === 403){ alert('Non autorizzato: effettua il login con un passcode.'); return; }
                            if(res.status === 409){ alert('Conflitto con altre prenotazioni.'); return; }
                            if(!res.ok){ const j = await res.json().catch(()=>({})); alert('Errore: '+(j.error||res.status)); return; }
                            // success: close modal and refresh calendar
                            changeModal.classList.add('hidden'); cleanup();
                            await refresh();
                            // if the booking creation modal is still open, re-trigger its change handlers (after short delay)
                            try{
                              const bm = document.getElementById('bookingModal');
                              if(bm && !bm.classList.contains('hidden')){
                                setTimeout(()=>{
                                  try{
                                    const sel = bm.querySelector('select[name="car_id"]');
                                    const sIn = bm.querySelector('input[name="start_date"]');
                                    const eIn = bm.querySelector('input[name="end_date"]');
                                    if(sel) sel.dispatchEvent(new Event('change'));
                                    if(sIn) sIn.dispatchEvent(new Event('change'));
                                    if(eIn) eIn.dispatchEvent(new Event('change'));
                                  }catch(e){}
                                }, 250);
                              }
                            }catch(e){}
                            return;
                          }
                          // fallback: nothing to do
                        }catch(e){ console.error(e); }
                        changeModal.classList.add('hidden'); cleanup();
                      };
                      form.addEventListener('submit', onSubmit);
                      closeBtn.onclick = ()=>{ changeModal.classList.add('hidden'); cleanup(); };
                      cancelBtn.onclick = ()=>{ changeModal.classList.add('hidden'); cleanup(); };
                      // show the modal
                      changeModal.classList.remove('hidden');
                      return;
                    }
                  }catch(e){}
                  // fallback: open full edit flow on bookings page
                  try{ window.dispatchEvent(new CustomEvent('openEditBooking', { detail:{ id: r.id } })); }catch(e){}
                  try{ localStorage.setItem('open_edit_booking_id', String(r.id)); }catch(e){}
                });
                const actions = document.createElement('div'); actions.style.display='flex'; actions.style.gap='8px'; actions.appendChild(edit); actions.appendChild(del);
                row.appendChild(txt); row.appendChild(actions); warning.appendChild(row);
              });
              warning.classList.remove('hidden');
            } else {
              // fallback
              warning.classList.remove('hidden');
              warning.textContent = 'Conflitto: già prenotato.';
            }
          } else {
            warning.classList.add('hidden');
            warning.innerHTML = '';
          }
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
      // include optional exclude id when editing
      const bm = document.getElementById('bookingModal');
      const excludeId = bm?.dataset?.editId ? parseInt(bm.dataset.editId) : null;
      const chkBody = { car_id, start_iso, end_iso };
      if(excludeId) chkBody.exclude_id = excludeId;
      const chk = await fetchJson('/api/bookings/check', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(chkBody) });
      if(chk.overlap){
        // show detailed overlapping bookings in the warning area so user can delete the specific one
        checkOverlap();
        return;
      }
      const payload = { car_id, start_iso, end_iso, title: body.description || body.client_name || 'Prenotazione', client_name: body.client_name || null, description: body.description || null };
      const res = await fetchRaw('/api/bookings', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(payload) });
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

  // ensure new-booking clears any edit marker
  const bookingModalEl = document.getElementById('bookingModal');
  if(bookingModalEl){ bookingModalEl.addEventListener('show', ()=>{ delete bookingModalEl.dataset.editId; }); }

  refresh();
}
