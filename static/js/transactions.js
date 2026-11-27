/* ==========================================================
   SpendSense — Transactions page.
   ========================================================== */

(function () {
  "use strict";

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  const state = {
    search: "",
    category: "",
    month: "",
    date: "",
    datasetId: "",
    sort: "date-desc",
  };

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));
  }

  function populateCategorySelects() {
    const SS = window.SS;
    const options = SS.CATEGORIES.map((c) => `<option value="${c.key}">${c.key}</option>`).join("");
    const filter = document.getElementById("txCategoryFilter");
    const form = document.getElementById("txCategory");
    if (filter) filter.innerHTML = `<option value="">All categories</option>${options}`;
    if (form) form.innerHTML = options;
  }

  function applyFilters(list) {
    const SS = window.SS;
    let out = [...list];
    if (state.search) {
      const q = state.search.toLowerCase();
      out = out.filter(
        (t) =>
          t.description.toLowerCase().includes(q) ||
          (t.notes || "").toLowerCase().includes(q)
      );
    }
    if (state.category) out = out.filter((t) => t.category === state.category);
    if (state.month) out = out.filter((t) => (t.date || "").slice(0, 7) === state.month);
    if (state.date) out = out.filter((t) => t.date === state.date);
    if (state.datasetId === "__manual__") {
      out = out.filter((t) => !t.import_id);
    } else if (state.datasetId) {
      out = out.filter((t) => t.import_id === state.datasetId);
    }

    switch (state.sort) {
      case "date-asc":
        out.sort((a, b) => a.date.localeCompare(b.date));
        break;
      case "amount-asc":
        out.sort((a, b) => a.amount - b.amount);
        break;
      case "amount-desc":
        out.sort((a, b) => b.amount - a.amount);
        break;
      case "date-desc":
      default:
        out.sort((a, b) => b.date.localeCompare(a.date));
    }
    return out;
  }

  function render() {
    const SS = window.SS;
    const tbody = document.getElementById("txTableBody");
    const empty = document.getElementById("txEmpty");
    const tx = SS.Store.getTransactions();
    const list = applyFilters(tx);

    if (!list.length) {
      tbody.innerHTML = "";
      empty.hidden = false;
    } else {
      empty.hidden = true;
      tbody.innerHTML = list
        .map((t) => {
          const meta = SS.categoryMeta(t.category);
          return `
          <tr data-id="${t.id}">
            <td>
              <div><strong>${escapeHtml(t.description)}</strong></div>
              ${t.notes ? `<div style="color:var(--muted);font-size:11.5px;margin-top:2px">${escapeHtml(t.notes)}</div>` : ""}
            </td>
            <td><span class="chip ${meta.chip}">${escapeHtml(t.category)}</span></td>
            <td>${escapeHtml(t.payment || "—")}</td>
            <td>${SS.fmtDate(t.date)}</td>
            <td class="amount-cell" style="text-align:right">${SS.money(t.amount)}</td>
            <td>
              <div class="row-actions">
                <button class="btn-icon" data-edit="${t.id}" aria-label="Edit"><i data-lucide="pencil"></i></button>
                <button class="btn-icon" data-del="${t.id}" aria-label="Delete"><i data-lucide="trash-2"></i></button>
              </div>
            </td>
          </tr>`;
        })
        .join("");
    }
    SS.refreshIcons();
  }

  function openModal(tx) {
    const modal = document.getElementById("txModal");
    const title = document.getElementById("txModalTitle");
    document.getElementById("txId").value = tx ? tx.id : "";
    document.getElementById("txDescription").value = tx ? tx.description : "";
    document.getElementById("txAmount").value = tx ? tx.amount : "";
    document.getElementById("txCategory").value = tx ? tx.category : "Food";
    document.getElementById("txDate").value = tx ? tx.date : new Date().toISOString().slice(0, 10);
    document.getElementById("txPayment").value = tx ? tx.payment || "UPI" : "UPI";
    document.getElementById("txNotes").value = tx ? tx.notes || "" : "";
    title.textContent = tx ? "Edit transaction" : "Add transaction";
    clearErrors();
    hideSuggestion();
    modal.hidden = false;
    document.getElementById("txDescription").focus();
  }

  // ---------- Live ML category suggestion ----------
  let catSuggestTimer = null;
  let catSuggestInflight = 0;

  function hideSuggestion() {
    const el = document.getElementById("catSuggest");
    if (el) el.hidden = true;
  }

  function fetchCategorySuggestion() {
    const descEl = document.getElementById("txDescription");
    const notesEl = document.getElementById("txNotes");
    const paymentEl = document.getElementById("txPayment");
    const text = [descEl.value, notesEl.value, paymentEl.value].filter(Boolean).join(" ").trim();
    if (text.length < 3) {
      hideSuggestion();
      return;
    }
    const myRun = ++catSuggestInflight;
    fetch(`/api/categorize?text=${encodeURIComponent(text)}`)
      .then((r) => r.json())
      .then((body) => {
        if (myRun !== catSuggestInflight) return; // superseded
        if (!body || !body.ok || !body.available) {
          hideSuggestion();
          return;
        }
        const current = document.getElementById("txCategory").value;
        const el = document.getElementById("catSuggest");
        const txt = document.getElementById("catSuggestText");
        if (body.category === current) {
          hideSuggestion();
          return;
        }
        const confidencePct = Math.round((body.confidence || 0) * 100);
        txt.textContent = `Suggested: ${body.category} (${confidencePct}%) — click to apply`;
        el.dataset.suggest = body.category;
        el.hidden = false;
      })
      .catch(() => hideSuggestion());
  }

  function debouncedSuggest() {
    clearTimeout(catSuggestTimer);
    catSuggestTimer = setTimeout(fetchCategorySuggestion, 350);
  }

  function closeModal() {
    document.getElementById("txModal").hidden = true;
  }

  function clearErrors() {
    document.querySelectorAll("#txForm [data-error-for]").forEach((n) => (n.textContent = ""));
  }

  function setError(name, msg) {
    const el = document.querySelector(`#txForm [data-error-for="${name}"]`);
    if (el) el.textContent = msg;
  }

  function validate(values) {
    clearErrors();
    let ok = true;
    if (!values.description || values.description.trim().length < 2) {
      setError("description", "Please enter a description.");
      ok = false;
    }
    const amt = Number(values.amount);
    if (!isFinite(amt) || amt <= 0) {
      setError("amount", "Amount must be greater than zero.");
      ok = false;
    }
    if (!values.category) {
      setError("category", "Pick a category.");
      ok = false;
    }
    if (!values.date) {
      setError("date", "Pick a date.");
      ok = false;
    }
    return ok;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const SS = window.SS;
    const values = {
      id: document.getElementById("txId").value || "",
      description: document.getElementById("txDescription").value.trim(),
      amount: Number(document.getElementById("txAmount").value),
      category: document.getElementById("txCategory").value,
      date: document.getElementById("txDate").value,
      payment: document.getElementById("txPayment").value,
      notes: document.getElementById("txNotes").value.trim(),
    };
    if (!validate(values)) return;

    try {
      if (values.id) {
        await SS.Store.updateTransaction(values.id, values);
        SS.toast("Transaction updated.", "success");
      } else {
        await SS.Store.addTransaction(values);
        SS.toast("Transaction added.", "success");
      }
      closeModal();
      render();
    } catch (err) {
      SS.toast(err.message || "Could not save transaction.", "error");
    }
  }

  async function handleDelete(id) {
    const SS = window.SS;
    const list = SS.Store.getTransactions();
    const t = list.find((x) => x.id === id);
    if (!t) return;
    const ok = await SS.confirmDialog({
      title: "Delete this transaction?",
      body: `${t.description} — ${SS.money(t.amount)} on ${SS.fmtDate(t.date)}. This cannot be undone.`,
      okLabel: "Delete",
    });
    if (!ok) return;
    try {
      await SS.Store.deleteTransaction(id);
      SS.toast("Transaction deleted.", "success");
      render();
    } catch (err) {
      SS.toast(err.message || "Could not delete transaction.", "error");
    }
  }

  function handleEdit(id) {
    const SS = window.SS;
    const t = SS.Store.getTransactions().find((x) => x.id === id);
    if (t) openModal(t);
  }

  ready(async () => {
    const SS = window.SS;
    await SS.Store.load();
    populateCategorySelects();

    document.getElementById("txSearch").addEventListener("input", (e) => {
      state.search = e.target.value;
      render();
    });
    document.getElementById("txCategoryFilter").addEventListener("change", (e) => {
      state.category = e.target.value;
      render();
    });
    document.getElementById("txMonthFilter").addEventListener("change", (e) => {
      state.month = e.target.value;
      updateInlineDeleteButtons();
      render();
    });
    document.getElementById("txDatasetFilter").addEventListener("change", (e) => {
      state.datasetId = e.target.value;
      updateInlineDeleteButtons();
      render();
    });

    document.getElementById("deleteSelectedMonth").addEventListener("click", () => {
      if (state.month) handleMonthDelete(state.month);
    });
    document.getElementById("deleteSelectedDataset").addEventListener("click", () => {
      if (!state.datasetId || state.datasetId === "__manual__") return;
      const SS = window.SS;
      // Resolve the name for the confirm dialog
      SS.Store.listDatasets().then((datasets) => {
        const ds = datasets.find((d) => d.id === state.datasetId);
        handleDatasetDelete(state.datasetId, ds ? ds.name : state.datasetId);
      }).catch(() => handleDatasetDelete(state.datasetId, state.datasetId));
    });
    document.getElementById("txDateFilter").addEventListener("change", (e) => {
      state.date = e.target.value;
      render();
    });
    document.getElementById("txSort").addEventListener("change", (e) => {
      state.sort = e.target.value;
      render();
    });

    document.getElementById("openAddTx").addEventListener("click", () => openModal(null));
    document.getElementById("emptyAddTx").addEventListener("click", () => openModal(null));
    document.getElementById("txForm").addEventListener("submit", handleSubmit);

    document.querySelectorAll("[data-close-tx]").forEach((el) =>
      el.addEventListener("click", closeModal)
    );
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !document.getElementById("txModal").hidden) closeModal();
    });

    document.getElementById("txTableBody").addEventListener("click", (e) => {
      const edit = e.target.closest("[data-edit]");
      const del = e.target.closest("[data-del]");
      if (edit) handleEdit(edit.dataset.edit);
      if (del) handleDelete(del.dataset.del);
    });

// Deep-link: ?add=1 opens the modal (used from Overview CTA)
    if (new URLSearchParams(location.search).get("add") === "1") {
      openModal(null);
    }

    initCsvImport();
    initSubscriptionModal();
    render();
    renderSidePanels();
    window.addEventListener("spendsense:transactions-changed", () => {
      render();
      renderSidePanels();
    });
  });

  function updateInlineDeleteButtons() {
    const monthBtn = document.getElementById("deleteSelectedMonth");
    const dsBtn = document.getElementById("deleteSelectedDataset");
    if (monthBtn) monthBtn.hidden = !state.month;
    // Dataset delete only makes sense for a real import; "Manually added" isn't deletable as a batch.
    if (dsBtn) dsBtn.hidden = !state.datasetId || state.datasetId === "__manual__";
  }

  // ---------- Month + Dataset filter populators ----------
  function populateMonthFilter(months) {
    const SS = window.SS;
    const select = document.getElementById("txMonthFilter");
    if (!select) return;
    const current = state.month;
    const options = months
      .map((m) => `<option value="${m.month}">${escapeHtml(SS.fmtMonthKey(m.month))} (${m.count})</option>`)
      .join("");
    select.innerHTML = `<option value="">All months</option>${options}`;
    if (current && months.some((m) => m.month === current)) select.value = current;
  }

  function populateDatasetFilter(datasets) {
    const select = document.getElementById("txDatasetFilter");
    if (!select) return;
    const current = state.datasetId;
    const options = datasets
      .map((d) => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)} (${d.count})</option>`)
      .join("");
    select.innerHTML =
      `<option value="">All sources</option>` +
      `<option value="__manual__">Manually added</option>` +
      options;
    if (
      current &&
      (current === "__manual__" || datasets.some((d) => d.id === current))
    ) {
      select.value = current;
    }
  }

  async function renderSidePanels() {
    const SS = window.SS;
    try {
      const [datasets, months] = await Promise.all([
        SS.Store.listDatasets(),
        SS.Store.listMonths(),
      ]);
      populateDatasetFilter(datasets);
      populateMonthFilter(months);
      updateInlineDeleteButtons();
    } catch (err) {
      // leave the panels in whatever state they are — toast is noisy for a side-panel.
    }
  }

  async function handleDatasetDelete(id, name) {
    const SS = window.SS;
    const ok = await SS.confirmDialog({
      title: "Delete this dataset?",
      body: `“${name}” and every transaction imported with it will be permanently removed. This cannot be undone.`,
      okLabel: "Delete dataset",
    });
    if (!ok) return;
    try {
      const r = await SS.Store.deleteDataset(id);
      if (state.datasetId === id) {
        state.datasetId = "";
        document.getElementById("txDatasetFilter").value = "";
      }
      SS.toast(`Removed ${r.removed_transactions} transaction${r.removed_transactions === 1 ? "" : "s"}.`, "success");
      render();
      renderSidePanels();
    } catch (err) {
      SS.toast(err.message || "Could not delete dataset.", "error");
    }
  }

  async function handleMonthDelete(month) {
    const SS = window.SS;
    const ok = await SS.confirmDialog({
      title: `Delete all transactions in ${SS.fmtMonthKey(month)}?`,
      body: `Every record dated inside ${SS.fmtMonthKey(month)} will be permanently removed — across all datasets. This cannot be undone.`,
      okLabel: "Delete month",
    });
    if (!ok) return;
    try {
      const r = await SS.Store.deleteMonth(month);
      if (state.month === month) {
        state.month = "";
        document.getElementById("txMonthFilter").value = "";
      }
      SS.toast(`Removed ${r.removed_transactions} transaction${r.removed_transactions === 1 ? "" : "s"}.`, "success");
      render();
      renderSidePanels();
    } catch (err) {
      SS.toast(err.message || "Could not delete month.", "error");
    }
  }

  // ---------- Recurring subscription modal ----------
  function initSubscriptionModal() {
    const SS = window.SS;
    const modal = document.getElementById("subModal");
    const openBtn = document.getElementById("openAddSub");
    const form = document.getElementById("subForm");
    if (!modal || !openBtn || !form) return;

    // Populate category select from the shared catalog
    const catSel = document.getElementById("subCategory");
    catSel.innerHTML = SS.CATEGORIES.map((c) => `<option value="${c.key}">${c.key}</option>`).join("");
    catSel.value = "Entertainment"; // most common subscription category

    openBtn.addEventListener("click", openSubModal);
    modal.querySelectorAll("[data-close-sub]").forEach((el) =>
      el.addEventListener("click", closeSubModal)
    );
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !modal.hidden) closeSubModal();
    });

    ["subFirstDate", "subAmount"].forEach((id) => {
      document.getElementById(id).addEventListener("input", updatePreview);
    });

    form.addEventListener("submit", submitSubscription);
  }

  function openSubModal() {
    const modal = document.getElementById("subModal");
    document.getElementById("subDescription").value = "";
    document.getElementById("subAmount").value = "";
    document.getElementById("subCategory").value = "Entertainment";
    document.getElementById("subPayment").value = "Credit card";
    document.getElementById("subNotes").value = "";
    const today = new Date();
    // Default to 3 months ago, same day
    const def = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate());
    document.getElementById("subFirstDate").value = def.toISOString().slice(0, 10);
    updatePreview();
    document.querySelectorAll("#subForm .error-text").forEach((n) => (n.textContent = ""));
    modal.hidden = false;
    document.getElementById("subDescription").focus();
  }

  function closeSubModal() {
    document.getElementById("subModal").hidden = true;
  }

  function monthsBetween(startDateStr, endDate) {
    const start = new Date(startDateStr + "T00:00:00");
    if (isNaN(start)) return 0;
    if (start > endDate) return 0;
    let count = 1;
    let cur = new Date(start);
    while (true) {
      const next = new Date(cur.getFullYear(), cur.getMonth() + 1, Math.min(start.getDate(), 28));
      // Clamp to actual last day of next month
      const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      next.setDate(Math.min(start.getDate(), lastDay));
      if (next > endDate) break;
      count++;
      cur = next;
    }
    return count;
  }

  function updatePreview() {
    const SS = window.SS;
    const dateVal = document.getElementById("subFirstDate").value;
    const amtVal = Number(document.getElementById("subAmount").value);
    const preview = document.getElementById("subPreview");
    if (!dateVal || !isFinite(amtVal) || amtVal <= 0) {
      preview.textContent = "pick a first charge date and amount to see how many months will be created.";
      return;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const months = monthsBetween(dateVal, today);
    const total = months * amtVal;
    preview.innerHTML =
      `<strong>${months} transaction${months === 1 ? "" : "s"}</strong> will be created ` +
      `(${SS.money(amtVal)} × ${months} = <strong>${SS.money(total)}</strong> total spend tagged as Recurring).`;
  }

  async function submitSubscription(e) {
    e.preventDefault();
    const SS = window.SS;
    const desc = document.getElementById("subDescription").value.trim();
    const amt = Number(document.getElementById("subAmount").value);
    const cat = document.getElementById("subCategory").value;
    const first = document.getElementById("subFirstDate").value;
    const payment = document.getElementById("subPayment").value;
    const notes = document.getElementById("subNotes").value.trim() || "Recurring";

    document.querySelectorAll("#subForm .error-text").forEach((n) => (n.textContent = ""));
    const setErr = (name, msg) => {
      const el = document.querySelector(`#subForm [data-error-for="${name}"]`);
      if (el) el.textContent = msg;
    };
    let ok = true;
    if (!desc || desc.length < 2) { setErr("sub-description", "Give it a name."); ok = false; }
    if (!isFinite(amt) || amt <= 0) { setErr("sub-amount", "Amount must be greater than zero."); ok = false; }
    if (!first) { setErr("sub-first-date", "Pick a first charge date."); ok = false; }
    if (!ok) return;

    const btn = e.submitter;
    if (btn) { btn.disabled = true; btn.textContent = "Creating…"; }

    try {
      const r = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: desc, amount: amt, category: cat,
          first_date: first, payment, notes,
        }),
      });
      const body = await r.json();
      if (!r.ok || !body.ok) throw new Error(body.error || `Request failed (${r.status})`);
      await SS.Store.load();
      renderSidePanels();
      render();
      closeSubModal();
      SS.toast(`${body.created} monthly charge${body.created === 1 ? "" : "s"} created for “${desc}”.`, "success");
    } catch (err) {
      SS.toast(err.message || "Could not create subscription.", "error");
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Create subscription"; }
    }
  }

  // ---------- CSV import ----------
  const csv = { file: null, text: "" };

  function initCsvImport() {
    const openBtn = document.getElementById("openImportCsv");
    const modal = document.getElementById("csvModal");
    const drop = document.getElementById("csvDrop");
    const fileInput = document.getElementById("csvFile");
    const importBtn = document.getElementById("csvImportBtn");

    if (!openBtn || !modal || !drop || !fileInput || !importBtn) return;

    openBtn.addEventListener("click", openCsvModal);
    modal.querySelectorAll("[data-close-csv]").forEach((el) =>
      el.addEventListener("click", closeCsvModal)
    );
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !modal.hidden) closeCsvModal();
    });

    drop.addEventListener("click", () => fileInput.click());
    drop.addEventListener("dragover", (e) => {
      e.preventDefault();
      drop.classList.add("is-drag");
    });
    drop.addEventListener("dragleave", () => drop.classList.remove("is-drag"));
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      drop.classList.remove("is-drag");
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handleCsvFile(f);
    });
    fileInput.addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) handleCsvFile(f);
    });

    importBtn.addEventListener("click", submitImport);
  }

  function openCsvModal() {
    resetCsvState();
    document.getElementById("csvModal").hidden = false;
  }

  function closeCsvModal() {
    document.getElementById("csvModal").hidden = true;
    resetCsvState();
  }

  function resetCsvState() {
    csv.file = null;
    csv.text = "";
    document.getElementById("csvFile").value = "";
    document.getElementById("csvFileName").textContent = "Drop a CSV here, or click to choose";
    document.getElementById("csvFileMeta").textContent = "UTF-8, up to a few thousand rows.";
    document.getElementById("csvImportBtn").disabled = true;
    document.getElementById("csvPreview").hidden = true;
    document.getElementById("csvErrorList").hidden = true;
    document.getElementById("csvPreviewHead").innerHTML = "";
    document.getElementById("csvPreviewBody").innerHTML = "";
    const nameInput = document.getElementById("csvDatasetName");
    if (nameInput) nameInput.value = "";
  }

  function handleCsvFile(file) {
    if (!/\.csv$|text\/csv/i.test(file.name + file.type)) {
      window.SS.toast("Please choose a .csv file.", "error");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      window.SS.toast("File is too large — keep it under 4 MB.", "error");
      return;
    }
    csv.file = file;
    document.getElementById("csvFileName").textContent = file.name;
    document.getElementById("csvFileMeta").textContent = `${(file.size / 1024).toFixed(1)} KB`;
    const reader = new FileReader();
    reader.onload = (e) => {
      csv.text = String(e.target.result || "");
      renderCsvPreview(csv.text);
      document.getElementById("csvImportBtn").disabled = false;
    };
    reader.onerror = () => window.SS.toast("Could not read the file.", "error");
    reader.readAsText(file, "utf-8");
  }

  function renderCsvPreview(text) {
    const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim().length);
    if (!lines.length) return;
    const parse = (line) => parseCsvLine(line);
    const headers = parse(lines[0]);
    const rows = lines.slice(1, 6).map(parse);
    document.getElementById("csvPreviewHead").innerHTML = headers
      .map((h) => `<th>${escapeHtml(h)}</th>`)
      .join("");
    document.getElementById("csvPreviewBody").innerHTML = rows.length
      ? rows
          .map(
            (r) =>
              `<tr>${headers
                .map((_, i) => `<td>${escapeHtml(r[i] ?? "")}</td>`)
                .join("")}</tr>`
          )
          .join("")
      : `<tr><td colspan="${headers.length}" style="color:var(--muted)">No data rows</td></tr>`;
    document.getElementById("csvPreview").hidden = false;
  }

  // Minimal CSV line parser for preview (handles quoted commas).
  function parseCsvLine(line) {
    const out = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') { inQ = false; }
        else cur += c;
      } else {
        if (c === ",") { out.push(cur); cur = ""; }
        else if (c === '"') inQ = true;
        else cur += c;
      }
    }
    out.push(cur);
    return out;
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  async function submitImport() {
    const SS = window.SS;
    if (!csv.file) return;
    const btn = document.getElementById("csvImportBtn");
    btn.disabled = true;
    btn.textContent = "Importing…";
    try {
      const fd = new FormData();
      fd.append("file", csv.file);
      const nameInput = document.getElementById("csvDatasetName");
      const dsName = (nameInput && nameInput.value || "").trim();
      if (dsName) fd.append("dataset_name", dsName);
      const r = await fetch("/api/import", { method: "POST", body: fd });
      const body = await r.json();
      if (!r.ok || !body.ok) {
        throw new Error(body.error || `Import failed (${r.status})`);
      }
      renderCsvReport(body);
      if (body.inserted) {
        await SS.Store.load();
        render();
        renderSidePanels();
        SS.toast(`Imported ${body.inserted} transaction${body.inserted === 1 ? "" : "s"} into “${body.dataset_name}”.`, "success");
      } else {
        SS.toast("No rows imported.", "info");
      }
    } catch (err) {
      SS.toast(err.message || "Import failed.", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Import";
    }
  }

  function renderCsvReport(report) {
    const host = document.getElementById("csvErrorList");
    const parts = [];
    parts.push(
      `<div><span class="csv-report-ok">${report.inserted} imported</span>` +
      (report.skipped ? ` · <span class="csv-report-skip">${report.skipped} skipped</span>` : "") +
      ` · of ${report.total_rows} data rows</div>`
    );
    if (report.errors && report.errors.length) {
      parts.push(
        `<ul>${report.errors
          .map(
            (e) =>
              `<li>Row ${e.row}: ${escapeHtml(e.reason)}</li>`
          )
          .join("")}</ul>`
      );
    }
    host.innerHTML = parts.join("");
    host.hidden = false;
  }
})();
