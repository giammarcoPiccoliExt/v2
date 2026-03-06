// Modulo per rendering del calendario delle prenotazioni
import { softenHex, esc } from './homeutils.js';

/**
 * Renderizza il calendario delle prenotazioni
 * @param {HTMLElement} container - contenitore principale
 * @param {HTMLElement} carsCol - colonna auto
 * @param {Array} cars - lista auto
 * @param {Array} bookings - lista prenotazioni
 * @param {Date|string} startDate - data di partenza
 * @returns {Array} days - array di giorni visualizzati
 */
export function renderCalendar(container, carsCol, cars, bookings, startDate) {
  function localISO(d) {
    const dt = d || new Date();
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
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
  for (let i = 0; i < total; i++) { const d = new Date(start); d.setDate(start.getDate() + i); days.push(d); }

  // header row with day labels (calendar only)
  const headerRow = document.createElement('div'); headerRow.className = 'row';
  const nameCol = document.createElement('div'); nameCol.className = 'car-name'; headerRow.appendChild(nameCol);
  const daysWrapHeader = document.createElement('div'); daysWrapHeader.className = 'days-wrap';
  const todayIso = localISO(new Date());
  days.forEach(day => {
    const c = document.createElement('div'); c.className = 'cell';
    const dk = localISO(day);
    const wk = day.toLocaleDateString('it', { weekday: 'short' });
    const dm = day.toLocaleDateString('it', { day: 'numeric', month: 'short' });
    c.innerHTML = `<div class="day-week">${wk}</div><div class="day-date">${dm}</div>`;
    if (dk === todayIso) c.classList.add('today');
    daysWrapHeader.appendChild(c);
  });
  headerRow.appendChild(daysWrapHeader);
  container.appendChild(headerRow);

  // rows per car
  cars.forEach(car => {
    // left column card
    const card = document.createElement('div'); card.className = 'car-card';
    const sw = document.createElement('div'); sw.className = 'color-swatch'; if (car.color) sw.style.background = car.color || '#ddd';
    const info = document.createElement('div'); info.className = 'car-info';
    // modello (bold)
    const modelloEl = document.createElement('strong'); modelloEl.textContent = car.modello || '';
    modelloEl.style.display = 'block';
    info.appendChild(modelloEl);
    // descrizione (normal)
    const descrizioneEl = document.createElement('div'); descrizioneEl.textContent = car.descrizione || '';
    descrizioneEl.style.fontWeight = 'normal';
    descrizioneEl.style.display = 'block';
    info.appendChild(descrizioneEl);
    // targa (plate)
    const plateEl = document.createElement('div'); plateEl.className = 'car-plate'; plateEl.textContent = car.plate || '';
    plateEl.style.display = 'block';
    info.appendChild(plateEl);
    card.appendChild(sw); card.appendChild(info);
    carsCol.appendChild(card);
    // calendar row for this car
    const r = document.createElement('div'); r.className = 'row';
    const namePlaceholder = document.createElement('div'); namePlaceholder.className = 'car-name'; r.appendChild(namePlaceholder);
    const daysWrap = document.createElement('div'); daysWrap.className = 'days-wrap';
    days.forEach((day, idx) => {
      const dayKey = localISO(day);
      const c = document.createElement('div'); c.className = 'cell';
      if (dayKey === todayIso) c.classList.add('today');
      const b = bookings.find(bk => bk.car_id === car.id && bk.start_iso.slice(0, 10) <= dayKey && bk.end_iso.slice(0, 10) >= dayKey);
      if (b) {
        // detect adjacency to make multi-day bookings look merged
        const prevDay = (idx > 0) ? days[idx - 1] : null;
        const nextDay = (idx < days.length - 1) ? days[idx + 1] : null;
        const prevKey = prevDay ? localISO(prevDay) : null;
        const nextKey = nextDay ? localISO(nextDay) : null;
        const prevB = prevKey ? bookings.find(bk => bk.car_id === car.id && bk.start_iso.slice(0, 10) <= prevKey && bk.end_iso.slice(0, 10) >= prevKey) : null;
        const nextB = nextKey ? bookings.find(bk => bk.car_id === car.id && bk.start_iso.slice(0, 10) <= nextKey && bk.end_iso.slice(0, 10) >= nextKey) : null;
        const isPrevSame = prevB && prevB.id === b.id;
        const isNextSame = nextB && nextB.id === b.id;
        c.classList.add('booked');
        if (!isPrevSame && !isNextSame) c.classList.add('booked-single');
        else if (!isPrevSame && isNextSame) c.classList.add('booked-start');
        else if (isPrevSame && !isNextSame) c.classList.add('booked-end');
        else c.classList.add('booked-mid');
        // use car color (softened) for booking background instead of default red
        if (car && car.color) {
          const bg = softenHex(car.color, 0.72); // mix heavily with white for softer tone
          c.style.background = bg;
          // set outer border color to car color; middle cells will hide inner borders via CSS
          c.style.borderColor = car.color || 'rgba(0,0,0,0.06)';
          // ensure readable text color
          c.style.color = '#111';
        }
        const creatorName = b.creator_name || 'Utente';
        const clientLabel = b.client_name || b.title || 'Prenotazione';
        // decide visibility for client and creator names
        let showClient = true;
        let showCreator = true;
        try {
          const toLocalDate = (isoOrDay) => { const y = isoOrDay.slice(0, 4); const m = isoOrDay.slice(5, 7); const d = isoOrDay.slice(8, 10); return new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10)); };
          const startDay = (b.start_iso || '').slice(0, 10);
          const endDay = (b.end_iso || '').slice(0, 10);
          const curDay = dayKey; // localISO(day)
          if (startDay && endDay && curDay) {
            const sd = toLocalDate(startDay); const ed = toLocalDate(endDay); const cd = toLocalDate(curDay);
            if ((cd.getTime() - sd.getTime()) / 86400000 > 2) showClient = idx === 0 || idx === days.length - 1 || idx === 1 || idx === days.length - 2;
            if ((cd.getTime() - sd.getTime()) / 86400000 > 2) showCreator = idx === 0 || idx === days.length - 1;
          }
        } catch (e) { }
        const clientHtml = showClient ? `<div class="booking-client">${esc(clientLabel)}</div>` : '<div class="booking-client" style="visibility:hidden;height:1em">&nbsp;</div>';
        const creatorHtml = showCreator ? `<div class="booking-creator">${esc(creatorName)}</div>` : '<div class="booking-creator" style="visibility:hidden;height:1em">&nbsp;</div>';
        c.innerHTML = clientHtml + creatorHtml;
        // tooltip
        const startLabel = b.start_iso ? new Date(b.start_iso).toLocaleDateString('it') : (b.start_iso || '').slice(0, 10);
        const endLabel = b.end_iso ? new Date(b.end_iso).toLocaleDateString('it') : (b.end_iso || '').slice(0, 10);
        c.title = `${clientLabel} — ${creatorName} (${startLabel} → ${endLabel})`;
      }
      daysWrap.appendChild(c);
    });
    r.appendChild(daysWrap);
    container.appendChild(r);
  });
  setTimeout(() => {
    try {
      if (typeof window.scaleBookingText === 'function') window.scaleBookingText();
    } catch (e) { }
  }, 30);
  return days;
}
