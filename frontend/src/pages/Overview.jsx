import { useMemo } from "react";
import { Link } from "react-router-dom";
import { List, Plus, ArrowRight, BarChart3 } from "lucide-react";
import { Doughnut, Line, Bar } from "react-chartjs-2";
import "chart.js/auto";
import { useData } from "../store/dataStore.jsx";
import {
  money, fmtDate, thisMonthKey, prevMonthKey, monthKey,
  totalForMonth, groupByCategory, lastSixMonthsSeries,
} from "../lib/format.js";
import { categoryMeta, PALETTE, INK_FOR } from "../lib/constants.js";
import { baseOpts, cartesian, hexA } from "../lib/chartOptions.js";

export default function Overview() {
  const { transactions, budgets } = useData();

  const thisMonth = thisMonthKey();
  const prev = prevMonthKey();
  const total = totalForMonth(transactions, thisMonth);
  const prevTotal = totalForMonth(transactions, prev);
  const budgetTotal = budgets.reduce((s, b) => s + Number(b.amount || 0), 0);
  const remaining = budgetTotal - total;

  // Delta vs. last month
  let delta = null, deltaClass = "";
  if (prevTotal === 0) delta = "No prior month";
  else {
    const d = ((total - prevTotal) / prevTotal) * 100;
    delta = `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`;
    deltaClass = d >= 0 ? "is-up" : "is-down";
  }

  // Category donut
  const grouped = groupByCategory(transactions, thisMonth);
  const catLabels = Object.keys(grouped);
  const catData = Object.values(grouped);
  const catColors = catLabels.map((_, i) => PALETTE.seq[i % PALETTE.seq.length]);

  const donutData = {
    labels: catLabels.length ? catLabels : ["No data"],
    datasets: [{
      data: catData.length ? catData : [1],
      backgroundColor: catLabels.length ? catColors : ["#EDE8DB"],
      borderColor: "#FFFEFA",
      borderWidth: 4,
      hoverOffset: 6,
    }],
  };
  const sliceTotal = catData.reduce((s, v) => s + Number(v || 0), 0);
  const donutOpts = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "72%",
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#121417",
        titleColor: "#D9E67A",
        bodyColor: "#FDFCF6",
        cornerRadius: 10,
        padding: 10,
        callbacks: {
          label: (ctx) => {
            const pct = sliceTotal ? ((ctx.parsed / sliceTotal) * 100).toFixed(1) : "0";
            return ` ${ctx.label}: ${money(ctx.parsed)} · ${pct}%`;
          },
        },
      },
    },
  };
  const heroPercentPlugin = {
    id: "heroPercent",
    afterDatasetsDraw(chart) {
      if (!catLabels.length || !sliceTotal) return;
      const meta = chart.getDatasetMeta(0);
      const ctx2 = chart.ctx;
      ctx2.save();
      ctx2.font = '700 11px "Inter", sans-serif';
      ctx2.textAlign = "center"; ctx2.textBaseline = "middle"; ctx2.fillStyle = "#15181B";
      meta.data.forEach((arc, i) => {
        const pct = (Number(catData[i] || 0) / sliceTotal) * 100;
        if (pct < 5) return;
        const pos = arc.tooltipPosition();
        ctx2.fillText(`${pct.toFixed(0)}%`, pos.x, pos.y);
      });
      ctx2.restore();
    },
  };

  // Monthly line
  const monthlySeries = useMemo(() => lastSixMonthsSeries(transactions), [transactions]);
  const monthlyData = {
    labels: monthlySeries.labels,
    datasets: [{
      label: "Monthly spending",
      data: monthlySeries.data,
      borderColor: "#121417",
      backgroundColor: hexA("#121417", 0.12),
      fill: true, tension: 0.35,
      pointRadius: 4, pointBackgroundColor: "#121417",
      pointBorderColor: "#FFFEFA", pointBorderWidth: 2, borderWidth: 2.5,
    }],
  };
  const lineOpts = baseOpts({ scales: cartesian() });

  // MoM bar
  const momData = {
    labels: ["Previous", "Current"],
    datasets: [{
      label: "Spending",
      data: [prevTotal, total],
      backgroundColor: ["#CFE1F6", "#121417"],
      borderRadius: 8,
      borderSkipped: false,
    }],
  };

  // Sorted legend rows
  const totalForPct = catData.reduce((s, v) => s + v, 0) || 1;
  const legendRows = catLabels
    .map((name, i) => ({ name, value: catData[i], color: catColors[i], ink: INK_FOR[i % INK_FOR.length] }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const recent = [...transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);

  // Biggest expenses
  const biggest = transactions
    .filter((t) => monthKey(t.date) === thisMonth)
    .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))
    .slice(0, 3);
  const monthTotal = transactions
    .filter((t) => monthKey(t.date) === thisMonth)
    .reduce((s, t) => s + Number(t.amount || 0), 0);

  const latest = [...transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 2);

  return (
    <>
      <section className="hello">
        <div>
          <h2>Your spending & insights</h2>
          <p>What you've spent, what you've set aside, and where this month stands.</p>
        </div>
        <div className="btn-row">
          <Link to="/transactions" className="btn btn-ghost"><List size={16} />All transactions</Link>
          <Link to="/transactions?add=1" className="btn"><Plus size={16} />Add expense</Link>
        </div>

      </section>

      <section className="grid grid-hero">
        <div className="donut-hero">
          <div className="chart-wrap">
            <Doughnut data={donutData} options={donutOpts} plugins={[heroPercentPlugin]} />
            <div className="donut-center">
              <span className="label">Spent this month</span>
              <span className="big">{money(total)}</span>
              <span className="small">
                {catLabels.length
                  ? `across ${catLabels.length} categor${catLabels.length === 1 ? "y" : "ies"}`
                  : "No transactions yet"}
              </span>
            </div>
          </div>
          <div className="legend">
            {legendRows.length ? legendRows.map((r) => (
              <div className="legend-row" key={r.name}>
                <div className="name"><span className="dot" style={{ background: r.color }} />{r.name}</div>
                <div className="val">
                  {money(r.value)}{" "}
                  <span style={{ color: "var(--muted)", fontWeight: 600, fontSize: 12 }}>
                    · {Math.round((r.value / totalForPct) * 100)}%
                  </span>
                </div>
              </div>
            )) : (
              <div className="empty-state" style={{ padding: 20 }}>
                <h3>No spending yet</h3><p>Add transactions to see your breakdown.</p>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title">This month's highlights</h3>
              <p className="card-sub">The biggest hits and your latest two entries</p>
            </div>
            <div className="chip cat-entertainment">Snapshot</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span className="label" style={{ marginBottom: 0 }}>Biggest expenses this month</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {biggest.length ? biggest.map((t, i) => {
                const meta = categoryMeta(t.category);
                const share = monthTotal > 0 ? (Number(t.amount) / monthTotal * 100) : 0;
                const rankBg = ["#FBD6E3", "#CFE1F6", "#FBECAD"][i] || "#F2EFE4";
                const rankCol = ["#90263F", "#1B3C6A", "#71591C"][i] || "#6E7279";
                return (
                  <div key={t.id} className="biggest-row" style={{ background: rankBg }}>
                    <div className="biggest-rank" style={{ color: rankCol }}>#{i + 1}</div>
                    <div className="biggest-main">
                      <div className="biggest-desc">{t.description}</div>
                      <div className="biggest-meta">
                        <span className={`chip ${meta.chip}`} style={{ fontSize: 10.5, padding: "2px 8px" }}>{t.category}</span>
                        <span>{fmtDate(t.date)}</span>
                        <span>· {share.toFixed(0)}% of month</span>
                      </div>
                    </div>
                    <div className="biggest-amt">{money(t.amount)}</div>
                  </div>
                );
              }) : (
                <div style={{ color: "var(--muted)", fontSize: 13, padding: "6px 2px" }}>
                  No transactions this month yet.
                </div>
              )}
            </div>

            <div className="divider"></div>
            <span className="label" style={{ marginBottom: 0 }}>Latest transactions</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {latest.length ? latest.map((t, i) => (
                <div key={t.id} className={`tx-mini ${i === 1 ? "alt" : ""}`}>
                  <div>
                    <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 600 }}>{t.category}</div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{t.description}</div>
                  </div>
                  <div className="amt">− {money(t.amount)}</div>
                  <div className="meta">{fmtDate(t.date)} · {t.payment || "—"}</div>
                </div>
              )) : (
                <div style={{ gridColumn: "1/-1", color: "var(--muted)", fontSize: 12 }}>
                  Nothing to show yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-kpi-3">
        <article className="card pastel pink">
          <span className="label">Spending this month</span>
          <div className="kpi-row">
            <span className="kpi">{money(total)}</span>
            <span className={`kpi-delta ${deltaClass}`}>{delta}</span>
          </div>
          <div className="card-sub">Compared with last month</div>
        </article>

        <article className="card pastel blue">
          <span className="label">Monthly budget</span>
          <div className="kpi">{money(budgetTotal)}</div>
          <div className="card-sub">Sum of category targets</div>
        </article>

        <article className="card pastel yellow">
          <span className="label">Remaining balance</span>
          <div className="kpi">{money(remaining)}</div>
          <div className="card-sub">
            {budgetTotal === 0 ? "No budgets set yet" : remaining >= 0 ? "Within budget so far" : "Over budget"}
          </div>
        </article>
      </section>

      <section className="grid grid-split">
        <article className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title">Monthly spending</h3>
              <p className="card-sub">Last 6 months</p>
            </div>
            <div className="chip">Overview</div>
          </div>
          <div className="chart-wrap"><Line data={monthlyData} options={lineOpts} /></div>
        </article>

        <article className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title">Month-over-month</h3>
              <p className="card-sub">This month vs. previous</p>
            </div>
            <div className="card-icon is-blue"><BarChart3 size={18} /></div>
          </div>
          <div className="chart-wrap sm"><Bar data={momData} options={lineOpts} /></div>
        </article>
      </section>

      <article className="card">
        <div className="card-head">
          <div>
            <h3 className="card-title">Recent transactions</h3>
            <p className="card-sub">Your five latest entries</p>
          </div>
          <Link to="/transactions" className="btn btn-ghost">View all <ArrowRight size={14} /></Link>
        </div>
        <div className="table-wrap">
          <table className="data-table" aria-label="Recent transactions">
            <thead>
              <tr>
                <th>Description</th>
                <th>Category</th>
                <th>Payment</th>
                <th>Date</th>
                <th style={{ textAlign: "right" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {recent.length ? recent.map((t) => {
                const meta = categoryMeta(t.category);
                return (
                  <tr key={t.id}>
                    <td><strong>{t.description}</strong></td>
                    <td><span className={`chip ${meta.chip}`}>{t.category}</span></td>
                    <td>{t.payment || "—"}</td>
                    <td>{fmtDate(t.date)}</td>
                    <td className="amount-cell" style={{ textAlign: "right" }}>{money(t.amount)}</td>
                  </tr>
                );
              }) : (
                <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--muted)", padding: 18 }}>
                  No transactions yet. <Link to="/transactions?add=1" style={{ color: "var(--text)", fontWeight: 600, textDecoration: "underline" }}>Add your first</Link>.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </>
  );
}
