import { useEffect, useState } from "react";
import { RefreshCw, Info, TrendingUp, CalendarClock, AlertTriangle } from "lucide-react";
import { Line, Bar } from "react-chartjs-2";
import "chart.js/auto";
import { useData } from "../store/dataStore.jsx";
import { SpendSenseAPI } from "../lib/api.js";
import { money, fmtMonthKey } from "../lib/format.js";
import { PALETTE } from "../lib/constants.js";
import { baseOpts, cartesian, hexA } from "../lib/chartOptions.js";

function pct(x) {
  if (x === null || x === undefined) return "—";
  return `${Math.round(x * 100)}%`;
}

export default function Predictions() {
  const { transactions, toast } = useData();
  const [bundle, setBundle] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  async function load(retrain = false) {
    try {
      setLoading(true);
      if (retrain) setStatus({ kind: "info", text: "Retraining… running regressions, scoring with walk-forward, refitting the classifier." });
      const body = retrain ? await SpendSenseAPI.retrain() : await SpendSenseAPI.predictions();
      setBundle(body);
      if (retrain) {
        setStatus({ kind: "info", text: `Trained. ${body.data.transactions} transactions across ${body.data.months_with_data} months. Chosen forecast: ${body.forecast_total.chosen_model || "—"}.` });
        setTimeout(() => setStatus(null), 5000);
      } else setStatus(null);
    } catch (e) {
      setStatus({ kind: "warn", text: `Could not load predictions. ${e.message || ""}` });
    } finally { setLoading(false); }
  }

  useEffect(() => { load(false); }, []);
  useEffect(() => { if (transactions.length) load(false); /* eslint-disable-next-line */ }, [transactions.length]);

  const f = bundle?.forecast_total || {};
  const pace = bundle?.this_month_pacing || {};
  const d = bundle?.data || {};

  return (
    <>
      <section className="hello">
        <div>
          <h2>Predictions</h2>
          <p>Live forecasts from scikit-learn models trained on your MongoDB transaction history.</p>
        </div>
        <div className="btn-row">
          <button className="btn btn-ghost" disabled={loading} onClick={() => load(true)}>
            <RefreshCw size={14} />Retrain
          </button>
        </div>
      </section>

      {status && (
        <section className={`callout is-${status.kind}`}>
          <Info size={16} /><div>{status.text}</div>
        </section>
      )}

      {/* Headline tiles */}
      <section className="grid grid-kpi-3">
        <div className="metric-tile pink">
          <span className="label">Forecast (from history)</span>
          <div className="val">{f.available ? money(f.next_month_amount) : "Not yet"}</div>
          <div className="sub">
            {f.available
              ? (() => {
                  const trend = f.slope_per_month || 0;
                  const dir = trend > 0 ? "↑" : trend < 0 ? "↓" : "→";
                  const iv = f.prediction_interval || {};
                  return `${fmtMonthKey(f.next_month_key)} · likely ${money(iv.low || 0)} – ${money(iv.high || 0)} · trend ${dir} ${money(Math.abs(trend))}/mo`;
                })()
              : (f.reason || "Need more months of data")}
          </div>
        </div>
        <div className="metric-tile blue">
          <span className="label">Projection (from this month so far)</span>
          <div className="val">{money(pace.projected_total ?? 0)}</div>
          <div className="sub">
            {pace.month ? fmtMonthKey(pace.month) : "This month"} · {money(pace.spent_so_far ?? 0)} spent in {pace.days_elapsed ?? 0}/{pace.days_in_month ?? 0} days
          </div>
        </div>
        <div className="metric-tile yellow">
          <span className="label">Model confidence</span>
          <div className="val">{f.available ? pct(f.confidence) : "—"}</div>
          <div className="sub">{f.available ? `Holdout MAE ${money(f.mae)} · model: ${f.chosen_model || "—"}` : "Model not fitted yet"}</div>
        </div>
      </section>

      {/* Forecast + consensus charts */}
      <section className="grid grid-split">
        <article className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title">Spending forecast</h3>
              <p className="card-sub">
                {f.available ? `Trained on ${f.months_used} months. ${f.chosen_description || ""}` : (f.reason || "Add more months of data to unlock the forecast.")}
              </p>
            </div>
            <div className="chip">{f.available ? `Winner: ${f.chosen_model}` : "Not fitted"}</div>
          </div>
          <div className="chart-wrap"><ForecastChart f={f} /></div>
          {f.available && (
            <div className="legend-note">
              <strong>Shaded band</strong> shows the likely range for next month, based on how close past predictions have been to actuals.
              Expect it to land between {money((f.prediction_interval || {}).low)} and {money((f.prediction_interval || {}).high)}.
            </div>
          )}
        </article>

        <article className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title">Model consensus</h3>
              <p className="card-sub">What every model independently predicts for next month.</p>
            </div>
          </div>
          <div className="chart-wrap"><ConsensusChart f={f} /></div>
          <ConsensusNote f={f} />
        </article>
      </section>

      {/* Suggested budget */}
      <article className="card">
        <div className="card-head">
          <div>
            <h3 className="card-title">Suggested budget for <span>{bundle?.recommended_budget?.available ? fmtMonthKey(bundle.recommended_budget.month_key) : "next month"}</span></h3>
            <p className="card-sub">Translates the forecast into a monthly cap. Pick a buffer level that matches your risk tolerance.</p>
          </div>
        </div>
        <BudgetRecommendation rec={bundle?.recommended_budget} />
      </article>

      {/* Walkthrough */}
      <article className="card walkthrough-card">
        <div className="card-head">
          <div>
            <h3 className="card-title">How your next-month forecast was computed</h3>
            <p className="card-sub">Six steps, with the actual numbers from your data.</p>
          </div>
        </div>
        <ol className="walkthrough">
          {(f.explanation || []).length ? f.explanation.map((s, i) => (
            <li className="walk-step" key={i}>
              <div className="walk-label">{s.label}</div>
              <div className="walk-value">{s.value}</div>
              <div className="walk-note">{s.note || ""}</div>
            </li>
          )) : <li className="muted-note">{f.reason || "Loading…"}</li>}
        </ol>
      </article>

      {/* Model comparison */}
      <article className="card">
        <div className="card-head">
          <div>
            <h3 className="card-title">Model comparison</h3>
            <p className="card-sub">Every forecasting method, scored by walk-forward validation on months the model never trained on. Lower MAE wins.</p>
          </div>
        </div>
        <ModelComparison f={f} />
      </article>

      {/* Budget status */}
      <article className="card">
        <div className="card-head">
          <div>
            <h3 className="card-title">Budget status — {pace.month ? fmtMonthKey(pace.month) : "this month"}</h3>
            <p className="card-sub">For each budget: where you are today, where you're heading, when you'll hit the cap, and the probability of overrun.</p>
          </div>
          <div className="chip">{pace.days_elapsed && pace.days_in_month ? `Day ${pace.days_elapsed} of ${pace.days_in_month}` : "—"}</div>
        </div>
        <BudgetStatus bundle={bundle} />
      </article>

      {/* Model evaluation */}
      <article className="card">
        <div className="card-head">
          <div>
            <h3 className="card-title">Model evaluation</h3>
            <p className="card-sub">Honest metrics — forecast errors come from walk-forward holdouts, not from in-sample fit.</p>
          </div>
          <div className="chip">{d.months_with_data ? `${d.months_with_data} months · ${d.transactions} rows` : "No data"}</div>
        </div>
        <div className="grid grid-three">
          <div className="metric-tile">
            <span className="label">MAE</span>
            <div className="val">{f.available ? money(f.mae) : "—"}</div>
            <div className="sub">Mean absolute error (regression)</div>
          </div>
          <div className="metric-tile">
            <span className="label">RMSE</span>
            <div className="val">{f.available ? money(f.rmse) : "—"}</div>
            <div className="sub">Root mean squared error</div>
          </div>
          <div className="metric-tile">
            <span className="label">R²</span>
            <div className="val">{f.available ? (f.r2 ?? "—") : "—"}</div>
            <div className="sub">Variance explained</div>
          </div>
          <div className="metric-tile">
            <span className="label">Rows trained on</span>
            <div className="val">{d.transactions || "—"}</div>
            <div className="sub">
              {d.earliest_month && d.latest_month
                ? `${fmtMonthKey(d.earliest_month)} → ${fmtMonthKey(d.latest_month)}`
                : "Transactions in your DB"}
            </div>
          </div>
        </div>
      </article>

      {/* Methods explainer */}
      <article className="card">
        <div className="card-head">
          <div>
            <h3 className="card-title">How these predictions are made</h3>
            <p className="card-sub">Plain-language method notes for each panel above.</p>
          </div>
        </div>
        <ul className="simple-list">
          <li>
            <div className="lead">
              <span className="ic"><TrendingUp size={14} /></span>
              <div>
                <div><strong>Next-month forecast</strong></div>
                <div className="meta">
                  sklearn <code>LinearRegression</code> fitted to <em>(month index, monthly total)</em>.
                  Predicts the next calendar month. MAE / RMSE / R² are measured on the fit.
                </div>
              </div>
            </div>
          </li>
          <li>
            <div className="lead">
              <span className="ic"><CalendarClock size={14} /></span>
              <div>
                <div><strong>This-month projection</strong></div>
                <div className="meta">Linear pacing: <code>spent_so_far × days_in_month / days_elapsed</code>.</div>
              </div>
            </div>
          </li>
          <li>
            <div className="lead">
              <span className="ic"><AlertTriangle size={14} /></span>
              <div>
                <div><strong>Budget-overrun risk</strong></div>
                <div className="meta">Projection = 60% pacing + 40% historical mean. Probability from <code>sigmoid((projection − budget) / σ_history)</code>.</div>
              </div>
            </div>
          </li>
        </ul>
      </article>
    </>
  );
}

function ForecastChart({ f }) {
  if (!f.available) {
    return <Bar data={{ labels: ["No fit"], datasets: [{ data: [0], backgroundColor: [PALETTE.border] }] }}
                options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }} />;
  }
  const history = f.history || [];
  const labels = history.map((h) => fmtMonthKey(h.month).slice(0, 3));
  const actuals = history.map((h) => h.amount);
  labels.push(fmtMonthKey(f.next_month_key).slice(0, 3));
  const predictionSeries = Array(actuals.length).fill(null).concat([f.next_month_amount]);
  const actualsPadded = actuals.concat([null]);
  const iv = f.prediction_interval || {};
  const bandHigh = Array(actuals.length).fill(null).concat([iv.high]);
  const bandLow = Array(actuals.length).fill(null).concat([iv.low]);

  const makeDs = (label, data, color, dashed = false, pointRadius = 3) => ({
    label, data,
    borderColor: color,
    backgroundColor: hexA(color, 0.1),
    borderDash: dashed ? [6, 6] : [],
    fill: false, tension: 0.35,
    pointRadius, pointHoverRadius: pointRadius + 2,
    pointBackgroundColor: color, pointBorderColor: "#FFFEFA", pointBorderWidth: 2,
    borderWidth: 2.5, spanGaps: true,
  });

  const data = {
    labels,
    datasets: [
      makeDs("Actual", actualsPadded, PALETTE.primary),
      makeDs("Likely high", bandHigh, "#C97A5E", true, 6),
      makeDs("Likely low", bandLow, "#8FA58B", true, 6),
      makeDs("Forecast", predictionSeries, "#D9A400", false, 9),
    ],
  };
  return <Line data={data} options={baseOpts({ scales: cartesian() })} />;
}

function ConsensusChart({ f }) {
  if (!f.available || !f.models || !f.models.length) {
    return <Bar data={{ labels: ["No data"], datasets: [{ data: [0], backgroundColor: [PALETTE.border] }] }}
                options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }} />;
  }
  const sorted = [...f.models]
    .filter((m) => m.next_month_amount != null)
    .sort((a, b) => a.next_month_amount - b.next_month_amount);
  const labels = sorted.map((m) => m.name);
  const data = sorted.map((m) => m.next_month_amount);
  const colors = sorted.map((m) => m.name === f.chosen_model ? "#D9A400" : "#8FA58B");

  const labelPlugin = {
    id: "barAmountLabels",
    afterDatasetsDraw(chart) {
      const ctx = chart.ctx;
      const meta = chart.getDatasetMeta(0);
      ctx.save();
      ctx.font = '700 12px "Inter", sans-serif';
      ctx.fillStyle = PALETTE.primary;
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      meta.data.forEach((bar, i) => {
        ctx.fillText("₹" + Math.round(chart.data.datasets[0].data[i]).toLocaleString("en-IN"), bar.x + 8, bar.y);
      });
      ctx.restore();
    },
  };

  return <Bar
    data={{ labels, datasets: [{ label: "Next-month forecast", data, backgroundColor: colors, borderRadius: 8, borderSkipped: false, barThickness: 22 }] }}
    options={{
      indexAxis: "y",
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { right: 48 } },
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: PALETTE.primary, titleColor: "#F2E8B7", bodyColor: "#FFFEFA", cornerRadius: 8, padding: 10,
                   callbacks: { label: (ctx) => ` ${money(ctx.parsed.x)}` } },
      },
      scales: {
        x: { display: false, beginAtZero: false, min: Math.max(0, Math.min(...data) * 0.95), max: Math.max(...data) * 1.02 },
        y: { grid: { display: false }, ticks: { color: PALETTE.primary, font: { family: "Inter", size: 12, weight: "600" }, padding: 8 }, border: { display: false } },
      },
      animation: { duration: 300 },
    }}
    plugins={[labelPlugin]}
  />;
}

function ConsensusNote({ f }) {
  if (!f.available || !f.models || !f.models.length) return null;
  const sorted = [...f.models].filter((m) => m.next_month_amount != null).sort((a, b) => a.next_month_amount - b.next_month_amount);
  const data = sorted.map((m) => m.next_month_amount);
  const min = Math.min(...data), max = Math.max(...data);
  const spread = max - min;
  const mean = data.reduce((s, v) => s + v, 0) / data.length;
  const spreadPct = mean > 0 ? (spread / mean) * 100 : 0;
  const chosen = sorted.find((m) => m.name === f.chosen_model);
  const chosenVal = chosen ? chosen.next_month_amount : mean;
  const withinTen = data.filter((v) => Math.abs(v - chosenVal) / Math.max(1, chosenVal) <= 0.1).length;

  let text;
  if (spreadPct < 10) text = <><strong>Strong consensus.</strong> All {sorted.length} models land within a {spreadPct.toFixed(0)}% spread ({money(min)}–{money(max)}). When methods this different agree this closely, the forecast is on solid ground.</>;
  else if (spreadPct < 25) text = <><strong>Moderate consensus.</strong> {withinTen} of {sorted.length} models agree within 10% of the chosen forecast. Spread is {money(spread)} across all methods.</>;
  else text = <><strong>Methods disagree.</strong> Spread is {spreadPct.toFixed(0)}% ({money(min)}–{money(max)}). We chose the one with the lowest holdout error; still, treat the exact number with some flexibility.</>;
  return <div className="legend-note">{text}</div>;
}

function BudgetRecommendation({ rec }) {
  if (!rec || !rec.available) {
    return <div className="budget-rec-grid"><div className="muted-note">{rec?.reason || "Loading…"}</div></div>;
  }
  const opts = rec.options || [];
  return (
    <>
      <div className="budget-rec-grid">
        {opts.map((o, i) => (
          <div key={i} className={`budget-rec-tile ${o.label === rec.default_label ? "is-default" : ""}`}>
            <div className="budget-rec-label">
              {o.label}
              {o.label === rec.default_label && <span className="chip chip-recommend"> recommended</span>}
            </div>
            <div className="budget-rec-amount">{money(o.amount)}</div>
            <div className="budget-rec-meta">
              {o.clears_prob_pct !== null && o.clears_prob_pct !== undefined ? `${o.clears_prob_pct}% clears` : "no probability (thin data)"}
              · buffer {money(o.buffer)}
            </div>
            <div className="budget-rec-note">{o.note}</div>
          </div>
        ))}
      </div>
      {rec.note && <div className="legend-note">{rec.note}</div>}
    </>
  );
}

function ModelComparison({ f }) {
  const models = f?.models || [];
  if (!models.length) {
    return (
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Method</th><th>How it predicts</th><th style={{ textAlign: "right" }}>Next month</th><th style={{ textAlign: "right" }}>Holdout MAE</th><th style={{ textAlign: "right" }}>Folds</th></tr></thead>
          <tbody><tr><td colSpan={5} className="muted-note">Not enough data to score models yet.</td></tr></tbody>
        </table>
      </div>
    );
  }
  const sorted = [...models].sort((a, b) => (a.holdout_mae ?? Infinity) - (b.holdout_mae ?? Infinity));
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Method</th><th>How it predicts</th>
            <th style={{ textAlign: "right" }}>Next month</th>
            <th style={{ textAlign: "right" }}>Holdout MAE</th>
            <th style={{ textAlign: "right" }}>Folds</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((m, idx) => {
            const winner = m.name === f.chosen_model;
            return (
              <tr key={m.name} className={winner ? "row-winner" : ""}>
                <td>
                  <strong>{m.name}</strong>
                  {winner
                    ? <span className="risk-chip risk-chip-safe" style={{ marginLeft: 6 }}>chosen</span>
                    : <span className="rank-badge" style={{ marginLeft: 6 }}>#{idx + 1}</span>}
                </td>
                <td className="card-sub">{m.desc}</td>
                <td className="amount-cell" style={{ textAlign: "right" }}>{money(m.next_month_amount)}</td>
                <td className="amount-cell" style={{ textAlign: "right" }}>{m.holdout_mae !== null ? money(m.holdout_mae) : "—"}</td>
                <td style={{ textAlign: "right" }}>{m.folds}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BudgetStatus({ bundle }) {
  const risk = bundle?.budget_risk || [];
  const trajectory = bundle?.budget_trajectory || [];
  if (!risk.length && !trajectory.length) {
    return <div className="risk-list"><div className="muted-note">No active budgets. Add a budget on the Budgets page to see where you stand.</div></div>;
  }
  const trajMap = new Map(trajectory.map((t) => [t.category, t]));
  const merged = risk.length
    ? risk.map((r) => ({ risk: r, traj: trajMap.get(r.category) || null }))
    : trajectory.map((t) => ({ risk: null, traj: t }));

  return (
    <div className="risk-list">
      {merged.map(({ risk: r, traj: t }, i) => {
        const base = r || t;
        const { category, budget, spent_so_far: spent, projected_month_total: projected } = base;
        const status = (t && t.status) || (r && r.status) || "on_track";
        const chipClass = { exceeded: "risk-chip-danger", will_overshoot: "risk-chip-danger", danger: "risk-chip-danger",
                            watch: "risk-chip-watch", on_track: "risk-chip-safe", safe: "risk-chip-safe" }[status] || "risk-chip-safe";
        const statusText = { exceeded: "exceeded", will_overshoot: "will overshoot", danger: "danger",
                             watch: "watch", on_track: "on track", safe: "safe" }[status] || status;
        const rowClass = ["exceeded", "will_overshoot", "danger"].includes(status) ? "risk-danger" : status === "watch" ? "risk-watch" : "risk-safe";
        const barPct = Math.min(1, spent / Math.max(1, budget)) * 100;
        return (
          <div key={i} className={`risk-row ${rowClass}`}>
            <div className="risk-main">
              <div className="risk-top">
                <span className="risk-cat">{category}</span>
                <span className={`risk-chip ${chipClass}`}>{statusText}</span>
                {r && <span className={`risk-chip ${chipClass}`} title="Probability of exceeding budget">{pct(r.probability)} risk</span>}
              </div>
              <div className="risk-bar"><span style={{ width: `${barPct.toFixed(1)}%` }} /></div>
              <div className="risk-meta">
                {money(spent)} / {money(budget)} spent
                {r && ` · ${r.months_of_history} month${r.months_of_history === 1 ? "" : "s"} of history`}
              </div>
              {t && (
                <div className="risk-meta">
                  <strong>{money(t.daily_rate)}/day</strong> · projected end {money(projected)} ·{" "}
                  <strong>Hits budget:</strong> {t.hit_day_text}
                  {t.burn_text && <> · {t.burn_text}</>}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
