import { fetchJson, fetchText, fetchRaw } from './utils.js';

export async function initSettings(){
  const list = document.getElementById('carsList');
  if(!list) return;

  async function load(){
    try{
      const cars = await fetchJson('/api/cars');
      list.innerHTML = '';
      cars.forEach(c=>{
        const el = document.createElement('div'); el.className='car-card';
        const sw = document.createElement('div'); sw.className = 'color-swatch'; if(c.color) sw.style.background = c.color || '#ddd';
        const info = document.createElement('div'); info.className = 'car-info';
        const nameEl = document.createElement('strong'); nameEl.textContent = c.name;
        const plateEl = document.createElement('div'); plateEl.textContent = c.plate || '';
        info.appendChild(nameEl); info.appendChild(plateEl);
        const actions = document.createElement('div'); actions.className = 'car-actions';
        const editBtn = document.createElement('button'); editBtn.className = 'page-btn edit'; editBtn.dataset.id = c.id; editBtn.textContent = 'Modifica';
        const delBtn = document.createElement('button'); delBtn.className = 'page-btn del'; delBtn.dataset.id = c.id; delBtn.textContent = 'Elimina';
        actions.appendChild(editBtn); actions.appendChild(delBtn);
        el.appendChild(sw); el.appendChild(info); el.appendChild(actions);
        list.appendChild(el);
      });
    }catch(e){ console.error('load cars', e); }
  }

  // simple handlers (edit/delete) - opens modal if present
  list.addEventListener('click', async (ev)=>{
    const t = ev.target;
    if(t.classList.contains('del')){
      const id = t.dataset.id; if(!confirm("Eliminare l'auto?")) return;
      await fetchRaw(`/api/cars/${id}`, { method:'DELETE' });
      load();
    }
    if(t.classList.contains('edit')){
      const id = t.dataset.id;
      const modal = document.getElementById('carModal'); if(!modal) return;
      const name = modal.querySelector('input[name="name"]');
      const color = modal.querySelector('input[name="color"]');
      const plate = modal.querySelector('input[name="plate"]');
      const size = modal.querySelector('select[name="size"]');
      const res = await fetchJson(`/api/cars`);
      const car = res.find(x=>x.id==id);
      if(!car) return;
      name.value = car.name||''; color.value = car.color||'#ffffff'; plate.value = car.plate||''; size.value = car.size||'';
      const form = modal.querySelector('form'); form.setAttribute('data-edit-id', id);
      renderSwatches(color.value || '#ffffff');
      modal.classList.remove('hidden');
      const submit = async (e)=>{
        e.preventDefault();
        const body = { name: (name.value||'').trim(), color: color.value, plate: (plate.value||'').toUpperCase(), size: size.value };
        // require name, plate and size only (price optional, color may duplicate)
        const nameNorm = (body.name||'').trim();
        const plateNorm = (body.plate||'').toUpperCase();
        if(!nameNorm || !plateNorm || !body.size){
          alert('Compila i campi obbligatori: nome, targa e dimensione.');
          return;
        }
        // client-side duplicate check (exclude current id)
        try{
          const existing = await fetchJson('/api/cars');
          const conflict = existing.find(x => (x.id != id) && ( ((x.name||'').trim().toLowerCase() === nameNorm.toLowerCase()) || (plateNorm && ((x.plate||'').toUpperCase() === plateNorm)) ));
          if(conflict){ alert('Errore: Nome o targa già esistente per un\'altra auto.'); return; }
        }catch(e){ /* ignore and continue to server validation */ }
        const res = await fetchRaw(`/api/cars/${id}`, { method:'PUT', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
        if(res.status===409){ alert('Errore: Nome o targa già esistente.'); return; }
        if(!res.ok){ alert('Aggiornamento fallito'); return; }
        modal.classList.add('hidden'); form.removeEventListener('submit', submit); load();
      };
      form.addEventListener('submit', submit);
    }
  });

  // Add new car
  const addBtn = document.getElementById('newCarBtn');
  if(addBtn){
    addBtn.addEventListener('click', ()=>{
      const modal = document.getElementById('carModal'); if(!modal) return;
      const form = modal.querySelector('form'); form.removeAttribute('data-edit-id');
      // reset fields
      form.querySelector('input[name="name"]').value = '';
      form.querySelector('input[name="color"]').value = '';
      form.querySelector('input[name="plate"]').value = '';
      form.querySelector('select[name="size"]').value = 'media';
      renderSwatches('#ffffff');
      modal.classList.remove('hidden');
      const submit = async (e)=>{
        e.preventDefault();
        const data = new FormData(form); const body = Object.fromEntries(data.entries());
        // ensure plate is uppercase
        body.plate = (body.plate||'').toUpperCase();
        // require name, plate and size only; price optional, color may duplicate
        const nameNorm = (body.name||'').trim();
        const plateNorm = (body.plate||'').toUpperCase();
        if(!nameNorm || !plateNorm || !body.size){
          alert('Compila i campi obbligatori: nome, targa e dimensione.');
          return;
        }
        // client-side duplicate check
        try{
          const existing = await fetchJson('/api/cars');
          const conflict = existing.find(x => ( ((x.name||'').trim().toLowerCase() === nameNorm.toLowerCase()) || (plateNorm && ((x.plate||'').toUpperCase() === plateNorm)) ));
          if(conflict){ alert('Errore: Nome o targa già esistente.'); return; }
        }catch(e){ /* ignore and rely on server */ }
        const res = await fetchRaw('/api/cars', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
        if(res.status===409){ alert('Errore: Nome o targa già esistente.'); return; }
        if(!res.ok){ alert('Salvataggio fallito'); return; }
        modal.classList.add('hidden'); form.removeEventListener('submit', submit); load();
      };
      form.addEventListener('submit', submit);
    });
  }

  // Users modal: list devices and allow approve/remove
  const passcodesBtn = document.getElementById('passcodesBtn');

  async function loadDevices(){
    try{
          const devs = await fetchJson('/api/devices');
          devicesModalList.innerHTML = '';
          devs.forEach(d=>{
              const el = document.createElement('div'); el.className = 'device-row';
              const left = document.createElement('div'); left.className = 'device-left';
              const idDiv = document.createElement('div'); idDiv.className = 'device-id'; idDiv.innerHTML = `<strong>${d.id}</strong>`;
              const input = document.createElement('input'); input.dataset.id = d.id; input.className = 'device-name-input'; input.value = d.name||''; input.placeholder = 'Nome dispositivo';
              left.appendChild(idDiv); left.appendChild(input);
              const actions = document.createElement('div'); actions.className = 'device-actions';
              const saveBtn = document.createElement('button'); saveBtn.className = 'saveName page-btn'; saveBtn.textContent = 'Salva';
              actions.appendChild(saveBtn);
              if(d.approved===1){ const remove = document.createElement('button'); remove.className = 'remove page-btn'; remove.textContent = 'Remove'; actions.appendChild(remove); }
              else { const approve = document.createElement('button'); approve.className = 'approve page-btn'; approve.textContent = 'Approve'; actions.appendChild(approve); }
              el.appendChild(left); el.appendChild(actions);
              saveBtn.addEventListener('click', async ()=>{ const name = input.value||''; await fetchRaw(`/api/devices/${encodeURIComponent(d.id)}`, { method:'PUT', headers:{'content-type':'application/json'}, body: JSON.stringify({ action:'rename', name }) }); loadDevices(); });
              const approveBtn = actions.querySelector('.approve'); if(approveBtn) approveBtn.addEventListener('click', async ()=>{ await fetchRaw(`/api/devices/${encodeURIComponent(d.id)}`, { method:'PUT', headers:{'content-type':'application/json'}, body: JSON.stringify({ action:'approve' }) }); loadDevices(); });
              const removeBtn = actions.querySelector('.remove'); if(removeBtn) removeBtn.addEventListener('click', async ()=>{ if(!confirm('Rimuovere il dispositivo?')) return; await fetchRaw(`/api/devices/${encodeURIComponent(d.id)}`, { method:'PUT', headers:{'content-type':'application/json'}, body: JSON.stringify({ action:'remove' }) }); loadDevices(); });
              devicesModalList.appendChild(el);
            });
    }catch(e){ console.error('load devices', e); }
  }
  passcodesBtn?.addEventListener('click', ()=>{ if(!passcodesModal) return; passcodesModal.classList.remove('hidden'); loadPasscodes(); });
  const passcodesCloseBtn = document.getElementById('passcodesCloseBtn');
  if(passcodesCloseBtn) passcodesCloseBtn.addEventListener('click', ()=>{ if(!passcodesModal) return; passcodesModal.classList.add('hidden'); });
  // modal close top-left
  document.getElementById('usersModalClose')?.addEventListener('click', ()=>{ usersModal.classList.add('hidden'); });
  document.getElementById('carModalClose')?.addEventListener('click', ()=>{ document.getElementById('carModal').classList.add('hidden'); });
  document.getElementById('bookingModalClose')?.addEventListener('click', ()=>{ document.getElementById('bookingModal').classList.add('hidden'); });

  async function loadPasscodes(){
    try{
      const rows = await fetchJson('/api/passcodes');
      passcodesList.innerHTML = '';
      rows.forEach(r=>{
        const el = document.createElement('div'); el.className = 'pass-row';
        const info = document.createElement('div'); info.className = 'info';
        const nameEl = document.createElement('strong'); nameEl.textContent = r.name;
        const idDiv = document.createElement('div'); idDiv.className = 'card-meta dates'; idDiv.textContent = `id: ${r.id}`;
        info.appendChild(nameEl); info.appendChild(idDiv);
        const actions = document.createElement('div'); actions.className = 'device-actions';
        const del = document.createElement('button'); del.className = 'delPass page-btn'; del.dataset.id = r.id; del.textContent = 'Elimina'; actions.appendChild(del);
        el.appendChild(info); el.appendChild(actions);
        del.addEventListener('click', async ()=>{ if(!confirm("Eliminare il passcode?")) return; await fetchRaw(`/api/passcodes/${r.id}`, { method:'DELETE' }); loadPasscodes(); });
        passcodesList.appendChild(el);
      });
    }catch(e){ console.error('load passcodes', e); }
  }

  addPassBtn?.addEventListener('click', async ()=>{
    const name = (newPassName.value||'').trim(); const password = (newPassValue.value||'').trim();
    if(!name || !password) return alert('Inserisci nome e passcode');
    await fetchRaw('/api/passcodes', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ name, password }) });
    newPassName.value=''; newPassValue.value=''; loadPasscodes();
  });

  // populate color swatches (25 colors) when car modal opens
  const colorPalette = ['#FF6633','#FFB399','#FF33FF','#FFFF99','#00B3E6','#E6B333','#3366E6','#999966','#99FF99','#B34D4D','#80B300','#809900','#E6B3B3','#6680B3','#66991A','#FF99E6','#CCFF1A','#FF1A66','#E6331A','#33FFCC','#66994D','#B366CC','#4D8000','#B33300','#CC80CC'];
  function renderSwatches(selected){
    const sw = document.getElementById('colorSwatches'); if(!sw) return; sw.innerHTML='';
    colorPalette.forEach(hex=>{
      const b = document.createElement('button'); b.type='button'; b.className='swatch-btn'; b.style.background = hex;
      if(hex===selected) b.classList.add('selected');
      b.addEventListener('click', ()=>{ document.querySelector('#carModal input[name="color"]').value = hex; renderSwatches(hex); });
      sw.appendChild(b);
    });
  }

  // when car modal shows, initialize swatches and wire cancel/delete
  const carModal = document.getElementById('carModal');
  carModal?.addEventListener('show', ()=>{ renderSwatches('#ffffff'); });
  document.getElementById('carCancelBtn')?.addEventListener('click', ()=>{ carModal.classList.add('hidden'); });
  // delete in modal
  document.getElementById('carDeleteBtn')?.addEventListener('click', async ()=>{
    const id = document.querySelector('#carModalForm [data-edit-id]')?.getAttribute('data-edit-id');
    if(!id) return; if(!confirm("Eliminare l'auto?")) return; await fetchRaw(`/api/cars/${id}`, { method:'DELETE' }); carModal.classList.add('hidden'); load();
  });

  load();
}
