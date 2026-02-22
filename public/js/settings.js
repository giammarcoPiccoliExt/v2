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
        el.innerHTML = `<div class="color-swatch" style="background:${c.color||'#ddd'}"></div><div class="car-info"><strong>${c.name}</strong><div>${c.plate||''}</div></div><div class="car-actions"><button data-id="${c.id}" class="page-btn edit">Modifica</button><button data-id="${c.id}" class="page-btn del">Elimina</button></div>`;
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
      const price = modal.querySelector('input[name="price_per_day"]');
      const res = await fetchJson(`/api/cars`);
      const car = res.find(x=>x.id==id);
      if(!car) return;
      name.value = car.name||''; color.value = car.color||'#ffffff'; plate.value = car.plate||''; size.value = car.size||''; price.value = car.price_per_day||'';
      const form = modal.querySelector('form'); form.setAttribute('data-edit-id', id);
      renderSwatches(color.value || '#ffffff');
      modal.style.display='flex';
      const submit = async (e)=>{
        e.preventDefault();
        const body = { name: name.value, color: color.value, plate: (plate.value||'').toUpperCase(), size: size.value, price_per_day: price.value };
        await fetchRaw(`/api/cars/${id}`, { method:'PUT', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
        modal.style.display='none'; form.removeEventListener('submit', submit); load();
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
      form.querySelector('select[name="size"]').value = 'normal';
      form.querySelector('input[name="price_per_day"]').value = '';
      renderSwatches('#ffffff');
      modal.style.display='flex';
      const submit = async (e)=>{
        e.preventDefault();
        const data = new FormData(form); const body = Object.fromEntries(data.entries());
        // ensure plate is uppercase
        body.plate = (body.plate||'').toUpperCase();
        await fetchRaw('/api/cars', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
        modal.style.display='none'; form.removeEventListener('submit', submit); load();
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
          const el = document.createElement('div'); el.style.display='flex'; el.style.justifyContent='space-between'; el.style.alignItems='center'; el.style.padding='8px 0';
          const buttons = [];
          // Save (rename) always
          buttons.push('<button class="saveName page-btn">Salva</button>');
          if(d.approved===1){
            // show Remove only
            buttons.push('<button class="remove page-btn">Remove</button>');
          } else {
            // show Approve only
            buttons.push('<button class="approve page-btn">Approve</button>');
          }
          el.innerHTML = `<div style="flex:1"><div style="font-size:12px;color:#333"><strong>${d.id}</strong></div><input data-id="${d.id}" class="device-name-input" value="${d.name||''}" style="width:100%;margin-top:6px" placeholder="Nome dispositivo" /></div><div style="display:flex;gap:6px;flex-shrink:0;margin-left:12px">${buttons.join('')}</div>`;
          const saveBtn = el.querySelector('.saveName');
          const approve = el.querySelector('.approve');
          const remove = el.querySelector('.remove');
          const input = el.querySelector('.device-name-input');
          saveBtn.addEventListener('click', async ()=>{ const name = input.value||''; await fetchRaw(`/api/devices/${encodeURIComponent(d.id)}`, { method:'PUT', headers:{'content-type':'application/json'}, body: JSON.stringify({ action:'rename', name }) }); loadDevices(); });
          if(approve) approve.addEventListener('click', async ()=>{ await fetchRaw(`/api/devices/${encodeURIComponent(d.id)}`, { method:'PUT', headers:{'content-type':'application/json'}, body: JSON.stringify({ action:'approve' }) }); loadDevices(); });
          if(remove) remove.addEventListener('click', async ()=>{ if(!confirm('Rimuovere il dispositivo?')) return; await fetchRaw(`/api/devices/${encodeURIComponent(d.id)}`, { method:'PUT', headers:{'content-type':'application/json'}, body: JSON.stringify({ action:'remove' }) }); loadDevices(); });
          devicesModalList.appendChild(el);
        });
    }catch(e){ console.error('load devices', e); }
  }
  passcodesBtn?.addEventListener('click', ()=>{ if(!passcodesModal) return; passcodesModal.style.display='flex'; loadPasscodes(); });
  passcodesCloseBtn?.addEventListener('click', ()=>{ if(!passcodesModal) return; passcodesModal.style.display='none'; });
  // modal close top-left
  document.getElementById('usersModalClose')?.addEventListener('click', ()=>{ usersModal.style.display='none'; });
  document.getElementById('carModalClose')?.addEventListener('click', ()=>{ document.getElementById('carModal').style.display='none'; });
  document.getElementById('bookingModalClose')?.addEventListener('click', ()=>{ document.getElementById('bookingModal').style.display='none'; });

  async function loadPasscodes(){
    try{
      const rows = await fetchJson('/api/passcodes');
      passcodesList.innerHTML = '';
      rows.forEach(r=>{
        const el = document.createElement('div'); el.style.display='flex'; el.style.justifyContent='space-between'; el.style.alignItems='center'; el.style.padding='8px 0';
        el.innerHTML = `<div style="flex:1"><strong>${r.name}</strong><div style="font-size:12px;color:#666">id: ${r.id}</div></div><div style="display:flex;gap:6px"><button data-id="${r.id}" class="delPass page-btn">Elimina</button></div>`;
        const del = el.querySelector('.delPass');
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
      const b = document.createElement('button'); b.type='button'; b.className='page-btn'; b.style.width='28px'; b.style.height='28px'; b.style.padding='0'; b.style.borderRadius='6px'; b.style.border='1px solid #ccc'; b.style.background=hex;
      if(hex===selected) b.style.outline='3px solid #333';
      b.addEventListener('click', ()=>{ document.querySelector('#carModal input[name="color"]').value = hex; renderSwatches(hex); });
      sw.appendChild(b);
    });
  }

  // when car modal shows, initialize swatches and wire cancel/delete
  const carModal = document.getElementById('carModal');
  carModal?.addEventListener('show', ()=>{ renderSwatches('#ffffff'); });
  document.getElementById('carCancelBtn')?.addEventListener('click', ()=>{ carModal.style.display='none'; });
  // delete in modal
  document.getElementById('carDeleteBtn')?.addEventListener('click', async ()=>{
    const id = document.querySelector('#carModalForm [data-edit-id]')?.getAttribute('data-edit-id');
    if(!id) return; if(!confirm("Eliminare l'auto?")) return; await fetchRaw(`/api/cars/${id}`, { method:'DELETE' }); carModal.style.display='none'; load();
  });

  load();
}
