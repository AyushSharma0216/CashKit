import { useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Doughnut } from "react-chartjs-2";
import "chart.js/auto";
import {
  ChevronLeft, Pencil, Plus, Trash2, Wallet, PiggyBank, Leaf,
  UtensilsCrossed, Bus, ShoppingBag, Clapperboard, ReceiptText, BookOpen, HeartPulse, CircleDot, Info,
} from "lucide-react";
import { useData } from "../store/dataStore.jsx";
import { useConfirm } from "../components/ConfirmModal.jsx";
import { money, thisMonthKey, monthKey } from "../lib/format.js";
import { CATEGORIES } from "../lib/constants.js";

const CAT_STYLE = {
  Food:          { Icon: UtensilsCrossed, tone: "pink" },
  Transport:     { Icon: Bus,             tone: "blue" },
  Shopping:      { Icon: ShoppingBag,     tone: "lavender" },
  Entertainment: { Icon: Clapperboard,    tone: "yellow" },
  Bills:         { Icon: ReceiptText,     tone: "yellow" },
  Education:     { Icon: BookOpen,        tone: "mint" },
  Health:        { Icon: HeartPulse,      tone: "coral" },
  Other:         { Icon: CircleDot,       tone: "gray" },
};
function catMeta(name) { return CAT_STYLE[name] || CAT_STYLE.Other; }

const SLICE_COLORS = ["#FBD6E3", "#CFE1F6", "#FBECAD", "#CFEBD1", "#E0D6F5", "#FBD5BB", "#D7EDE4", "#F3DAD4"];

/* ================================================================
   /budgets/:category — detail view.
   Breadcrumb · hero · 3 KPI tiles · donut + legend + sub-budgets
   derived from this category's top descriptions this month.
   ================================================================ */
export default function BudgetDetail() {
  const { category } = useParams();
  const categoryName = decodeURIComponent(category || "");
  const { budgets, transactions, toast, updateBudget, deleteBudget } = useData();
  const confirm = useConfirm();
  const navigate = useNavigate();

  const [editOpen, setEditOpen] = useState(false);

  const budget = budgets.find((b) => b.category === categoryName);

  const thisMonth = thisMonthKey();
  const catTx = useMemo(
    () => transactions.filter((t) => t.category === categoryName && monthKey(t.date) === thisMonth),
    [transactions, categoryName, thisMonth]
  );
  const spent = catTx.reduce((s, t) => s + Number(t.amount || 0), 0);
  const limit = budget ? Number(budget.amount || 0) : 0;
  const remaining = Math.max(0, limit - spent);
  const over = spent > limit && limit > 0;
  const pct = limit ? (spent / limit) * 100 : 0;
  const pctLeft = limit ? Math.max(0, 100 - pct) : 0;

  // Group this month's transactions in this category by description — these
  // become the "sub-budgets" shown in the detail table.
  const subRows = useMemo(() => {
    const map = {};
    catTx.forEach((t) => {
      const key = (t.description || "").trim() || "Untitled";
      if (!map[key]) map[key] = { desc: key, spent: 0, count: 0 };
      map[key].spent += Number(t.amount || 0);
      map[key].count += 1;
    });
    const rows = Object.values(map).sort((a, b) => b.spent - a.spent);
    // Nominal "limit" per sub = round up to nearest ₹100 above spent (display only)
    rows.forEach((r) => { r.limit = Math.max(100, Math.ceil((r.spent * 1.1) / 100) * 100); });
    return rows;
  }, [catTx]);

  const meta = catMeta(categoryName);
  const HeroIcon = meta.Icon;

  // Donut data
  const topRows = subRows.slice(0, 6);
  const otherSum = subRows.slice(6).reduce((s, r) => s + r.spent, 0);
  const labels = topRows.map((r) => r.desc).concat(otherSum ? ["Other"] : []);
  const data = topRows.map((r) => r.spent).concat(otherSum ? [otherSum] : []);
  const colors = labels.map((_, i) => SLICE_COLORS[i % SLICE_COLORS.length]);

  const donutData = {
    labels: labels.length ? labels : ["No spending"],
    datasets: [{
      data: data.length ? data : [1],
      backgroundColor: labels.length ? colors : ["#EDE8DB"],
      borderWidth: 3, borderColor: "#FFFEFA", hoverOffset: 6,
    }],
  };
  const donutOpts = {
    responsive: true, maintainAspectRatio: false, cutout: "72%",
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const pct = spent > 0 ? ((ctx.parsed / spent) * 100).toFixed(1) : "0";
            return ` ${ctx.label}: ${money(ctx.parsed)} · ${pct}%`;
          }
        }
      },
    },
  };

  async function handleDeleteBudget() {
    if (!budget) return;
    const ok = await confirm({
      title: "Delete this category budget?",
      body: `Remove the ${budget.category} limit of ${money(budget.amount)}? This cannot be undone.`,
      okLabel: "Delete",
    });
    if (!ok) return;
    try {
      await deleteBudget(budget.id);
      toast("Budget removed.", "success");
      navigate("/budgets");
    } catch (e) { toast(e.message || "Could not delete.", "error"); }
  }

  return (
    <>
      {/* Breadcrumb + hero */}
      <section className="bg2-detail-head">
        <div className="bg2-breadcrumb">
          <Link to="/budgets"><ChevronLeft size={14} />Budgets</Link>
          <span>/</span>
          <span className="is-current">{categoryName}</span>
        </div>
        <div className="bg2-hero">
          <div className={`bg2-hero-ic tx2-desc-ic-${meta.tone}`}>
            <HeroIcon size={28} />
          </div>
          <div>
            <h2 className="bg2-hero-title">{categoryName} Budget</h2>
            <p className="bg2-hero-sub">Manage your {categoryName.toLowerCase()} spending with sub-budgets.</p>
          </div>
          {budget && (
            <div className="bg2-hero-actions">
              <button className="tx2-btn tx2-btn-ghost" onClick={() => setEditOpen(true)}>
                <Pencil size={14} /> Edit Budget
              </button>
              <button className="tx2-btn tx2-btn-dark" onClick={() =>
                toast("True per-description sub-budgets aren't backed by the current schema — the table below shows an auto-derived view.", "info")
              }>
                <Plus size={14} /> Add Sub-Budget
              </button>
            </div>
          )}
        </div>
      </section>

      {!budget ? (
        <article className="card">
          <div className="empty-state">
            <Info size={28} />
            <h3>No budget set for {categoryName}</h3>
            <p>Add a category budget on the Budgets page to start tracking this category.</p>
            <Link to="/budgets" className="tx2-btn tx2-btn-dark">
              <ChevronLeft size={14} /> Back to Budgets
            </Link>
          </div>
        </article>
      ) : (
        <>
          {/* 3 KPI tiles */}
          <section className="bg2-detail-kpis">
            <article className="tx2-kpi tx2-kpi-pink">
              <div className="tx2-kpi-ic"><Wallet size={20} /></div>
              <div className="tx2-kpi-body">
                <span className="tx2-kpi-label">Category Budget</span>
                <div className="tx2-kpi-val">{money(limit)}</div>
                <div className="tx2-kpi-foot"><span>Monthly cap</span></div>
              </div>
            </article>
            <article className="tx2-kpi tx2-kpi-blue">
              <div className="tx2-kpi-ic"><PiggyBank size={20} /></div>
              <div className="tx2-kpi-body">
                <span className="tx2-kpi-label">Spent</span>
                <div className={`tx2-kpi-val ${over ? "is-neg" : ""}`}>{money(spent)}</div>
                <div className="tx2-kpi-foot"><span>{Math.round(pct)}% of budget</span></div>
              </div>
            </article>
            <article className="tx2-kpi tx2-kpi-mint">
              <div className="tx2-kpi-ic"><Leaf size={20} /></div>
              <div className="tx2-kpi-body">
                <span className="tx2-kpi-label">Remaining</span>
                <div className="tx2-kpi-val">{money(remaining)}</div>
                <div className="tx2-kpi-foot">
                  <span>{over ? `Over by ${money(spent - limit)}` : `${Math.round(pctLeft)}% left`}</span>
                </div>
              </div>
            </article>
          </section>

          {/* Donut + sub-budgets side-by-side */}
          <section className="bg2-detail-grid">
            <article className="card bg2-donut-card">
              <div className="bg2-donut-wrap">
                <div className="bg2-donut-chart">
                  <Doughnut data={donutData} options={donutOpts} />
                  <div className="bg2-donut-center">
                    <div className="bg2-donut-amt">{money(spent)}</div>
                    <div className="bg2-donut-lbl">Spent</div>
                    <div className="bg2-donut-of">of {money(limit)}</div>
                  </div>
                </div>
                <ul className="bg2-donut-legend">
                  {labels.length ? labels.map((label, i) => {
                    const val = data[i];
                    const pct = spent > 0 ? (val / spent) * 100 : 0;
                    return (
                      <li key={label}>
                        <span className="bg2-leg-dot" style={{ background: colors[i] }} />
                        <span className="bg2-leg-name">{label}</span>
                        <span className="bg2-leg-val">{money(val)}</span>
                        <span className="bg2-leg-pct">{pct.toFixed(0)}%</span>
                      </li>
                    );
                  }) : (
                    <li className="muted-note">No spending in this category this month.</li>
                  )}
                </ul>
              </div>
            </article>

            <article className="card bg2-sub-card">
              <div className="card-head">
                <div>
                  <h3 className="card-title">Sub-Budgets ({subRows.length})</h3>
                  <p className="card-sub">Grouped by description within this category, this month.</p>
                </div>
              </div>
              <div className="bg2-sub-table-wrap">
                <table className="bg2-sub-table">
                  <thead>
                    <tr>
                      <th>SUB-BUDGET</th>
                      <th>SPENT / LIMIT</th>
                      <th>PROGRESS</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {subRows.length ? subRows.map((r, i) => {
                      const p = r.limit ? Math.min(100, (r.spent / r.limit) * 100) : 0;
                      return (
                        <tr key={r.desc}>
                          <td>
                            <div className="bg2-sub-desc">
                              <span className="bg2-sub-dot" style={{ background: SLICE_COLORS[i % SLICE_COLORS.length] }} />
                              <strong>{r.desc}</strong>
                            </div>
                          </td>
                          <td className="bg2-sub-amt">
                            {money(r.spent)} <em>/ {money(r.limit)}</em>
                          </td>
                          <td className="bg2-sub-prog-cell">
                            <div className="bg2-sub-prog">
                              <span style={{ width: `${p}%`, background: SLICE_COLORS[i % SLICE_COLORS.length] }} />
                            </div>
                            <span className="bg2-sub-pct">{Math.round(p)}%</span>
                          </td>
                          <td>
                            <div className="bg2-sub-actions">
                              <button className="tx2-row-btn" aria-label="Info"
                                      onClick={() => toast(`${r.count} transaction${r.count === 1 ? "" : "s"} under "${r.desc}" totalling ${money(r.spent)}.`, "info")}>
                                <Info size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr><td colSpan={4} className="muted-note" style={{ padding: 20, textAlign: "center" }}>
                        No transactions in this category this month.
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        </>
      )}

      {editOpen && budget && (
        <EditBudgetModal
          budget={budget}
          onClose={() => setEditOpen(false)}
          onSave={async (n) => {
            try {
              await updateBudget(budget.id, { category: budget.category, amount: n });
              toast(`${budget.category} budget set to ${money(n)}.`, "success");
              setEditOpen(false);
            } catch (e) { toast(e.message || "Could not save.", "error"); }
          }}
          onDelete={handleDeleteBudget}
        />
      )}
    </>
  );
}

function EditBudgetModal({ budget, onClose, onSave, onDelete }) {
  const [amount, setAmount] = useState(budget.amount);
  const [err, setErr] = useState("");
  return (
    <div className="modal-root">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true">
        <h2 className="modal-title">Edit {budget.category} budget</h2>
        <p className="modal-sub">Set a new monthly cap for this category.</p>
        <form onSubmit={(e) => {
          e.preventDefault();
          const n = Number(amount);
          if (!isFinite(n) || n <= 0) { setErr("Enter a positive amount."); return; }
          onSave(n);
        }}>
          <div className="form-field">
            <label>Monthly limit (₹)</label>
            <input type="number" min="1" step="0.01" required value={amount}
                   onChange={(e) => setAmount(e.target.value)} autoFocus />
            {err && <div className="error-text">{err}</div>}
          </div>
          <div className="modal-actions" style={{ justifyContent: "space-between" }}>
            <button type="button" className="btn btn-ghost btn-danger-subtle" onClick={onDelete}>
              <Trash2 size={14} /> Remove
            </button>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn">Save</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
