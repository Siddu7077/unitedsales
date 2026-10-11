import { useEffect, useState } from 'react';
import { api, prettyDate, todayISO, weekday } from '../lib.js';

const EMPTY = {
  total_sales: '',
  fuel_sales: '',
  shop_sales: '',
  bbq_gas: '',
  tobacco_qty: '',
  tobacco_sales: '',
  pie_face_sales: '',
  notes: '',
};

const FIELDS = [
  { key: 'total_sales', label: 'Total sales', icon: '💰', color: 'text-indigo-600' },
  { key: 'fuel_sales', label: 'Fuel sale', icon: '⛽', color: 'text-orange-500' },
  { key: 'shop_sales', label: 'Shop sale', icon: '🛒', color: 'text-violet-600' },
  { key: 'bbq_gas', label: 'BBQ gas', icon: '🔥', color: 'text-teal-600' },
  { key: 'tobacco', label: 'Tobacco', icon: '🚬', color: 'text-pink-600', special: true },
  { key: 'pie_face_sales', label: 'Pie Face', icon: '🥧', color: 'text-yellow-600' },
];

function Money({ value, onChange, id }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">$</span>
      <input
        id={id}
        inputMode="decimal"
        className="input pl-8"
        placeholder="0.00"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
      />
    </div>
  );
}

export default function EntryForm({ initialDate, onSaved }) {
  const [date, setDate] = useState(initialDate || todayISO());
  const [form, setForm] = useState(EMPTY);
  const [exists, setExists] = useState(false);
  const [status, setStatus] = useState({ type: '', msg: '' });
  const [saving, setSaving] = useState(false);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  // Load an existing entry when the date changes, so it can be edited.
  useEffect(() => {
    let alive = true;
    setStatus({ type: '', msg: '' });
    api
      .list(date, date)
      .then((rows) => {
        if (!alive) return;
        const r = rows[0];
        setExists(!!r);
        setForm(
          r
            ? {
                total_sales: String(r.total_sales),
                fuel_sales: String(r.fuel_sales),
                shop_sales: String(r.shop_sales),
                bbq_gas: String(r.bbq_gas),
                tobacco_qty: String(r.tobacco_qty),
                tobacco_sales: String(r.tobacco_sales),
                pie_face_sales: String(r.pie_face_sales),
                notes: r.notes || '',
              }
            : EMPTY
        );
      })
      .catch((e) => alive && setStatus({ type: 'error', msg: e.message }));
    return () => {
      alive = false;
    };
  }, [date]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.total_sales) {
      setStatus({ type: 'error', msg: 'Please enter the total sales.' });
      return;
    }
    setSaving(true);
    try {
      await api.save({ entry_date: date, ...form });
      setStatus({ type: 'ok', msg: exists ? 'Entry updated ✔' : 'Entry saved ✔' });
      setTimeout(onSaved, 700);
    } catch (err) {
      setStatus({ type: 'error', msg: err.message });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete the entry for ${prettyDate(date)}?`)) return;
    try {
      await api.remove(date);
      setForm(EMPTY);
      setExists(false);
      setStatus({ type: 'ok', msg: 'Entry deleted' });
    } catch (err) {
      setStatus({ type: 'error', msg: err.message });
    }
  };

  return (
    <form onSubmit={submit} className="card mx-auto max-w-2xl p-6 sm:p-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">
            {exists ? 'Edit entry' : 'New daily entry'}
          </h2>
          <p className="text-sm text-slate-500">
            {weekday(date)}, {prettyDate(date)}
            {exists && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">already saved</span>}
          </p>
        </div>
        <input
          type="date"
          className="input w-auto"
          value={date}
          max={todayISO()}
          onChange={(e) => e.target.value && setDate(e.target.value)}
        />
      </div>

      <div className="divide-y divide-slate-100">
        {FIELDS.map((f) => (
          <div key={f.key} className="grid items-center gap-2 py-3 sm:grid-cols-[180px_1fr] sm:gap-6">
            <label htmlFor={f.key} className={`flex items-center gap-2 font-semibold ${f.color}`}>
              <span className="text-lg">{f.icon}</span>
              {f.label}
            </label>
            {f.special ? (
              <div className="grid grid-cols-[110px_1fr] gap-3">
                <input
                  id="tobacco"
                  inputMode="numeric"
                  className="input"
                  placeholder="Qty"
                  value={form.tobacco_qty}
                  onChange={(e) => set('tobacco_qty')(e.target.value.replace(/\D/g, ''))}
                />
                <Money value={form.tobacco_sales} onChange={set('tobacco_sales')} />
              </div>
            ) : (
              <Money id={f.key} value={form[f.key]} onChange={set(f.key)} />
            )}
          </div>
        ))}
        <div className="grid items-center gap-2 py-3 sm:grid-cols-[180px_1fr] sm:gap-6">
          <label htmlFor="notes" className="font-semibold text-slate-600">
            <span className="mr-2 text-lg">📝</span>Notes
          </label>
          <input
            id="notes"
            className="input"
            placeholder="Optional"
            maxLength={255}
            value={form.notes}
            onChange={(e) => set('notes')(e.target.value)}
          />
        </div>
      </div>

      {status.msg && (
        <p
          className={`mt-4 rounded-xl px-4 py-2.5 text-sm font-medium ${
            status.type === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
          }`}
        >
          {status.msg}
        </p>
      )}

      <div className="mt-6 flex items-center justify-between gap-3">
        {exists ? (
          <button type="button" onClick={remove} className="text-sm font-semibold text-rose-600 hover:text-rose-500">
            Delete entry
          </button>
        ) : (
          <span />
        )}
        <button
          disabled={saving}
          className="rounded-full bg-gradient-to-r from-indigo-600 to-fuchsia-600 px-8 py-3 font-bold text-white shadow-lg shadow-indigo-200 transition hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : exists ? 'Update entry' : 'Save entry'}
        </button>
      </div>
    </form>
  );
}
