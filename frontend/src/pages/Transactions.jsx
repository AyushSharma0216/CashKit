import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Upload, Repeat, Plus, Pencil, Trash2, FileUp, Download, Inbox, Search,
  ArrowDown, ArrowUp, ArrowUpDown, SlidersHorizontal,
  Wallet, TrendingUp, TrendingDown, RefreshCw, CalendarDays, ChevronLeft, ChevronRight,
  UtensilsCrossed, Bus, ShoppingBag, Clapperboard, ReceiptText, BookOpen, HeartPulse, CircleDot, Coins,
} from "lucide-react";
import { useData } from "../store/dataStore.jsx";
import { useConfirm } from "../components/ConfirmModal.jsx";
import { SpendSenseAPI } from "../lib/api.js";
import { money, fmtDate, fmtMonthKey, thisMonthKey, prevMonthKey, totalForMonth } from "../lib/format.js";
import { CATEGORIES, categoryMeta } from "../lib/constants.js";

const PAYMENTS = ["UPI", "Debit card", "Credit card", "Cash", "Net banking", "Wallet"];
const PAGE_SIZE = 10;

/* Income detection — any transaction whose description or notes mentions
   salary/allowance/income/refund/credit/reimburse/freelance/dividend/interest
   is treated as Income. All other rows are Expense. Amounts in the DB are
   always positive — we only flip the display sign + color. */
const INCOME_RE = /\b(salary|allowance|income|refund|credit|reimburse|freelance|dividend|interest|bonus|cashback|stipend)\b/i;
function isIncome(t) {
  return INCOME_RE.test(t.description || "") || INCOME_RE.test(t.notes || "");
}
/* A transaction is recurring if it was inserted by the subscription flow
   (import_id prefix "sub_") or explicitly tagged with "recurring" in notes. */
function isRecurring(t) {
  if (t.import_id && String(t.import_id).startsWith("sub_")) return true;
  if (t.notes && /\brecurr/i.test(t.notes)) return true;
  return false;
}

/* lucide icon per category */
const CAT_ICON = {
  Food: UtensilsCrossed, Transport: Bus, Shopping: ShoppingBag, Entertainment: Clapperboard,
  Bills: ReceiptText, Education: BookOpen, Health: HeartPulse, Other: CircleDot,
};

export default function Transactions() {
  const { transactions, toast, addTransaction, updateTransaction, deleteTransaction, reload } = useData();
  const confirm = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();

  const [filter, setFilter] = useState({
    search: "", category: "", month: "", date: "", datasetId: "",
    type: "all", // all | expense | income | recurring
  });
  const [sort, setSort] = useState({ key: "date", dir: "desc" });
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  const [months, setMonths] = useState([]);
  const [datasets, setDatasets] = useState([]);

  const [txModal, setTxModal] = useState(null);
  const [csvModal, setCsvModal] = useState(false);
  const [subModal, setSubModal] = useState(false);

  const loadSide = async () => {
    try {
      const [ds, mo] = await Promise.all([SpendSenseAPI.listDatasets(), SpendSenseAPI.listMonths()]);
      setDatasets(ds.items || []); setMonths(mo.items || []);
    } catch { /* ignore */ }
  };
  useEffect(() => { loadSide(); }, [transactions]);

  useEffect(() => {
    if (searchParams.get("add") === "1") {
      setTxModal({});
      const p = new URLSearchParams(searchParams);
      p.delete("add");
      setSearchParams(p, { replace: true });
    }
    if (searchParams.get("addSub") === "1") {
      setSubModal(true);
      const p = new URLSearchParams(searchParams);
      p.delete("addSub");
      setSearchParams(p, { replace: true });
    }
    const initialSearch = searchParams.get("search");
    if (initialSearch) {
      setFilter((f) => ({ ...f, search: initialSearch }));
      const p = new URLSearchParams(searchParams);
      p.delete("search");
      setSearchParams(p, { replace: true });
    }
  }, []); // eslint-disable-line

  /* ---------- KPI math ---------- */
  const thisMonth = thisMonthKey();
  const prev = prevMonthKey();
  const txThisMonth = transactions.filter((t) => (t.date || "").slice(0, 7) === thisMonth);

  const expensesThisMonth = txThisMonth.filter((t) => !isIncome(t));
  const incomeThisMonth = txThisMonth.filter(isIncome);
  const totalExpenses = expensesThisMonth.reduce((s, t) => s + Number(t.amount || 0), 0);
  const totalIncome = incomeThisMonth.reduce((s, t) => s + Number(t.amount || 0), 0);
  const prevExpenses = transactions
    .filter((t) => (t.date || "").slice(0, 7) === prev && !isIncome(t))
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const prevIncome = transactions
    .filter((t) => (t.date || "").slice(0, 7) === prev && isIncome(t))
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const expenseDelta = prevExpenses ? ((totalExpenses - prevExpenses) / prevExpenses) * 100 : null;
  const incomeDelta = prevIncome ? ((totalIncome - prevIncome) / prevIncome) * 100 : null;
  const netBalance = totalIncome - totalExpenses;

  const now = new Date();
  const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dom = now.getDate();
  const monthProgress = Math.min(100, (dom / dim) * 100);

  /* ---------- filter + sort ---------- */
  const list = useMemo(() => {
    let out = [...transactions];
    if (filter.type === "expense")   out = out.filter((t) => !isIncome(t) && !isRecurring(t));
    if (filter.type === "income")    out = out.filter((t) => isIncome(t));
    if (filter.type === "recurring") out = out.filter(isRecurring);
    if (filter.search) {
      const q = filter.search.toLowerCase();
      out = out.filter((t) =>
        t.description.toLowerCase().includes(q) || (t.notes || "").toLowerCase().includes(q)
      );
    }
    if (filter.category) out = out.filter((t) => t.category === filter.category);
    if (filter.month)    out = out.filter((t) => (t.date || "").slice(0, 7) === filter.month);
    if (filter.date)     out = out.filter((t) => t.date === filter.date);
    if (filter.datasetId === "__manual__") out = out.filter((t) => !t.import_id);
    else if (filter.datasetId) out = out.filter((t) => t.import_id === filter.datasetId);

    const dir = sort.dir === "asc" ? 1 : -1;
    if (sort.key === "date") out.sort((a, b) => (a.date.localeCompare(b.date)) * dir);
    else if (sort.key === "amount") out.sort((a, b) => (a.amount - b.amount) * dir);
    return out;
  }, [transactions, filter, sort]);

  /* reset page when filters change */
  useEffect(() => { setPage(1); }, [filter, sort]);
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const paged = list.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  /* ---------- actions ---------- */
  async function handleDelete(tx) {
    const ok = await confirm({
      title: "Delete this transaction?",
      body: `${tx.description} — ${money(tx.amount)} on ${fmtDate(tx.date)}. This cannot be undone.`,
      okLabel: "Delete",
    });
    if (!ok) return;
    try { await deleteTransaction(tx.id); toast("Transaction deleted.", "success"); }
    catch (e) { toast(e.message || "Could not delete.", "error"); }
  }

  function toggleSort(key) {
    setSort((s) => ({
      key,
      dir: s.key === key ? (s.dir === "asc" ? "desc" : "asc") : "desc",
    }));
  }

  function SortIcon({ col }) {
    if (sort.key !== col) return <ArrowUpDown size={12} className="tx2-sort-ic" />;
    return sort.dir === "asc"
      ? <ArrowUp size={12} className="tx2-sort-ic is-active" />
      : <ArrowDown size={12} className="tx2-sort-ic is-active" />;
  }

  return (
    <>
      {/* HERO */}
      <section className="hello">
        <div>
          <h2>Transactions</h2>
          <p>Record, view, and manage all your income and expenses.</p>
        </div>
      </section>

      {/* KPI TILES */}
      <section className="tx2-kpis">
        <article className="tx2-kpi tx2-kpi-pink">
          <div className="tx2-kpi-ic"><TrendingDown size={20} /></div>
          <div className="tx2-kpi-body">
            <span className="tx2-kpi-label">Total Expenses</span>
            <div className="tx2-kpi-val">{money(totalExpenses)}</div>
            <div className="tx2-kpi-foot">
              <span>{expensesThisMonth.length} transactions</span>
              {expenseDelta != null && (
                <span className={`tx2-delta ${expenseDelta >= 0 ? "is-up" : "is-down"}`}>
                  {expenseDelta >= 0 ? <TrendingUp size={10}/> : <TrendingDown size={10}/>}
                  {expenseDelta >= 0 ? "+" : ""}{expenseDelta.toFixed(0)}%
                </span>
              )}
            </div>
          </div>
        </article>

        <article className="tx2-kpi tx2-kpi-mint">
          <div className="tx2-kpi-ic"><TrendingUp size={20} /></div>
          <div className="tx2-kpi-body">
            <span className="tx2-kpi-label">Total Income</span>
            <div className="tx2-kpi-val">{money(totalIncome)}</div>
            <div className="tx2-kpi-foot">
              <span>{incomeThisMonth.length} transactions</span>
              {incomeDelta != null && (
                <span className={`tx2-delta ${incomeDelta >= 0 ? "is-up" : "is-down"}`}>
                  {incomeDelta >= 0 ? <TrendingUp size={10}/> : <TrendingDown size={10}/>}
                  {incomeDelta >= 0 ? "+" : ""}{incomeDelta.toFixed(0)}%
                </span>
              )}
            </div>
          </div>
        </article>

        <article className="tx2-kpi tx2-kpi-blue">
          <div className="tx2-kpi-ic"><Wallet size={20} /></div>
          <div className="tx2-kpi-body">
            <span className="tx2-kpi-label">Net Balance</span>
            <div className={`tx2-kpi-val ${netBalance < 0 ? "is-neg" : ""}`}>{money(netBalance)}</div>
            <div className="tx2-kpi-foot"><span>Income − Expenses</span></div>
          </div>
        </article>

        <article className="tx2-kpi tx2-kpi-yellow">
          <div className="tx2-kpi-ic"><CalendarDays size={20} /></div>
          <div className="tx2-kpi-body">
            <span className="tx2-kpi-label">This Month</span>
            <div className="tx2-kpi-val tx2-kpi-val-sm">{fmtMonthKey(thisMonth)}</div>
            <div className="tx2-kpi-foot tx2-kpi-foot-col">
              <span>Day {dom} of {dim}</span>
              <div className="tx2-kpi-bar"><span style={{ width: `${monthProgress}%` }} /></div>
            </div>
          </div>
        </article>
      </section>

      {/* TOOLBAR ROW */}
      <section className="tx2-toolbar">
        <div className="tx2-pills" role="tablist">
          {[
            { key: "all", label: "All", Icon: null },
            { key: "expense", label: "Expenses", Icon: TrendingDown, tone: "pink" },
            { key: "income", label: "Income", Icon: TrendingUp, tone: "mint" },
            { key: "recurring", label: "Recurring", Icon: RefreshCw, tone: "yellow" },
          ].map(({ key, label, Icon, tone }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter.type === key}
              className={`tx2-pill ${filter.type === key ? "is-active" : ""} ${tone ? `tx2-pill-${tone}` : ""}`}
              onClick={() => setFilter((f) => ({ ...f, type: key }))}
            >
              {Icon && <Icon size={14} />}
              {label}
            </button>
          ))}
        </div>

        <label className="tx2-search">
          <Search size={16} />
          <input type="search"
            placeholder="Search transactions..."
            value={filter.search}
            onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
          />
        </label>

        <div className="tx2-actions">
          <button className={`tx2-btn tx2-btn-ghost ${showFilters ? "is-active" : ""}`}
                  onClick={() => setShowFilters((v) => !v)}>
            <SlidersHorizontal size={14} /> Filters
          </button>
          <button className="tx2-btn tx2-btn-ghost" onClick={() => setCsvModal(true)}>
            <Upload size={14} /> Import
          </button>
          <button className="tx2-btn tx2-btn-ghost" onClick={() => setSubModal(true)}>
            <Repeat size={14} /> Subscription
          </button>
          <button className="tx2-btn tx2-btn-dark" onClick={() => setTxModal({})}>
            <Plus size={14} /> Add Transaction
          </button>
        </div>
      </section>

      {/* ADVANCED FILTERS (collapsible) */}
      {showFilters && (
        <section className="tx2-filters-panel">
          <div className="tx2-filter">
            <label>Category</label>
            <select value={filter.category} onChange={(e) => setFilter((f) => ({ ...f, category: e.target.value }))}>
              <option value="">All</option>
              {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.key}</option>)}
            </select>
          </div>
          <div className="tx2-filter">
            <label>Month</label>
            <select value={filter.month} onChange={(e) => setFilter((f) => ({ ...f, month: e.target.value }))}>
              <option value="">All months</option>
              {months.map((m) => <option key={m.month} value={m.month}>{fmtMonthKey(m.month)} ({m.count})</option>)}
            </select>
          </div>
          <div className="tx2-filter">
            <label>Source</label>
            <select value={filter.datasetId} onChange={(e) => setFilter((f) => ({ ...f, datasetId: e.target.value }))}>
              <option value="">All sources</option>
              <option value="__manual__">Manually added</option>
              {datasets.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.count})</option>)}
            </select>
          </div>
          <div className="tx2-filter">
            <label>Exact date</label>
            <input type="date" value={filter.date}
                   onChange={(e) => setFilter((f) => ({ ...f, date: e.target.value }))} />
          </div>
          <button className="tx2-btn tx2-btn-ghost" onClick={() =>
            setFilter({ search: "", category: "", month: "", date: "", datasetId: "", type: filter.type })
          }>Clear all</button>
        </section>
      )}

      {/* TABLE CARD */}
      <article className="card tx2-card">
        <div className="tx2-table-wrap">
          <table className="tx2-table">
            <thead>
              <tr>
                <th>
                  <button type="button" className="tx2-th-btn" onClick={() => toggleSort("date")}>
                    DATE <SortIcon col="date" />
                  </button>
                </th>
                <th>DESCRIPTION</th>
                <th>CATEGORY</th>
                <th>TYPE</th>
                <th style={{ textAlign: "right" }}>
                  <button type="button" className="tx2-th-btn" onClick={() => toggleSort("amount")}>
                    AMOUNT <SortIcon col="amount" />
                  </button>
                </th>
                <th style={{ textAlign: "right" }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((t) => {
                const meta = categoryMeta(t.category);
                const income = isIncome(t);
                const recurring = isRecurring(t);
                const Icon = income ? Coins : (CAT_ICON[t.category] || CircleDot);
                return (
                  <tr key={t.id}>
                    <td className="tx2-cell-date">{fmtDate(t.date)}</td>
                    <td>
                      <div className="tx2-desc">
                        <span className={`tx2-desc-ic ${income ? "tx2-desc-ic-mint" : `tx2-desc-ic-${chipToTone(meta.chip)}`}`}>
                          <Icon size={14} />
                        </span>
                        <div>
                          <div className="tx2-desc-main">
                            {t.description}
                            {recurring && <span className="tx2-recur-badge" title="Recurring charge"><RefreshCw size={10} /> Recurring</span>}
                          </div>
                          {t.notes && <div className="tx2-desc-note">{t.notes}</div>}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`tx2-chip tx2-chip-${chipToTone(meta.chip)}`}>
                        <span className="tx2-chip-dot" /> {t.category}
                      </span>
                    </td>
                    <td>
                      <span className={`tx2-type ${income ? "tx2-type-income" : "tx2-type-expense"}`}>
                        {income ? "Income" : "Expense"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <span className={`tx2-amt ${income ? "is-pos" : "is-neg"}`}>
                        {income ? "+ " : "− "}{money(t.amount)}
                      </span>
                    </td>
                    <td>
                      <div className="tx2-row-actions">
                        <button className="tx2-row-btn" aria-label="Edit" onClick={() => setTxModal(t)}>
                          <Pencil size={13} />
                        </button>
                        <button className="tx2-row-btn tx2-row-btn-danger" aria-label="Delete" onClick={() => handleDelete(t)}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {list.length === 0 && (
          <div className="empty-state">
            <Inbox size={28} />
            <h3>No transactions match these filters</h3>
            <p>Clear a filter above, or add a new entry.</p>
            <button className="tx2-btn tx2-btn-dark" onClick={() => setTxModal({})}>
              <Plus size={14} /> Add Transaction
            </button>
          </div>
        )}

        {/* FOOTER */}
        {list.length > 0 && (
          <div className="tx2-foot">
            <div className="tx2-foot-info">
              Showing {(pageSafe - 1) * PAGE_SIZE + 1}–
              {Math.min(pageSafe * PAGE_SIZE, list.length)} of {list.length} transactions
            </div>
            <div className="tx2-pager">
              <button className="tx2-pager-btn" disabled={pageSafe === 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label="Previous page">
                <ChevronLeft size={14} />
              </button>
              {buildPageList(pageSafe, totalPages).map((p, i) =>
                p === "…" ? (
                  <span key={`g${i}`} className="tx2-pager-gap">…</span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    className={`tx2-pager-num ${p === pageSafe ? "is-active" : ""}`}
                    onClick={() => setPage(p)}>{p}</button>
                )
              )}
              <button className="tx2-pager-btn" disabled={pageSafe >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))} aria-label="Next page">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </article>

      {/* MODALS */}
      {txModal && (
        <TxModal
          tx={txModal.id ? txModal : null}
          onClose={() => setTxModal(null)}
          onSave={async (values) => {
            try {
              if (values.id) { await updateTransaction(values.id, values); toast("Transaction updated.", "success"); }
              else { await addTransaction(values); toast("Transaction added.", "success"); }
              setTxModal(null);
            } catch (e) { toast(e.message || "Could not save.", "error"); }
          }}
        />
      )}

      {csvModal && (
        <CsvModal
          onClose={() => setCsvModal(false)}
          onImported={async (report) => {
            await reload();
            if (report.inserted) toast(`Imported ${report.inserted} transaction${report.inserted === 1 ? "" : "s"} into "${report.dataset_name}".`, "success");
            else toast("No rows imported.", "info");
          }}
        />
      )}

      {subModal && (
        <SubscriptionModal
          onClose={() => setSubModal(false)}
          onCreated={async (body, desc) => {
            await reload();
            setSubModal(false);
            toast(`${body.created} monthly charge${body.created === 1 ? "" : "s"} created for "${desc}".`, "success");
          }}
        />
      )}
    </>
  );
}

/* ---------- helpers ---------- */
function chipToTone(chip) {
  return ({
    "cat-food": "pink",
    "cat-transport": "blue",
    "cat-shopping": "lavender",
    "cat-entertainment": "yellow",
    "cat-bills": "peach",
    "cat-education": "mint",
    "cat-health": "coral",
    "cat-other": "gray",
  })[chip] || "gray";
}

function buildPageList(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out = [1];
  if (current > 3) out.push("…");
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) out.push(i);
  if (current < total - 2) out.push("…");
  out.push(total);
  return out;
}

/* =====================================================
   Modals — unchanged behaviour, reused from previous impl
   ===================================================== */
function TxModal({ tx, onClose, onSave }) {
  const [values, setValues] = useState(() => ({
    id: tx?.id || "",
    description: tx?.description || "",
    amount: tx?.amount || "",
    category: tx?.category || "Food",
    date: tx?.date || new Date().toISOString().slice(0, 10),
    payment: tx?.payment || "UPI",
    notes: tx?.notes || "",
  }));
  const [errors, setErrors] = useState({});

  function validate() {
    const e = {};
    if (!values.description || values.description.trim().length < 2) e.description = "Please enter a description.";
    const amt = Number(values.amount);
    if (!isFinite(amt) || amt <= 0) e.amount = "Amount must be greater than zero.";
    if (!values.category) e.category = "Pick a category.";
    if (!values.date) e.date = "Pick a date.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(e) {
    e.preventDefault();
    if (!validate()) return;
    await onSave({
      ...values,
      description: values.description.trim(),
      amount: Number(values.amount),
      notes: values.notes.trim(),
    });
  }

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-root">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true">
        <h2 className="modal-title">{tx ? "Edit transaction" : "Add transaction"}</h2>
        <p className="modal-sub">Saved to MongoDB.</p>
        <form onSubmit={submit} noValidate>
          <div className="form-grid">
            <div className="form-field full">
              <label>Description</label>
              <input type="text" required maxLength={80}
                value={values.description} onChange={(e) => setValues({ ...values, description: e.target.value })} autoFocus />
              {errors.description && <div className="error-text">{errors.description}</div>}
            </div>
            <div className="form-field">
              <label>Amount (₹)</label>
              <input type="number" min="0.01" step="0.01" required
                value={values.amount} onChange={(e) => setValues({ ...values, amount: e.target.value })} />
              {errors.amount && <div className="error-text">{errors.amount}</div>}
            </div>
            <div className="form-field">
              <label>Category</label>
              <select value={values.category} onChange={(e) => setValues({ ...values, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.key}</option>)}
              </select>
              {errors.category && <div className="error-text">{errors.category}</div>}
            </div>
            <div className="form-field">
              <label>Date</label>
              <input type="date" required
                value={values.date} onChange={(e) => setValues({ ...values, date: e.target.value })} />
              {errors.date && <div className="error-text">{errors.date}</div>}
            </div>
            <div className="form-field">
              <label>Payment method</label>
              <select value={values.payment} onChange={(e) => setValues({ ...values, payment: e.target.value })}>
                {PAYMENTS.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div className="form-field full">
              <label>Notes (optional)</label>
              <textarea maxLength={240} value={values.notes}
                onChange={(e) => setValues({ ...values, notes: e.target.value })} />
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SubscriptionModal({ onClose, onCreated }) {
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [cat, setCat] = useState("Entertainment");
  const [first, setFirst] = useState(() => {
    const t = new Date();
    const d = new Date(t.getFullYear(), t.getMonth() - 3, t.getDate());
    return d.toISOString().slice(0, 10);
  });
  const [payment, setPayment] = useState("Credit card");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useData();

  const preview = useMemo(() => {
    const amt = Number(amount);
    if (!first || !isFinite(amt) || amt <= 0) {
      return "pick a first charge date and amount to see how many months will be created.";
    }
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const start = new Date(first + "T00:00:00");
    if (isNaN(start) || start > today) return "pick a first charge date and amount…";
    let count = 1, cur = new Date(start);
    while (true) {
      const next = new Date(cur.getFullYear(), cur.getMonth() + 1, Math.min(start.getDate(), 28));
      const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      next.setDate(Math.min(start.getDate(), lastDay));
      if (next > today) break;
      count++; cur = next;
    }
    const total = count * amt;
    return <><strong>{count} transaction{count === 1 ? "" : "s"}</strong> will be created ({money(amt)} × {count} = <strong>{money(total)}</strong> total spend tagged as Recurring).</>;
  }, [first, amount]);

  async function submit(e) {
    e.preventDefault();
    const err = {};
    if (!desc || desc.trim().length < 2) err.desc = "Give it a name.";
    const amt = Number(amount);
    if (!isFinite(amt) || amt <= 0) err.amount = "Amount must be greater than zero.";
    if (!first) err.first = "Pick a first charge date.";
    setErrors(err);
    if (Object.keys(err).length) return;
    setSubmitting(true);
    try {
      const body = await SpendSenseAPI.createSubscription({
        description: desc.trim(), amount: amt, category: cat,
        first_date: first, payment, notes: notes.trim() || "Recurring",
      });
      onCreated(body, desc.trim());
    } catch (e2) {
      toast(e2.message || "Could not create subscription.", "error");
    } finally { setSubmitting(false); }
  }

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-root">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true">
        <h2 className="modal-title">Add recurring subscription</h2>
        <p className="modal-sub">Creates one transaction per month from the first charge date up to today, each tagged "Recurring".</p>
        <form onSubmit={submit} noValidate>
          <div className="form-grid">
            <div className="form-field full">
              <label>Service name</label>
              <input type="text" required maxLength={80} placeholder="e.g. Netflix subscription"
                value={desc} onChange={(e) => setDesc(e.target.value)} autoFocus />
              {errors.desc && <div className="error-text">{errors.desc}</div>}
            </div>
            <div className="form-field">
              <label>Amount per cycle (₹)</label>
              <input type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
              {errors.amount && <div className="error-text">{errors.amount}</div>}
            </div>
            <div className="form-field">
              <label>Category</label>
              <select value={cat} onChange={(e) => setCat(e.target.value)}>
                {CATEGORIES.map((c) => <option key={c.key}>{c.key}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label>First charge date</label>
              <input type="date" required value={first} onChange={(e) => setFirst(e.target.value)} />
              {errors.first && <div className="error-text">{errors.first}</div>}
            </div>
            <div className="form-field">
              <label>Payment method</label>
              <select value={payment} onChange={(e) => setPayment(e.target.value)}>
                {PAYMENTS.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div className="form-field full">
              <label>Notes (optional)</label>
              <input type="text" maxLength={120} placeholder="e.g. Annual, Family plan" value={notes} onChange={(e) => setNotes(e.target.value)} />
              <div className="card-sub" style={{ marginTop: 4 }}>Preview: {preview}</div>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn" disabled={submitting}>{submitting ? "Creating…" : "Create subscription"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CsvModal({ onClose, onImported }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [datasetName, setDatasetName] = useState("");
  const [report, setReport] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [drag, setDrag] = useState(false);
  const { toast } = useData();

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function parseCsvLine(line) {
    const out = []; let cur = ""; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQ = false; else cur += c;
      } else {
        if (c === ",") { out.push(cur); cur = ""; }
        else if (c === '"') inQ = true; else cur += c;
      }
    }
    out.push(cur); return out;
  }

  function onFile(f) {
    if (!f) return;
    if (!/\.csv$|text\/csv/i.test(f.name + f.type)) { toast("Please choose a .csv file.", "error"); return; }
    if (f.size > 4 * 1024 * 1024) { toast("File is too large — keep it under 4 MB.", "error"); return; }
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => {
      const txt = String(e.target.result || "");
      const lines = txt.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim().length);
      if (!lines.length) return;
      const headers = parseCsvLine(lines[0]);
      const rows = lines.slice(1, 6).map(parseCsvLine);
      setPreview({ headers, rows });
    };
    reader.onerror = () => toast("Could not read the file.", "error");
    reader.readAsText(f, "utf-8");
  }

  async function submit() {
    if (!file) return;
    setSubmitting(true);
    try {
      const body = await SpendSenseAPI.importCsv(file, datasetName.trim() || null);
      setReport(body);
      await onImported(body);
    } catch (e) {
      toast(e.message || "Import failed.", "error");
    } finally { setSubmitting(false); }
  }

  return (
    <div className="modal-root">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true">
        <h2 className="modal-title">Import transactions from CSV</h2>
        <p className="modal-sub">
          Required columns: <code>description</code>, <code>amount</code>, <code>date</code>.
          Optional: <code>category</code>, <code>payment</code>, <code>notes</code>.
        </p>

        <div className="form-field" style={{ marginTop: 10 }}>
          <label>Dataset name (optional)</label>
          <input type="text" maxLength={80}
            placeholder="e.g. October statement"
            value={datasetName} onChange={(e) => setDatasetName(e.target.value)} />
        </div>

        <div className={`csv-drop ${drag ? "is-drag" : ""}`}
          onClick={() => document.getElementById("csv-file-input").click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault(); setDrag(false);
            const f = e.dataTransfer.files && e.dataTransfer.files[0];
            if (f) onFile(f);
          }}>
          <input id="csv-file-input" type="file" accept=".csv,text/csv" hidden
            onChange={(e) => onFile(e.target.files && e.target.files[0])} />
          <FileUp size={22} />
          <div>
            <div style={{ fontWeight: 700 }}>{file ? file.name : "Drop a CSV here, or click to choose"}</div>
            <div className="card-sub">{file ? `${(file.size / 1024).toFixed(1)} KB` : "UTF-8, up to a few thousand rows."}</div>
          </div>
        </div>

        {preview && (
          <>
            <span className="label" style={{ marginTop: 14 }}>Preview — first 5 rows</span>
            <div className="table-wrap" style={{ marginTop: 4 }}>
              <table className="data-table">
                <thead><tr>{preview.headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
                <tbody>
                  {preview.rows.length ? preview.rows.map((r, i) => (
                    <tr key={i}>{preview.headers.map((_, j) => <td key={j}>{r[j] ?? ""}</td>)}</tr>
                  )) : (
                    <tr><td colSpan={preview.headers.length} style={{ color: "var(--muted)" }}>No data rows</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {report && (
          <div style={{ marginTop: 14 }}>
            <div>
              <span className="csv-report-ok">{report.inserted} imported</span>
              {report.skipped ? <> · <span className="csv-report-skip">{report.skipped} skipped</span></> : null}
              {` · of ${report.total_rows} data rows`}
            </div>
            {report.errors && report.errors.length > 0 && (
              <ul>{report.errors.map((e, i) => <li key={i}>Row {e.row}: {e.reason}</li>)}</ul>
            )}
          </div>
        )}

        <div className="modal-actions" style={{ justifyContent: "space-between" }}>
          <a href="/api/sample-csv" className="btn btn-ghost" download><Download size={14} />Download template</a>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="button" className="btn" disabled={!file || submitting} onClick={submit}>{submitting ? "Importing…" : "Import"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
