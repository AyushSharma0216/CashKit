/* ==========================================================
   SpendSense — Predictions page (Phase 3, v2).
   Fetches scikit-learn forecasts + walkthroughs from the API
   and renders them with real explanations.
   ========================================================== */

(function () {
  "use strict";

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function fmtMonth(key) {
    return window.SS.fmtMonthKey(key);
  }

  function pct(x) {
    if (x === null || x === undefined) return "—";
    return `${Math.round(x * 100)}%`;
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function showStatus(message, kind = "info") {
    const bar = document.getElementById("trainStatus");
    const txt = document.getElementById("trainStatusText");
    if (!bar || !txt) return;
    bar.hidden = false;
    bar.className = `callout is-${kind}`;
    txt.innerHTML = message;
    window.SS.refreshIcons();
  }

  function hideStatus() {
    const bar = document.getElementById("trainStatus");
    if (bar) bar.hidden = true;
  }

  async function fetchPredictions(retrain = false) {
    const url = retrain ? "/api/train" : "/api/predictions";
    const r = await fetch(url, { method: retrain ? "POST" : "GET" });
    const body = await r.json().catch(() => ({}));
    if (!r.ok || !body.ok) {
      throw new Error(body.error || `Request failed (${r.status})`);
    }
    return body;
  }

  // ---------- Headline KPIs ----------
  function renderHeadline(bundle) {
    const SS = window.SS;
    const f = bundle.forecast_total || {};
    const pace = bundle.this_month_pacing || {};

    if (f.available) {
      setText("nextMonthVal", SS.money(f.next_month_amount));
      const trend = f.slope_per_month || 0;
      const dir = trend > 0 ? "↑" : trend < 0 ? "↓" : "→";
      const interval = f.prediction_interval || {};
      setText(
        "nextMonthSub",
        `${fmtMonth(f.next_month_key)} · likely ${SS.money(interval.low || 0)} – ${SS.money(interval.high || 0)} · trend ${dir} ${SS.money(Math.abs(trend))}/mo`
      );
    } else {
      setText("nextMonthVal", "Not yet");
      setText("nextMonthSub", f.reason || "Need more months of data");
    }

    setText("paceVal", SS.money(pace.projected_total ?? 0));
    const paceMonth = pace.month ? fmtMonth(pace.month) : "This month";
    setText(
      "paceSub",
      `${paceMonth} · ${SS.money(pace.spent_so_far ?? 0)} spent in ${pace.days_elapsed}/${pace.days_in_month} days`
    );

    if (f.available) {
      setText("confVal", pct(f.confidence));
      setText("confSub", `Holdout MAE ${SS.money(f.mae)} · model: ${f.chosen_model || "—"}`);
    } else {
      setText("confVal", "—");
      setText("confSub", "Model not fitted yet");
    }
  }

  // ---------- Forecast chart with prediction interval ----------
  function renderForecastChart(bundle) {
    const SS = window.SS;
    const canvas = document.getElementById("forecastChart");
    if (!canvas || !SS.charts) return;
    if (canvas._chart) canvas._chart.destroy();

    const f = bundle.forecast_total || {};
    const chip = document.getElementById("chosenModelChip");
    const intervalNote = document.getElementById("intervalNote");

    if (!f.available) {
      if (chip) chip.textContent = "Not fitted";
      if (intervalNote) intervalNote.textContent = "";
      document.getElementById("forecastSub").textContent =
        f.reason || "Add more months of data to unlock the forecast.";
      canvas._chart = SS.charts.makeBar(canvas, ["No fit"], [0], {
        label: "No data", colors: [SS.PALETTE.border],
      });
      return;
    }

    const history = f.history || [];
    const labels = history.map((h) => fmtMonth(h.month).slice(0, 3));
    const actuals = history.map((h) => h.amount);

    // Append the predicted next month
    labels.push(fmtMonth(f.next_month_key).slice(0, 3));
    const predictionSeries = Array(actuals.length).fill(null).concat([f.next_month_amount]);
    const actualsPadded = actuals.concat([null]);

    const interval = f.prediction_interval || {};
    const bandHigh = Array(actuals.length).fill(null).concat([interval.high]);
    const bandLow = Array(actuals.length).fill(null).concat([interval.low]);

    if (chip) chip.textContent = `Winner: ${f.chosen_model}`;
    if (intervalNote) {
      intervalNote.innerHTML = `
        <strong>Shaded band</strong> shows the likely range for next month, based on how close past predictions have been to actuals.
        Expect it to land between ${SS.money(interval.low)} and ${SS.money(interval.high)}.`;
    }

    document.getElementById("forecastSub").textContent =
      `Trained on ${f.months_used} months. ${f.chosen_description || ""}`;

    canvas._chart = SS.charts.makeMultiLine(canvas, labels, [
      { label: "Actual", data: actualsPadded, color: SS.PALETTE.primary },
      { label: "Likely high", data: bandHigh, color: "#C97A5E", dashed: true, pointRadius: 6 },
      { label: "Likely low", data: bandLow, color: "#8FA58B", dashed: true, pointRadius: 6 },
      { label: "Forecast", data: predictionSeries, color: "#D9A400", pointRadius: 9 },
    ]);
  }

  // ---------- Model consensus (how closely all models agree on next month) ----------
  function renderConsensus(bundle) {
    const SS = window.SS;
    const canvas = document.getElementById("consensusChart");
    if (!canvas || !SS.charts) return;
    if (canvas._chart) canvas._chart.destroy();

    const f = bundle.forecast_total || {};
    const subEl = document.getElementById("consensusSub");
    const noteEl = document.getElementById("consensusNote");

    if (!f.available || !f.models || !f.models.length) {
      if (subEl) subEl.textContent = f.reason || "Need more months of data to score models.";
      if (noteEl) noteEl.textContent = "";
      canvas._chart = SS.charts.makeBar(canvas, ["No data"], [0], {
        label: "", colors: [SS.PALETTE.border],
      });
      return;
    }

    // Sort models by predicted value for a clean read
    const sorted = [...f.models]
      .filter((m) => m.next_month_amount != null)
      .sort((a, b) => a.next_month_amount - b.next_month_amount);

    const labels = sorted.map((m) => m.name);
    const data = sorted.map((m) => m.next_month_amount);
    const chosenName = f.chosen_model;
    // Color-code: chosen gold, others sage
    const colors = sorted.map((m) => m.name === chosenName ? "#D9A400" : "#8FA58B");

    // Horizontal bars so model names fit cleanly on the left (no slanted labels)
    canvas._chart = new window.Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Next-month forecast",
          data,
          backgroundColor: colors,
          borderRadius: 8,
          borderSkipped: false,
          barThickness: 22,
        }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { right: 48 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: SS.PALETTE.primary,
            titleColor: "#F2E8B7",
            bodyColor: "#FFFEFA",
            cornerRadius: 8,
            padding: 10,
            callbacks: { label: (ctx) => ` ${SS.money(ctx.parsed.x)}` },
          },
          // Draw the amount at the end of each bar
          barLabels: true,
        },
        scales: {
          x: {
            display: false,
            beginAtZero: false,
            min: Math.max(0, Math.min(...data) * 0.95),
            max: Math.max(...data) * 1.02,
          },
          y: {
            grid: { display: false },
            ticks: {
              color: SS.PALETTE.primary,
              font: { family: "Inter", size: 12, weight: "600" },
              padding: 8,
            },
            border: { display: false },
          },
        },
        animation: { duration: 300 },
      },
      plugins: [{
        id: "barAmountLabels",
        afterDatasetsDraw(chart) {
          const { ctx } = chart;
          const meta = chart.getDatasetMeta(0);
          ctx.save();
          ctx.font = '700 12px "Inter", sans-serif';
          ctx.fillStyle = SS.PALETTE.primary;
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          meta.data.forEach((bar, i) => {
            const value = chart.data.datasets[0].data[i];
            ctx.fillText("₹" + Math.round(value).toLocaleString("en-IN"), bar.x + 8, bar.y);
          });
          ctx.restore();
        },
      }],
    });

    // Agreement stats — honest, not fabricated
    const min = Math.min(...data);
    const max = Math.max(...data);
    const spread = max - min;
    const mean = data.reduce((s, v) => s + v, 0) / data.length;
    const stdev = Math.sqrt(data.reduce((s, v) => s + (v - mean) ** 2, 0) / data.length);
    const spreadPct = mean > 0 ? (spread / mean) * 100 : 0;

    // Count how many are within ±10% of the chosen forecast
    const chosen = sorted.find((m) => m.name === chosenName);
    const chosenVal = chosen ? chosen.next_month_amount : mean;
    const withinTenPct = data.filter((v) => Math.abs(v - chosenVal) / Math.max(1, chosenVal) <= 0.1).length;

    if (subEl) {
      subEl.textContent = `${sorted.length} independent models · gold = chosen (lowest holdout error), sage = alternatives.`;
    }
    if (noteEl) {
      let verdict;
      if (spreadPct < 10) {
        verdict = `<strong>Strong consensus.</strong> All ${sorted.length} models land within a ${spreadPct.toFixed(0)}% spread (${SS.money(min)}–${SS.money(max)}). When methods this different agree this closely, the forecast is on solid ground.`;
      } else if (spreadPct < 25) {
        verdict = `<strong>Moderate consensus.</strong> ${withinTenPct} of ${sorted.length} models agree within 10% of the chosen forecast. Spread is ${SS.money(spread)} across all methods.`;
      } else {
        verdict = `<strong>Methods disagree.</strong> Spread is ${spreadPct.toFixed(0)}% (${SS.money(min)}–${SS.money(max)}). We chose the one with the lowest holdout error; still, treat the exact number with some flexibility.`;
      }
      noteEl.innerHTML = verdict;
    }
  }

  // ---------- Forecast walkthrough ----------
  function renderForecastWalkthrough(bundle) {
    const host = document.getElementById("forecastWalkthrough");
    if (!host) return;
    const f = bundle.forecast_total || {};
    const steps = f.explanation || [];
    if (!steps.length) {
      host.innerHTML = `<li class="muted-note">${escapeHtml(f.reason || "No walkthrough available until the forecast runs.")}</li>`;
      return;
    }
    host.innerHTML = steps
      .map((s) => `
        <li class="walk-step">
          <div class="walk-label">${escapeHtml(s.label)}</div>
          <div class="walk-value">${escapeHtml(s.value)}</div>
          <div class="walk-note">${escapeHtml(s.note || "")}</div>
        </li>`)
      .join("");
  }

  // ---------- Model comparison ----------
  function renderModelComparison(bundle) {
    const SS = window.SS;
    const body = document.getElementById("modelCompareBody");
    if (!body) return;
    const f = bundle.forecast_total || {};
    const models = f.models || [];
    if (!models.length) {
      body.innerHTML = `<tr><td colspan="5" class="muted-note">Not enough data to score models yet.</td></tr>`;
      return;
    }
    // Sort by holdout MAE ascending so the chosen/best is on top and worst at the bottom.
    // Models with no MAE (e.g. errored) fall to the end.
    const sorted = [...models].sort((a, b) => {
      const ma = a.holdout_mae ?? Number.POSITIVE_INFINITY;
      const mb = b.holdout_mae ?? Number.POSITIVE_INFINITY;
      return ma - mb;
    });
    body.innerHTML = sorted
      .map((m, idx) => {
        const winner = m.name === f.chosen_model;
        const rankBadge = winner
          ? `<span class="risk-chip risk-chip-safe" style="margin-left:6px">chosen</span>`
          : `<span class="rank-badge" style="margin-left:6px">#${idx + 1}</span>`;
        return `
          <tr class="${winner ? "row-winner" : ""}">
            <td>
              <strong>${escapeHtml(m.name)}</strong>
              ${rankBadge}
            </td>
            <td class="card-sub">${escapeHtml(m.desc)}</td>
            <td class="amount-cell" style="text-align:right">${SS.money(m.next_month_amount)}</td>
            <td class="amount-cell" style="text-align:right">${m.holdout_mae !== null ? SS.money(m.holdout_mae) : "—"}</td>
            <td style="text-align:right">${m.folds}</td>
          </tr>`;
      })
      .join("");
  }

  // ---------- Budget status (combined risk + trajectory) ----------
  function renderBudgetStatus(bundle) {
    const SS = window.SS;
    const host = document.getElementById("budgetStatusList");
    const risk = bundle.budget_risk || [];
    const trajectory = bundle.budget_trajectory || [];
    const pace = bundle.this_month_pacing || {};
    const label = document.getElementById("riskMonthLabel");
    const chip = document.getElementById("riskDayChip");
    if (label && pace.month) label.textContent = SS.fmtMonthKey(pace.month);
    if (chip && pace.days_elapsed && pace.days_in_month) {
      chip.textContent = `Day ${pace.days_elapsed} of ${pace.days_in_month}`;
    }

    if (!risk.length && !trajectory.length) {
      host.innerHTML = `<div class="muted-note">No active budgets. Add a budget on the Budgets page to see where you stand.</div>`;
      return;
    }

    // Merge the two sources by category — trajectory brings daily rate / hit-date,
    // risk brings probability and historical variance.
    const trajMap = new Map(trajectory.map((t) => [t.category, t]));
    const merged = risk.map((r) => ({ risk: r, traj: trajMap.get(r.category) || null }));

    // Fallback: if risk list is empty but trajectory isn't, still show the rows
    if (!merged.length) {
      trajectory.forEach((t) => merged.push({ risk: null, traj: t }));
    }

    // Already sorted by urgency on the server; keep that order.
    host.innerHTML = merged
      .map(({ risk: r, traj: t }) => {
        const category = (r || t).category;
        const budget = (r || t).budget;
        const spent = (r || t).spent_so_far;
        const projected = (r || t).projected_month_total;

        // Status: prefer trajectory's granular 4-way status over risk's 3-way
        const status = (t && t.status) || (r && r.status) || "on_track";
        const statusChipClass = {
          exceeded: "risk-chip-danger",
          will_overshoot: "risk-chip-danger",
          danger: "risk-chip-danger",
          watch: "risk-chip-watch",
          on_track: "risk-chip-safe",
          safe: "risk-chip-safe",
        }[status] || "risk-chip-safe";
        const statusText = {
          exceeded: "exceeded",
          will_overshoot: "will overshoot",
          danger: "danger",
          watch: "watch",
          on_track: "on track",
          safe: "safe",
        }[status] || status;
        const rowStatusClass = ["exceeded", "will_overshoot", "danger"].includes(status)
          ? "risk-danger"
          : status === "watch" ? "risk-watch" : "risk-safe";

        // Progress bar: % of budget already spent
        const barClamped = Math.min(1, spent / Math.max(1, budget));

        // Probability chip (only when risk data is available)
        const probChip = r
          ? `<span class="risk-chip ${statusChipClass}" title="Probability of exceeding budget">${pct(r.probability)} risk</span>`
          : "";

        // Trajectory line (daily rate · projected · hit date · burn vs usual)
        const trajLine = t
          ? `<div class="risk-meta">
               <strong>${SS.money(t.daily_rate)}/day</strong> ·
               projected end ${SS.money(projected)} ·
               <strong>Hits budget:</strong> ${escapeHtml(t.hit_day_text)}
               ${t.burn_text ? ` · ${escapeHtml(t.burn_text)}` : ""}
             </div>`
          : "";

        // Why? explanation combines both narratives when available
        const whyText = [
          r && r.explanation,
          t && t.burn_text && `Pace detail: ${t.burn_text}`,
        ].filter(Boolean).join(" ");

        return `
          <div class="risk-row ${rowStatusClass}">
            <div class="risk-main">
              <div class="risk-top">
                <span class="risk-cat">${escapeHtml(category)}</span>
                <span class="risk-chip ${statusChipClass}">${statusText}</span>
                ${probChip}
              </div>
              <div class="risk-bar">
                <span style="width:${(barClamped * 100).toFixed(1)}%"></span>
              </div>
              <div class="risk-meta">
                ${SS.money(spent)} / ${SS.money(budget)} spent
                ${r ? ` · ${r.months_of_history} month${r.months_of_history === 1 ? "" : "s"} of history` : ""}
              </div>
              ${trajLine}
              ${whyText ? `
                <details class="risk-why">
                  <summary>Why ${statusText}?</summary>
                  <div class="risk-explain">${escapeHtml(whyText)}</div>
                </details>` : ""}
            </div>
          </div>`;
      })
      .join("");
  }

  // ---------- Classifier details ----------
  function renderClassifier(bundle) {
    const c = bundle.classifier || {};
    const chip = document.getElementById("classifierChosenChip");
    const walk = document.getElementById("classifierWalkthrough");
    const perClassWrap = document.getElementById("classifierPerClassWrap");
    const perClassBody = document.getElementById("classifierPerClassBody");

    if (!c.available) {
      if (chip) chip.textContent = "Not trained";
      if (walk) walk.innerHTML = `<li class="muted-note">${escapeHtml(c.reason || "Classifier not available yet.")}</li>`;
      if (perClassWrap) perClassWrap.hidden = true;
      return;
    }

    if (chip) chip.textContent = `${c.chosen_model} · ${pct(c.accuracy)} CV accuracy`;

    if (walk) {
      const steps = c.explanation || [];
      walk.innerHTML = steps
        .map((s) => `
          <li class="walk-step">
            <div class="walk-label">${escapeHtml(s.label)}</div>
            <div class="walk-value">${escapeHtml(s.value)}</div>
            <div class="walk-note">${escapeHtml(s.note || "")}</div>
          </li>`)
        .join("");
    }

    if (perClassWrap && perClassBody) {
      const rows = c.per_class || [];
      if (rows.length) {
        perClassWrap.hidden = false;
        perClassBody.innerHTML = rows
          .map((r) => `
            <tr>
              <td><strong>${escapeHtml(r.class)}</strong></td>
              <td style="text-align:right">${pct(r.precision)}</td>
              <td style="text-align:right">${pct(r.recall)}</td>
              <td style="text-align:right">${pct(r.f1)}</td>
              <td style="text-align:right">${r.support}</td>
            </tr>`)
          .join("");
      } else {
        perClassWrap.hidden = true;
      }
    }
  }

  // ---------- Model evaluation panel ----------
  function renderEvaluation(bundle) {
    const SS = window.SS;
    const f = bundle.forecast_total || {};
    const d = bundle.data || {};

    setText("metricMae", f.available ? SS.money(f.mae) : "—");
    setText("metricRmse", f.available ? SS.money(f.rmse) : "—");
    setText("metricR2", f.available ? f.r2 : "—");

    setText("metricRows", d.transactions || "—");
    setText("metricRowsSub",
      d.earliest_month && d.latest_month
        ? `${fmtMonth(d.earliest_month)} → ${fmtMonth(d.latest_month)}`
        : "Transactions in your DB");

    const chip = document.getElementById("modelDataChip");
    if (chip) {
      chip.textContent = d.months_with_data
        ? `${d.months_with_data} months · ${d.transactions} rows`
        : "No data";
    }
  }

  // ---------- Main ----------
  function renderBudgetRecommendation(bundle) {
    const SS = window.SS;
    const grid = document.getElementById("budgetRecGrid");
    const disclaimer = document.getElementById("recDisclaimer");
    const monthLabel = document.getElementById("recMonthLabel");
    const sub = document.getElementById("recSub");
    const rec = bundle.recommended_budget || {};

    if (!rec.available) {
      if (monthLabel) monthLabel.textContent = "next month";
      if (grid) grid.innerHTML = `<div class="muted-note">${escapeHtml(rec.reason || "Not enough data to recommend a budget yet.")}</div>`;
      if (disclaimer) disclaimer.hidden = true;
      return;
    }

    if (monthLabel) monthLabel.textContent = fmtMonth(rec.month_key);
    if (sub) sub.textContent = rec.sigma
      ? `Forecast ${SS.money(rec.forecast)} with σ ${SS.money(rec.sigma)}. Pick a cap based on how much headroom you want.`
      : `Forecast ${SS.money(rec.forecast)}. Confidence band not available yet — the cushion is a rule-of-thumb.`;

    const opts = rec.options || [];
    grid.innerHTML = opts
      .map((o) => {
        const isDefault = o.label === rec.default_label;
        const probText = o.clears_prob_pct !== null && o.clears_prob_pct !== undefined
          ? `${o.clears_prob_pct}% clears`
          : "no probability (thin data)";
        return `
          <div class="budget-rec-tile ${isDefault ? 'is-default' : ''}">
            <div class="budget-rec-label">${escapeHtml(o.label)}${isDefault ? ' <span class="chip chip-recommend">recommended</span>' : ''}</div>
            <div class="budget-rec-amount">${SS.money(o.amount)}</div>
            <div class="budget-rec-meta">${probText} · buffer ${SS.money(o.buffer)}</div>
            <div class="budget-rec-note">${escapeHtml(o.note)}</div>
          </div>`;
      })
      .join("");

    if (disclaimer && rec.note) {
      disclaimer.textContent = rec.note;
      disclaimer.hidden = false;
    }
  }

  async function loadAll(retrain = false) {
    const SS = window.SS;
    try {
      if (retrain) showStatus("<strong>Retraining…</strong> running regressions, scoring with walk-forward, refitting the classifier.", "info");
      const bundle = await fetchPredictions(retrain);
      renderHeadline(bundle);
      renderForecastChart(bundle);
      renderConsensus(bundle);
      renderBudgetRecommendation(bundle);
      renderForecastWalkthrough(bundle);
      renderModelComparison(bundle);
      renderBudgetStatus(bundle);
      renderEvaluation(bundle);
      if (retrain) {
        showStatus(
          `<strong>Trained.</strong> ${bundle.data.transactions} transactions across ${bundle.data.months_with_data} months. Chosen forecast: ${bundle.forecast_total.chosen_model || "—"}. Chosen classifier: ${bundle.classifier.chosen_model || "—"}.`,
          "info"
        );
        setTimeout(hideStatus, 5000);
      } else {
        hideStatus();
      }
    } catch (err) {
      showStatus(`<strong>Could not load predictions.</strong> ${escapeHtml(err.message || "")}`, "warn");
    }
    SS.refreshIcons();
  }

  ready(async () => {
    const SS = window.SS;
    await SS.Store.load();
    await loadAll(false);

    document.getElementById("retrainBtn").addEventListener("click", async () => {
      const btn = document.getElementById("retrainBtn");
      btn.disabled = true;
      await loadAll(true);
      btn.disabled = false;
    });

    window.addEventListener("spendsense:transactions-changed", () => loadAll(false));
    window.addEventListener("spendsense:budgets-changed", () => loadAll(false));
  });
})();
