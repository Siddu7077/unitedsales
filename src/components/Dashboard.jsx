import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CATEGORIES,
  RANGES,
  api,
  catById,
  eachDay,
  money,
  moneyShort,
  prettyDate,
  rangeDates,
  shortDate,
  weekday,
} from '../lib.js';

const ALL = 'all';
const MONEY_CATS = CATEGORIES.filter((c) => c.money);

function StatCard({ label, value, sub, color }) {
  return (
    <div className="card relative overflow-hidden p-5">
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: color }} />
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900">{value}</p>
      {sub && <p className="mt-1 text-sm text-slate-500">{sub}</p>}
    </div>
  );
}

function ChartTooltip({ active, payload, label, isMoney }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-white px-3 py-2 text-sm shadow-lg ring-1 ring-slate-200">
      <p className="mb-1 font-semibold text-slate-800">
        {prettyDate(label)} · {weekday(label)}
      </p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-slate-600">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <b className="text-slate-900">{isMoney ? money(p.value) : p.value}</b>
        </p>
      ))}
    </div>
  );
}

export default function Dashboard({ onAdd }) {
  const [range, setRange] = useState('this_week');
  const [cat, setCat] = useState('shop_sales');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const { from, to } = useMemo(() => rangeDates(range), [range]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    api
      .list(from, to)
      .then((r) => alive && setRows(r))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [from, to]);

  // One point per calendar day; days without an entry are null (gap in the line).
  const series = useMemo(() => {
    const byDate = Object.fromEntries(rows.map((r) => [r.entry_date, r]));
    return eachDay(from, to).map((d) => {
      const r = byDate[d];
      const point = { date: d };
      CATEGORIES.forEach((c) => {
        point[c.id] = r ? r[c.id] : null;
      });
      return point;
    });
  }, [rows, from, to]);

  const isAll = cat === ALL;
  const active = isAll ? null : catById(cat);
  const isMoney = isAll ? true : active.money;
  const longRange = series.length > 45;

  // Stats for the selected category
  const statCat = isAll ? catById('total_sales') : active;
  const stats = useMemo(() => {
    const vals = rows.map((r) => ({ date: r.entry_date, v: r[statCat.id] }));
    const sum = vals.reduce((a, b) => a + b.v, 0);
    const best = vals.reduce((a, b) => (b.v > (a?.v ?? -1) ? b : a), null);
    return { sum, avg: vals.length ? sum / vals.length : 0, best, days: vals.length };
  }, [rows, statCat]);

  const fmt = (n) => (statCat.money ? money(n) : Math.round(n).toLocaleString());

  // Breakdown bars: shop, fuel, etc. totals for the period
  const breakdown = useMemo(
    () =>
      MONEY_CATS.filter((c) => c.id !== 'total_sales').map((c) => ({
        name: c.label,
        color: c.color,
        value: rows.reduce((a, r) => a + r[c.id], 0),
      })),
    [rows]
  );

  const tickFmt = (d) => shortDate(d);
  const yFmt = (v) => (isMoney ? moneyShort(v) : v);

  return (
    <div className="space-y-6">
      {/* Range selector */}
      <div className="card flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex flex-wrap gap-1.5">
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className={`pill ${
                range === r.id
                  ? 'bg-slate-900 text-white shadow'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <p className="px-2 text-sm text-slate-500">
          {prettyDate(from)} – {prettyDate(to)}
        </p>
      </div>

      {error && (
        <div className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700 ring-1 ring-rose-200">
          Couldn’t load data: {error}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label={`${statCat.label} · total`}
          value={fmt(stats.sum)}
          sub={`${stats.days} day${stats.days === 1 ? '' : 's'} recorded`}
          color={statCat.color}
        />
        <StatCard
          label="Daily average"
          value={fmt(stats.avg)}
          sub="on days with entries"
          color="#14b8a6"
        />
        <StatCard
          label="Best day"
          value={stats.best ? fmt(stats.best.v) : '—'}
          sub={stats.best ? `${weekday(stats.best.date)}, ${shortDate(stats.best.date)}` : 'no data yet'}
          color="#f97316"
        />
        <StatCard
          label="Fuel vs shop"
          value={(() => {
            const f = rows.reduce((a, r) => a + r.fuel_sales, 0);
            const s = rows.reduce((a, r) => a + r.shop_sales, 0);
            return f + s ? `${Math.round((f / (f + s)) * 100)}% / ${Math.round((s / (f + s)) * 100)}%` : '—';
          })()}
          sub="share of fuel / shop sales"
          color="#8b5cf6"
        />
      </div>

      {/* Main chart */}
      <div className="card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900">
            {isAll ? 'All categories' : active.label} by day
          </h2>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setCat(ALL)}
              className={`pill ${
                isAll ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Compare all
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => setCat(c.id)}
                className={`pill ${cat === c.id ? 'text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                style={cat === c.id ? { background: c.color } : undefined}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="h-80 w-full">
          {loading ? (
            <div className="grid h-full place-items-center text-slate-400">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="grid h-full place-items-center text-center">
              <div>
                <p className="text-4xl">📭</p>
                <p className="mt-2 font-semibold text-slate-700">No entries in this period</p>
                <button
                  onClick={onAdd}
                  className="mt-3 rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-500"
                >
                  Add today’s sales
                </button>
              </div>
            </div>
          ) : (
            <ResponsiveContainer>
              {isAll ? (
                <LineChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={tickFmt} tick={{ fontSize: 12, fill: '#64748b' }} minTickGap={24} />
                  <YAxis tickFormatter={moneyShort} tick={{ fontSize: 12, fill: '#64748b' }} width={52} />
                  <Tooltip content={<ChartTooltip isMoney />} />
                  <Legend />
                  {MONEY_CATS.map((c) => (
                    <Line
                      key={c.id}
                      type="monotone"
                      dataKey={c.id}
                      name={c.label}
                      stroke={c.color}
                      strokeWidth={2.5}
                      dot={!longRange}
                      connectNulls
                    />
                  ))}
                </LineChart>
              ) : (
                <AreaChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={active.color} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={active.color} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={tickFmt} tick={{ fontSize: 12, fill: '#64748b' }} minTickGap={24} />
                  <YAxis tickFormatter={yFmt} tick={{ fontSize: 12, fill: '#64748b' }} width={52} />
                  <Tooltip content={<ChartTooltip isMoney={isMoney} />} />
                  <Area
                    type="monotone"
                    dataKey={active.id}
                    name={active.label}
                    stroke={active.color}
                    strokeWidth={3}
                    fill="url(#fill)"
                    dot={!longRange}
                    activeDot={{ r: 5 }}
                    connectNulls
                  />
                </AreaChart>
              )}
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Breakdown */}
      {rows.length > 0 && (
        <div className="card p-5">
          <h2 className="mb-4 text-lg font-bold text-slate-900">Where the money came from</h2>
          <div className="h-64 w-full">
            <ResponsiveContainer>
              <BarChart data={breakdown} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis tickFormatter={moneyShort} tick={{ fontSize: 12, fill: '#64748b' }} width={52} />
                <Tooltip
                  cursor={{ fill: 'rgba(99,102,241,0.06)' }}
                  formatter={(v) => money(v)}
                  contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,.12)' }}
                />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {breakdown.map((b) => (
                    <Cell key={b.name} fill={b.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
