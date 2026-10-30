import { useEffect, useState } from 'react';
import { api, money, prettyDate, rangeDates, todayISO, weekday } from '../lib.js';

export default function History({ onEdit }) {
  const initial = rangeDates('3m');
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(todayISO());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    api
      .list(from, to)
      .then((r) => setRows([...r].reverse())) // newest first
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [from, to]);

  const remove = async (date) => {
    if (!window.confirm(`Delete the entry for ${prettyDate(date)}?`)) return;
    await api.remove(date).catch((e) => setError(e.message));
    load();
  };

  const th = 'px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-white-500';

  return (
    <div className="card overflow-hidden x-hero">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white-100 p-5">
        <div>
          <h2 className="text-lg font-bold text-white-900">Entry history</h2>
          <p className="text-sm text-white-500">{rows.length} entries · newest first</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <input type="date" className="input w-auto" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
          <span className="text-white-400">to</span>
          <input type="date" className="input w-auto" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} />
        </div>
      </div>

      {error && <p className="m-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-white-50">
            <tr>
              <th className={`${th} text-left`}>Date</th>
              <th className={th}>Total</th>
              <th className={th}>Fuel</th>
              <th className={th}>Shop</th>
              <th className={th}>BBQ gas</th>
              <th className={th}>Tobacco</th>
              <th className={th}>Pie Face</th>
              <th className={th}></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white-100">
            {loading && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-white-400">Loading…</td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-white-400">No entries in this date range.</td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.entry_date} className="hover:bg-indigo-50/40">
                <td className="px-4 py-3">
                  <p className="font-semibold text-white-900">{prettyDate(r.entry_date)}</p>
                  <p className="text-xs text-white-500">{weekday(r.entry_date)}</p>
                </td>
                <td className="px-4 py-3 text-right font-bold text-indigo-600">{money(r.total_sales)}</td>
                <td className="px-4 py-3 text-right text-white-700">{money(r.fuel_sales)}</td>
                <td className="px-4 py-3 text-right text-white-700">{money(r.shop_sales)}</td>
                <td className="px-4 py-3 text-right text-white-700">{money(r.bbq_gas)}</td>
                <td className="px-4 py-3 text-right text-white-700">
                  {money(r.tobacco_sales)}
                  <span className="ml-1 text-xs text-white-400">({r.tobacco_qty})</span>
                </td>
                <td className="px-4 py-3 text-right text-white-700">{money(r.pie_face_sales)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <button onClick={() => onEdit(r.entry_date)} className="mr-3 font-semibold text-indigo-600 hover:text-indigo-500">
                    Edit
                  </button>
                  <button onClick={() => remove(r.entry_date)} className="font-semibold text-rose-500 hover:text-rose-400">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
