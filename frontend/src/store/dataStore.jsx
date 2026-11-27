import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { SpendSenseAPI } from "../lib/api.js";
import { uid } from "../lib/constants.js";

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const [transactions, setTransactions] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [totalBudget, setTotalBudget] = useState(null);
  const [online, setOnline] = useState(true);
  const [offlineReason, setOfflineReason] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [toasts, setToasts] = useState([]);

  const loadAll = useCallback(async () => {
    try {
      const [t, b, total] = await Promise.all([
        SpendSenseAPI.listTransactions(),
        SpendSenseAPI.listBudgets(),
        SpendSenseAPI.getTotalBudget().catch(() => ({ total: null })),
      ]);
      setTransactions(t.items || []);
      setBudgets(b.items || []);
      setTotalBudget(total?.total || null);
      setOnline(true);
      setOfflineReason("");
    } catch (err) {
      setOnline(false);
      setOfflineReason(err.message || "Database unavailable.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  function toast(message, type = "info", ms = 2600) {
    const id = uid("toast");
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), ms);
  }

  const actions = {
    reload: loadAll,
    toast,
    async addTransaction(doc) {
      doc.id = doc.id || uid("t");
      const res = await SpendSenseAPI.createTransaction(doc);
      await loadAll();
      return res.item;
    },
    async updateTransaction(id, doc) {
      const res = await SpendSenseAPI.updateTransaction(id, doc);
      await loadAll();
      return res.item;
    },
    async deleteTransaction(id) {
      await SpendSenseAPI.deleteTransaction(id);
      await loadAll();
    },
    async addBudget(doc) {
      doc.id = doc.id || uid("b");
      const res = await SpendSenseAPI.createBudget(doc);
      await loadAll();
      return res.item;
    },
    async updateBudget(id, doc) {
      const res = await SpendSenseAPI.updateBudget(id, doc);
      await loadAll();
      return res.item;
    },
    async deleteBudget(id) {
      await SpendSenseAPI.deleteBudget(id);
      await loadAll();
    },
    async setTotalBudgetAmount(amount) {
      const res = await SpendSenseAPI.setTotalBudget(amount);
      setTotalBudget(res.total || null);
      await loadAll();
      return res.total;
    },
    async deleteTotalBudget() {
      await SpendSenseAPI.deleteTotalBudget();
      setTotalBudget(null);
      await loadAll();
    },
  };

  const value = {
    transactions, budgets, totalBudget,
    online, offlineReason, loaded,
    toasts, dismissToast: (id) => setToasts((p) => p.filter((t) => t.id !== id)),
    ...actions,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used inside <DataProvider>");
  return ctx;
}
