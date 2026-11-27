/* ==========================================================
   SpendSense — shared frontend helpers (Phase 2).
   Reads/writes through the Flask + MongoDB API.
   ========================================================== */

(function () {
  "use strict";

  // ---------- Constants ----------
  const CATEGORIES = [
    { key: "Food", chip: "cat-food", icon: "utensils" },
    { key: "Transport", chip: "cat-transport", icon: "bus" },
    { key: "Shopping", chip: "cat-shopping", icon: "shopping-bag" },
    { key: "Entertainment", chip: "cat-entertainment", icon: "clapperboard" },
    { key: "Bills", chip: "cat-bills", icon: "receipt-text" },
    { key: "Education", chip: "cat-education", icon: "book-open" },
    { key: "Health", chip: "cat-health", icon: "heart-pulse" },
    { key: "Other", chip: "cat-other", icon: "circle-dot" },
  ];

  const PALETTE = {
    primary: "#121417",
    sage: "#8FA58B",
    paleSage: "#E4EBDD",
    beige: "#EDE8DB",
    yellow: "#FBECAD",
    coral: "#FBD6E3",
    mint: "#CFEBD1",
    muted: "#6E7279",
    border: "#E8E6DD",
    seq: ["#FBD6E3", "#CFE1F6", "#FBECAD", "#CFEBD1", "#E0D6F5", "#FBD5BB", "#D7EDE4", "#F3DAD4"],
  };

  // ---------- API client ----------
  const API = {
    async get(path) {
      const r = await fetch(path, { headers: { Accept: "application/json" } });
      return { ok: r.ok, status: r.status, body: await safeJson(r) };
    },
    async send(path, method, data) {
      const r = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: data ? JSON.stringify(data) : undefined,
      });
      return { ok: r.ok, status: r.status, body: await safeJson(r) };
    },
  };

  async function safeJson(r) {
    try {
      return await r.json();
    } catch {
      return null;
    }
  }

  function uid(prefix = "t") {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-3)}`;
  }

  // ---------- Store ----------
  const cache = {
    transactions: [],
    budgets: [],
    loaded: false,
    online: true,
    offlineReason: "",
  };

  async function loadAll() {
    const [t, b] = await Promise.all([
      API.get("/api/transactions"),
      API.get("/api/budgets"),
    ]);
    if (!t.ok || !b.ok) {
      cache.online = false;
      cache.offlineReason = (t.body && t.body.detail) || (b.body && b.body.detail) || "Database unavailable.";
      cache.loaded = true;
      return;
    }
    cache.online = true;
    cache.offlineReason = "";
    cache.transactions = (t.body && t.body.items) || [];
    cache.budgets = (b.body && b.body.items) || [];
    cache.loaded = true;
  }

  const Store = {
    isOnline() { return cache.online; },
    offlineReason() { return cache.offlineReason; },
    isLoaded() { return cache.loaded; },

    async load() {
      await loadAll();
      window.dispatchEvent(new CustomEvent("spendsense:data-loaded"));
    },

    getTransactions() {
      return cache.transactions;
    },

    getBudgets() {
      return cache.budgets;
    },

    async addTransaction(doc) {
      doc.id = doc.id || uid("t");
      const r = await API.send("/api/transactions", "POST", doc);
      if (!r.ok) throw new Error(formatError(r));
      await loadAll();
      window.dispatchEvent(new CustomEvent("spendsense:transactions-changed"));
      return r.body.item;
    },

    async updateTransaction(id, doc) {
      const r = await API.send(`/api/transactions/${encodeURIComponent(id)}`, "PUT", doc);
      if (!r.ok) throw new Error(formatError(r));
      await loadAll();
      window.dispatchEvent(new CustomEvent("spendsense:transactions-changed"));
      return r.body.item;
    },

    async deleteTransaction(id) {
      const r = await API.send(`/api/transactions/${encodeURIComponent(id)}`, "DELETE");
      if (!r.ok) throw new Error(formatError(r));
      await loadAll();
      window.dispatchEvent(new CustomEvent("spendsense:transactions-changed"));
    },

    async addBudget(doc) {
      doc.id = doc.id || uid("b");
      const r = await API.send("/api/budgets", "POST", doc);
      if (!r.ok) throw new Error(formatError(r));
      await loadAll();
      window.dispatchEvent(new CustomEvent("spendsense:budgets-changed"));
      return r.body.item;
    },

    async updateBudget(id, doc) {
      const r = await API.send(`/api/budgets/${encodeURIComponent(id)}`, "PUT", doc);
      if (!r.ok) throw new Error(formatError(r));
      await loadAll();
      window.dispatchEvent(new CustomEvent("spendsense:budgets-changed"));
      return r.body.item;
    },

    async deleteBudget(id) {
      const r = await API.send(`/api/budgets/${encodeURIComponent(id)}`, "DELETE");
      if (!r.ok) throw new Error(formatError(r));
      await loadAll();
      window.dispatchEvent(new CustomEvent("spendsense:budgets-changed"));
    },

    async resetSeed() {
      const r = await API.send("/api/reset", "POST");
      if (!r.ok) throw new Error(formatError(r));
      await loadAll();
      window.dispatchEvent(new CustomEvent("spendsense:transactions-changed"));
      window.dispatchEvent(new CustomEvent("spendsense:budgets-changed"));
      return r.body;
    },

    async listDatasets() {
      const r = await API.get("/api/datasets");
      if (!r.ok) throw new Error(formatError(r));
      return (r.body && r.body.items) || [];
    },

    async deleteDataset(id) {
      const r = await API.send(`/api/datasets/${encodeURIComponent(id)}`, "DELETE");
      if (!r.ok) throw new Error(formatError(r));
      await loadAll();
      window.dispatchEvent(new CustomEvent("spendsense:transactions-changed"));
      return r.body;
    },

    async listMonths() {
      const r = await API.get("/api/months");
      if (!r.ok) throw new Error(formatError(r));
      return (r.body && r.body.items) || [];
    },

    async deleteMonth(month) {
      const r = await API.send(`/api/months/${encodeURIComponent(month)}`, "DELETE");
      if (!r.ok) throw new Error(formatError(r));
      await loadAll();
      window.dispatchEvent(new CustomEvent("spendsense:transactions-changed"));
      return r.body;
    },

    async getTotalBudget() {
      const r = await API.get("/api/budgets/total");
      if (!r.ok) throw new Error(formatError(r));
      return (r.body && r.body.total) || null;
    },

    async setTotalBudget(amount) {
      const r = await API.send("/api/budgets/total", "POST", { amount });
      if (!r.ok) throw new Error(formatError(r));
      window.dispatchEvent(new CustomEvent("spendsense:budgets-changed"));
      return r.body.total;
    },

    async deleteTotalBudget() {
      const r = await API.send("/api/budgets/total", "DELETE");
      if (!r.ok) throw new Error(formatError(r));
      window.dispatchEvent(new CustomEvent("spendsense:budgets-changed"));
      return r.body;
    },
  };

  function formatError(r) {
    const body = r.body || {};
    if (r.status === 503) return "Database unavailable. Is MongoDB running?";
    return body.error || `Request failed (${r.status})`;
  }

  // ---------- Format helpers ----------
  const inr = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });

  const inrDecimal = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  });

  function money(n, decimals = false) {
    if (n === null || n === undefined || isNaN(n)) return "—";
    return decimals ? inrDecimal.format(n) : inr.format(Math.round(n));
  }

  const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
  const MONTH_FMT = new Intl.DateTimeFormat("en-GB", {
    month: "long", year: "numeric",
  });

  function fmtDate(iso) {
    const d = new Date(iso + "T00:00:00");
    return isNaN(d) ? iso : DATE_FMT.format(d);
  }
  function fmtMonth(d) { return MONTH_FMT.format(d); }

  function fmtMonthKey(key) {
    if (!key || key.length !== 7) return key || "";
    const [y, m] = key.split("-");
    const d = new Date(Number(y), Number(m) - 1, 1);
    return isNaN(d) ? key : MONTH_FMT.format(d);
  }

  function monthKey(iso) { return (iso || "").slice(0, 7); }

  function thisMonthKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function prevMonthKey() {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  // ---------- Toast ----------
  function toast(message, type = "info", ms = 2600) {
    const host = document.getElementById("toastContainer");
    if (!host) return;
    const el = document.createElement("div");
    el.className = `toast is-${type}`;
    el.textContent = message;
    host.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transition = "opacity .2s ease";
      setTimeout(() => el.remove(), 220);
    }, ms);
  }

  // ---------- Confirmation ----------
  function confirmDialog({ title, body, okLabel = "Confirm", okClass = "btn-danger" }) {
    return new Promise((resolve) => {
      const modal = document.getElementById("confirmModal");
      if (!modal) return resolve(window.confirm(body || title || "Are you sure?"));
      modal.querySelector("#confirmTitle").textContent = title || "Are you sure?";
      modal.querySelector("#confirmBody").textContent = body || "";
      const okBtn = modal.querySelector("#confirmOk");
      okBtn.textContent = okLabel;
      okBtn.className = `btn ${okClass}`;
      modal.hidden = false;

      const close = (ans) => {
        modal.hidden = true;
        okBtn.removeEventListener("click", onOk);
        modal.querySelectorAll("[data-close-confirm]").forEach((n) =>
          n.removeEventListener("click", onCancel)
        );
        document.removeEventListener("keydown", onKey);
        resolve(ans);
      };
      const onOk = () => close(true);
      const onCancel = () => close(false);
      const onKey = (e) => { if (e.key === "Escape") close(false); };
      okBtn.addEventListener("click", onOk);
      modal.querySelectorAll("[data-close-confirm]").forEach((n) =>
        n.addEventListener("click", onCancel)
      );
      document.addEventListener("keydown", onKey);
      okBtn.focus();
    });
  }

  // ---------- Mobile nav ----------
  function initMobileNav() {
    const btn = document.getElementById("mobileNavToggle");
    const sidebar = document.getElementById("sidebar");
    const scrim = document.getElementById("navScrim");
    if (!btn || !sidebar || !scrim) return;

    const open = () => {
      sidebar.classList.add("is-open");
      scrim.classList.add("is-open");
      btn.setAttribute("aria-expanded", "true");
    };
    const close = () => {
      sidebar.classList.remove("is-open");
      scrim.classList.remove("is-open");
      btn.setAttribute("aria-expanded", "false");
    };

    btn.addEventListener("click", () => {
      sidebar.classList.contains("is-open") ? close() : open();
    });
    scrim.addEventListener("click", close);
    sidebar.querySelectorAll(".nav-item").forEach((a) =>
      a.addEventListener("click", () => {
        if (window.innerWidth <= 860) close();
      })
    );
  }

  // ---------- Offline banner ----------
  function renderOfflineBanner() {
    const host = document.querySelector(".page-body");
    if (!host) return;
    let banner = document.getElementById("offlineBanner");
    if (cache.online) {
      if (banner) banner.remove();
      return;
    }
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "offlineBanner";
      banner.className = "callout is-warn";
      host.prepend(banner);
    }
    banner.innerHTML = `
      <i data-lucide="alert-triangle"></i>
      <div>
        <strong>Database unavailable.</strong>
        ${cache.offlineReason ? `<div style="font-size:12px;opacity:0.8;margin-top:4px">${cache.offlineReason}</div>` : ""}
        <div style="font-size:12px;opacity:0.8;margin-top:4px">
          Start a local MongoDB (<code>mongod</code>) or point <code>MONGODB_URI</code> at your Atlas cluster, then refresh.
        </div>
      </div>`;
    if (window.lucide) window.lucide.createIcons();
  }

  // ---------- Icons ----------
  function initIcons() {
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }
  }

  // ---------- Aggregation helpers ----------
  function totalForMonth(transactions, mKey) {
    return transactions
      .filter((t) => monthKey(t.date) === mKey)
      .reduce((s, t) => s + Number(t.amount || 0), 0);
  }

  function groupByCategory(transactions, mKey) {
    const groups = {};
    transactions
      .filter((t) => !mKey || monthKey(t.date) === mKey)
      .forEach((t) => {
        groups[t.category] = (groups[t.category] || 0) + Number(t.amount || 0);
      });
    return groups;
  }

  function lastSixMonthsSeries(transactions) {
    const labels = [];
    const data = [];
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 5);
    for (let i = 0; i < 6; i++) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      labels.push(d.toLocaleString("en-GB", { month: "short" }));
      data.push(totalForMonth(transactions, key));
      d.setMonth(d.getMonth() + 1);
    }
    return { labels, data };
  }

  function categoryMeta(key) {
    return CATEGORIES.find((c) => c.key === key) || CATEGORIES[CATEGORIES.length - 1];
  }

  // ---------- Sidebar snapshot (live this-month stats) ----------
  async function renderSidebarSnapshot() {
    const el = document.getElementById("sidebarSnapshot");
    if (!el) return;
    const amountEl = document.getElementById("snapAmount");
    const monthEl = document.getElementById("snapMonthLabel");
    const fillEl = document.getElementById("snapProgressFill");
    const metaEl = document.getElementById("snapMeta");

    if (!cache.loaded || !cache.online) {
      if (amountEl) amountEl.textContent = "—";
      if (metaEl) metaEl.textContent = cache.online ? "Loading…" : "Offline";
      return;
    }

    const thisMonth = thisMonthKey();
    const tx = cache.transactions || [];
    const spent = tx
      .filter((t) => (t.date || "").slice(0, 7) === thisMonth)
      .reduce((s, t) => s + Number(t.amount || 0), 0);

    const now = new Date();
    const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dom = now.getDate();
    const daysLeft = Math.max(0, dim - dom);

    if (monthEl) {
      monthEl.textContent = now.toLocaleString("en-GB", { month: "long" });
    }
    if (amountEl) amountEl.textContent = money(spent);

    // Try to grab the master total budget to show progress against it
    let totalBudget = null;
    try {
      const r = await API.get("/api/budgets/total");
      if (r.ok && r.body && r.body.total) totalBudget = Number(r.body.total.amount || 0);
    } catch (e) { /* ignore */ }

    if (totalBudget && totalBudget > 0) {
      const pct = Math.min(100, (spent / totalBudget) * 100);
      if (fillEl) {
        fillEl.style.width = `${pct.toFixed(1)}%`;
        fillEl.classList.toggle("over-budget", spent > totalBudget);
      }
      const remaining = totalBudget - spent;
      if (metaEl) {
        metaEl.innerHTML = remaining >= 0
          ? `${money(remaining)} left · ${daysLeft} day${daysLeft === 1 ? "" : "s"} to go`
          : `<span class="snap-over">Over by ${money(Math.abs(remaining))}</span> · ${daysLeft} day${daysLeft === 1 ? "" : "s"} to go`;
      }
    } else {
      // No total budget set — show day-of-month pace instead
      if (fillEl) fillEl.style.width = `${((dom / dim) * 100).toFixed(1)}%`;
      if (metaEl) metaEl.textContent = `Day ${dom} of ${dim} · ${daysLeft} left`;
    }
  }

  // ---------- Boot ----------
  document.addEventListener("DOMContentLoaded", () => {
    initMobileNav();
    initIcons();
    window.addEventListener("spendsense:icons-refresh", initIcons);
    window.addEventListener("spendsense:data-loaded", () => { renderOfflineBanner(); renderSidebarSnapshot(); });
    window.addEventListener("spendsense:transactions-changed", () => { renderOfflineBanner(); renderSidebarSnapshot(); });
    window.addEventListener("spendsense:budgets-changed", () => { renderOfflineBanner(); renderSidebarSnapshot(); });
    renderSidebarSnapshot();
  });

  // ---------- Expose ----------
  window.SS = {
    CATEGORIES,
    PALETTE,
    Store,
    money,
    fmtDate,
    fmtMonth,
    fmtMonthKey,
    monthKey,
    thisMonthKey,
    prevMonthKey,
    toast,
    confirmDialog,
    totalForMonth,
    groupByCategory,
    lastSixMonthsSeries,
    categoryMeta,
    uid,
    refreshIcons: () => window.dispatchEvent(new Event("spendsense:icons-refresh")),
  };
})();
