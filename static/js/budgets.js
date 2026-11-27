/* ==========================================================
   SpendSense — Budgets page (redesigned).
   ========================================================== */

(function () {
  "use strict";

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;",
      '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function daysInThisMonth() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  }
  function dayOfMonth() {
    return new Date().getDate();
  }

  function populateCategorySelect() {
    const SS = window.SS;
    const el = document.getElementById("budgetCategory");
    el.innerHTML = SS.CATEGORIES.map((c) => `<option value="${c.key}">${c.key}</option>`).join("");
  }

  // Build last-6-months spending series for a category (for sparklines)
  function sixMonthSeries(tx, category) {
    const data = [];
    const labels = [];
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 5);
    for (let i = 0; i < 6; i++) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const total = tx
        .filter((t) => (t.date || "").slice(0, 7) === key && t.category === category)
        .reduce((s, t) => s + Number(t.amount || 0), 0);
      data.push(total);
      labels.push(d.toLocaleString("en-GB", { month: "short" }));
      d.setMonth(d.getMonth() + 1);
    }
    return { labels, data };
  }

  function statusFor(spent, budget) {
    if (!budget || budget <= 0) return "neutral";
    const pct = spent / budget;
    if (pct >= 1) return "over";
    if (pct >= 0.9) return "watch";
    return "safe";
  }

  let totalBudget = null; // cached master total, loaded from the server

  function updateHeaderActions() {
    const el = document.getElementById("budgetHeaderActions");
    if (!el) return;
    if (totalBudget) {
      el.innerHTML = `
        <button class="btn btn-ghost" id="editTotalBtn">
          <i data-lucide="pencil"></i>
          Edit total
        </button>
        <button class="btn" id="headerAddBudget">
          <i data-lucide="plus"></i>
          Add sub-budget
        </button>`;
      el.querySelector("#editTotalBtn").addEventListener("click", () => openTotalEditor(totalBudget.amount));
      el.querySelector("#headerAddBudget").addEventListener("click", () => openModal(null));
    } else {
      el.innerHTML = "";
    }
    if (window.lucide) window.lucide.createIcons();
  }

  function openTotalEditor(current) {
    const SS = window.SS;
    const modal = document.getElementById("totalModal");
    const input = document.getElementById("totalAmountInput");
    const banner = document.getElementById("totalCurrentBanner");
    const bannerVal = document.getElementById("totalCurrentVal");
    const bannerNote = document.getElementById("totalCurrentNote");
    const impact = document.getElementById("totalImpact");
    const impactText = document.getElementById("totalImpactText");
    const deleteBtn = document.getElementById("totalDeleteBtn");
    const errorEl = document.getElementById("totalAmountError");
    const title = document.getElementById("totalModalTitle");

    errorEl.textContent = "";
    input.value = current ? String(current) : "";

    if (current) {
      title.textContent = "Edit total monthly budget";
      banner.hidden = false;
      bannerVal.textContent = SS.money(current);
      const subBudgets = SS.Store.getBudgets();
      const subSum = subBudgets.reduce((s, b) => s + Number(b.amount || 0), 0);
      bannerNote.textContent = subBudgets.length
        ? `${SS.money(subSum)} currently allocated across ${subBudgets.length} sub-budget${subBudgets.length === 1 ? "" : "s"}.`
        : "No sub-budgets yet.";
      deleteBtn.hidden = false;
    } else {
      title.textContent = "Set total monthly budget";
      banner.hidden = true;
      deleteBtn.hidden = true;
    }

    updateTotalImpact();

    modal.hidden = false;
    setTimeout(() => input.focus(), 50);
    if (window.lucide) window.lucide.createIcons();
  }

  function closeTotalModal() {
    document.getElementById("totalModal").hidden = true;
  }

  function updateTotalImpact() {
    const SS = window.SS;
    const input = document.getElementById("totalAmountInput");
    const impact = document.getElementById("totalImpact");
    const impactText = document.getElementById("totalImpactText");

    const n = Number(input.value);
    if (!isFinite(n) || n <= 0) {
      impact.hidden = true;
      return;
    }
    const subSum = SS.Store.getBudgets().reduce((s, b) => s + Number(b.amount || 0), 0);
    impact.hidden = false;
    impact.className = "total-impact";
    if (subSum === 0) {
      impactText.textContent = `No sub-budgets yet — your entire ${SS.money(n)} is free to allocate.`;
    } else if (subSum > n) {
      impact.classList.add("warn");
      impactText.textContent = `Your sub-budgets total ${SS.money(subSum)}, which would exceed this cap by ${SS.money(subSum - n)}. You'll need to lower a sub-budget or raise this amount.`;
    } else {
      const left = n - subSum;
      impactText.textContent = `${SS.money(subSum)} already allocated · ${SS.money(left)} would stay free for new sub-budgets.`;
    }
  }

  async function handleDeleteTotal() {
    const SS = window.SS;
    const ok = await SS.confirmDialog({
      title: "Remove the total monthly budget?",
      body: "Your sub-budgets stay as they are, but you'll need to set the total again to track overall spending. Continue?",
      okLabel: "Remove total",
    });
    if (!ok) return;
    try {
      await SS.Store.deleteTotalBudget();
      totalBudget = null;
      closeTotalModal();
      SS.toast("Total budget removed.", "success");
      render();
    } catch (err) {
      SS.toast(err.message || "Could not remove total.", "error");
    }
  }

  async function saveTotalBudget(amount) {
    const SS = window.SS;
    try {
      totalBudget = await SS.Store.setTotalBudget(amount);
      SS.toast(`Total monthly budget set to ${SS.money(amount)}.`, "success");
      render();
    } catch (err) {
      SS.toast(err.message || "Could not save total budget.", "error");
    }
  }

  function render() {
    const SS = window.SS;
    const budgets = SS.Store.getBudgets();
    const tx = SS.Store.getTransactions();
    const thisMonth = SS.thisMonthKey();
    const spentByCat = SS.groupByCategory(tx, thisMonth);
    const spentTotal = Object.values(spentByCat).reduce((s, v) => s + v, 0);
    const subBudgetSum = budgets.reduce((s, b) => s + Number(b.amount || 0), 0);
    // If a master total is set, that drives the hero. Otherwise fall back to the sum of sub-budgets.
    const budgetTotal = totalBudget ? Number(totalBudget.amount || 0) : subBudgetSum;
    const remaining = budgetTotal - spentTotal;

    // --- First-run state: no master total set ---
    document.getElementById("budgetSetupCard").hidden = !!totalBudget;
    document.getElementById("budgetHeroCard").hidden = !totalBudget;
    document.getElementById("budgetAllocCard").hidden = !totalBudget;
    document.getElementById("statusRow").hidden = !totalBudget;
    document.getElementById("subBudgetsCard").hidden = !totalBudget;
    updateHeaderActions();

    if (!totalBudget) {
      // Nothing more to render until the total is set.
      SS.refreshIcons();
      return;
    }

    // --- Allocation card: how much of total is covered by sub-budgets ---
    const allocPct = budgetTotal > 0 ? Math.min(100, (subBudgetSum / budgetTotal) * 100) : 0;
    const allocBar = document.getElementById("allocBar");
    allocBar.style.width = `${allocPct}%`;
    allocBar.className = "progress-bar";
    if (subBudgetSum > budgetTotal) allocBar.classList.add("is-danger");
    else if (subBudgetSum >= budgetTotal * 0.9) allocBar.classList.add("is-warn");

    const allocChip = document.getElementById("budgetAllocChip");
    const allocNote = document.getElementById("budgetAllocNote");
    if (subBudgetSum > budgetTotal) {
      const over = subBudgetSum - budgetTotal;
      allocChip.textContent = `Over-allocated by ${SS.money(over)}`;
      allocChip.className = "chip";
      allocChip.style.background = "#FBD6E3";
      allocChip.style.color = "#90263F";
      allocNote.textContent = `Your sub-budgets total ${SS.money(subBudgetSum)}, which exceeds the ${SS.money(budgetTotal)} master cap. Lower one, or raise your total.`;
    } else if (subBudgetSum === 0) {
      allocChip.textContent = "Nothing allocated";
      allocChip.style.background = "";
      allocChip.style.color = "";
      allocNote.textContent = `Your total is ${SS.money(budgetTotal)}. Add sub-budgets below to split it by category.`;
    } else {
      const left = budgetTotal - subBudgetSum;
      allocChip.textContent = `${SS.money(left)} unallocated`;
      allocChip.style.background = "";
      allocChip.style.color = "";
      allocNote.textContent = `${SS.money(subBudgetSum)} allocated across ${budgets.length} categor${budgets.length === 1 ? "y" : "ies"} out of ${SS.money(budgetTotal)} total.`;
    }

    const dim = daysInThisMonth();
    const dom = dayOfMonth();
    const daysLeft = Math.max(0, dim - dom);
    const pctElapsed = Math.round((dom / dim) * 100);

    // Headline stats
    document.getElementById("budgetTotal").textContent = SS.money(budgetTotal);
    document.getElementById("budgetSpent").textContent = SS.money(spentTotal);
    document.getElementById("budgetRemaining").textContent = SS.money(remaining >= 0 ? remaining : 0);
    document.getElementById("budgetDaysLeft").textContent = daysLeft;

    document.getElementById("budgetSpentSub").textContent = budgetTotal
      ? `${Math.round((spentTotal / budgetTotal) * 100)}% of plan`
      : "No budgets yet";
    document.getElementById("budgetRemainingSub").textContent = budgetTotal
      ? (remaining >= 0 ? "Still available" : `Over by ${SS.money(Math.abs(remaining))}`)
      : "—";
    document.getElementById("budgetDaysSub").textContent = `${pctElapsed}% of ${dim} days elapsed`;

    // Donut hero
    renderDonut(budgetTotal, spentTotal);

    // Status counts
    let onTrack = 0, watch = 0, over = 0;
    budgets.forEach((b) => {
      const s = statusFor(spentByCat[b.category] || 0, b.amount);
      if (s === "safe") onTrack++;
      else if (s === "watch") watch++;
      else if (s === "over") over++;
    });
    document.getElementById("countOnTrack").textContent = onTrack;
    document.getElementById("countWatch").textContent = watch;
    document.getElementById("countOver").textContent = over;
    document.getElementById("countTotal").textContent = budgets.length;

    // Category grid
    const grid = document.getElementById("budgetGrid");
    const empty = document.getElementById("budgetEmpty");
    if (!budgets.length) {
      grid.innerHTML = "";
      empty.hidden = false;
    } else {
      empty.hidden = true;
      // Sort: over > watch > safe
      const sortOrder = { over: 0, watch: 1, safe: 2, neutral: 3 };

      // Build per-category recurring-this-month & historical variable averages
      // so projections don't naively extrapolate one-off recurring charges.
      const txThisMonth = tx.filter((t) => SS.monthKey(t.date) === thisMonth);
      const recurringByCat = {};
      txThisMonth.forEach((t) => {
        if (/recurr/i.test(t.notes || "")) {
          recurringByCat[t.category] = (recurringByCat[t.category] || 0) + Number(t.amount || 0);
        }
      });
      // Historical totals per category per prior month
      const prevMonths = {};
      tx.forEach((t) => {
        const mk = SS.monthKey(t.date);
        if (!mk || mk === thisMonth) return;
        prevMonths[t.category] = prevMonths[t.category] || {};
        prevMonths[t.category][mk] = (prevMonths[t.category][mk] || 0) + Number(t.amount || 0);
      });
      const histAvgByCat = {};
      Object.keys(prevMonths).forEach((c) => {
        const vals = Object.values(prevMonths[c]);
        histAvgByCat[c] = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
      });

      function smartProject(cat, spent) {
        const recurring = recurringByCat[cat] || 0;
        const variable = Math.max(0, spent - recurring);
        // If we have enough days and some variable signal, pace it
        if (dom >= 8 && variable > 0) {
          return recurring + (variable / dom) * dim;
        }
        // Otherwise fall back to historical average for the variable portion
        const hist = histAvgByCat[cat] || spent;
        const histVariable = Math.max(0, hist - recurring);
        return Math.max(spent, recurring + histVariable);
      }

      const rows = budgets
        .map((b) => {
          const spent = spentByCat[b.category] || 0;
          const projected = smartProject(b.category, spent);
          const utilization = b.amount ? (spent / b.amount) * 100 : 0;
          const projUtil = b.amount ? (projected / b.amount) * 100 : 0;
          const status = statusFor(spent, b.amount);
          return { b, spent, projected, utilization, projUtil, status };
        })
        .sort((a, b) => sortOrder[a.status] - sortOrder[b.status]);

      grid.innerHTML = rows
        .map(({ b, spent, projected, utilization, projUtil, status }) => {
          const meta = SS.categoryMeta(b.category);
          const projMarker = Math.max(0, Math.min(100, projUtil));
          const projDiff = projected - b.amount;
          const projTag = status === "over"
            ? `<span class="budget-card-tag over">Over by ${SS.money(spent - b.amount)}</span>`
            : projUtil >= 100
              ? `<span class="budget-card-tag warn">Projected over by ${SS.money(projDiff)}</span>`
              : projUtil >= 90
                ? `<span class="budget-card-tag watch">On track to cut it close</span>`
                : `<span class="budget-card-tag safe">${SS.money(b.amount - projected)} buffer projected</span>`;

          return `
          <div class="budget-card status-${status}" data-id="${b.id}" tabindex="0" role="button" aria-label="Edit ${escapeHtml(b.category)} budget">
            <div class="budget-card-head">
              <span class="chip ${meta.chip}">${escapeHtml(b.category)}</span>
              <div class="budget-card-actions">
                <button class="btn-icon" data-edit-budget="${b.id}" aria-label="Edit"><i data-lucide="pencil"></i></button>
                <button class="btn-icon btn-icon-danger" data-del-budget="${b.id}" aria-label="Delete"><i data-lucide="trash-2"></i></button>
              </div>
            </div>

            <div class="budget-card-amounts">
              <div class="budget-card-spent">${SS.money(spent)}</div>
              <div class="budget-card-of">of ${SS.money(b.amount)} · ${Math.round(utilization)}%</div>
            </div>

            <div class="budget-card-progress">
              <div class="budget-card-track">
                <div class="budget-card-fill" style="width:${Math.min(100, utilization).toFixed(1)}%"></div>
                ${projMarker > utilization ? `<div class="budget-card-proj-marker" style="left:${projMarker.toFixed(1)}%" title="Projected month end"></div>` : ""}
              </div>
            </div>

            ${projTag}

            <div class="budget-card-spark">
              <canvas data-spark="${b.id}" height="40"></canvas>
            </div>
          </div>`;
        })
        .join("");

      // Draw sparklines
      rows.forEach(({ b }) => {
        const canvas = grid.querySelector(`canvas[data-spark="${b.id}"]`);
        if (!canvas || !window.Chart) return;
        const series = sixMonthSeries(tx, b.category);
        const budgetLine = Array(series.data.length).fill(Number(b.amount || 0));
        new window.Chart(canvas, {
          type: "line",
          data: {
            labels: series.labels,
            datasets: [
              {
                data: series.data,
                borderColor: "#263D32",
                backgroundColor: "rgba(38,61,50,0.12)",
                borderWidth: 1.8,
                fill: true,
                tension: 0.35,
                pointRadius: 0,
              },
              {
                data: budgetLine,
                borderColor: "rgba(18,20,23,0.35)",
                borderWidth: 1,
                borderDash: [4, 4],
                pointRadius: 0,
                fill: false,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            scales: { x: { display: false }, y: { display: false, beginAtZero: true } },
            elements: { line: { tension: 0.35 } },
          },
        });
      });
    }

    SS.refreshIcons();
  }

  let donutChart = null;
  function renderDonut(total, spent) {
    const SS = window.SS;
    const canvas = document.getElementById("budgetDonut");
    const centerPct = document.getElementById("budgetHeroPct");
    if (!canvas || !window.Chart) return;
    if (donutChart) donutChart.destroy();

    const remaining = Math.max(0, total - spent);
    const over = Math.max(0, spent - total);
    const effectiveSpent = Math.min(spent, total);

    if (!total) {
      centerPct.textContent = "—";
      canvas.style.opacity = "0.4";
      donutChart = new window.Chart(canvas, {
        type: "doughnut",
        data: { labels: ["No budget"], datasets: [{ data: [1], backgroundColor: ["#EDE8DB"], borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: "72%", plugins: { legend: { display: false }, tooltip: { enabled: false } } },
      });
      return;
    }
    canvas.style.opacity = "1";

    const pct = Math.round((spent / total) * 100);
    centerPct.textContent = `${pct}%`;

    const labels = over > 0
      ? ["Spent (within plan)", "Over budget"]
      : ["Spent", "Remaining"];
    const data = over > 0
      ? [effectiveSpent, over]
      : [effectiveSpent, remaining];
    const colors = over > 0
      ? ["#263D32", "#E8A69A"]
      : ["#263D32", "#CFEBD1"];

    donutChart = new window.Chart(canvas, {
      type: "doughnut",
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 3, borderColor: "#FFFEFA", hoverOffset: 4 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "72%",
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.label}: ${SS.money(ctx.parsed)}`,
            },
          },
        },
      },
    });
  }

  function openModal(b) {
    const SS = window.SS;
    const modal = document.getElementById("budgetModal");
    document.getElementById("budgetModalTitle").textContent = b ? "Edit sub-budget" : "Add sub-budget";
    document.getElementById("budgetId").value = b ? b.id : "";
    document.getElementById("budgetCategory").value = b ? b.category : "Food";
    document.getElementById("budgetAmount").value = b ? b.amount : "";

    // Show remaining allocation hint under the subtitle
    const sub = modal.querySelector(".modal-sub");
    if (sub && totalBudget) {
      const budgets = SS.Store.getBudgets();
      const used = budgets.reduce((s, x) => (b && x.id === b.id ? s : s + Number(x.amount || 0)), 0);
      const left = Number(totalBudget.amount) - used;
      sub.innerHTML = `Choose a category and a monthly target. <strong>${SS.money(left)}</strong> of your ${SS.money(totalBudget.amount)} total is still unallocated.`;
    }

    clearErrors();
    modal.hidden = false;
    document.getElementById("budgetCategory").focus();
  }

  function closeModal() {
    document.getElementById("budgetModal").hidden = true;
  }

  function clearErrors() {
    document.querySelectorAll("#budgetForm [data-error-for]").forEach((n) => (n.textContent = ""));
  }

  function setError(name, msg) {
    const el = document.querySelector(`#budgetForm [data-error-for="${name}"]`);
    if (el) el.textContent = msg;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const SS = window.SS;
    const id = document.getElementById("budgetId").value || "";
    const category = document.getElementById("budgetCategory").value;
    const amount = Number(document.getElementById("budgetAmount").value);

    clearErrors();
    let ok = true;
    if (!category) { setError("category", "Pick a category."); ok = false; }
    if (!isFinite(amount) || amount <= 0) { setError("amount", "Amount must be greater than zero."); ok = false; }
    if (!ok) return;

    const list = SS.Store.getBudgets();
    try {
      if (id) {
        await SS.Store.updateBudget(id, { category, amount });
        SS.toast("Budget updated.", "success");
      } else {
        const existing = list.find((x) => x.category === category);
        if (existing) {
          await SS.Store.updateBudget(existing.id, { category, amount });
          SS.toast(`Updated existing ${category} budget.`, "success");
        } else {
          await SS.Store.addBudget({ category, amount });
          SS.toast("Budget created.", "success");
        }
      }
      closeModal();
      render();
    } catch (err) {
      SS.toast(err.message || "Could not save budget.", "error");
    }
  }

  async function handleDelete(id) {
    const SS = window.SS;
    const list = SS.Store.getBudgets();
    const b = list.find((x) => x.id === id);
    if (!b) return;
    const ok = await SS.confirmDialog({
      title: "Delete this budget?",
      body: `Remove the ${b.category} limit of ${SS.money(b.amount)}? This cannot be undone.`,
      okLabel: "Delete",
    });
    if (!ok) return;
    try {
      await SS.Store.deleteBudget(id);
      SS.toast("Budget removed.", "success");
      render();
    } catch (err) {
      SS.toast(err.message || "Could not delete budget.", "error");
    }
  }

  function handleEdit(id) {
    const SS = window.SS;
    const b = SS.Store.getBudgets().find((x) => x.id === id);
    if (b) openModal(b);
  }

  ready(async () => {
    const SS = window.SS;
    await SS.Store.load();
    try {
      totalBudget = await SS.Store.getTotalBudget();
    } catch (err) {
      totalBudget = null;
    }
    populateCategorySelect();

    // Setup form (first-time): saves the total monthly budget
    document.getElementById("setupTotalForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const n = Number(document.getElementById("setupTotalAmount").value);
      if (!isFinite(n) || n <= 0) {
        SS.toast("Enter a positive amount.", "error");
        return;
      }
      saveTotalBudget(n);
    });

    // Total-edit modal wiring
    document.getElementById("totalForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const errorEl = document.getElementById("totalAmountError");
      const n = Number(document.getElementById("totalAmountInput").value);
      if (!isFinite(n) || n <= 0) {
        errorEl.textContent = "Enter a positive amount.";
        return;
      }
      errorEl.textContent = "";
      await saveTotalBudget(n);
      closeTotalModal();
    });
    document.querySelectorAll("[data-close-total]").forEach((el) =>
      el.addEventListener("click", closeTotalModal)
    );
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !document.getElementById("totalModal").hidden) closeTotalModal();
    });
    document.getElementById("totalAmountInput").addEventListener("input", updateTotalImpact);
    document.querySelectorAll(".total-quick").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.getElementById("totalAmountInput").value = btn.dataset.quick;
        updateTotalImpact();
      });
    });
    document.getElementById("totalDeleteBtn").addEventListener("click", handleDeleteTotal);

    const addSub = document.getElementById("openAddBudget");
    if (addSub) addSub.addEventListener("click", () => openModal(null));
    document.getElementById("emptyAddBudget").addEventListener("click", () => openModal(null));
    document.getElementById("budgetForm").addEventListener("submit", handleSubmit);
    document.querySelectorAll("[data-close-budget]").forEach((el) =>
      el.addEventListener("click", closeModal)
    );
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !document.getElementById("budgetModal").hidden) closeModal();
    });

    document.getElementById("budgetGrid").addEventListener("click", (e) => {
      const edit = e.target.closest("[data-edit-budget]");
      const del = e.target.closest("[data-del-budget]");
      if (del) { handleDelete(del.dataset.delBudget); return; }
      if (edit) { handleEdit(edit.dataset.editBudget); return; }
      // Click anywhere else on the card = open edit
      const card = e.target.closest(".budget-card");
      if (card && card.dataset.id) handleEdit(card.dataset.id);
    });

    render();
    window.addEventListener("spendsense:transactions-changed", render);
    window.addEventListener("spendsense:budgets-changed", render);
  });
})();
