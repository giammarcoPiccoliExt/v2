// Modulo per la gestione delle modali di prenotazione (nuova/edit)
import { fetchJson, fetchRaw } from './utils.js';

/**
 * Inizializza la modale di nuova prenotazione
 * @param {Function} refresh - funzione per aggiornare il calendario
 */
export function setupNewBookingModal(refresh) {
  const newBookingBtn = document.getElementById('newBookingBtnHome');
  if (!newBookingBtn) return;
  newBookingBtn.addEventListener('click', async () => {
    // open modal and populate car list grouped by size
    const cars = await fetchJson('/api/cars');
    const select = document.querySelector('#bookingModal select[name="car_id"]');
    select.innerHTML = '';
    const groups = {};
    cars.forEach(c=>{ groups[c.size || 'Unknown'] = groups[c.size || 'Unknown'] || []; groups[c.size || 'Unknown'].push(c); });
    Object.keys(groups).forEach(size=>{
      const optg = document.createElement('optgroup'); optg.label = size;
      groups[size].forEach(c=>{
        let label = (c.modello || '');
        if(c.descrizione) label += ' - ' + c.descrizione;
        if(c.plate) label += ' / ' + c.plate;
        const o = document.createElement('option'); o.value = c.id; o.textContent = label; optg.appendChild(o);
      });
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
                      // Precompila il nome cliente se presente
                      const clientInputCR = changeModal.querySelector('input[name="client_name"]');
                      if(clientInputCR && targetBooking && targetBooking.client_name) clientInputCR.value = targetBooking.client_name;
                      try{ if(targetBooking && targetBooking.start_iso) startInputCR.value = (targetBooking.start_iso||'').slice(0,10); if(targetBooking && targetBooking.end_iso) endInputCR.value = (targetBooking.end_iso||'').slice(0,10); }catch(e){}
                      // populate car select immediately
                      try{
                        fetchJson('/api/cars').then(carsList=>{
                          carSelect.innerHTML = '';
                          // Raggruppa per size come in nuova prenotazione
                          const groups = {};
                          carsList.forEach(c=>{ groups[c.size || 'Unknown'] = groups[c.size || 'Unknown'] || []; groups[c.size || 'Unknown'].push(c); });
                          Object.keys(groups).forEach(size=>{
                            const optg = document.createElement('optgroup'); optg.label = size;
                            groups[size].forEach(c=>{
                              let label = (c.modello || '');
                              if(c.descrizione) label += ' - ' + c.descrizione;
                              if(c.plate) label += ' / ' + c.plate;
                              const o = document.createElement('option'); o.value = c.id; o.textContent = label; optg.appendChild(o);
                            });
                            carSelect.appendChild(optg);
                          });
                          if(bmCarVal) try{ carSelect.value = bmCarVal; }catch(e){}
                        }).catch(()=>{});
                      }catch(e){}

                      // --- AGGIUNTA: controllo conflitti in tempo reale anche in MODIFICA ---
                      function checkEditOverlap() {
                        const carId = carSelect.value;
                        const s = startInputCR.value;
                        const e = endInputCR.value;
                        if(!carId || !s || !e) return;
                        const start_iso = s + 'T00:00:00Z';
                        const end_iso = e + 'T23:59:59Z';
                        const body = { car_id: parseInt(carId), start_iso, end_iso, exclude_id: targetBooking.id };
                        fetchJson('/api/bookings/check', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) })
                          .then(json=>{
                            const overlapping = (json.rows || []).filter(r=> !(r.end_iso < start_iso || r.start_iso > end_iso));
                            let warning = changeModal.querySelector('.overlap-warning');
                            if(!warning) {
                              warning = document.createElement('div');
                              warning.className = 'overlap-warning';
                              changeModal.querySelector('.modal-content').insertBefore(warning, changeModal.querySelector('form'));
                            }
                            warning.innerHTML = '';
                            if(overlapping.length){
                              const title = document.createElement('div');
                              title.textContent = 'Conflitto: le seguenti prenotazioni si sovrappongono:';
                              title.style.fontWeight = '600';
                              title.style.marginBottom = '6px';
                              warning.appendChild(title);
                              overlapping.forEach(r => {
                                const row = document.createElement('div');
                                row.className = 'overlap-row';
                                row.style.display='flex';
                                row.style.justifyContent='space-between';
                                row.style.alignItems='center';
                                row.style.gap='8px';
                                row.style.marginBottom='6px';
                                const txt = document.createElement('div');
                                try{
                                  const rStart = r.start_iso ? new Date(r.start_iso).toLocaleDateString('it') : (r.start_iso||'').slice(0,10);
                                  const rEnd = r.end_iso ? new Date(r.end_iso).toLocaleDateString('it') : (r.end_iso||'').slice(0,10);
                                  txt.textContent = `${(r.client_name||r.title||'Prenotazione')} (${rStart} → ${rEnd})`;
                                }catch(e){ txt.textContent = `${(r.client_name||r.title||'Prenotazione')} (${r.start_iso.slice(0,10)} → ${r.end_iso.slice(0,10)})`; }
                                row.appendChild(txt);
                                warning.appendChild(row);
                              });
                              warning.classList.remove('hidden');
                            } else {
                              warning.classList.add('hidden');
                              warning.innerHTML = '';
                            }
                          }).catch(()=>{});
                      }
                      carSelect.addEventListener('change', checkEditOverlap);
                      startInputCR.addEventListener('change', checkEditOverlap);
                      endInputCR.addEventListener('change', checkEditOverlap);
                      // --- FINE AGGIUNTA ---
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
                            if(!payload.car_id){ alert("Seleziona un'auto valida."); return; }
                            const res = await fetchRaw(`/api/bookings/${targetBooking.id}`, { method:'PUT', headers:{ 'content-type':'application/json' }, body: JSON.stringify(payload) });
                            if(res.status === 403){ alert('Non autorizzato: effettua il login con un passcode.'); return; }
                            if(res.status === 409){
                              // Mostra il modal di conflitto come in nuova prenotazione, ma senza pulsanti di edit/elimina
                              try {
                                const bm = document.getElementById('bookingModal');
                                const changeModal = document.getElementById('changeResolveModal');
                                if (bm && !bm.classList.contains('hidden') && changeModal) {
                                  // Recupera le prenotazioni in conflitto dal backend
                                  const carId = bm.querySelector('select[name="car_id"]').value;
                                  const s = bm.querySelector('input[name="start_date"]').value;
                                  const e = bm.querySelector('input[name="end_date"]').value;
                                  const start_iso = s + 'T00:00:00Z';
                                  const end_iso = e + 'T23:59:59Z';
                                  const body = { car_id: parseInt(carId), start_iso, end_iso, exclude_id: targetBooking.id };
                                  fetchJson('/api/bookings/check', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) })
                                    .then(json=>{
                                      const overlapping = (json.rows || []).filter(r=> !(r.end_iso < start_iso || r.start_iso > end_iso));
                                      const warning = changeModal.querySelector('.overlap-warning') || document.createElement('div');
                                      warning.className = 'overlap-warning';
                                      warning.innerHTML = '';
                                      const title = document.createElement('div');
                                      title.textContent = 'Conflitto: le seguenti prenotazioni si sovrappongono:';
                                      title.style.fontWeight = '600';
                                      title.style.marginBottom = '6px';
                                      warning.appendChild(title);
                                      overlapping.forEach(r => {
                                        const row = document.createElement('div');
                                        row.className = 'overlap-row';
                                        row.style.display='flex';
                                        row.style.justifyContent='space-between';
                                        row.style.alignItems='center';
                                        row.style.gap='8px';
                                        row.style.marginBottom='6px';
                                        const txt = document.createElement('div');
                                        try{
                                          const rStart = r.start_iso ? new Date(r.start_iso).toLocaleDateString('it') : (r.start_iso||'').slice(0,10);
                                          const rEnd = r.end_iso ? new Date(r.end_iso).toLocaleDateString('it') : (r.end_iso||'').slice(0,10);
                                          txt.textContent = `${(r.client_name||r.title||'Prenotazione')} (${rStart} → ${rEnd})`;
                                        }catch(e){ txt.textContent = `${(r.client_name||r.title||'Prenotazione')} (${r.start_iso.slice(0,10)} → ${r.end_iso.slice(0,10)})`; }
                                        row.appendChild(txt);
                                        warning.appendChild(row);
                                      });
                                      // Rimuovi azioni
                                      const actions = changeModal.querySelector('.actions');
                                      if(actions) actions.style.display = 'none';
                                      // Inserisci warning
                                      changeModal.querySelector('.modal-content').insertBefore(warning, changeModal.querySelector('form'));
                                      changeModal.classList.remove('hidden');
                                    });
                                }
                              } catch(e) { alert('Conflitto con altre prenotazioni.'); }
                              return;
                            }
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
                      }
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

    // Do NOT auto-fill client_name qui; lascia il campo vuoto per l'utente.

    document.getElementById('bookingModal').classList.remove('hidden');

    // --- Submit nuova prenotazione ---
    const form = document.getElementById('bookingModalForm');
    const onSubmit = async (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const body = Object.fromEntries(data.entries());
      // require fields: car_id, start_date, end_date, client_name
      if(!body.car_id || !body.start_date || !body.end_date || !(body.client_name && body.client_name.trim())){
        alert('Compila tutti i campi obbligatori: auto, data inizio, data fine e nome cliente.');
        return;
      }
      const sDate = new Date(body.start_date);
      const eDate = new Date(body.end_date);
      if(isNaN(sDate) || isNaN(eDate) || sDate > eDate){ alert('Date non valide: assicurati che la data di inizio sia <= data di fine.'); return; }
      const start_iso = body.start_date + 'T00:00:00Z';
      const end_iso = body.end_date + 'T23:59:59Z';
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
      const payload = {
        car_id,
        start_iso,
        end_iso,
        title: body.description || body.client_name || 'Prenotazione',
        client_name: body.client_name || null,
        description: body.description || null
      };
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
}

/**
 * Inizializza la modale di modifica prenotazione
 * @param {Function} refresh - funzione per aggiornare il calendario
 */
export function setupEditBookingModal(refresh) {
  // ...estrai qui la logica di apertura e popolamento modale edit da home.js...
  // (Vedi refactoring step successivo per spostare la logica)
}
