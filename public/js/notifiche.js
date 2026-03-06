// Modulo per la gestione di notifiche e banner (estratto da home.js)
import { fetchJson, fetchRaw } from './utils.js';
import { createBanner } from './uiutils.js';

export function showDeletionBanner(b, fetchCars) {
  try {
    const myName = localStorage.getItem('passcode_name') || '';
    if (!(b && (b.client_name === myName || b.creator_name === myName))) return;
    // don't show if dismissed
    const key = 'dismissed_del_' + (b.original_id || b.id || '');
    if (localStorage.getItem(key)) return;
    const hdr = document.querySelector('header') || document.body;
    // remove existing banner for same id
    const existing = document.getElementById('deletedBanner_' + (b.original_id || b.id));
    if (existing) return;
    const banner = document.createElement('div'); banner.id = 'deletedBanner_' + (b.original_id || b.id); banner.className = 'deletion-banner';
    const carId = b.car_id;
    fetchCars().then(cars => {
      const car = cars.find(c => c.id === carId) || {};
      const carName = car.modello || '';
      const start = b.start_iso ? new Date(b.start_iso).toLocaleDateString('it') : '';
      const end = b.end_iso ? new Date(b.end_iso).toLocaleDateString('it') : '';
      banner.innerHTML = `<div>La prenotazione per <strong>${carName}</strong> ${(b.client_name ? (' - ' + b.client_name) : '')} (${start} → ${end}) è stata cancellata.</div>`;
      const close = document.createElement('button'); close.className = 'page-btn'; close.textContent = '✕'; close.style.marginLeft = '8px';
      close.addEventListener('click', () => { try { localStorage.setItem(key, '1'); } catch (e) { }; banner.remove(); });
      banner.appendChild(close);
      hdr.insertAdjacentElement('afterend', banner);
    }).catch(() => { });
  } catch (e) { }
}

export function showUpdateBanner(b, carsList) {
  try {
    const hdr = document.querySelector('header') || document.body;
    const id = 'updateBanner_' + (b.id || 'x');
    if (document.getElementById(id)) return; // already shown
    const banner = document.createElement('div'); banner.id = id; banner.className = 'deletion-banner';
    // Ricostruisci info auto e date
    let carName = '';
    if (b.car_id && carsList) {
      const car = carsList.find(c => c.id == b.car_id);
      if (car) {
        carName = car.modello || '';
        if (car.descrizione) carName += ' - ' + car.descrizione;
        if (car.plate) carName += ' / ' + car.plate;
      }
    }
    const start = b.start_iso ? new Date(b.start_iso).toLocaleDateString('it') : (b.start_iso || '').slice(0, 10);
    const end = b.end_iso ? new Date(b.end_iso).toLocaleDateString('it') : (b.end_iso || '').slice(0, 10);
    banner.innerHTML = `<div>La prenotazione per <strong>${carName}</strong> ${(b.client_name ? (' - ' + b.client_name) : '')} è stata <strong>modificata</strong>.<br>Nuove date: <strong>${start} → ${end}</strong></div>`;
    const close = document.createElement('button'); close.className = 'page-btn'; close.textContent = '✕'; close.style.marginLeft = '8px';
    close.addEventListener('click', () => { banner.remove(); });
    banner.appendChild(close);
    hdr.insertAdjacentElement('afterend', banner);
    setTimeout(() => { try { banner.remove(); } catch (e) { } }, 10000);
  } catch (e) { }
}

// Altre funzioni per insuranceBanner e polling possono essere estratte qui...
