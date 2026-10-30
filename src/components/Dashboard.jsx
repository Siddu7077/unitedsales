import { useEffect, useMemo, useState } from 'react';
import {
  Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  CATEGORIES, RANGES, api, catById, eachDay, money, moneyShort, prettyDate,
  rangeDates, shortDate, todayISO, weekday,
} from '../lib.js';
import Insights from './Insights.jsx';

const ALL = 'all';
const MONEY_CATS = CATEGORIES.filter((c) => c.money);
const BREAKDOWN_EXCLUDE = ['total_sales', 'fuel_sales'];
const EXPECTED_COLOR = '#fbbf24';
const LAST_WEEK_COLOR = '#8b8fa8';
const GRID = 'rgba(255,255,255,0.07)';
const axis = { fontSize: 12, fill: '#8b8fa8' };

const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dow = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();

function StatCard({ label, value, sub, color, children }) {
  return (
    <div className="x-card">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: color, boxShadow: `0 0 0 4px ${color}33` }} />
        <p className="x-label">{label}</p>
      </div>
      <p className="x-num mt-3">{value}</p>
      {children}
      {sub && <p className="x-sub">{sub}</p>}
    </div>
  );
}

function ChartTooltip({ active, payload, label, isMoney }) {
  if (!active || !payload?.length) return null;
  const fmt = (v) => (v == null ? '—' : isMoney ? money(v) : v);
  const { __actual: actual, __expected: expected } = payload[0]?.payload || {};
  const diff = actual != null && expected ? ((actual - expected) / expected) * 100 : null;
  return (
    <div className="x-tip">
      <p style={{ color: '#fff', fontWeight: 700, marginBottom: 4 }}>
        {prettyDate(label)} · {weekday(label)}
      </p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <b style={{ color: '#fff' }}>{fmt(p.value)}</b>
        </p>
      ))}
      {diff != null && (
        <p className={diff >= 0 ? 'x-up' : 'x-down'} style={{ marginTop: 4, fontWeight: 700 }}>
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
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const { from, to } = useMemo(() => rangeDates(range), [range]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    api.list(from, to)
      .then((r) => alive && setRows(r))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [from, to]);

  useEffect(() => {
    let alive = true;
    api.list('2000-01-01', todayISO()).then((r) => alive && setHistory(r)).catch(() => {});
    return () => { alive = false; };
  }, []);

  const { byDate, byWeekday } = useMemo(() => {
    const byDate = {};
    const byWeekday = [[], [], [], [], [], [], []];
    [...history]
      .sort((a, b) => (a.entry_date < b.entry_date ? -1 : 1))
      .forEach((r) => { byDate[r.entry_date] = r; byWeekday[dow(r.entry_date)].push(r); });
    return { byDate, byWeekday };
  }, [history]);

  const expectedFor = (date, catId) => {
    const prior = byWeekday[dow(date)].filter((r) => r.entry_date < date);
    if (!prior.length) return null;
    return prior.reduce((a, r) => a + r[catId], 0) / prior.length;
  };

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

  const statCat = isAll ? catById('total_sales') : active;
  const stats = useMemo(() => {
    const vals = rows.map((r) => ({ date: r.entry_date, v: r[statCat.id] }));
    const sum = vals.reduce((a, b) => a + b.v, 0);
    const best = vals.reduce((a, b) => (b.v > (a?.v ?? -1) ? b : a), null);
    return { sum, avg: vals.length ? sum / vals.length : 0, best, days: vals.length };
  }, [rows, statCat]);

  const compare = useMemo(() => {
    if (isAll) return null;
    let act = 0, exp = 0, act2 = 0, lw = 0;
    chartData.forEach((p) => {
      if (p.current != null && p.expected != null) { act += p.current; exp += p.expected; }
      if (p.current != null && p.lastWeek != null) { act2 += p.current; lw += p.lastWeek; }
    });
    return {
      vsExpected: exp ? ((act - exp) / exp) * 100 : null,
      vsLast: lw ? ((act2 - lw) / lw) * 100 : null,
    };
  }, [chartData, isAll]);

  const fmt = (n) => (statCat.money ? money(n) : Math.round(n).toLocaleString());
  const fuel = rows.reduce((a, r) => a + r.fuel_sales, 0);
  const shop = rows.reduce((a, r) => a + r.shop_sales, 0);
  const fuelPct = fuel + shop ? Math.round((fuel / (fuel + shop)) * 100) : 0;

  const breakdown = useMemo(
    () =>
      MONEY_CATS.filter((c) => !BREAKDOWN_EXCLUDE.includes(c.id)).map((c) => ({
        name: c.label, color: c.color, value: rows.reduce((a, r) => a + r[c.id], 0),
      })),
    [rows]
  );

  const yFmt = (v) => (isMoney ? moneyShort(v) : v);
  const Delta = ({ label, value }) =>
    value == null ? null : (
      <span className={`x-chip ${value >= 0 ? 'up' : 'down'}`}>
        {value >= 0 ? '▲' : '▼'} {Math.abs(value).toFixed(1)}% {label}
      </span>
    );

  return (
    <div className="mx-auto max-w-6xl space-y-5 sm:space-y-6">
      {error && <div className="x-card x-down">Couldn’t load data: {error}</div>}

      {/* HERO: headline number + main chart */}
      <section className="x-hero">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="x-scroll">
            {RANGES.map((r) => (
              <button key={r.id} onClick={() => setRange(r.id)} className={`x-pill ${range === r.id ? 'on' : ''}`}>
                {r.label}
              </button>
            ))}
          </div>
          <p className="x-sub">{prettyDate(from)} – {prettyDate(to)}</p>
        </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label={`${statCat.label} · total`}
          value={fmt(stats.sum)}
          sub={`${stats.days} day${stats.days === 1 ? '' : 's'} recorded`}
          color={statCat.color}
        />
        <StatCard label="Daily average" value={fmt(stats.avg)} sub="on days with entries" color="#2dd4bf" />
        <StatCard
          label="Best day"
          value={stats.best ? fmt(stats.best.v) : '—'}
          sub={stats.best ? `${weekday(stats.best.date)}, ${shortDate(stats.best.date)}` : 'no data yet'}
          color="#fb923c"
        />
        <StatCard
          label="Fuel vs shop"
          value={fuel + shop ? `${fuelPct}% / ${100 - fuelPct}%` : '—'}
          sub="share of fuel / shop sales"
          color="#a78bfa"
        >
          {/* <div className="x-bar mt-3 mb-2">
            <div style={{ width: `${fuelPct}%`, background: '#a78bfa' }} />
            <div style={{ flex: 1, background: '#2dd4bf' }} />
          </div> */}
        </StatCard>
      </div>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            {compare && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Delta label="vs expected" value={compare.vsExpected} />
                <Delta label="vs last week" value={compare.vsLast} />
              </div>
            )}
          </div>
        </div>

        <div className="x-scroll mt-6">
          <button onClick={() => setCat(ALL)} className={`x-pill ${isAll ? 'on' : ''}`}>Compare all</button>
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCat(c.id)}
              className={`x-pill tint ${cat === c.id ? 'on' : ''}`}
              style={cat === c.id ? { background: c.color } : undefined}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="mt-4 h-72 w-full sm:h-80">
          {loading ? (
            <div className="grid h-full place-items-center x-muted">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="grid h-full place-items-center text-center">
              <div>
                <p className="x-h">No sales recorded for this period</p>
                <p className="x-sub mb-4">Add an entry and your chart will appear here.</p>
                <button onClick={onAdd} className="x-cta">Add today’s sales</button>
              </div>
            </div>
          ) : (
            <ResponsiveContainer>
              {isAll ? (
                <LineChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="date" tickFormatter={shortDate} tick={axis} minTickGap={24} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={moneyShort} tick={axis} width={52} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip isMoney />} />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#aab0cc' }} />
                  {MONEY_CATS.map((c) => (
                    <Line key={c.id} type="monotone" dataKey={c.id} name={c.label} stroke={c.color}
                      strokeWidth={2.5} dot={!longRange} connectNulls />
                  ))}
                </LineChart>
              ) : (
                <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="heroFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={active.color} stopOpacity={0.55} />
                      <stop offset="100%" stopColor={active.color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="date" tickFormatter={shortDate} tick={axis} minTickGap={24} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={yFmt} tick={axis} width={52} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip isMoney={isMoney} />} />
                  <Legend verticalAlign="top" height={32} wrapperStyle={{ fontSize: 12, color: '#aab0cc' }} />
                  <Line type="monotone" dataKey="lastWeek" name="Last week" stroke={LAST_WEEK_COLOR}
                    strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls />
                  <Line type="monotone" dataKey="expected" name="Expected" stroke={EXPECTED_COLOR}
                    strokeWidth={2} strokeDasharray="2 4" strokeLinecap="round" dot={false} connectNulls />
                  <Area type="monotone" dataKey="current" name="This period" stroke={active.color}
                    strokeWidth={3} fill="url(#heroFill)" dot={!longRange}
                    activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }} connectNulls />
                </ComposedChart>
              )}
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {rows.length > 0 && (
        <>
          <Insights rows={rows} history={history} from={from} to={to} />

          <section className="x-card">
            <h2 className="x-h">Where the money came from</h2>
            <p className="x-sub">Shop, tobacco, pie face and the rest. Fuel and total are left out.</p>
            <div className="mt-4 h-64 w-full">
              <ResponsiveContainer>
                <BarChart data={breakdown} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="name" tick={axis} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={moneyShort} tick={axis} width={52} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                    formatter={(v) => money(v)}
                    contentStyle={{ background: 'rgba(14,16,34,.92)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 14, color: '#fff' }}
                  />
                  <Bar dataKey="value" radius={[10, 10, 4, 4]}>
                    {breakdown.map((b) => <Cell key={b.name} fill={b.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </>
      )}
    </div>
  );
}