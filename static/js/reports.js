/* ==========================================================
   SpendSense — Reports page (filterable by month + dataset).
   ========================================================== */

(function () {
  "use strict";

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));
  }

  function csvEscape(v) {
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  function toCSV(rows) {
    const headers = ["Date", "Description", "Category", "Payment", "Amount", "Notes"];
    const lines = [headers.join(",")];
    rows.forEach((t) => {
      lines.push(
        [t.date, t.description, t.category, t.payment || "", t.amount, t.notes || ""]
          .map(csvEscape)
          .join(",")
      );
    });
    return lines.join("\n");
  }

  function download(filename, text) {
    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  const state = {
    month: "",
    datasetId: "",
    datasets: [],
    months: [],
  };

  function scopeLabel() {
    const SS = window.SS;
    const parts = [];
    if (state.month) parts.push(SS.fmtMonthKey(state.month));
    if (state.datasetId === "__manual__") parts.push("manually added");
    else if (state.datasetId) {
      const d = state.datasets.find((x) => x.id === state.datasetId);
      if (d) parts.push(`dataset “${d.name}”`);
    }
    return parts.length ? parts.join(" · ") : "All transactions";
  }

  function applyFilter(tx) {
    let out = tx;
    if (state.month) {
      out = out.filter((t) => (t.date || "").slice(0, 7) === state.month);
    }
    if (state.datasetId === "__manual__") {
      out = out.filter((t) => !t.import_id);
    } else if (state.datasetId) {
      out = out.filter((t) => t.import_id === state.datasetId);
    }
    return out;
  }

  function sanitizeFilename(s) {
    return String(s || "export").replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 60);
  }

  function populateFilters() {
    const SS = window.SS;
    const monthSel = document.getElementById("rpMonthFilter");
    const dsSel = document.getElementById("rpDatasetFilter");

    const monthOpts = state.months
      .map((m) => `<option value="${m.month}">${escapeHtml(SS.fmtMonthKey(m.month))} (${m.count})</option>`)
      .join("");
    monthSel.innerHTML = `<option value="">All months</option>${monthOpts}`;
    if (state.month && state.months.some((m) => m.month === state.month)) {
      monthSel.value = state.month;
    } else {
      state.month = "";
    }

    const dsOpts = state.datasets
      .map((d) => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)} (${d.count})</option>`)
      .join("");
    dsSel.innerHTML =
      `<option value="">All sources</option>` +
      `<option value="__manual__">Manually added</option>` +
      dsOpts;
    if (
      state.datasetId &&
      (state.datasetId === "__manual__" || state.datasets.some((d) => d.id === state.datasetId))
    ) {
      dsSel.value = state.datasetId;
    } else {
      state.datasetId = "";
    }
  }

  function render() {
    const SS = window.SS;
    const allTx = SS.Store.getTransactions();
    const scoped = applyFilter(allTx);

    const spent = scoped.reduce((s, t) => s + Number(t.amount || 0), 0);
    const count = scoped.length;
    const avg = count ? spent / count : 0;
    const scope = scopeLabel();

    // Headline tiles
    document.getElementById("rpScopeLabel").textContent = scope;
    document.getElementById("rpSpentLabel").textContent =
      state.month || state.datasetId ? "Spending in scope" : "Total spending";
    document.getElementById("rpSpent").textContent = SS.money(spent);
    document.getElementById("rpCount").textContent = count;
    document.getElementById("rpCountSub").textContent =
      state.month || state.datasetId ? `In ${scope}` : "Across all data";
    document.getElementById("rpAvg").textContent = SS.money(avg);
    document.getElementById("rpAvgSub").textContent =
      state.month || state.datasetId ? `Within ${scope}` : "Across all data";

    // Spent subline (comparison to previous month, only meaningful with month filter or default)
    const sub = document.getElementById("rpSpentSub");
    if (state.month) {
      const prevKey = shiftMonth(state.month, -1);
      const prevSpent = SS.totalForMonth(allTx, prevKey);
      sub.textContent = prevSpent
        ? `${spent >= prevSpent ? "+" : ""}${(((spent - prevSpent) / prevSpent) * 100).toFixed(1)}% vs ${SS.fmtMonthKey(prevKey)}`
        : `No data for ${SS.fmtMonthKey(prevKey)}`;
    } else if (!state.datasetId) {
      const thisMonth = SS.thisMonthKey();
      const prev = SS.prevMonthKey();
      const thisTotal = SS.totalForMonth(allTx, thisMonth);
      const prevTotal = SS.totalForMonth(allTx, prev);
      sub.textContent = prevTotal
        ? `This month ${thisTotal >= prevTotal ? "+" : ""}${(((thisTotal - prevTotal) / prevTotal) * 100).toFixed(1)}% vs last month`
        : "No prior-month data";
    } else {
      sub.textContent = `Across ${count} transaction${count === 1 ? "" : "s"}`;
    }

    // Trend (always 6-month overview of ALL data — the point of a trend is history)
    const trend = document.getElementById("rpTrendChart");
    if (trend && SS.charts) {
      if (trend._chart) trend._chart.destroy();
      const series = SS.lastSixMonthsSeries(allTx);
      trend._chart = SS.charts.makeLine(trend, series.labels, series.data, {
        label: "Monthly spending",
        color: SS.PALETTE.primary,
      });
    }

    // Category distribution for the scoped data
    const cat = document.getElementById("rpCategoryChart");
    if (cat && SS.charts) {
      if (cat._chart) cat._chart.destroy();
      const groups = scoped.reduce((acc, t) => {
        acc[t.category] = (acc[t.category] || 0) + Number(t.amount || 0);
        return acc;
      }, {});
      const labels = Object.keys(groups);
      const data = Object.values(groups);
      cat._chart = labels.length
        ? SS.charts.makeDoughnut(cat, labels, data)
        : SS.charts.makeDoughnut(cat, ["No data"], [1]);
    }
    document.getElementById("rpCategorySub").textContent =
      state.month || state.datasetId ? `Share of ${scope}` : "Share of all-time spending";

    // Month comparison — tied to the month filter, or current month otherwise
    const mom = document.getElementById("rpMomChart");
    if (mom && SS.charts) {
      if (mom._chart) mom._chart.destroy();
      const baseMonth = state.month || SS.thisMonthKey();
      const prevKey = shiftMonth(baseMonth, -1);
      mom._chart = SS.charts.makeBar(
        mom,
        [SS.fmtMonthKey(prevKey), SS.fmtMonthKey(baseMonth)],
        [SS.totalForMonth(allTx, prevKey), SS.totalForMonth(allTx, baseMonth)],
        { label: "Spending", colors: [SS.PALETTE.sage, SS.PALETTE.primary] }
      );
      document.getElementById("rpMomSub").textContent =
        `${SS.fmtMonthKey(baseMonth)} vs. ${SS.fmtMonthKey(prevKey)}`;
    }

    // New analysis sections
    renderDayOfWeek(scoped, scope);
    renderPaymentMethods(scoped, scope);
    renderWeekByWeek(scoped, allTx, scope);
    renderTopDescriptions(scoped);
    renderSpendingSpeed(scoped, scope);

    const empty = document.getElementById("rpEmpty");
    if (!scoped.length) {
      empty.hidden = false;
    } else {
      empty.hidden = true;
    }
    SS.refreshIcons();
  }

  // ---------- Analysis renderers ----------
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function renderDayOfWeek(scoped, scope) {
    const SS = window.SS;
    const canvas = document.getElementById("rpDowChart");
    if (!canvas || !SS.charts) return;
    if (canvas._chart) canvas._chart.destroy();
    const buckets = [0, 0, 0, 0, 0, 0, 0];
    scoped.forEach((t) => {
      const d = new Date((t.date || "") + "T00:00:00");
      if (!isNaN(d)) buckets[d.getDay()] += Number(t.amount || 0);
    });
    canvas._chart = SS.charts.makeBar(canvas, DOW, buckets, {
      label: "Total spending",
      colors: ["#FBD6E3", "#CFE1F6", "#FBECAD", "#CFEBD1", "#E0D6F5", "#FBD5BB", "#D7EDE4"],
    });
    const max = buckets.indexOf(Math.max(...buckets));
    const sub = document.getElementById("rpDowSub");
    if (sub) sub.textContent = buckets[max] > 0
      ? `Heaviest day: ${DOW[max]} with ${SS.money(buckets[max])} across ${scope.toLowerCase()}`
      : "Which day of the week eats the most";
  }

  function renderPaymentMethods(scoped, scope) {
    const SS = window.SS;
    const canvas = document.getElementById("rpPayChart");
    if (!canvas || !SS.charts) return;
    if (canvas._chart) canvas._chart.destroy();
    const groups = scoped.reduce((acc, t) => {
      const key = (t.payment || "Unspecified").trim() || "Unspecified";
      acc[key] = (acc[key] || 0) + Number(t.amount || 0);
      return acc;
    }, {});
    const labels = Object.keys(groups);
    const data = Object.values(groups);
    canvas._chart = labels.length
      ? SS.charts.makeDoughnut(canvas, labels, data)
      : SS.charts.makeDoughnut(canvas, ["No data"], [1]);
    const total = data.reduce((s, v) => s + v, 0);
    const topIdx = data.indexOf(Math.max(...data));
    const sub = document.getElementById("rpPayMethodSub");
    if (sub && labels.length) {
      const pct = total > 0 ? ((data[topIdx] / total) * 100).toFixed(0) : 0;
      sub.textContent = `${labels[topIdx]} accounts for ${pct}% of ${scope.toLowerCase()}`;
    }
  }

  function renderWeekByWeek(scoped, allTx, scope) {
    const SS = window.SS;
    const canvas = document.getElementById("rpWeekChart");
    if (!canvas || !SS.charts) return;
    if (canvas._chart) canvas._chart.destroy();
    // Build 4-5 week buckets from the scoped data's date range
    const dates = scoped.map((t) => t.date).filter(Boolean).sort();
    if (!dates.length) {
      canvas._chart = SS.charts.makeBar(canvas, ["No data"], [0], { label: "", colors: [SS.PALETTE.border] });
      return;
    }
    const first = new Date(dates[0] + "T00:00:00");
    const last = new Date(dates[dates.length - 1] + "T00:00:00");
    const startDay = first.getDate();
    const buckets = {};
    scoped.forEach((t) => {
      const d = new Date((t.date || "") + "T00:00:00");
      if (isNaN(d)) return;
      const day = d.getDate();
      const weekIdx = Math.floor((day - 1) / 7);
      buckets[weekIdx] = (buckets[weekIdx] || 0) + Number(t.amount || 0);
    });
    const labels = [];
    const data = [];
    for (let i = 0; i < 5; i++) {
      const startD = i * 7 + 1;
      const endD = Math.min(startD + 6, 31);
      labels.push(`${startD}–${endD}`);
      data.push(buckets[i] || 0);
    }
    canvas._chart = SS.charts.makeBar(canvas, labels, data, {
      label: "Spending",
      colors: ["#CFE1F6", "#FBECAD", "#CFEBD1", "#FBD6E3", "#E0D6F5"],
    });
    const hottest = data.indexOf(Math.max(...data));
    const sub = document.getElementById("rpWeekSub");
    if (sub) sub.textContent = `Hottest week: days ${labels[hottest]} with ${SS.money(data[hottest])}.`;
  }

  function renderTopDescriptions(scoped) {
    const SS = window.SS;
    const body = document.getElementById("rpTopDescBody");
    if (!body) return;
    const groups = scoped.reduce((acc, t) => {
      const key = (t.description || "").trim();
      if (!key) return acc;
      if (!acc[key]) acc[key] = { count: 0, total: 0, category: t.category };
      acc[key].count += 1;
      acc[key].total += Number(t.amount || 0);
      return acc;
    }, {});
    const rows = Object.entries(groups)
      .map(([desc, info]) => ({ desc, ...info }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="4" class="muted-note">No data.</td></tr>`;
      return;
    }
    body.innerHTML = rows
      .map((r) => {
        const meta = SS.categoryMeta(r.category);
        return `
          <tr>
            <td><strong>${escapeHtml(r.desc)}</strong></td>
            <td><span class="chip ${meta.chip}">${escapeHtml(r.category)}</span></td>
            <td style="text-align:right">${r.count}</td>
            <td class="amount-cell" style="text-align:right">${SS.money(r.total)}</td>
          </tr>`;
      })
      .join("");
    document.getElementById("rpTopDescSub").textContent =
      `${rows.length} unique descriptions shown · ${Object.keys(groups).length} total in scope`;
  }

  function renderSpendingSpeed(scoped, scope) {
    const SS = window.SS;
    const total = scoped.reduce((s, t) => s + Number(t.amount || 0), 0);
    const dates = scoped.map((t) => t.date).filter(Boolean);
    const uniqueDays = new Set(dates);
    const activeDays = uniqueDays.size;
    const dayCount = dates.length ? _spanDays(dates) : 0;
    const avgPerDay = dayCount ? total / dayCount : 0;

    // Biggest single transaction
    const biggest = scoped.reduce((max, t) => (Number(t.amount || 0) > Number(max.amount || 0) ? t : max), scoped[0] || {});
    // Busiest day
    const dayTotals = scoped.reduce((acc, t) => {
      acc[t.date] = (acc[t.date] || 0) + Number(t.amount || 0);
      return acc;
    }, {});
    const busiestEntry = Object.entries(dayTotals).sort((a, b) => b[1] - a[1])[0];

    document.getElementById("rpAvgPerDay").textContent = SS.money(avgPerDay);
    document.getElementById("rpAvgPerDaySub").textContent =
      dayCount ? `${SS.money(total)} spread across ${dayCount} day${dayCount === 1 ? "" : "s"}` : "No data";
    document.getElementById("rpBiggest").textContent = biggest.amount ? SS.money(biggest.amount) : "—";
    document.getElementById("rpBiggestSub").textContent = biggest.description
      ? `${biggest.description} · ${SS.fmtDate(biggest.date)}`
      : "No data";
    document.getElementById("rpBusiestDay").textContent = busiestEntry ? SS.money(busiestEntry[1]) : "—";
    document.getElementById("rpBusiestDaySub").textContent = busiestEntry
      ? `${SS.fmtDate(busiestEntry[0])}`
      : "No data";
    document.getElementById("rpActiveDays").textContent = activeDays;
    document.getElementById("rpActiveDaysSub").textContent = dayCount
      ? `${((activeDays / dayCount) * 100).toFixed(0)}% of ${dayCount}-day window`
      : "No data";
    document.getElementById("rpSpeedSub").textContent = `Movement patterns across ${scope.toLowerCase()}`;
  }

  function _spanDays(dates) {
    if (!dates.length) return 0;
    const sorted = [...dates].sort();
    const first = new Date(sorted[0] + "T00:00:00");
    const last = new Date(sorted[sorted.length - 1] + "T00:00:00");
    return Math.max(1, Math.round((last - first) / (1000 * 60 * 60 * 24)) + 1);
  }

  function shiftMonth(key, by) {
    if (!key || key.length !== 7) return key;
    const [y, m] = key.split("-").map(Number);
    const d = new Date(y, m - 1 + by, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  async function loadFiltersData() {
    const SS = window.SS;
    try {
      const [datasets, months] = await Promise.all([
        SS.Store.listDatasets(),
        SS.Store.listMonths(),
      ]);
      state.datasets = datasets;
      state.months = months;
    } catch (err) {
      state.datasets = [];
      state.months = [];
    }
    populateFilters();
  }

  ready(async () => {
    const SS = window.SS;
    await SS.Store.load();
    await loadFiltersData();

    document.getElementById("rpMonthFilter").addEventListener("change", (e) => {
      state.month = e.target.value;
      render();
    });
    document.getElementById("rpDatasetFilter").addEventListener("change", (e) => {
      state.datasetId = e.target.value;
      render();
    });

    document.getElementById("exportCsvBtn").addEventListener("click", () => {
      const scoped = applyFilter(SS.Store.getTransactions());
      if (!scoped.length) {
        SS.toast("Nothing to export in this scope.", "info");
        return;
      }
      const csv = toCSV([...scoped].sort((a, b) => b.date.localeCompare(a.date)));
      const stamp = new Date().toISOString().slice(0, 10);
      const scopeTag = sanitizeFilename(
        state.month ? state.month
          : state.datasetId === "__manual__" ? "manual"
          : state.datasetId
            ? (state.datasets.find((d) => d.id === state.datasetId)?.name || state.datasetId)
            : "all"
      );
      download(`spendsense-${scopeTag}-${stamp}.csv`, csv);
      SS.toast(`Exported ${scoped.length} transactions.`, "success");
    });

    render();
    window.addEventListener("spendsense:transactions-changed", async () => {
      await loadFiltersData();
      render();
    });
  });
})();
