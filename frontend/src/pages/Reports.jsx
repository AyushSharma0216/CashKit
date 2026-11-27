import { useEffect, useMemo, useState } from "react";
import { Download, Inbox } from "lucide-react";
import { Line, Bar, Doughnut } from "react-chartjs-2";
import "chart.js/auto";
import { useData } from "../store/dataStore.jsx";
import { SpendSenseAPI } from "../lib/api.js";
import {
  money, fmtDate, fmtMonthKey, thisMonthKey, prevMonthKey,
  totalForMonth, lastSixMonthsSeries,
} from "../lib/format.js";
import { categoryMeta, PALETTE } from "../lib/constants.js";
import { baseOpts, cartesian, hexA, percentOnSlices } from "../lib/chartOptions.js";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function shiftMonth(key, by) {
  if (!key || key.length !== 7) return key;
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function csvEscape(v) {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCSV(rows) {
  const headers = ["Date", "Description", "Category", "Payment", "Amount", "Notes"];
  const lines = [headers.join(",")];
  rows.forEach((t) =>
    lines.push([t.date, t.description, t.category, t.payment || "", t.amount, t.notes || ""].map(csvEscape).join(","))
  );
  return lines.join("\n");
}

function download(filename, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

export default function Reports() {
  const { transactions, toast } = useData();
  const [filter, setFilter] = useState({ month: "", datasetId: "" });
  const [datasets, setDatasets] = useState([]);
  const [months, setMonths] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [ds, mo] = await Promise.all([SpendSenseAPI.listDatasets(), SpendSenseAPI.listMonths()]);
        setDatasets(ds.items || []); setMonths(mo.items || []);
      } catch { /* ignore */ }
    })();
  }, [transactions]);

  const scope = useMemo(() => {
    const parts = [];
    if (filter.month) parts.push(fmtMonthKey(filter.month));
    if (filter.datasetId === "__manual__") parts.push("manually added");
    else if (filter.datasetId) {
      const d = datasets.find((x) => x.id === filter.datasetId);
      if (d) parts.push(`dataset "${d.name}"`);
    }
    return parts.length ? parts.join(" · ") : "All transactions";
  }, [filter, datasets]);

  const scoped = useMemo(() => {
    let out = transactions;
    if (filter.month) out = out.filter((t) => (t.date || "").slice(0, 7) === filter.month);
    if (filter.datasetId === "__manual__") out = out.filter((t) => !t.import_id);
    else if (filter.datasetId) out = out.filter((t) => t.import_id === filter.datasetId);
    return out;
  }, [transactions, filter]);

  const spent = scoped.reduce((s, t) => s + Number(t.amount || 0), 0);
  const count = scoped.length;
  const avg = count ? spent / count : 0;

  // Spent subline (vs. prior month)
  let spentSub;
  if (filter.month) {
    const prevKey = shiftMonth(filter.month, -1);
    const prevSpent = totalForMonth(transactions, prevKey);
    spentSub = prevSpent
      ? `${spent >= prevSpent ? "+" : ""}${(((spent - prevSpent) / prevSpent) * 100).toFixed(1)}% vs ${fmtMonthKey(prevKey)}`
      : `No data for ${fmtMonthKey(prevKey)}`;
  } else if (!filter.datasetId) {
    const t0 = totalForMonth(transactions, thisMonthKey());
    const t1 = totalForMonth(transactions, prevMonthKey());
    spentSub = t1 ? `This month ${t0 >= t1 ? "+" : ""}${(((t0 - t1) / t1) * 100).toFixed(1)}% vs last month` : "No prior-month data";
  } else {
    spentSub = `Across ${count} transaction${count === 1 ? "" : "s"}`;
  }

  // Charts
  const trendSeries = lastSixMonthsSeries(transactions);

  // Category distribution (doughnut on scoped)
  const catGroups = scoped.reduce((acc, t) => { acc[t.category] = (acc[t.category] || 0) + Number(t.amount || 0); return acc; }, {});
  const catLabels = Object.keys(catGroups);
  const catData = Object.values(catGroups);
  const catColors = catLabels.map((_, i) => PALETTE.seq[i % PALETTE.seq.length]);

  // MoM
  const baseMonth = filter.month || thisMonthKey();
  const prevKey = shiftMonth(baseMonth, -1);

  // Day of week
  const dow = [0, 0, 0, 0, 0, 0, 0];
  scoped.forEach((t) => {
    const d = new Date((t.date || "") + "T00:00:00");
    if (!isNaN(d)) dow[d.getDay()] += Number(t.amount || 0);
  });
  const maxDow = dow.indexOf(Math.max(...dow));

  // Payment methods
  const payGroups = scoped.reduce((acc, t) => {
    const key = (t.payment || "Unspecified").trim() || "Unspecified";
    acc[key] = (acc[key] || 0) + Number(t.amount || 0);
    return acc;
  }, {});
  const payLabels = Object.keys(payGroups); const payData = Object.values(payGroups);
  const payTotal = payData.reduce((s, v) => s + v, 0);
  const payTopIdx = payData.length ? payData.indexOf(Math.max(...payData)) : -1;

  // Week-by-week
  const weekBuckets = {};
  scoped.forEach((t) => {
    const d = new Date((t.date || "") + "T00:00:00");
    if (isNaN(d)) return;
    const day = d.getDate();
    const wi = Math.floor((day - 1) / 7);
    weekBuckets[wi] = (weekBuckets[wi] || 0) + Number(t.amount || 0);
  });
  const weekLabels = [], weekData = [];
  for (let i = 0; i < 5; i++) {
    const s = i * 7 + 1; const e = Math.min(s + 6, 31);
    weekLabels.push(`${s}–${e}`); weekData.push(weekBuckets[i] || 0);
  }
  const hottestWeek = weekData.indexOf(Math.max(...weekData));

  // Top descriptions
  const descGroups = scoped.reduce((acc, t) => {
    const key = (t.description || "").trim();
    if (!key) return acc;
    if (!acc[key]) acc[key] = { count: 0, total: 0, category: t.category };
    acc[key].count += 1; acc[key].total += Number(t.amount || 0);
    return acc;
  }, {});
  const topDesc = Object.entries(descGroups).map(([desc, info]) => ({ desc, ...info })).sort((a, b) => b.total - a.total).slice(0, 8);

  // Speed metrics
  const dates = scoped.map((t) => t.date).filter(Boolean);
  const uniqueDays = new Set(dates);
  const activeDays = uniqueDays.size;
  const span = (() => {
    if (!dates.length) return 0;
    const sorted = [...dates].sort();
    const f = new Date(sorted[0] + "T00:00:00"); const l = new Date(sorted[sorted.length - 1] + "T00:00:00");
    return Math.max(1, Math.round((l - f) / (1000 * 60 * 60 * 24)) + 1);
  })();
  const avgPerDay = span ? spent / span : 0;
  const biggest = scoped.reduce((max, t) => (Number(t.amount || 0) > Number(max?.amount || 0) ? t : max), scoped[0] || null);
  const dayTotals = scoped.reduce((acc, t) => { acc[t.date] = (acc[t.date] || 0) + Number(t.amount || 0); return acc; }, {});
  const busiestEntry = Object.entries(dayTotals).sort((a, b) => b[1] - a[1])[0];

  function handleExport() {
    if (!scoped.length) { toast("Nothing to export in this scope.", "info"); return; }
    const csv = toCSV([...scoped].sort((a, b) => b.date.localeCompare(a.date)));
    const stamp = new Date().toISOString().slice(0, 10);
    const sanitize = (s) => String(s || "export").replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 60);
    const tag = sanitize(filter.month || (filter.datasetId === "__manual__" ? "manual" : (filter.datasetId ? (datasets.find((d) => d.id === filter.datasetId)?.name || filter.datasetId) : "all")));
    download(`cashkit-${tag}-${stamp}.csv`, csv);
    toast(`Exported ${scoped.length} transactions.`, "success");
  }

  // Common chart building helpers
  const barColors = ["#FBD6E3", "#CFE1F6", "#FBECAD", "#CFEBD1", "#E0D6F5", "#FBD5BB", "#D7EDE4"];
  const lineOpts = baseOpts({ scales: cartesian() });

  const trendData = {
    labels: trendSeries.labels,
    datasets: [{
      label: "Monthly spending",
      data: trendSeries.data,
      borderColor: PALETTE.primary, backgroundColor: hexA(PALETTE.primary, 0.12),
      fill: true, tension: 0.35, pointRadius: 4,
      pointBackgroundColor: PALETTE.primary, pointBorderColor: "#FFFEFA",
      pointBorderWidth: 2, borderWidth: 2.5,
    }],
  };

  return (
    <>
      <section className="hello">
        <div>
          <h2>Reports</h2>
          <p>A clean summary of your activity, scoped by month or by dataset, ready to export.</p>
        </div>
        <div className="btn-row">
          <button className="btn btn-ghost" onClick={handleExport}><Download size={14} />Export CSV</button>
        </div>
      </section>

      <article className="card">
        <div className="toolbar">
          <div className="toolbar-left">
            <select value={filter.month} onChange={(e) => setFilter({ ...filter, month: e.target.value })}>
              <option value="">All months</option>
              {months.map((m) => <option key={m.month} value={m.month}>{fmtMonthKey(m.month)} ({m.count})</option>)}
            </select>
            <select value={filter.datasetId} onChange={(e) => setFilter({ ...filter, datasetId: e.target.value })}>
              <option value="">All sources</option>
              <option value="__manual__">Manually added</option>
              {datasets.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.count})</option>)}
            </select>
          </div>
          <div className="toolbar-right"><span className="card-sub">{scope}</span></div>
        </div>
      </article>

      <section className="grid grid-three">
        <div className="metric-tile">
          <span className="label">{filter.month || filter.datasetId ? "Spending in scope" : "Total spending"}</span>
          <div className="val">{money(spent)}</div>
          <div className="sub">{spentSub}</div>
        </div>
        <div className="metric-tile">
          <span className="label">Transaction count</span>
          <div className="val">{count}</div>
          <div className="sub">{filter.month || filter.datasetId ? `In ${scope}` : "Across all data"}</div>
        </div>
        <div className="metric-tile">
          <span className="label">Average per transaction</span>
          <div className="val">{money(avg)}</div>
          <div className="sub">{filter.month || filter.datasetId ? `Within ${scope}` : "Across all data"}</div>
        </div>
      </section>

      <section className="grid grid-split">
        <article className="card">
          <div className="card-head"><div><h3 className="card-title">Monthly trend</h3><p className="card-sub">Last 6 months of monthly totals.</p></div></div>
          <div className="chart-wrap"><Line data={trendData} options={lineOpts} /></div>
        </article>

        <article className="card">
          <div className="card-head"><div><h3 className="card-title">Category distribution</h3>
            <p className="card-sub">{filter.month || filter.datasetId ? `Share of ${scope}` : "Share of all-time spending"}</p></div></div>
          <div className="chart-wrap">
            <Doughnut
              data={{
                labels: catLabels.length ? catLabels : ["No data"],
                datasets: [{
                  data: catData.length ? catData : [1],
                  backgroundColor: catLabels.length ? catColors : ["#EDE8DB"],
                  borderColor: "#FFFEFA", borderWidth: 3, hoverOffset: 6,
                }],
              }}
              options={baseOpts({ cutout: "62%" })}
              plugins={catLabels.length ? [percentOnSlices] : []}
            />
          </div>
        </article>
      </section>

      <article className="card">
        <div className="card-head"><div><h3 className="card-title">Month comparison</h3>
          <p className="card-sub">{`${fmtMonthKey(baseMonth)} vs. ${fmtMonthKey(prevKey)}`}</p></div></div>
        <div className="chart-wrap sm">
          <Bar
            data={{
              labels: [fmtMonthKey(prevKey), fmtMonthKey(baseMonth)],
              datasets: [{
                label: "Spending",
                data: [totalForMonth(transactions, prevKey), totalForMonth(transactions, baseMonth)],
                backgroundColor: [PALETTE.sage, PALETTE.primary],
                borderRadius: 8, borderSkipped: false,
              }],
            }}
            options={lineOpts}
          />
        </div>
      </article>

      <section className="grid grid-split">
        <article className="card">
          <div className="card-head"><div><h3 className="card-title">Day-of-week spending</h3>
            <p className="card-sub">{dow[maxDow] > 0 ? `Heaviest day: ${DOW[maxDow]} with ${money(dow[maxDow])} across ${scope.toLowerCase()}` : "Which day of the week eats the most"}</p></div></div>
          <div className="chart-wrap sm">
            <Bar
              data={{ labels: DOW, datasets: [{ label: "Total spending", data: dow, backgroundColor: barColors, borderRadius: 8, borderSkipped: false }] }}
              options={lineOpts}
            />
          </div>
        </article>

        <article className="card">
          <div className="card-head"><div><h3 className="card-title">Payment methods</h3>
            <p className="card-sub">
              {payLabels.length && payTopIdx >= 0
                ? `${payLabels[payTopIdx]} accounts for ${((payData[payTopIdx] / (payTotal || 1)) * 100).toFixed(0)}% of ${scope.toLowerCase()}`
                : "How you paid"}
            </p></div></div>
          <div className="chart-wrap">
            <Doughnut
              data={{
                labels: payLabels.length ? payLabels : ["No data"],
                datasets: [{
                  data: payLabels.length ? payData : [1],
                  backgroundColor: payLabels.length ? payLabels.map((_, i) => PALETTE.seq[i % PALETTE.seq.length]) : ["#EDE8DB"],
                  borderColor: "#FFFEFA", borderWidth: 3, hoverOffset: 6,
                }],
              }}
              options={baseOpts({ cutout: "62%" })}
              plugins={payLabels.length ? [percentOnSlices] : []}
            />
          </div>
        </article>
      </section>

      <article className="card">
        <div className="card-head"><div><h3 className="card-title">Week-by-week this month</h3>
          <p className="card-sub">{weekData.some((v) => v > 0) ? `Hottest week: days ${weekLabels[hottestWeek]} with ${money(weekData[hottestWeek])}.` : "Spending per calendar week"}</p></div></div>
        <div className="chart-wrap sm">
          <Bar
            data={{ labels: weekLabels, datasets: [{ label: "Spending", data: weekData, backgroundColor: ["#CFE1F6", "#FBECAD", "#CFEBD1", "#FBD6E3", "#E0D6F5"], borderRadius: 8, borderSkipped: false }] }}
            options={lineOpts}
          />
        </div>
      </article>

      <section className="grid grid-split">
        <article className="card">
          <div className="card-head"><div><h3 className="card-title">Top descriptions</h3>
            <p className="card-sub">{topDesc.length ? `${topDesc.length} unique descriptions shown · ${Object.keys(descGroups).length} total in scope` : "Where you spent most, grouped by description"}</p></div></div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Description</th><th>Category</th><th style={{ textAlign: "right" }}>Times</th><th style={{ textAlign: "right" }}>Total</th></tr></thead>
              <tbody>
                {topDesc.length ? topDesc.map((r) => {
                  const meta = categoryMeta(r.category);
                  return (
                    <tr key={r.desc}>
                      <td><strong>{r.desc}</strong></td>
                      <td><span className={`chip ${meta.chip}`}>{r.category}</span></td>
                      <td style={{ textAlign: "right" }}>{r.count}</td>
                      <td className="amount-cell" style={{ textAlign: "right" }}>{money(r.total)}</td>
                    </tr>
                  );
                }) : <tr><td colSpan={4} className="muted-note">No data.</td></tr>}
              </tbody>
            </table>
          </div>
        </article>

        <article className="card">
          <div className="card-head"><div><h3 className="card-title">Spending speed</h3>
            <p className="card-sub">{`Movement patterns across ${scope.toLowerCase()}`}</p></div></div>
          <div className="speed-grid">
            <div className="speed-tile">
              <span className="speed-label">Avg per day</span>
              <div className="speed-val">{money(avgPerDay)}</div>
              <div className="speed-sub">{span ? `${money(spent)} spread across ${span} day${span === 1 ? "" : "s"}` : "No data"}</div>
            </div>
            <div className="speed-tile">
              <span className="speed-label">Largest single hit</span>
              <div className="speed-val">{biggest?.amount ? money(biggest.amount) : "—"}</div>
              <div className="speed-sub">{biggest?.description ? `${biggest.description} · ${fmtDate(biggest.date)}` : "No data"}</div>
            </div>
            <div className="speed-tile">
              <span className="speed-label">Busiest day</span>
              <div className="speed-val">{busiestEntry ? money(busiestEntry[1]) : "—"}</div>
              <div className="speed-sub">{busiestEntry ? fmtDate(busiestEntry[0]) : "No data"}</div>
            </div>
            <div className="speed-tile">
              <span className="speed-label">Active days</span>
              <div className="speed-val">{activeDays}</div>
              <div className="speed-sub">{span ? `${((activeDays / span) * 100).toFixed(0)}% of ${span}-day window` : "No data"}</div>
            </div>
          </div>
        </article>
      </section>

      {!scoped.length && (
        <div className="empty-state">
          <Inbox size={28} />
          <h3>Nothing to report yet</h3>
          <p>Add transactions on the Transactions page to populate your report.</p>
        </div>
      )}
    </>
  );
}
