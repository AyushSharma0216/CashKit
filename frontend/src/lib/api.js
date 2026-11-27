async function safeJson(r) {
  try { return await r.json(); } catch { return null; }
}

function formatError(r) {
  const body = r.body || {};
  if (r.status === 503) return "Database unavailable. Is MongoDB running?";
  return body.error || `Request failed (${r.status})`;
}

export const api = {
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

async function must(promise) {
  const r = await promise;
  if (!r.ok) throw new Error(formatError(r));
  return r.body || {};
}

export const SpendSenseAPI = {
  listTransactions:  () => must(api.get("/api/transactions")),
  createTransaction: (doc) => must(api.send("/api/transactions", "POST", doc)),
  updateTransaction: (id, doc) => must(api.send(`/api/transactions/${encodeURIComponent(id)}`, "PUT", doc)),
  deleteTransaction: (id) => must(api.send(`/api/transactions/${encodeURIComponent(id)}`, "DELETE")),
  createSubscription:(doc) => must(api.send("/api/subscriptions", "POST", doc)),
  listBudgets:       () => must(api.get("/api/budgets")),
  createBudget:      (doc) => must(api.send("/api/budgets", "POST", doc)),
  updateBudget:      (id, doc) => must(api.send(`/api/budgets/${encodeURIComponent(id)}`, "PUT", doc)),
  deleteBudget:      (id) => must(api.send(`/api/budgets/${encodeURIComponent(id)}`, "DELETE")),
  getTotalBudget:    () => must(api.get("/api/budgets/total")),
  setTotalBudget:    (amount) => must(api.send("/api/budgets/total", "POST", { amount })),
  deleteTotalBudget: () => must(api.send("/api/budgets/total", "DELETE")),
  listDatasets:      () => must(api.get("/api/datasets")),
  deleteDataset:     (id) => must(api.send(`/api/datasets/${encodeURIComponent(id)}`, "DELETE")),
  listSubscriptions: () => must(api.get("/api/subscriptions")),
  pauseSubscription: (id, paused) => must(api.send(`/api/subscriptions/${encodeURIComponent(id)}/pause`, "POST", { paused })),
  listMonths:        () => must(api.get("/api/months")),
  deleteMonth:       (m) => must(api.send(`/api/months/${encodeURIComponent(m)}`, "DELETE")),
  predictions:       () => must(api.get("/api/predictions")),
  retrain:           () => must(api.send("/api/train", "POST")),
  categorize:        (text) => must(api.get(`/api/categorize?text=${encodeURIComponent(text)}`)),
  resetSeed:         () => must(api.send("/api/reset", "POST")),
  importCsv: async (file, datasetName) => {
    const fd = new FormData();
    fd.append("file", file);
    if (datasetName) fd.append("dataset_name", datasetName);
    const r = await fetch("/api/import", { method: "POST", body: fd });
    const body = await safeJson(r);
    if (!r.ok || !body?.ok) throw new Error(body?.error || `Import failed (${r.status})`);
    return body;
  },
};
