// Test automatico per assicurazione: aggiorna la data e verifica banner e notifiche
// Da lanciare con: node test/insuranceBanner.test.js

import fetch from 'node-fetch';
import assert from 'assert';

const BASE = 'http://localhost:3001';

async function getNotifications() {
  const res = await fetch(BASE + '/api/notifications');
  assert(res.ok, 'GET /api/notifications failed');
  return res.json();
}

async function getCars() {
  const res = await fetch(BASE + '/api/cars');
  assert(res.ok, 'GET /api/cars failed');
  return res.json();
}

async function updateInsurance(carId, newDate) {
  const res = await fetch(BASE + `/api/cars/${carId}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ insurance_expiry_iso: newDate })
  });
  assert(res.ok, 'PUT /api/cars/:id failed');
}

(async function testInsuranceBannerFlow() {
  // 1. Trova un'auto con notifica insurance attiva
  const notifs = await getNotifications();
  const insurance = notifs.find(n => n.type === 'insurance' && n.car && !n.dismissed);
  assert(insurance, 'Nessuna notifica insurance attiva trovata');
  const car = insurance.car;
  console.log('Test su auto:', car.modello, car.id);

  // 2. Aggiorna la data assicurazione a +30 giorni
  const newDate = new Date(Date.now() + 30*24*60*60*1000).toISOString().slice(0,10);
  await updateInsurance(car.id, newDate);
  console.log('Data assicurazione aggiornata a', newDate);

  // 3. Attendi e verifica che la notifica insurance sia sparita
  await new Promise(r => setTimeout(r, 1000));
  const notifs2 = await getNotifications();
  const stillThere = notifs2.find(n => n.type === 'insurance' && n.car && n.car.id === car.id && !n.dismissed);
  assert(!stillThere, 'La notifica insurance non è stata rimossa dopo update');
  console.log('Notifica insurance rimossa correttamente dopo update.');

  // 4. (Opzionale) Riporta la data indietro per test ripetibili
  // await updateInsurance(car.id, insurance.car.insurance_expiry_iso);

  console.log('TEST PASSATO');
})().catch(e => { console.error('TEST FALLITO:', e); process.exit(1); });
