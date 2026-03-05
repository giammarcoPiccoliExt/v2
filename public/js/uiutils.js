// Utility per creare banner generici
export function createBanner({ id, className = '', html = '', buttons = [], timeout = 0, parent = null }) {
  if (document.getElementById(id)) return null;
  const banner = document.createElement('div');
  banner.id = id;
  banner.className = className;
  banner.innerHTML = html;
  const btnWrap = document.createElement('div');
  btnWrap.style.display = 'flex';
  btnWrap.style.gap = '8px';
  btnWrap.style.marginLeft = '8px';
  (buttons || []).forEach(btnCfg => {
    const btn = document.createElement('button');
    btn.className = btnCfg.className || 'page-btn';
    btn.textContent = btnCfg.text;
    btn.onclick = btnCfg.onClick;
    btnWrap.appendChild(btn);
  });
  if (buttons && buttons.length) banner.appendChild(btnWrap);
  (parent || document.body).insertAdjacentElement('afterend', banner);
  if (timeout > 0) setTimeout(() => { try { banner.remove(); } catch (e) {} }, timeout);
  return banner;
}

// Utility per creare modali generici
export function createModal({ id, html = '', onSubmit = null, onCancel = null }) {
  let modal = document.getElementById(id);
  if (!modal) {
    modal = document.createElement('div');
    modal.id = id;
    modal.className = 'modal';
    modal.innerHTML = html;
    document.body.appendChild(modal);
  }
  modal.classList.remove('hidden');
  if (onSubmit) {
    const form = modal.querySelector('form');
    if (form) {
      form.onsubmit = function (ev) {
        ev.preventDefault();
        onSubmit(ev, modal);
      };
    }
  }
  if (onCancel) {
    const cancelBtn = modal.querySelector('.modal-close, .cancel-btn, [type="button"]');
    if (cancelBtn) cancelBtn.onclick = () => { modal.classList.add('hidden'); onCancel(modal); };
  }
  return modal;
}

// Funzioni di fetch dati unificate
export async function fetchCars() { return (await import('./utils.js')).fetchJson('/api/cars'); }
export async function fetchBookings() { return (await import('./utils.js')).fetchJson('/api/bookings'); }
