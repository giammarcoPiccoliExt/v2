// Test automatico end-to-end per assicurazione: login, forza la generazione della notifica, aggiorna la data e verifica la rimozione
// Da lanciare con: node test/insuranceBanner.test.js

import fetch from 'node-fetch';
import assert from 'assert';

const BASE = 'http://localhost:3001';
const PASSWORD = process.env.PASSCODE_PASSWORD || 'inserisci_password_valida'; // <-- Sostituisci o usa variabile env

let AUTH_TOKEN = null;

// Utility: elimina tutte le notifiche insurance (se esiste endpoint)
async function deleteAllInsuranceNotifications() {
  const notifs = await getNotifications();
  const insuranceNotifs = notifs.filter(n => n.type === 'insurance');
  for(const n of insuranceNotifs) {
    if(n.notification_id) {
      const res = await fetch(BASE + `/api/notifications/${n.notification_id}/dismiss`, {
        method: 'POST',
        headers: AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {}
      });
      if(res.ok) {
        console.log(`[DEBUG] Notifica insurance ${n.notification_id} dismessa.`);
      } else {
        console.warn(`[DEBUG] Errore nel dismiss notifica ${n.notification_id}`);
      }
    }
  }
}

async function login() {
  const res = await fetch(BASE + '/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD })
  });
  assert(res.ok, 'Login fallito');
  const data = await res.json();
  AUTH_TOKEN = data.token;
  assert(AUTH_TOKEN, 'Token non ricevuto');
  console.log('Login OK, utente:', data.name);
}

async function getNotifications() {
  const res = await fetch(BASE + '/api/notifications', {
    headers: AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {}
  });
  assert(res.ok, 'GET /api/notifications failed');
  return res.json();
}

async function getCars() {
  const res = await fetch(BASE + '/api/cars', {
    headers: AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {}
  });
  assert(res.ok, 'GET /api/cars failed');
  return res.json();
}

async function updateInsurance(carId, newDate) {
  const res = await fetch(BASE + `/api/cars/${carId}`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      ...(AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {})
    },
    body: JSON.stringify({ insurance_expiry_iso: newDate })
  });
  assert(res.ok, 'PUT /api/cars/:id failed');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async function testInsuranceBannerFlow() {
  await login();
  // Pulisci tutte le notifiche insurance prima di iniziare
  await deleteAllInsuranceNotifications();
  // 1. Trova un'auto qualsiasi
  const cars = await getCars();
  assert(cars.length > 0, 'Nessuna auto trovata');
  const car = cars[0];
  console.log('Test su auto:', car.modello, car.id);

  // 2. Imposta la data assicurazione a DOMANI per forzare la notifica
  const tomorrow = new Date(Date.now() + 24*60*60*1000).toISOString().slice(0,10);
  await updateInsurance(car.id, tomorrow);
  console.log('Data assicurazione impostata a domani:', tomorrow);

  // 3. Attendi la generazione della notifica insurance (max 30s, polling ogni 2s)
  let insuranceNotif = null;
  for(let i=0; i<15; i++) {
    const notifs = await getNotifications();
    // DEBUG: stampa tutte le insurance trovate
    const allIns = notifs.filter(n => n.type === 'insurance');
    console.log(`[DEBUG] Ciclo ${i+1}: notifiche insurance trovate:`, JSON.stringify(allIns, null, 2));
    insuranceNotif = allIns.find(n => n.car && n.car.id == car.id && !n.dismissed);
    if(insuranceNotif) break;
    await sleep(2000);
  }
  assert(insuranceNotif, 'La notifica insurance non è stata generata dopo update a domani');
  console.log('Notifica insurance generata:', insuranceNotif);

  // 4. Aggiorna la data assicurazione a +30 giorni (per "risolvere" la notifica)
  const newDate = new Date(Date.now() + 30*24*60*60*1000).toISOString().slice(0,10);
  await updateInsurance(car.id, newDate);
  console.log('Data assicurazione aggiornata a', newDate);

  // 5. Attendi e verifica che la notifica insurance sia sparita (max 10s)
  let gone = false;
  for(let i=0; i<10; i++) {
    const notifs2 = await getNotifications();
    const stillThere = notifs2.find(n => n.type === 'insurance' && n.car && n.car.id === car.id && !n.dismissed);
    if(!stillThere) { gone = true; break; }
    await sleep(1000);
  }
  assert(gone, 'La notifica insurance non è stata rimossa dopo update');
  console.log('Notifica insurance rimossa correttamente dopo update.');

  // 6. (Opzionale) Riporta la data indietro per test ripetibili
  // await updateInsurance(car.id, car.insurance_expiry_iso);

  console.log('TEST PASSATO');
})().catch(e => { console.error('TEST FALLITO:', e); process.exit(1); });
