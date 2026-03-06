// Utility generali estratte da home.js

// Soften a hex color by mixing it with white (amount 0..1)
export function softenHex(hex, amount) {
  try {
    if (!hex) return '';
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(h => h + h).join('');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const mix = (v) => Math.round(v + (255 - v) * amount);
    return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
  } catch (e) { return hex; }
}

// Format a date as short label (e.g. lun 4 mar)
export function formatDayLabel(date) {
  const d = new Date(date);
  return d.toLocaleDateString('it', { weekday: 'short', month: 'short', day: 'numeric' });
}

// Escape HTML
export function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
