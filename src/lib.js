// ---------- API ----------
const BASE = 'https://unitedsales.webhostdevs.com/api/entries.php';

function headers() {
  const pin = localStorage.getItem('sales_pin');
  return { 'Content-Type': 'application/json', ...(pin ? { 'X-Pin': pin } : {}) };
}

async function handle(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

export const api = {
  list: (from, to) => {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    return fetch(`${BASE}?${q}`, { headers: headers() }).then(handle);
  },
  save: (entry) =>
    fetch(BASE, { method: 'POST', headers: headers(), body: JSON.stringify(entry) }).then(handle),
  remove: (date) =>
    fetch(`${BASE}?date=${date}`, { method: 'DELETE', headers: headers() }).then(handle),
};

// ---------- Dates ----------
const pad = (n) => String(n).padStart(2, '0');
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromISO = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
export const todayISO = () => toISO(new Date());
export const weekday = (iso) => fromISO(iso).toLocaleDateString('en-AU', { weekday: 'long' });
export const prettyDate = (iso) =>
  fromISO(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
export const shortDate = (iso) =>
  fromISO(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });

// Weeks run Monday to Sunday.
function mondayOf(d) {
  const x = new Date(d);
  const diff = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - diff);
  return x;
}

export const RANGES = [
  { id: 'this_week', label: 'This week' },
  { id: 'last_week', label: 'Last week' },
  { id: 'fortnight', label: 'Fortnight' },
  { id: '1m', label: '1 month' },
  { id: '3m', label: '3 months' },
  { id: '6m', label: '6 months' },
  { id: '1y', label: '1 year' },
];

export function rangeDates(id, today = new Date()) {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  switch (id) {
    case 'this_week': {
      const s = mondayOf(t);
      return { from: toISO(s), to: toISO(addDays(s, 6)) };
    }
    case 'last_week': {
      const s = addDays(mondayOf(t), -7);
      return { from: toISO(s), to: toISO(addDays(s, 6)) };
    }
    case 'fortnight':
      return { from: toISO(addDays(t, -13)), to: toISO(t) };
    case '1m':
      return { from: toISO(addDays(t, -29)), to: toISO(t) };
    case '3m':
      return { from: toISO(addDays(t, -89)), to: toISO(t) };
    case '6m':
      return { from: toISO(addDays(t, -179)), to: toISO(t) };
    case '1y':
      return { from: toISO(addDays(t, -364)), to: toISO(t) };
    default:
      return { from: toISO(t), to: toISO(t) };
  }
}

// Every calendar day in a range (so missing days show as gaps, not skipped).
export function eachDay(from, to) {
  const out = [];
  for (let d = fromISO(from); toISO(d) <= to; d = addDays(d, 1)) out.push(toISO(d));
  return out;
}

// ---------- Categories ----------
export const CATEGORIES = [
  { id: 'total_sales', label: 'Total sales', color: '#6366f1', money: true },
  { id: 'fuel_sales', label: 'Fuel', color: '#f97316', money: true },
  { id: 'shop_sales', label: 'Shop', color: '#8b5cf6', money: true },
  { id: 'tobacco_sales', label: 'Tobacco', color: '#ec4899', money: true },
  { id: 'pie_face_sales', label: 'Pie Face', color: '#eab308', money: true },
  { id: 'bbq_gas', label: 'BBQ gas', color: '#14b8a6', money: true },
  { id: 'tobacco_qty', label: 'Tobacco qty', color: '#f43f5e', money: false },
];

export const catById = (id) => CATEGORIES.find((c) => c.id === id);

export const money = (n) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 })
    .format(n || 0)
    .replace('A$', '$');
export const moneyShort = (n) => {
  const v = Math.abs(n || 0);
  if (v >= 1000) return `$${(n / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
  return `$${Math.round(n || 0)}`;
};
