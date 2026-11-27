import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Wallet, Target, Plus, Pencil, Trash2, MoreHorizontal, Info, Repeat,
  PiggyBank, Leaf, CalendarDays,
  UtensilsCrossed, Bus, ShoppingBag, Clapperboard, ReceiptText, BookOpen, HeartPulse, CircleDot,
} from "lucide-react";
import { useData } from "../store/dataStore.jsx";
import { useConfirm } from "../components/ConfirmModal.jsx";
import SubscriptionsPanel from "../components/SubscriptionsPanel.jsx";
import { money, thisMonthKey, monthKey, groupByCategory, fmtMonthKey } from "../lib/format.js";
import { CATEGORIES } from "../lib/constants.js";

/* ================================================================
   Budgets — index page.
   4 KPI tiles, "Category Budgets" tab, category card grid, "+ Add"
   dashed card. Each card links to /budgets/:category for the detail.
   ================================================================ */

const CAT_STYLE = {
  Food:          { Icon: UtensilsCrossed, tone: "pink",     bar: "#E8A09E" },
  Transport:     { Icon: Bus,             tone: "blue",     bar: "#8FB4E5" },
  Shopping:      { Icon: ShoppingBag,     tone: "lavender", bar: "#B6A2E5" },
  Entertainment: { Icon: Clapperboard,    tone: "yellow",   bar: "#E6C94A" },
  Bills:         { Icon: ReceiptText,     tone: "yellow",   bar: "#E6C94A" },
  Education:     { Icon: BookOpen,        tone: "mint",     bar: "#8CC79A" },
  Health:        { Icon: HeartPulse,      tone: "coral",    bar: "#E8A09E" },
  Other:         { Icon: CircleDot,       tone: "gray",     bar: "#9FA1A6" },
};
function catMeta(name) { return CAT_STYLE[name] || CAT_STYLE.Other; }

export default function Budgets() {
  const { transactions, budgets, totalBudget, toast,
          addBudget, updateBudget, deleteBudget,
          setTotalBudgetAmount, deleteTotalBudget } = useData();
  const confirm = useConfirm();

  const [totalModal, setTotalModal] = useState(false);
  const [subModal, setSubModal] = useState(null); // null | {} | b (sub = category budget)
  const [menuOpen, setMenuOpen] = useState(null);
  const [tab, setTab] = useState("categories"); // "categories" | "subscriptions"
  const navigate = useNavigate();

  const thisMonth = thisMonthKey();
  const spentByCat = useMemo(() => groupByCategory(transactions, thisMonth), [transactions, thisMonth]);
  const spentTotal = Object.values(spentByCat).reduce((s, v) => s + v, 0);
  const budgetTotalAmt = totalBudget ? Number(totalBudget.amount || 0) : 0;
  const remaining = Math.max(0, budgetTotalAmt - spentTotal);
  const pctSpent = budgetTotalAmt > 0 ? (spentTotal / budgetTotalAmt) * 100 : 0;
  const pctLeft = budgetTotalAmt > 0 ? Math.max(0, 100 - pctSpent) : 0;

  const now = new Date();
  const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dom = now.getDate();
  const monthProgress = (dom / dim) * 100;

  async function handleDelete(b) {
    setMenuOpen(null);
    const ok = await confirm({
      title: "Delete this budget?",
      body: `Remove the ${b.category} limit of ${money(b.amount)}? This cannot be undone.`,
      okLabel: "Delete",
    });
    if (!ok) return;
    try { await deleteBudget(b.id); toast("Budget removed.", "success"); }
    catch (e) { toast(e.message || "Could not delete.", "error"); }
  }

  async function saveTotal(amount) {
    try { await setTotalBudgetAmount(amount); toast(`Total monthly budget set to ${money(amount)}.`, "success"); }
    catch (e) { toast(e.message || "Could not save total.", "error"); }
  }

  async function removeTotal() {
    const ok = await confirm({
      title: "Remove the total monthly budget?",
      body: "Your sub-budgets stay as they are, but you'll need to set the total again to track overall spending.",
      okLabel: "Remove total",
    });
    if (!ok) return;
    try { await deleteTotalBudget(); setTotalModal(false); toast("Total budget removed.", "success"); }
    catch (e) { toast(e.message || "Could not remove total.", "error"); }
  }

  /* close the row-menu on outside click */
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e) => { if (!e.target.closest(".bg2-menu-wrap")) setMenuOpen(null); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  return (
    <>
      <section className="hello">
        <div>
          <h2>Budgets</h2>
          <p>Set monthly budgets, track progress, and manage sub-budgets for each category.</p>
        </div>
        {totalBudget && (
          <div className="btn-row">
            <button className="tx2-btn tx2-btn-ghost" onClick={() => setTotalModal(true)}>
              <Pencil size={14} />Edit total
            </button>
          </div>
        )}
      </section>

      {!totalBudget ? (
        <article className="card budget-setup">
          <div className="budget-setup-inner">
            <div className="budget-setup-icon"><Target size={24} /></div>
            <div className="budget-setup-body">
              <h3 className="card-title">Step 1 — Set your total monthly budget</h3>
              <p className="card-sub">
                This is the overall cap for your month. Once set, split it into
                sub-budgets per category and see where every rupee is heading.
              </p>
              <SetupForm onSave={saveTotal} />
            </div>
          </div>
        </article>
      ) : (
        <>
          {/* ===== 4 KPI tiles ===== */}
          <section className="tx2-kpis">
            <article className="tx2-kpi tx2-kpi-pink">
              <div className="tx2-kpi-ic"><Wallet size={20} /></div>
              <div className="tx2-kpi-body">
                <span className="tx2-kpi-label">Monthly Budget</span>
                <div className="tx2-kpi-val">{money(budgetTotalAmt)}</div>
                <div className="tx2-kpi-foot"><span>{budgets.length} categor{budgets.length === 1 ? "y" : "ies"}</span></div>
              </div>
            </article>

            <article className="tx2-kpi tx2-kpi-blue">
              <div className="tx2-kpi-ic"><PiggyBank size={20} /></div>
              <div className="tx2-kpi-body">
                <span className="tx2-kpi-label">Spent So Far</span>
                <div className="tx2-kpi-val">{money(spentTotal)}</div>
                <div className="tx2-kpi-foot">
                  <span>{Math.round(pctSpent)}% of budget</span>
                </div>
              </div>
            </article>

            <article className="tx2-kpi tx2-kpi-mint">
              <div className="tx2-kpi-ic"><Leaf size={20} /></div>
              <div className="tx2-kpi-body">
                <span className="tx2-kpi-label">Remaining</span>
                <div className="tx2-kpi-val">{money(remaining)}</div>
                <div className="tx2-kpi-foot">
                  <span>
                    {budgetTotalAmt
                      ? (spentTotal > budgetTotalAmt
                          ? `Over by ${money(spentTotal - budgetTotalAmt)}`
                          : `${Math.round(pctLeft)}% left`)
                      : "—"}
                  </span>
                </div>
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

          {/* ===== Toolbar: tabs + Add ===== */}
          <section className="bg2-toolbar">
            <div className="tx2-pills" role="tablist">
              <button type="button" role="tab" aria-selected={tab === "categories"}
                      className={`tx2-pill ${tab === "categories" ? "is-active" : ""}`}
                      onClick={() => setTab("categories")}>Category Budgets</button>
              <button type="button" role="tab" aria-selected={tab === "subscriptions"}
                      className={`tx2-pill ${tab === "subscriptions" ? "is-active" : ""}`}
                      onClick={() => setTab("subscriptions")}>
                <Repeat size={13} /> Subscriptions
              </button>
            </div>
            {tab === "categories" ? (
              <button className="tx2-btn tx2-btn-dark" onClick={() => setSubModal({})}>
                <Plus size={14} /> Add Budget
              </button>
            ) : (
              <button className="tx2-btn tx2-btn-dark"
                      onClick={() => navigate("/transactions?addSub=1")}>
                <Plus size={14} /> Add Subscription
              </button>
            )}
          </section>

          {/* ===== Subscriptions tab ===== */}
          {tab === "subscriptions" ? (
            <SubscriptionsPanel onAdd={() => navigate("/transactions?addSub=1")} />
          ) :
          /* ===== Category grid ===== */
          budgets.length === 0 ? (
            <article className="card">
              <div className="empty-state">
                <Target size={28} />
                <h3>No category budgets yet</h3>
                <p>Split your monthly total into categories to track spending by area.</p>
                <button className="tx2-btn tx2-btn-dark" onClick={() => setSubModal({})}>
                  <Plus size={14} /> Add Category Budget
                </button>
              </div>
            </article>
          ) : (
            <section className="bg2-grid">
              {budgets.map((b) => {
                const spent = spentByCat[b.category] || 0;
                const pct = b.amount ? Math.min(100, (spent / b.amount) * 100) : 0;
                const over = spent > b.amount;
                const meta = catMeta(b.category);
                const Icon = meta.Icon;
                return (
                  <Link key={b.id}
                        to={`/budgets/${encodeURIComponent(b.category)}`}
                        className={`bg2-card ${over ? "is-over" : ""}`}>
                    <div className="bg2-card-head">
                      <div className={`bg2-card-ic tx2-desc-ic-${meta.tone}`}>
                        <Icon size={18} />
                      </div>
                      <div className="bg2-card-name">{b.category}</div>
                      <div className="bg2-menu-wrap" onClick={(e) => e.preventDefault()}>
                        <button type="button" className="bg2-menu-btn"
                                onClick={(e) => { e.preventDefault(); e.stopPropagation();
                                                  setMenuOpen(menuOpen === b.id ? null : b.id); }}
                                aria-label="Open menu">
                          <MoreHorizontal size={16} />
                        </button>
                        {menuOpen === b.id && (
                          <div className="bg2-menu" role="menu">
                            <button type="button" onClick={(e) => { e.preventDefault(); setMenuOpen(null); setSubModal(b); }}>
                              <Pencil size={13} /> Edit
                            </button>
                            <button type="button" className="is-danger"
                                    onClick={(e) => { e.preventDefault(); handleDelete(b); }}>
                              <Trash2 size={13} /> Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="bg2-card-row">
                      <div className="bg2-card-amt">
                        <strong className={over ? "is-over" : ""}>{money(spent)}</strong>
                        <em> / {money(b.amount)}</em>
                      </div>
                      <div className={`bg2-card-pct ${over ? "is-over" : pct >= 90 ? "is-warn" : ""}`}>
                        {Math.round(pct)}%
                      </div>
                    </div>
                    <div className="bg2-card-track">
                      <span style={{ width: `${pct}%`, background: over ? "#C92E52" : meta.bar }} />
                    </div>
                  </Link>
                );
              })}

              <button type="button" className="bg2-card bg2-card-add"
                      onClick={() => setSubModal({})}>
                <Plus size={22} />
                <span>Add Category Budget</span>
              </button>
            </section>
          )}
        </>
      )}

      {totalModal && (
        <TotalModal
          current={totalBudget}
          subBudgets={budgets}
          onClose={() => setTotalModal(false)}
          onSave={async (n) => { await saveTotal(n); setTotalModal(false); }}
          onDelete={removeTotal}
        />
      )}

      {subModal && (
        <SubBudgetModal
          budget={subModal.id ? subModal : null}
          totalBudget={totalBudget}
          budgets={budgets}
          onClose={() => setSubModal(null)}
          onSave={async (values) => {
            try {
              if (values.id) {
                await updateBudget(values.id, { category: values.category, amount: values.amount });
                toast("Budget updated.", "success");
              } else {
                const existing = budgets.find((x) => x.category === values.category);
                if (existing) {
                  await updateBudget(existing.id, { category: values.category, amount: values.amount });
                  toast(`Updated existing ${values.category} budget.`, "success");
                } else {
                  await addBudget({ category: values.category, amount: values.amount });
                  toast("Budget created.", "success");
                }
              }
              setSubModal(null);
            } catch (e) { toast(e.message || "Could not save.", "error"); }
          }}
        />
      )}
    </>
  );
}

/* ----- setup, total, add/edit modals (unchanged behaviour) ----- */
function SetupForm({ onSave }) {
  const [amount, setAmount] = useState("");
  return (
    <form className="budget-setup-form" onSubmit={(e) => { e.preventDefault(); const n = Number(amount); if (isFinite(n) && n > 0) onSave(n); }}>
      <div className="form-field">
        <label>Total monthly budget (₹)</label>
        <input type="number" min="1" step="1" required placeholder="e.g. 20000"
               value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <button type="submit" className="btn"><Plus size={14} />Save total</button>
    </form>
  );
}

function TotalModal({ current, subBudgets, onClose, onSave, onDelete }) {
  const [amount, setAmount] = useState(current?.amount || "");
  const [err, setErr] = useState("");
  const subSum = subBudgets.reduce((s, b) => s + Number(b.amount || 0), 0);
  const n = Number(amount);
  let impact = null;
  if (isFinite(n) && n > 0) {
    if (subSum === 0) impact = `No category budgets yet — your entire ${money(n)} is free to allocate.`;
    else if (subSum > n) impact = <><em>Warning:</em> Your category budgets total {money(subSum)}, which exceeds this cap by {money(subSum - n)}.</>;
    else impact = `${money(subSum)} already allocated · ${money(n - subSum)} would stay free.`;
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
        <h2 className="modal-title">{current ? "Edit total monthly budget" : "Set total monthly budget"}</h2>
        <p className="modal-sub">Set the overall cap for the month. Category budgets should stay inside this.</p>
        <form onSubmit={(e) => {
          e.preventDefault();
          if (!isFinite(n) || n <= 0) { setErr("Enter a positive amount."); return; }
          setErr(""); onSave(n);
        }} noValidate>
          {current && (
            <div className="total-current">
              <div>
                <span className="total-current-label">Current total</span>
                <div className="total-current-val">{money(current.amount)}</div>
              </div>
              <div className="total-current-note">
                {subBudgets.length ? `${money(subSum)} currently allocated across ${subBudgets.length} categor${subBudgets.length === 1 ? "y" : "ies"}.` : "No category budgets yet."}
              </div>
            </div>
          )}
          <div className="total-input-wrap">
            <span className="total-input-rupee">₹</span>
            <input type="number" min="1" step="1" required className="total-input" placeholder="20000"
                   value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </div>
          <div className="total-quick-row">
            <span className="total-quick-label">Quick pick</span>
            {[10000, 15000, 20000, 30000, 50000].map((v) => (
              <button type="button" key={v} className="chip total-quick"
                      onClick={() => setAmount(String(v))}>
                ₹{v / 1000}K
              </button>
            ))}
          </div>
          {impact && (
            <div className="total-impact"><Info size={14} /><span>{impact}</span></div>
          )}
          {err && <div className="error-text">{err}</div>}
          <div className="modal-actions" style={{ justifyContent: "space-between" }}>
            {current ? (
              <button type="button" className="btn btn-ghost btn-danger-subtle" onClick={onDelete}>
                <Trash2 size={14} />Remove total
              </button>
            ) : <div />}
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn">Save total</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function SubBudgetModal({ budget, totalBudget, budgets, onClose, onSave }) {
  const [category, setCategory] = useState(budget?.category || "Food");
  const [amount, setAmount] = useState(budget?.amount || "");
  const [errors, setErrors] = useState({});
  let hint = null;
  if (totalBudget) {
    const used = budgets.reduce((s, x) => (budget && x.id === budget.id ? s : s + Number(x.amount || 0)), 0);
    const left = Number(totalBudget.amount) - used;
    hint = <>Choose a category and a monthly target. <strong>{money(left)}</strong> of your {money(totalBudget.amount)} total is still unallocated.</>;
  }
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  function submit(e) {
    e.preventDefault();
    const err = {};
    if (!category) err.category = "Pick a category.";
    const n = Number(amount);
    if (!isFinite(n) || n <= 0) err.amount = "Amount must be greater than zero.";
    setErrors(err);
    if (Object.keys(err).length) return;
    onSave({ id: budget?.id, category, amount: n });
  }
  return (
    <div className="modal-root">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true">
        <h2 className="modal-title">{budget ? "Edit category budget" : "Add category budget"}</h2>
        <p className="modal-sub">{hint || "Choose a category and a monthly target."}</p>
        <form onSubmit={submit} noValidate>
          <div className="form-grid">
            <div className="form-field">
              <label>Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} autoFocus>
                {CATEGORIES.map((c) => <option key={c.key}>{c.key}</option>)}
              </select>
              {errors.category && <div className="error-text">{errors.category}</div>}
            </div>
            <div className="form-field">
              <label>Monthly limit (₹)</label>
              <input type="number" min="1" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
              {errors.amount && <div className="error-text">{errors.amount}</div>}
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
