import { useMemo, useState } from 'react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CATEGORIES,
  catById,
  eachDay,
  money,
  moneyShort,
  prettyDate,
  shortDate,
  todayISO,
} from '../lib.js';

/**
 * Extra analytics that sit UNDER the existing Dashboard.
 * Props:
 *   rows    – entries for the selected period   (already loaded by Dashboard)
 *   history – every entry ever                  (already loaded by Dashboard)
 *   from/to – selected period (ISO dates)
 */

const MONEY_CATS = CATEGORIES.filter((c) => c.money);
// Categories that are already INCLUDED in shop_sales (display-only breakdown).
// Matched by id, so change this pattern if your ids differ (add bbq etc. if that is inside shop too).
const SHOP_PART = /tobacco|pie/i;
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON_FIRST = [1, 2, 3, 4, 5, 6, 0];
const MA_COLOR = '#0f172a';
const EXPECTED_COLOR = '#f59e0b';

const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dow = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const sum = (arr) => arr.reduce((a, b) => a + b, 0);
const pct = (a, b) => (b ? ((a - b) / b) * 100 : null);

const axis = { fontSize: 11, fill: '#64748b' };
const grid = <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />;

/* ---------- small building blocks ---------- */

function Panel({ title, subtitle, right, children, className = '' }) {
  return (
    <section className={`card p-4 sm:p-5 ${className}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-900 sm:text-lg">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Kpi({ label, value, sub, tone = 'slate' }) {
  const tones = {
    slate: 'text-slate-900',
    up: 'text-emerald-600',
    down: 'text-rose-600',
  };
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-extrabold tracking-tight sm:text-2xl ${tones[tone]}`}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function Toggle({ on, onChange, children }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`pill ${on ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
    >
      {children}
    </button>
  );
}

function Empty({ text }) {
  return (
    <div className="grid h-full place-items-center px-4 text-center text-sm text-slate-400">{text}</div>
  );
}

const tipStyle = {
  borderRadius: 12,
  border: 'none',
  boxShadow: '0 8px 24px rgba(0,0,0,.12)',
  fontSize: 13,
};

/* ---------- main component ---------- */

export default function Insights({ rows, history, from, to }) {
  const [metric, setMetric] = useState('total_sales');
  const [withFuel, setWithFuel] = useState(false);
  const [weekdayScope, setWeekdayScope] = useState('all'); // 'all' | 'period'

  const cat = catById(metric);
  const isMoney = cat.money;
  const f = (v) => (v == null ? '—' : isMoney ? money(v) : Math.round(v).toLocaleString());
  const yf = (v) => (isMoney ? moneyShort(v) : v);

  /* history grouped by weekday (oldest → newest) */
  const byWeekday = useMemo(() => {
    const g = [[], [], [], [], [], [], []];
    [...history]
      .sort((a, b) => (a.entry_date < b.entry_date ? -1 : 1))
      .forEach((r) => g[dow(r.entry_date)].push(r));
    return g;
  }, [history]);

  const expectedFor = (date) => {
    const prior = byWeekday[dow(date)].filter((r) => r.entry_date < date);
    return prior.length ? sum(prior.map((r) => r[metric])) / prior.length : null;
  };

  const days = useMemo(() => eachDay(from, to), [from, to]);
  const rowByDate = useMemo(() => Object.fromEntries(rows.map((r) => [r.entry_date, r])), [rows]);

  /* 1 ▸ daily value + 7-day moving average */
  const trend = useMemo(
    () =>
      days.map((d, i) => {
        const r = rowByDate[d];
        const win = days
          .slice(Math.max(0, i - 6), i + 1)
          .map((x) => rowByDate[x]?.[metric])
          .filter((v) => v != null);
        return {
          date: d,
          value: r ? r[metric] : null,
          avg7: win.length >= 2 ? sum(win) / win.length : null,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [days, rowByDate, metric]
  );

  /* 2 ▸ cumulative actual vs cumulative expected (pace) */
  const { pace, projected, lastEntry } = useMemo(() => {
    const dates = rows.map((r) => r.entry_date).sort();
    const last = dates[dates.length - 1] || null;
    let ca = 0;
    let ce = 0;
    const out = days.map((d) => {
      const e = expectedFor(d) ?? 0;
      ce += e;
      const r = rowByDate[d];
      if (r) ca += r[metric];
      return { date: d, actual: last && d <= last ? ca : null, expected: ce };
    });
    const remaining = last
      ? sum(days.filter((d) => d > last).map((d) => expectedFor(d) ?? 0))
      : 0;
    return { pace: out, projected: ca + remaining, lastEntry: last };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, rowByDate, rows, metric, byWeekday]);

  /* 3 ▸ weekday performance */
  const weekdayData = useMemo(() => {
    const src =
      weekdayScope === 'all'
        ? byWeekday
        : MON_FIRST.reduce((acc, d) => {
            acc[d] = rows.filter((r) => dow(r.entry_date) === d);
            return acc;
          }, [[], [], [], [], [], [], []]);
    const data = MON_FIRST.map((d) => {
      const list = src[d];
      return {
        name: DAY_NAMES[d],
        avg: list.length ? sum(list.map((r) => r[metric])) / list.length : 0,
        n: list.length,
      };
    });
    const withData = data.filter((x) => x.n > 0);
    const best = withData.length ? withData.reduce((a, b) => (b.avg > a.avg ? b : a)) : null;
    const worst = withData.length ? withData.reduce((a, b) => (b.avg < a.avg ? b : a)) : null;
    return { data, best, worst };
  }, [byWeekday, rows, metric, weekdayScope]);

  /* 4 ▸ sales mix per day (stacked) + share donut */
  const shopCat = catById('shop_sales');
  const shopParts = MONEY_CATS.filter((c) => SHOP_PART.test(c.id));
  const otherCats = MONEY_CATS.filter(
    (c) =>
      c.id !== 'total_sales' &&
      c.id !== 'shop_sales' &&
      !SHOP_PART.test(c.id) &&
      (withFuel || c.id !== 'fuel_sales')
  );
  // shop = tobacco + pie face + "other shop", so nothing is counted twice
  const mixCats = [
    ...shopParts,
    { id: 'other_shop', label: 'Other shop', color: shopCat.color },
    ...otherCats,
  ];
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

  /* 5 ▸ monthly totals + average per recorded day (all history) */
  const monthly = useMemo(() => {
    const m = {};
    history.forEach((r) => {
      const k = r.entry_date.slice(0, 7);
      (m[k] ||= { total: 0, n: 0 });
      m[k].total += r[metric];
      m[k].n += 1;
    });
    return Object.keys(m)
      .sort()
      .slice(-12)
      .map((k) => ({
        key: k,
        label: new Date(`${k}-01T00:00:00Z`).toLocaleDateString('en-AU', {
          month: 'short',
          year: '2-digit',
          timeZone: 'UTC',
        }),
        total: m[k].total,
        avg: m[k].total / m[k].n,
      }));
  }, [history, metric]);

  /* 6 ▸ heatmap – last 16 weeks of total sales */
  const heat = useMemo(() => {
    const today = todayISO();
    const start = addDays(today, -(dow(today) + 15 * 7)); // a Sunday, 15 weeks back
    const byDate = Object.fromEntries(history.map((r) => [r.entry_date, r]));
    const cells = [];
    for (let i = 0; i < 16 * 7; i++) {
      const d = addDays(start, i);
      cells.push({ date: d, v: byDate[d]?.total_sales ?? null, future: d > today });
    }
    const max = Math.max(1, ...cells.map((c) => c.v ?? 0));
    return { cells, max };
  }, [history]);

  /* KPIs */
  const kpi = useMemo(() => {
    const vals = rows.map((r) => r[metric]);
    const total = sum(vals);
    const len = days.length;
    const prevFrom = addDays(from, -len);
    const prevTo = addDays(from, -1);
    const prev = history.filter((r) => r.entry_date >= prevFrom && r.entry_date <= prevTo);
    const prevTotal = sum(prev.map((r) => r[metric]));
    const mean = vals.length ? total / vals.length : 0;
    const sd = vals.length > 1 ? Math.sqrt(sum(vals.map((v) => (v - mean) ** 2)) / vals.length) : 0;
    const cv = mean ? sd / mean : null;
    return { total, growth: prev.length ? pct(total, prevTotal) : null, cv, mean };
  }, [rows, history, days, from, metric]);

  const noData = rows.length === 0;
  const growthTone = kpi.growth == null ? 'slate' : kpi.growth >= 0 ? 'up' : 'down';
  const consistency =
    kpi.cv == null ? '—' : kpi.cv < 0.15 ? 'Very steady' : kpi.cv < 0.3 ? 'Steady' : 'Up and down';

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Section header + metric picker (horizontal scroll on phones) */}
      <div className="card p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 sm:text-xl">Deeper insights</h2>
            <p className="text-xs text-slate-500 sm:text-sm">
              {prettyDate(from)} – {prettyDate(to)}
            </p>
          </div>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => setMetric(c.id)}
                className={`pill shrink-0 ${
                  metric === c.id ? 'text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
                style={metric === c.id ? { background: c.color } : undefined}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Kpi
          label={`Projected ${cat.label.toLowerCase()}`}
          value={noData ? '—' : f(projected)}
          sub={lastEntry ? `at your usual pace to ${shortDate(to)}` : 'add entries to see'}
        />
        <Kpi
          label="Vs previous period"
          value={kpi.growth == null ? '—' : `${kpi.growth >= 0 ? '▲' : '▼'} ${Math.abs(kpi.growth).toFixed(1)}%`}
          sub={`${days.length} days before ${shortDate(from)}`}
          tone={growthTone}
        />
        <Kpi
          label="Best weekday"
          value={weekdayData.best ? weekdayData.best.name : '—'}
          sub={weekdayData.best ? `avg ${f(weekdayData.best.avg)}` : 'no data yet'}
        />
        <Kpi
          label="Consistency"
          value={consistency}
          sub={kpi.cv == null ? 'needs 2+ days' : `swing ±${(kpi.cv * 100).toFixed(0)}% around average`}
        />
      </div>

      {/* Trend + moving average */}
      <Panel title={`${cat.label}: daily with 7-day trend`} subtitle="The dark line smooths out busy and quiet days.">
        <div className="h-60 w-full sm:h-72">
          {noData ? (
            <Empty text="No entries in this period" />
          ) : (
            <ResponsiveContainer>
              <ComposedChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                {grid}
                <XAxis dataKey="date" tickFormatter={shortDate} tick={axis} minTickGap={28} />
                <YAxis tickFormatter={yf} tick={axis} width={46} />
                <Tooltip
                  contentStyle={tipStyle}
                  labelFormatter={prettyDate}
                  formatter={(v, n) => [f(v), n]}
                />
                <Bar dataKey="value" name="Daily" fill={cat.color} fillOpacity={0.35} radius={[4, 4, 0, 0]} />
                <Line
                  type="monotone"
                  dataKey="avg7"
                  name="7-day average"
                  stroke={MA_COLOR}
                  strokeWidth={2.5}
                  dot={false}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </Panel>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        {/* Pace */}
        <Panel
          title="Running total vs expected"
          subtitle="Are you ahead of or behind a typical period?"
        >
          <div className="h-60 w-full sm:h-72">
            {noData ? (
              <Empty text="No entries in this period" />
            ) : (
              <ResponsiveContainer>
                <ComposedChart data={pace} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="paceFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={cat.color} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={cat.color} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  {grid}
                  <XAxis dataKey="date" tickFormatter={shortDate} tick={axis} minTickGap={28} />
                  <YAxis tickFormatter={yf} tick={axis} width={46} />
                  <Tooltip contentStyle={tipStyle} labelFormatter={prettyDate} formatter={(v, n) => [f(v), n]} />
                  <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="expected"
                    name="Expected"
                    stroke={EXPECTED_COLOR}
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="actual"
                    name="Actual"
                    stroke={cat.color}
                    strokeWidth={3}
                    fill="url(#paceFill)"
                    dot={false}
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>

        {/* Weekday */}
        <Panel
          title="Which weekday earns most?"
          subtitle={
            weekdayData.best && weekdayData.worst && weekdayData.best.name !== weekdayData.worst.name
              ? `${weekdayData.best.name} is strongest, ${weekdayData.worst.name} is weakest.`
              : 'Average per weekday.'
          }
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
                <XAxis dataKey="name" tick={axis} />
                <YAxis tickFormatter={yf} tick={axis} width={46} />
                <Tooltip
                  cursor={{ fill: 'rgba(99,102,241,0.06)' }}
                  contentStyle={tipStyle}
                  formatter={(v, _n, p) => [`${f(v)}  (${p.payload.n} days)`, 'Average']}
                />
                <Bar dataKey="avg" radius={[8, 8, 0, 0]}>
                  {weekdayData.data.map((d) => (
                    <Cell
                      key={d.name}
                      fill={cat.color}
                      fillOpacity={weekdayData.best && d.name === weekdayData.best.name ? 1 : 0.45}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      {/* Mix */}
      <Panel
        title="Sales mix"
        subtitle="Shop sales split into tobacco, pie face and the rest. Fuel is hidden by default because it is much bigger."
        right={<Toggle on={withFuel} onChange={setWithFuel}>Include fuel</Toggle>}
      >
        {noData ? (
          <div className="h-48">
            <Empty text="No entries in this period" />
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-5">
            <div className="h-64 w-full sm:h-72 lg:col-span-3">
              <ResponsiveContainer>
                <BarChart data={mixDaily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  {grid}
                  <XAxis dataKey="date" tickFormatter={shortDate} tick={axis} minTickGap={28} />
                  <YAxis tickFormatter={moneyShort} tick={axis} width={46} />
                  <Tooltip
                    cursor={{ fill: 'rgba(99,102,241,0.06)' }}
                    contentStyle={tipStyle}
                    labelFormatter={prettyDate}
                    formatter={(v, n) => [money(v), n]}
                  />
                  {mixCats.map((c) => (
                    <Bar key={c.id} dataKey={c.id} name={c.label} stackId="mix" fill={c.color} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="lg:col-span-2">
              <div className="relative mx-auto h-48 w-48 sm:h-56 sm:w-56">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={share}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="62%"
                      outerRadius="95%"
                      paddingAngle={2}
                      stroke="none"
                    >
                      {share.map((s) => (
                        <Cell key={s.name} fill={s.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tipStyle} formatter={(v, n) => [money(v), n]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                  <div>
                    <p className="text-xs text-slate-500">Total</p>
                    <p className="text-lg font-extrabold text-slate-900">{moneyShort(shareTotal)}</p>
                  </div>
                </div>
              </div>
              <ul className="mt-3 grid grid-cols-1 gap-1.5 text-sm min-[420px]:grid-cols-2 lg:grid-cols-1">
                {share
                  .slice()
                  .sort((a, b) => b.value - a.value)
                  .map((s) => (
                    <li key={s.name} className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2 text-slate-600">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                        <span className="truncate">{s.name}</span>
                      </span>
                      <b className="shrink-0 text-slate-900">
                        {shareTotal ? ((s.value / shareTotal) * 100).toFixed(0) : 0}%
                      </b>
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        )}
      </Panel>

      {/* Monthly */}
      <Panel
        title={`${cat.label}: month by month`}
        subtitle="Bars are the month total. The line is the average per recorded day, so partial months compare fairly."
      >
        <div className="h-60 w-full sm:h-72">
          {monthly.length === 0 ? (
            <Empty text="No history yet" />
          ) : (
            <ResponsiveContainer>
              <ComposedChart data={monthly} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                {grid}
                <XAxis dataKey="label" tick={axis} />
                <YAxis yAxisId="l" tickFormatter={yf} tick={axis} width={46} />
                <YAxis yAxisId="r" orientation="right" tickFormatter={yf} tick={axis} width={46} hide={false} />
                <Tooltip contentStyle={tipStyle} formatter={(v, n) => [f(v), n]} />
                <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="l" dataKey="total" name="Month total" fill={cat.color} fillOpacity={0.5} radius={[6, 6, 0, 0]} />
                <Line
                  yAxisId="r"
                  type="monotone"
                  dataKey="avg"
                  name="Avg per day"
                  stroke={MA_COLOR}
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </Panel>

      {/* Heatmap */}
      {/* <Panel
        title="Last 16 weeks at a glance"
        subtitle="Each square is a day of total sales. Darker means a bigger day."
      >
        <div className="flex gap-2">
          <div className="grid shrink-0 grid-rows-7 gap-[3px] pt-0 text-[10px] leading-none text-slate-400 sm:text-xs">
            {DAY_NAMES.map((d, i) => (
              <span key={d} className="flex items-center">
                {i % 2 === 1 ? d : ''}
              </span>
            ))}
          </div>
          <div className="grid flex-1 grid-flow-col grid-rows-7 gap-[3px]">
            {heat.cells.map((c) => {
              const t = c.v == null ? 0 : Math.max(0.12, c.v / heat.max);
              return (
                <div
                  key={c.date}
                  title={c.future ? '' : `${prettyDate(c.date)}: ${c.v == null ? 'no entry' : money(c.v)}`}
                  className="aspect-square rounded-[3px] sm:rounded"
                  style={{
                    background: c.future
                      ? 'transparent'
                      : c.v == null
                      ? '#f1f5f9'
                      : `rgba(79,70,229,${0.15 + t * 0.85})`,
                  }}
                />
              );
            })}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-slate-500">
          <span>Less</span>
          {[0.15, 0.4, 0.65, 0.9].map((a) => (
            <span key={a} className="h-3 w-3 rounded-[3px]" style={{ background: `rgba(79,70,229,${a})` }} />
          ))}
          <span>More</span>
        </div>
      </Panel> */}
    </div>
  );
}