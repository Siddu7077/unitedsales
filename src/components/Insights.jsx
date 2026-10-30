import { useMemo, useState } from 'react';
import {
  Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { CATEGORIES, catById, eachDay, money, moneyShort, prettyDate, shortDate } from '../lib.js';

const MONEY_CATS = CATEGORIES.filter((c) => c.money);
const SHOP_PART = /tobacco|pie/i; // ids already included in shop_sales
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON_FIRST = [1, 2, 3, 4, 5, 6, 0];
const MA_COLOR = '#ffffff';
const EXPECTED_COLOR = '#fbbf24';
const GRID = 'rgba(255,255,255,0.07)';

const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dow = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const sum = (arr) => arr.reduce((a, b) => a + b, 0);
const pct = (a, b) => (b ? ((a - b) / b) * 100 : null);

const axis = { fontSize: 11, fill: '#8b8fa8' };
const grid = <CartesianGrid stroke={GRID} vertical={false} />;
const ax = { axisLine: false, tickLine: false };
const tipStyle = {
  background: 'rgba(14,16,34,.92)', border: '1px solid rgba(255,255,255,.1)',
  borderRadius: 14, boxShadow: '0 16px 40px -10px #000', fontSize: 13, color: '#fff',
};

function Panel({ title, subtitle, right, children }) {
  return (
    <section className="x-card">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="x-h">{title}</h3>
          {subtitle && <p className="x-sub">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Kpi({ label, value, sub, tone }) {
  return (
    <div className="x-card" style={{ padding: 18 }}>
      <p className="x-label">{label}</p>
      <p className={`x-num mt-2 ${tone === 'up' ? 'x-up' : tone === 'down' ? 'x-down' : ''}`} style={{ fontSize: '1.45rem' }}>
        {value}
      </p>
      {sub && <p className="x-sub truncate">{sub}</p>}
    </div>
  );
}

const Toggle = ({ on, onChange, children }) => (
  <button type="button" onClick={() => onChange(!on)} className={`x-pill ${on ? 'on' : ''}`}>{children}</button>
);
const Empty = ({ text }) => <div className="grid h-full place-items-center px-4 text-center x-muted">{text}</div>;

export default function Insights({ rows, history, from, to }) {
  const [metric, setMetric] = useState('total_sales');
  const [withFuel, setWithFuel] = useState(false);
  const [weekdayScope, setWeekdayScope] = useState('all');

  const cat = catById(metric);
  const isMoney = cat.money;
  const f = (v) => (v == null ? '—' : isMoney ? money(v) : Math.round(v).toLocaleString());
  const yf = (v) => (isMoney ? moneyShort(v) : v);

  const byWeekday = useMemo(() => {
    const g = [[], [], [], [], [], [], []];
    [...history].sort((a, b) => (a.entry_date < b.entry_date ? -1 : 1)).forEach((r) => g[dow(r.entry_date)].push(r));
    return g;
  }, [history]);

  const expectedFor = (date) => {
    const prior = byWeekday[dow(date)].filter((r) => r.entry_date < date);
    return prior.length ? sum(prior.map((r) => r[metric])) / prior.length : null;
  };

  const days = useMemo(() => eachDay(from, to), [from, to]);
  const rowByDate = useMemo(() => Object.fromEntries(rows.map((r) => [r.entry_date, r])), [rows]);

  const trend = useMemo(
    () =>
      days.map((d, i) => {
        const r = rowByDate[d];
        const win = days.slice(Math.max(0, i - 6), i + 1).map((x) => rowByDate[x]?.[metric]).filter((v) => v != null);
        return { date: d, value: r ? r[metric] : null, avg7: win.length >= 2 ? sum(win) / win.length : null };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [days, rowByDate, metric]
  );

  const { pace, projected, lastEntry } = useMemo(() => {
    const dates = rows.map((r) => r.entry_date).sort();
    const last = dates[dates.length - 1] || null;
    let ca = 0, ce = 0;
    const out = days.map((d) => {
      ce += expectedFor(d) ?? 0;
      const r = rowByDate[d];
      if (r) ca += r[metric];
      return { date: d, actual: last && d <= last ? ca : null, expected: ce };
    });
    const remaining = last ? sum(days.filter((d) => d > last).map((d) => expectedFor(d) ?? 0)) : 0;
    return { pace: out, projected: ca + remaining, lastEntry: last };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, rowByDate, rows, metric, byWeekday]);

  const weekdayData = useMemo(() => {
    const src =
      weekdayScope === 'all'
        ? byWeekday
        : MON_FIRST.reduce((acc, d) => { acc[d] = rows.filter((r) => dow(r.entry_date) === d); return acc; },
            [[], [], [], [], [], [], []]);
    const data = MON_FIRST.map((d) => {
      const list = src[d];
      return { name: DAY_NAMES[d], avg: list.length ? sum(list.map((r) => r[metric])) / list.length : 0, n: list.length };
    });
    const withData = data.filter((x) => x.n > 0);
    const best = withData.length ? withData.reduce((a, b) => (b.avg > a.avg ? b : a)) : null;
    const worst = withData.length ? withData.reduce((a, b) => (b.avg < a.avg ? b : a)) : null;
    return { data, best, worst };
  }, [byWeekday, rows, metric, weekdayScope]);

  const shopCat = catById('shop_sales');
  const shopParts = MONEY_CATS.filter((c) => SHOP_PART.test(c.id));
  const otherCats = MONEY_CATS.filter(
    (c) => c.id !== 'total_sales' && c.id !== 'shop_sales' && !SHOP_PART.test(c.id) && (withFuel || c.id !== 'fuel_sales')
  );
  const mixCats = [...shopParts, { id: 'other_shop', label: 'Other shop', color: shopCat.color }, ...otherCats];
  const mixValues = (r) => {
    const parts = sum(shopParts.map((c) => r[c.id]));
    const v = { other_shop: Math.max(0, r.shop_sales - parts) };
    [...shopParts, ...otherCats].forEach((c) => (v[c.id] = r[c.id]));
    return v;
  };
  const mixDaily = useMemo(
    () =>
      days.map((d) => {
        const r = rowByDate[d];
        const p = { date: d };
        const v = r ? mixValues(r) : null;
        mixCats.forEach((c) => (p[c.id] = v ? v[c.id] : null));
        return p;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [days, rowByDate, withFuel]
  );
  const share = useMemo(
    () =>
      mixCats
        .map((c) => ({ name: c.label, color: c.color, value: sum(rows.map((r) => mixValues(r)[c.id])) }))
        .filter((x) => x.value > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, withFuel]
  );
  const shareTotal = sum(share.map((s) => s.value));

  const monthly = useMemo(() => {
    const m = {};
    history.forEach((r) => {
      const k = r.entry_date.slice(0, 7);
      (m[k] ||= { total: 0, n: 0 });
      m[k].total += r[metric];
      m[k].n += 1;
    });
    return Object.keys(m).sort().slice(-12).map((k) => ({
      key: k,
      label: new Date(`${k}-01T00:00:00Z`).toLocaleDateString('en-AU', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
      total: m[k].total,
      avg: m[k].total / m[k].n,
    }));
  }, [history, metric]);

  const kpi = useMemo(() => {
    const vals = rows.map((r) => r[metric]);
    const total = sum(vals);
    const prev = history.filter((r) => r.entry_date >= addDays(from, -days.length) && r.entry_date <= addDays(from, -1));
    const mean = vals.length ? total / vals.length : 0;
    const sd = vals.length > 1 ? Math.sqrt(sum(vals.map((v) => (v - mean) ** 2)) / vals.length) : 0;
    return { growth: prev.length ? pct(total, sum(prev.map((r) => r[metric]))) : null, cv: mean ? sd / mean : null };
  }, [rows, history, days, from, metric]);

  const noData = rows.length === 0;
  const consistency = kpi.cv == null ? '—' : kpi.cv < 0.15 ? 'Very steady' : kpi.cv < 0.3 ? 'Steady' : 'Up and down';
  const legend = { verticalAlign: 'top', height: 28, wrapperStyle: { fontSize: 12, color: '#aab0cc' } };

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="x-h" style={{ fontSize: '1.4rem' }}>Deeper insights</h2>
          <p className="x-sub">Pick a number to explore · {prettyDate(from)} – {prettyDate(to)}</p>
        </div>
        <div className="x-scroll sm:flex-wrap">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setMetric(c.id)}
              className={`x-pill tint ${metric === c.id ? 'on' : ''}`}
              style={metric === c.id ? { background: c.color } : undefined}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Kpi label={`Projected ${cat.label.toLowerCase()}`} value={noData ? '—' : f(projected)}
          sub={lastEntry ? `at your usual pace to ${shortDate(to)}` : 'add entries to see'} />
        <Kpi label="Vs previous period"
          value={kpi.growth == null ? '—' : `${kpi.growth >= 0 ? '▲' : '▼'} ${Math.abs(kpi.growth).toFixed(1)}%`}
          sub={`${days.length} days before ${shortDate(from)}`}
          tone={kpi.growth == null ? '' : kpi.growth >= 0 ? 'up' : 'down'} />
        <Kpi label="Best weekday" value={weekdayData.best ? weekdayData.best.name : '—'}
          sub={weekdayData.best ? `avg ${f(weekdayData.best.avg)}` : 'no data yet'} />
        <Kpi label="Consistency" value={consistency}
          sub={kpi.cv == null ? 'needs 2+ days' : `swing ±${(kpi.cv * 100).toFixed(0)}% around average`} />
      </div>

      <Panel title={`${cat.label}: daily with 7-day trend`} subtitle="The white line smooths out busy and quiet days.">
        <div className="h-60 w-full sm:h-72">
          {noData ? <Empty text="No entries in this period" /> : (
            <ResponsiveContainer>
              <ComposedChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                {grid}
                <XAxis dataKey="date" tickFormatter={shortDate} tick={axis} minTickGap={28} {...ax} />
                <YAxis tickFormatter={yf} tick={axis} width={46} {...ax} />
                <Tooltip contentStyle={tipStyle} labelFormatter={prettyDate} formatter={(v, n) => [f(v), n]} />
                <Bar dataKey="value" name="Daily" fill={cat.color} fillOpacity={0.8} radius={[6, 6, 2, 2]} />
                <Line type="monotone" dataKey="avg7" name="7-day average" stroke={MA_COLOR} strokeWidth={2.5} dot={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </Panel>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <Panel title="Running total vs expected" subtitle="Are you ahead of or behind a typical period?">
          <div className="h-60 w-full sm:h-72">
            {noData ? <Empty text="No entries in this period" /> : (
              <ResponsiveContainer>
                <ComposedChart data={pace} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="paceFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={cat.color} stopOpacity={0.5} />
                      <stop offset="100%" stopColor={cat.color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  {grid}
                  <XAxis dataKey="date" tickFormatter={shortDate} tick={axis} minTickGap={28} {...ax} />
                  <YAxis tickFormatter={yf} tick={axis} width={46} {...ax} />
                  <Tooltip contentStyle={tipStyle} labelFormatter={prettyDate} formatter={(v, n) => [f(v), n]} />
                  <Legend {...legend} />
                  <Line type="monotone" dataKey="expected" name="Expected" stroke={EXPECTED_COLOR} strokeWidth={2} strokeDasharray="4 4" dot={false} />
                  <Area type="monotone" dataKey="actual" name="Actual" stroke={cat.color} strokeWidth={3} fill="url(#paceFill)" dot={false} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>

        <Panel
          title="Which weekday earns most?"
          subtitle={weekdayData.best && weekdayData.worst && weekdayData.best.name !== weekdayData.worst.name
            ? `${weekdayData.best.name} is strongest, ${weekdayData.worst.name} is weakest.` : 'Average per weekday.'}
          right={
            <div className="flex gap-1.5">
              <Toggle on={weekdayScope === 'all'} onChange={() => setWeekdayScope('all')}>All time</Toggle>
              <Toggle on={weekdayScope === 'period'} onChange={() => setWeekdayScope('period')}>This period</Toggle>
            </div>
          }
        >
          <div className="h-60 w-full sm:h-72">
            <ResponsiveContainer>
              <BarChart data={weekdayData.data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                {grid}
                <XAxis dataKey="name" tick={axis} {...ax} />
                <YAxis tickFormatter={yf} tick={axis} width={46} {...ax} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={tipStyle}
                  formatter={(v, _n, p) => [`${f(v)}  (${p.payload.n} days)`, 'Average']} />
                <Bar dataKey="avg" radius={[10, 10, 4, 4]}>
                  {weekdayData.data.map((d) => (
                    <Cell key={d.name} fill={cat.color} fillOpacity={weekdayData.best && d.name === weekdayData.best.name ? 1 : 0.35} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel
        title="Sales mix"
        subtitle="Shop sales split into tobacco, pie face and the rest. Fuel is hidden by default because it is much bigger."
        right={<Toggle on={withFuel} onChange={setWithFuel}>Include fuel</Toggle>}
      >
        {noData ? <div className="h-48"><Empty text="No entries in this period" /></div> : (
          <div className="grid gap-6 lg:grid-cols-5">
            <div className="h-64 w-full sm:h-72 lg:col-span-3">
              <ResponsiveContainer>
                <BarChart data={mixDaily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  {grid}
                  <XAxis dataKey="date" tickFormatter={shortDate} tick={axis} minTickGap={28} {...ax} />
                  <YAxis tickFormatter={moneyShort} tick={axis} width={46} {...ax} />
                  <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={tipStyle} labelFormatter={prettyDate} formatter={(v, n) => [money(v), n]} />
                  {mixCats.map((c) => <Bar key={c.id} dataKey={c.id} name={c.label} stackId="mix" fill={c.color} />)}
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="lg:col-span-2">
              <div className="relative mx-auto h-48 w-48 sm:h-56 sm:w-56">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={share} dataKey="value" nameKey="name" innerRadius="66%" outerRadius="96%" paddingAngle={3} cornerRadius={6} stroke="none">
                      {share.map((s) => <Cell key={s.name} fill={s.color} />)}
                    </Pie>
                    <Tooltip contentStyle={tipStyle} formatter={(v, n) => [money(v), n]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                  <div>
                    <p className="x-label">Total</p>
                    <p className="x-num">{moneyShort(shareTotal)}</p>
                  </div>
                </div>
              </div>
              <ul className="mt-4 grid grid-cols-1 gap-2 text-sm min-[420px]:grid-cols-2 lg:grid-cols-1">
                {share.slice().sort((a, b) => b.value - a.value).map((s) => (
                  <li key={s.name} className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2 x-muted">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                      <span className="truncate">{s.name}</span>
                    </span>
                    <b className="shrink-0" style={{ color: '#fff' }}>{shareTotal ? ((s.value / shareTotal) * 100).toFixed(0) : 0}%</b>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Panel>

      <Panel title={`${cat.label}: month by month`} subtitle="Bars are the month total. The line is the average per recorded day, so partial months compare fairly.">
        <div className="h-60 w-full sm:h-72">
          {monthly.length === 0 ? <Empty text="No history yet" /> : (
            <ResponsiveContainer>
              <ComposedChart data={monthly} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                {grid}
                <XAxis dataKey="label" tick={axis} {...ax} />
                <YAxis yAxisId="l" tickFormatter={yf} tick={axis} width={46} {...ax} />
                <YAxis yAxisId="r" orientation="right" tickFormatter={yf} tick={axis} width={46} {...ax} />
                <Tooltip contentStyle={tipStyle} formatter={(v, n) => [f(v), n]} />
                <Legend {...legend} />
                <Bar yAxisId="l" dataKey="total" name="Month total" fill={cat.color} fillOpacity={0.7} radius={[8, 8, 3, 3]} />
                <Line yAxisId="r" type="monotone" dataKey="avg" name="Avg per day" stroke={MA_COLOR} strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </Panel>
    </div>
  );
}