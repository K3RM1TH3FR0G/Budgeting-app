/* ── DOM HELPERS ── */
export const $  = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ── ID GENERATION ── */
export const genId = () =>
  crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substr(2, 12) + '_' + Date.now().toString(36);

/* ── XSS GUARD ──
   Always escape user-supplied strings before injecting into innerHTML. */
export const esc = s =>
  (s == null ? '' : String(s))
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#x27;');

/* ── NUMBER FORMATTERS ── */
export const fmt = n => {
  const a = Math.abs(n);
  return (n < 0 ? '-$' : '$') + a.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
export const fmtK = n =>
  '$' + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 });

export const fmtAxisVal = n =>
  n >= 1000 ? '$' + (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'k' : '$' + Math.round(n);

/* ── DATE HELPERS ── */
export const fmtDate  = ds => {
  const d = new Date(ds + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
export const todayStr = () => new Date().toISOString().split('T')[0];

/* ── AVATAR HELPERS ── */
export const AVATAR_COLORS = ['#8b78f5', '#3b82f6', '#ff9f43', '#4ec9ff', '#ff4d6a'];
export const initials    = n => (n || '').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
export const avatarColor = n => AVATAR_COLORS[(n || '').charCodeAt(0) % AVATAR_COLORS.length];

/* ── MATH ── */
export const niceNumber = n => {
  if (n <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(n)));
  const f = n / p;
  if (f <= 1) return p;
  if (f <= 2) return 2 * p;
  if (f <= 5) return 5 * p;
  return 10 * p;
};

export const hexToRgba = (hex, alpha) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};
