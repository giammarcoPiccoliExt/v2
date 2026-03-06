import { fetchJson, fetchRaw } from './utils.js';
import { createBanner } from './uiutils.js';
import { softenHex, formatDayLabel, esc } from './homeutils.js';
import { renderCalendar } from './calendar.js';
import { setupNewBookingModal } from './bookingmodals.js';
import { showDeletionBanner, showUpdateBanner } from './notifiche.js';

export async function initHome(){
  // --- Elementi principali ---
  const container = document.getElementById('calendarContainer');
  const carsCol = document.getElementById('carsCol');
  const calendarWrapper = document.querySelector('.calendar-wrapper');
  const scrollLeftBtn = document.getElementById('scrollLeftBtn');
  const scrollRightBtn = document.getElementById('scrollRightBtn');

  // --- Funzioni fetch ---
  async function fetchCars() { return fetchJson('/api/cars'); }
  async function fetchBookings() { return fetchJson('/api/bookings'); }

  // --- Stato e filtri ---
  let currentStart = new Date();
  currentStart.setHours(0,0,0,0);
  const sizes = ['all','piccola','media','grande','soccorso'];
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
  window.addEventListener('car:filterChanged', (ev)=>{ try{ sizeFilter = ev.detail || 'all'; saveFilter(sizeFilter); if(reorderBtn) reorderBtn.textContent = sizeFilter && sizeFilter !== 'all' ? `Filtra: ${sizeLabels[sizeFilter]||sizeFilter}` : 'Filtra: Tutti'; refresh(); }catch(e){} });

  // --- Rendering calendario ---
  function refresh() {
    Promise.all([fetchCars(), fetchBookings()]).then(([carsOrig, bookings]) => {
      let cars = carsOrig.slice();
      if(sizeFilter && sizeFilter !== 'all'){
        cars = cars.filter(c=> (c.size||'') === sizeFilter);
      }
      const days = renderCalendar(container, carsCol, cars, bookings, currentStart);
      // center calendar on today column
      try {
        const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
        const localISO = (dt)=>{ const d = dt || new Date(); const y = d.getFullYear(); const m = String(d.getMonth()+1).padStart(2,'0'); const day = String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; };
        const todayIso = localISO(tomorrow);
        const todayIndex = days.findIndex(d=> localISO(d) === todayIso);
        if(typeof todayIndex === 'number' && todayIndex >= 0 && calendarWrapper){
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
      }catch(e){}
    });
  }

  // --- Setup modali ---
  setupNewBookingModal(refresh);

  // --- Notifiche/banner: archivio cancellazioni ---
  async function checkArchivedDeletions() {
    try {
      const myName = localStorage.getItem('passcode_name') || '';
      if(!myName) return;
      const rows = await fetchJson(`/api/bookings/archive?name=${encodeURIComponent(myName)}`);
      if(!rows || !rows.length) return;
      rows.forEach(r=>{
        try{ showDeletionBanner(r, fetchCars); }catch(e){}
      });
    }catch(e){}
  }
  try{ checkArchivedDeletions(); }catch(e){}

  // --- Eventi realtime ---
  window.addEventListener('booking:created', ()=>{ refresh(); });
  window.addEventListener('booking:deleted', (ev)=>{ try{ showDeletionBanner(ev.detail, fetchCars); }catch(e){} });
  window.addEventListener('booking:updated', (ev)=>{ try{ showUpdateBanner(ev.detail, window.carsList); }catch(e){} });

  // --- Scroll calendario ---
  scrollLeftBtn?.addEventListener('click', ()=>{ calendarWrapper?.scrollBy({ left: -840, behavior:'smooth' }); });
  scrollRightBtn?.addEventListener('click', ()=>{ calendarWrapper?.scrollBy({ left: 840, behavior:'smooth' }); });

  // --- Reset marker edit su nuova prenotazione ---
  const bookingModalEl = document.getElementById('bookingModal');
  if(bookingModalEl){ bookingModalEl.addEventListener('show', ()=>{ delete bookingModalEl.dataset.editId; }); }

  // --- Avvio iniziale ---
  refresh();
}
