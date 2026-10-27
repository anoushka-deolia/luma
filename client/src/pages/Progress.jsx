import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../lib/api.js';
import { useAppState } from '../lib/AppState.jsx';
import { techniqueName } from '../lib/techniques.js';
import { formatShortDay, todayLocal } from '../lib/time.js';
import { moodLabel, tagLabel } from '../components/CheckIn.jsx';

const DISTRESS = ['', 'Calm', 'Uneasy', 'Anxious', 'Very anxious', 'Panicking'];
const TIME_LABELS = { morning: 'Mornings', afternoon: 'Afternoons', evening: 'Evenings', night: 'Nights' };
const HEAT_DAYS = 84; // 12 weeks
const CHART_DAYS = 30;

const axis = { fill: 'var(--ink-soft)', fontSize: 12 };
const tooltipStyle = {
  background: 'var(--surface-solid)',
  border: '1px solid var(--line)',
  borderRadius: 14,
  color: 'var(--ink)',
  fontSize: 14,
};

function Stat({ value, label, hero = false }) {
  return (
    <div className={`stat ${hero ? 'stat--hero' : ''}`}>
      <span className="stat__value">{value}</span>
      <span className="stat__label">{label}</span>
    </div>
  );
}

function DistressChart({ series }) {
  const data = series.map((d) => ({ ...d, label: formatShortDay(d.date) }));
  const rated = series.filter((d) => d.sessions > 0);
  if (!rated.length) {
    return (
      <p className="empty">
        Rate a session and it will show up here: how strong things felt when you started and when you finished.
      </p>
    );
  }
  return (
    <div className="chart" role="img" aria-label={`Average distress before and after sessions on ${rated.length} days in the last 30`}>
      <ResponsiveContainer width="100%" height={230}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={28} />
          <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={axis} axisLine={false} tickLine={false} width={40} />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={{ stroke: 'var(--ink-faint)', strokeDasharray: '3 3' }}
            formatter={(v, name) => [`${v} (${DISTRESS[Math.round(v)]})`, name]}
          />
          <Legend wrapperStyle={{ color: 'var(--ink-soft)', fontSize: 13 }} />
          <Line
            name="When you started"
            type="monotone"
            dataKey="avgBefore"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface-solid)', fill: 'var(--chart-1)' }}
            connectNulls
          />
          <Line
            name="When you finished"
            type="monotone"
            dataKey="avgAfter"
            stroke="var(--chart-2)"
            strokeWidth={2}
            dot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface-solid)', fill: 'var(--chart-2)' }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function MoodChart({ series }) {
  const data = series.map((d) => ({ ...d, label: formatShortDay(d.date) }));
  const days = series.filter((d) => d.mood !== null).length;
  if (!days) {
    return <p className="empty">Your daily check-ins will draw a line here, so you can see your weeks at a glance.</p>;
  }
  return (
    <div className="chart" role="img" aria-label={`Mood from ${days} check-ins in the last 30 days`}>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={28} />
          <YAxis domain={[1, 5]} ticks={[1, 3, 5]} tickFormatter={(v) => ({ 1: 'Low', 3: 'Okay', 5: 'Good' })[v]} tick={axis} axisLine={false} tickLine={false} width={48} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => [moodLabel(v), 'Mood']} />
          <Line
            name="Mood"
            type="monotone"
            dataKey="mood"
            stroke="var(--chart-3)"
            strokeWidth={2}
            dot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface-solid)', fill: 'var(--chart-3)' }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Twelve weeks of days, brighter for days with more kinds of care (a session, a check-in, a journal page). */
function Heatmap({ series }) {
  const firstDow = (new Date(`${series[0].date}T12:00:00`).getDay() + 6) % 7; // Monday = 0
  const cells = [...Array.from({ length: firstDow }, () => null), ...series];
  const level = (d) => (d.sessions > 0 ? 1 : 0) + (d.mood !== null ? 1 : 0) + (d.journaled ? 1 : 0);
  return (
    <>
      <div className="heatmap" role="img" aria-label="Activity over the last 12 weeks">
        {cells.map((d, i) =>
          d ? (
            <span
              key={d.date}
              className="heatmap__cell"
              data-level={level(d)}
              title={`${formatShortDay(d.date)}: ${
                [d.sessions && `${d.sessions} session${d.sessions > 1 ? 's' : ''}`, d.mood !== null && 'checked in', d.journaled && 'journal page']
                  .filter(Boolean)
                  .join(', ') || 'nothing logged'
              }`}
            />
          ) : (
            <span key={`pad${i}`} className="heatmap__cell is-future" />
          ),
        )}
      </div>
      <div className="legend" aria-hidden="true">
        Less
        {[0, 1, 2, 3].map((l) => (
          <span key={l} className="heatmap__cell" data-level={l} />
        ))}
        More
      </div>
    </>
  );
}

export default function Progress() {
  const { profile, refreshProfile } = useAppState();
  const [trends, setTrends] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    try {
      const [t] = await Promise.all([api(`/sessions/trends?today=${todayLocal()}&days=${HEAT_DAYS}`), refreshProfile()]);
      setTrends(t);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="page">
        <h1 className="page-title">Progress</h1>
        <p className="error-text" role="alert">
          {error}{' '}
          <button type="button" className="link-button" onClick={load}>
            Try again
          </button>
        </p>
      </div>
    );
  }
  if (!trends) {
    return (
      <div className="page">
        <h1 className="page-title">Progress</h1>
        <p className="muted">Loading…</p>
      </div>
    );
  }

  const recent = trends.series.slice(-CHART_DAYS);
  const sessions30 = recent.reduce((n, d) => n + d.sessions, 0);
  const active30 = recent.filter((d) => d.sessions || d.mood !== null || d.journaled).length;
  const { streak } = trends;
  const tags = Object.entries(trends.tagCounts).sort((a, b) => b[1] - a[1]);

  return (
    <div className="page">
      <h1 className="page-title">Progress</h1>
      <p className="lede">Any day you breathe, check in or write counts. Missing days is fine; this is not a scoreboard.</p>

      <div className="stat-row">
        <Stat
          hero
          value={streak.current}
          label={
            streak.current
              ? `day${streak.current === 1 ? '' : 's'} in a row${streak.activeToday ? ', including today' : ''}`
              : 'days in a row. Today is a good day to start one.'
          }
        />
        <Stat value={active30} label="days you showed up in the last 30" />
        <Stat value={sessions30} label={`rated session${sessions30 === 1 ? '' : 's'} in the last 30 days`} />
      </div>

      <section className="card">
        <h2 className="section-title">Distress before and after</h2>
        <p className="muted small">Daily average, 1 is calm and 5 is panicking. The gap between the lines is how much a session helped.</p>
        <DistressChart series={recent} />
      </section>

      <section className="card">
        <h2 className="section-title">Mood</h2>
        <MoodChart series={recent} />
        {tags.length > 0 && (
          <>
            <p className="muted small" style={{ marginTop: 10 }}>
              What came up most in check-ins:
            </p>
            <div className="chip-row">
              {tags.slice(0, 6).map(([id, n]) => (
                <span key={id} className="chip chip--small">
                  {tagLabel(id)} <span className="faint">{n}</span>
                </span>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="card">
        <h2 className="section-title">Days you showed up</h2>
        <p className="muted small">
          Last 12 weeks. Longest run: {streak.longest} day{streak.longest === 1 ? '' : 's'}.
        </p>
        <Heatmap series={trends.series} />
      </section>

      <section className="card">
        <h2 className="section-title">What helps you when</h2>
        <p className="muted small">Average drop in distress by time of day. Luma uses this to choose what opens first.</p>
        <div className="times">
          {Object.entries(TIME_LABELS).map(([bucket, label]) => {
            const best = trends.byTime[bucket]?.[0];
            return (
              <div key={bucket} className="time-card">
                <h3>{label}</h3>
                {best ? (
                  <p>
                    <strong>{techniqueName(best.technique)}</strong>
                    <br />
                    <span className="muted small">
                      {best.avgImprovement > 0 ? `${best.avgImprovement} lower` : 'No change yet'} · {best.sessions} session
                      {best.sessions === 1 ? '' : 's'}
                    </span>
                  </p>
                ) : (
                  <p className="faint small">No sessions yet</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {profile?.ranking && (
        <section className="card">
          <h2 className="section-title">Your techniques</h2>
          {!profile.onboardingComplete && (
            <p className="muted">
              <Link to="/onboarding">Finish setting up</Link> to turn on your personal go-to.
            </p>
          )}
          <table className="tracker">
            <thead>
              <tr>
                <th scope="col">Technique</th>
                <th scope="col">Sessions</th>
                <th scope="col">Avg. drop</th>
              </tr>
            </thead>
            <tbody>
              {profile.ranking.map((r, i) => (
                <tr key={r.technique}>
                  <th scope="row">
                    {techniqueName(r.technique)}
                    {i === 0 && profile.onboardingComplete && <span className="badge">Overall go-to</span>}
                  </th>
                  <td>{r.sessions}</td>
                  <td>{r.avgImprovement ?? '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
