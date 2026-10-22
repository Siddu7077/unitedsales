import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
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
  todayISO,
  weekday,
} from '../lib.js';
import Insights from './Insights.jsx';

const ALL = 'all';
const MONEY_CATS = CATEGORIES.filter((c) => c.money);
// Categories shown in the "Where the money came from" bars (no total / fuel)
const BREAKDOWN_EXCLUDE = ['total_sales', 'fuel_sales'];
const EXPECTED_COLOR = '#f59e0b'; // amber
const LAST_WEEK_COLOR = '#94a3b8'; // slate

// ---- small date helpers (UTC-safe, no timezone drift) ----
const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dow = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();

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
  const fmt = (v) => (v == null ? '—' : isMoney ? money(v) : v);
  const point = payload[0]?.payload || {};
  const actual = point.__actual;
  const expected = point.__expected;
  const diff =
    actual != null && expected ? ((actual - expected) / expected) * 100 : null;

  return (
    <div className="rounded-xl bg-white px-3 py-2 text-sm shadow-lg ring-1 ring-slate-200">
      <p className="mb-1 font-semibold text-slate-800">
        {prettyDate(label)} · {weekday(label)}
      </p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-slate-600">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <b className="text-slate-900">{fmt(p.value)}</b>
        </p>
      ))}
      {diff != null && (
        <p className={`mt-1 text-xs font-semibold ${diff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
          {diff >= 0 ? '▲' : '▼'} {Math.abs(diff).toFixed(1)}% vs expected
        </p>
      )}
    </div>
  );
}

export default function Dashboard({ onAdd }) {
  const [range, setRange] = useState('this_week');
  const [cat, setCat] = useState('shop_sales');
  const [rows, setRows] = useState([]);
  const [history, setHistory] = useState([]); // every entry ever, used for last week + expected
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const { from, to } = useMemo(() => rangeDates(range), [range]);

  // Entries for the selected period
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

  // All available history (loaded once) for last-week and expected-average lines
  useEffect(() => {
    let alive = true;
    api
      .list('2000-01-01', todayISO())
      .then((r) => alive && setHistory(r))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Index history by date, and group by weekday (sorted oldest → newest)
  const { byDate, byWeekday } = useMemo(() => {
    const byDate = {};
    const byWeekday = [[], [], [], [], [], [], []];
    [...history]
      .sort((a, b) => (a.entry_date < b.entry_date ? -1 : 1))
      .forEach((r) => {
        byDate[r.entry_date] = r;
        byWeekday[dow(r.entry_date)].push(r);
      });
    return { byDate, byWeekday };
  }, [history]);

  // Expected value for a category on a date = average of that category on the
  // same weekday over ALL earlier entries (e.g. every previous Friday).
  const expectedFor = (date, catId) => {
    const prior = byWeekday[dow(date)].filter((r) => r.entry_date < date);
    if (!prior.length) return null;
    return prior.reduce((a, r) => a + r[catId], 0) / prior.length;
  };

  // One point per calendar day; days without an entry are null (gap in the line).
  const series = useMemo(() => {
    const periodByDate = Object.fromEntries(rows.map((r) => [r.entry_date, r]));
    return eachDay(from, to).map((d) => {
      const r = periodByDate[d];
      const lw = byDate[addDays(d, -7)];
      const point = { date: d };
      CATEGORIES.forEach((c) => {
        point[c.id] = r ? r[c.id] : null;
        point[`${c.id}__last`] = lw ? lw[c.id] : null;
        point[`${c.id}__exp`] = expectedFor(d, c.id);
      });
      return point;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, from, to, byDate, byWeekday]);

  const isAll = cat === ALL;
  const active = isAll ? null : catById(cat);
  const isMoney = isAll ? true : active.money;
  const longRange = series.length > 45;

  // Series for the single-category chart (adds the 3 named keys + tooltip helpers)
  const chartData = useMemo(() => {
    if (isAll) return series;
    return series.map((p) => ({
      ...p,
      current: p[active.id],
      lastWeek: p[`${active.id}__last`],
      expected: p[`${active.id}__exp`],
      __actual: p[active.id],
      __expected: p[`${active.id}__exp`],
    }));
  }, [series, isAll, active]);

  // Stats for the selected category
  const statCat = isAll ? catById('total_sales') : active;
  const stats = useMemo(() => {
    const vals = rows.map((r) => ({ date: r.entry_date, v: r[statCat.id] }));
    const sum = vals.reduce((a, b) => a + b.v, 0);
    const best = vals.reduce((a, b) => (b.v > (a?.v ?? -1) ? b : a), null);
    return { sum, avg: vals.length ? sum / vals.length : 0, best, days: vals.length };
  }, [rows, statCat]);

  // Period comparison: actual vs expected, and vs last week (only days where both exist)
  const compare = useMemo(() => {
    if (isAll) return null;
    let act = 0, exp = 0, act2 = 0, lw = 0;
    chartData.forEach((p) => {
      if (p.current != null && p.expected != null) {
        act += p.current;
        exp += p.expected;
      }
      if (p.current != null && p.lastWeek != null) {
        act2 += p.current;
        lw += p.lastWeek;
      }
    });
    return {
      vsExpected: exp ? ((act - exp) / exp) * 100 : null,
      vsLast: lw ? ((act2 - lw) / lw) * 100 : null,
    };
  }, [chartData, isAll]);

  const fmt = (n) => (statCat.money ? money(n) : Math.round(n).toLocaleString());

  // Breakdown bars: shop, tobacco, pie face, BBQ gas… (no total, no fuel)
  const breakdown = useMemo(
    () =>
      MONEY_CATS.filter((c) => !BREAKDOWN_EXCLUDE.includes(c.id)).map((c) => ({
        name: c.label,
        color: c.color,
        value: rows.reduce((a, r) => a + r[c.id], 0),
      })),
    [rows]
  );

  const tickFmt = (d) => shortDate(d);
  const yFmt = (v) => (isMoney ? moneyShort(v) : v);

  const Delta = ({ label, value }) =>
    value == null ? null : (
      <span
        className={`rounded-full px-3 py-1 text-xs font-semibold ${
          value >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
        }`}
      >
        {value >= 0 ? '▲' : '▼'} {Math.abs(value).toFixed(1)}% {label}
      </span>
    );

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
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {isAll ? 'All categories' : active.label} by day
            </h2>
            {compare && (
              <div className="mt-2 flex flex-wrap gap-2">
                <Delta label="vs expected average" value={compare.vsExpected} />
                <Delta label="vs last week" value={compare.vsLast} />
              </div>
            )}
          </div>
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
                <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={active.color} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={active.color} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={tickFmt} tick={{ fontSize: 12, fill: '#64748b' }} minTickGap={24} />
                  <YAxis tickFormatter={yFmt} tick={{ fontSize: 12, fill: '#64748b' }} width={52} />
                  <Tooltip content={<ChartTooltip isMoney={isMoney} />} />
                  <Legend verticalAlign="top" height={32} />

                  {/* Background: same day last week (muted, dashed) */}
                  <Line
                    type="monotone"
                    dataKey="lastWeek"
                    name="Last week"
                    stroke={LAST_WEEK_COLOR}
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    strokeOpacity={0.9}
                    dot={false}
                    activeDot={{ r: 4 }}
                    connectNulls
                  />
                  {/* Background: expected = average of all previous same weekdays */}
                  <Line
                    type="monotone"
                    dataKey="expected"
                    name="Expected (avg)"
                    stroke={EXPECTED_COLOR}
                    strokeWidth={2}
                    strokeDasharray="2 4"
                    strokeLinecap="round"
                    dot={false}
                    activeDot={{ r: 4 }}
                    connectNulls
                  />
                  {/* Foreground: this period (highlighted) */}
                  <Area
                    type="monotone"
                    dataKey="current"
                    name="This period"
                    stroke={active.color}
                    strokeWidth={3.5}
                    fill="url(#fill)"
                    dot={!longRange}
                    activeDot={{ r: 6 }}
                    connectNulls
                  />
                </ComposedChart>
              )}
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Breakdown (shop, tobacco, pie face, BBQ gas — no fuel / total) */}
      {rows.length > 0 && (
        <div className="card p-5">
          <h2 className="mb-4 text-lg font-bold text-slate-900">Where the money came from</h2>
            <Insights rows={rows} history={history} from={from} to={to} />
          <div className="h-64 mt-7 w-full">
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