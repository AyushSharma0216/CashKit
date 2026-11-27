/* ==========================================================
   SpendSense — Overview page.
   Dark sidebar / pastel cards / donut hero.
   All numbers come from MongoDB — no fake projections here.
   ========================================================== */

(function () {
  "use strict";

  const PASTEL_SEQ = [
    "#FBD6E3", "#CFE1F6", "#FBECAD", "#CFEBD1",
    "#E0D6F5", "#FBD5BB", "#D7EDE4", "#F3DAD4",
  ];

  const INK_FOR = [
    "#8C2E54", "#244F84", "#6B5610", "#2A5C3B",
    "#4B3A86", "#8A4214", "#205943", "#8E3B2E",
  ];

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function nextCycle(iso) {
    const d = new Date(iso + "T00:00:00");
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  }

  function render() {
    const SS = window.SS;
    if (!SS) return;

    const tx = SS.Store.getTransactions();
    const budgets = SS.Store.getBudgets();
    const thisMonth = SS.thisMonthKey();
    const prev = SS.prevMonthKey();

    const total = SS.totalForMonth(tx, thisMonth);
    const prevTotal = SS.totalForMonth(tx, prev);
    const budgetTotal = budgets.reduce((s, b) => s + Number(b.amount || 0), 0);
    const remaining = budgetTotal - total;

    document.getElementById("kpiTotal").textContent = SS.money(total);
    document.getElementById("kpiBudget").textContent = SS.money(budgetTotal);
    document.getElementById("kpiRemaining").textContent = SS.money(remaining);
    document.getElementById("kpiRemainingSub").textContent =
      budgetTotal === 0
        ? "No budgets set yet"
        : remaining >= 0 ? "Within budget so far" : "Over budget";

    const deltaEl = document.getElementById("kpiTotalDelta");
    if (prevTotal === 0) {
      deltaEl.textContent = "No prior month";
      deltaEl.className = "kpi-delta";
    } else {
      const delta = ((total - prevTotal) / prevTotal) * 100;
      deltaEl.textContent = `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`;
      deltaEl.className = "kpi-delta " + (delta >= 0 ? "is-up" : "is-down");
    }

    // Donut hero (real category breakdown this month)
    const canvas = document.getElementById("categoryChart");
    const g = SS.groupByCategory(tx, thisMonth);
    const labels = Object.keys(g);
    const data = Object.values(g);
    const colors = labels.map((_, i) => PASTEL_SEQ[i % PASTEL_SEQ.length]);
    if (canvas && window.Chart) {
      if (canvas._chart) canvas._chart.destroy();
      const sliceTotal = data.reduce((s, v) => s + Number(v || 0), 0);
      const heroPercent = {
        id: "heroPercent",
        afterDatasetsDraw(chart) {
          if (!labels.length || !sliceTotal) return;
          const meta = chart.getDatasetMeta(0);
          const ctx2 = chart.ctx;
          ctx2.save();
          ctx2.font = '700 11px "Inter", sans-serif';
          ctx2.textAlign = "center";
          ctx2.textBaseline = "middle";
          ctx2.fillStyle = "#15181B";
          meta.data.forEach((arc, i) => {
            const pct = (Number(data[i] || 0) / sliceTotal) * 100;
            if (pct < 5) return;
            const pos = arc.tooltipPosition();
            ctx2.fillText(`${pct.toFixed(0)}%`, pos.x, pos.y);
          });
          ctx2.restore();
        },
      };
      canvas._chart = new window.Chart(canvas, {
        type: "doughnut",
        data: {
          labels: labels.length ? labels : ["No data"],
          datasets: [{
            data: data.length ? data : [1],
            backgroundColor: labels.length ? colors : ["#EDE8DB"],
            borderColor: "#FFFEFA",
            borderWidth: 4,
            hoverOffset: 6,
          }],
        },
        options: {
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
                  return ` ${ctx.label}: ${SS.money(ctx.parsed)} · ${pct}%`;
                },
              },
            },
          },
        },
        plugins: [heroPercent],
      });
    }

    document.getElementById("donutCenter").textContent = SS.money(total);
    document.getElementById("donutSub").textContent =
      labels.length
        ? `across ${labels.length} categor${labels.length === 1 ? "y" : "ies"}`
        : "No transactions yet";

    const legend = document.getElementById("donutLegend");
    if (legend) {
      const totalForPct = data.reduce((s, v) => s + v, 0) || 1;
      const sorted = labels
        .map((name, i) => ({ name, value: data[i], color: colors[i], ink: INK_FOR[i % INK_FOR.length] }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);
      legend.innerHTML = sorted.length
        ? sorted.map((r) => `
          <div class="legend-row">
            <div class="name"><span class="dot" style="background:${r.color}"></span>${escapeHtml(r.name)}</div>
            <div class="val">${SS.money(r.value)} <span style="color:var(--muted);font-weight:600;font-size:12px">· ${Math.round((r.value / totalForPct) * 100)}%</span></div>
          </div>`).join("")
        : `<div class="empty-state" style="padding:20px"><h3>No spending yet</h3><p>Add transactions to see your breakdown.</p></div>`;
    }

    // Monthly line chart (last 6 months — real data)
    const canvasMonthly = document.getElementById("monthlyChart");
    if (canvasMonthly && SS.charts) {
      if (canvasMonthly._chart) canvasMonthly._chart.destroy();
      const series = SS.lastSixMonthsSeries(tx);
      canvasMonthly._chart = SS.charts.makeLine(canvasMonthly, series.labels, series.data, {
        label: "Monthly spending",
        color: "#121417",
      });
    }

    // Month over month bar
    const canvasMom = document.getElementById("momChart");
    if (canvasMom && SS.charts) {
      if (canvasMom._chart) canvasMom._chart.destroy();
      canvasMom._chart = SS.charts.makeBar(canvasMom, ["Previous", "Current"], [prevTotal, total], {
        label: "Spending",
        colors: ["#CFE1F6", "#121417"],
      });
    }

    // Recent transactions
    const body = document.getElementById("recentTxBody");
    if (body) {
      const recent = [...tx].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
      body.innerHTML = recent.length
        ? recent.map((t) => {
            const meta = SS.categoryMeta(t.category);
            return `
            <tr>
              <td><strong>${escapeHtml(t.description)}</strong></td>
              <td><span class="chip ${meta.chip}">${escapeHtml(t.category)}</span></td>
              <td>${escapeHtml(t.payment || "—")}</td>
              <td>${SS.fmtDate(t.date)}</td>
              <td class="amount-cell" style="text-align:right">${SS.money(t.amount)}</td>
            </tr>`;
          }).join("")
        : `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:18px">No transactions yet. <a href="/transactions?add=1" style="color:var(--text);font-weight:600;text-decoration:underline">Add your first</a>.</td></tr>`;
    }

    // Biggest expenses this month — top 3 single transactions by amount.
    // Each row shows rank, category chip, description, date, amount.
    const biggest = tx
      .filter((t) => SS.monthKey(t.date) === thisMonth)
      .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))
      .slice(0, 3);
    const biggestEl = document.getElementById("biggestList");
    if (biggestEl) {
      const monthTotal = tx
        .filter((t) => SS.monthKey(t.date) === thisMonth)
        .reduce((s, t) => s + Number(t.amount || 0), 0);
      biggestEl.innerHTML = biggest.length
        ? biggest.map((t, i) => {
            const meta = SS.categoryMeta(t.category);
            const share = monthTotal > 0 ? (Number(t.amount) / monthTotal * 100) : 0;
            const rankBg = ["#FBD6E3", "#CFE1F6", "#FBECAD"][i] || "#F2EFE4";
            const rankCol = ["#90263F", "#1B3C6A", "#71591C"][i] || "#6E7279";
            return `
            <div class="biggest-row" style="background:${rankBg}">
              <div class="biggest-rank" style="color:${rankCol}">#${i + 1}</div>
              <div class="biggest-main">
                <div class="biggest-desc">${escapeHtml(t.description)}</div>
                <div class="biggest-meta">
                  <span class="chip ${meta.chip}" style="font-size:10.5px;padding:2px 8px">${escapeHtml(t.category)}</span>
                  <span>${SS.fmtDate(t.date)}</span>
                  <span>· ${share.toFixed(0)}% of month</span>
                </div>
              </div>
              <div class="biggest-amt">${SS.money(t.amount)}</div>
            </div>`;
          }).join("")
        : `<div style="color:var(--muted);font-size:13px;padding:6px 2px">No transactions this month yet.</div>`;
    }

    // Latest two tx mini cards
    const latest = [...tx].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 2);
    const mini = document.getElementById("latestMini");
    if (mini) {
      mini.innerHTML = latest.length
        ? latest.map((t, i) => `
          <div class="tx-mini ${i === 1 ? "alt" : ""}">
            <div>
              <div style="font-size:11px;opacity:0.75;font-weight:600">${escapeHtml(t.category)}</div>
              <div style="font-weight:700;font-size:13px">${escapeHtml(t.description)}</div>
            </div>
            <div class="amt">− ${SS.money(t.amount)}</div>
            <div class="meta">${SS.fmtDate(t.date)} · ${escapeHtml(t.payment || "—")}</div>
          </div>
        `).join("")
        : `<div style="grid-column:1/-1;color:var(--muted);font-size:12px">Nothing to show yet.</div>`;
    }

    SS.refreshIcons();
  }

  ready(async () => {
    await window.SS.Store.load();
    render();
    window.addEventListener("spendsense:transactions-changed", render);
    window.addEventListener("spendsense:budgets-changed", render);
  });
})();
