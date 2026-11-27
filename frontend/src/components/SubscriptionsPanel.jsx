import { useEffect, useMemo, useState } from "react";
import {
  Repeat, Plus, Pause, Play, Trash2, Info, CalendarDays, Wallet, TrendingUp,
  X, Clock,
  UtensilsCrossed, Bus, ShoppingBag, Clapperboard, ReceiptText, BookOpen, HeartPulse, CircleDot,
} from "lucide-react";
import { useData } from "../store/dataStore.jsx";
import { useConfirm } from "./ConfirmModal.jsx";
import { SpendSenseAPI } from "../lib/api.js";
import { money, fmtDate, fmtMonthKey } from "../lib/format.js";

/* ================================================================
   Subscriptions panel — reusable. Used inside the Budgets page as a
   second tab. Pure UI; owns its own loading + modal state.
   ================================================================ */

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

function daysUntil(iso) {
  if (!iso) return null;
  const now = new Date(); now.setHours(0,0,0,0);
  const d = new Date(iso + "T00:00:00");
  return Math.round((d - now) / (1000 * 60 * 60 * 24));
}

export default function SubscriptionsPanel({ onAdd }) {
  const { toast, reload } = useData();
  const confirm = useConfirm();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);

  async function load() {
    try {
      setLoading(true);
      const r = await SpendSenseAPI.listSubscriptions();
      setItems(r.items || []);
    } catch (e) {
      toast(e.message || "Could not load subscriptions.", "error");
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function togglePause(sub) {
    try {
      await SpendSenseAPI.pauseSubscription(sub.id, !sub.paused);
      toast(sub.paused ? "Subscription resumed." : "Subscription paused.", "success");
      await load();
      setDetail(null);
    } catch (e) { toast(e.message || "Could not update.", "error"); }
  }

  async function cancelSub(sub) {
    const ok = await confirm({
      title: `Cancel "${sub.name}"?`,
      body: `This permanently deletes ${sub.count} monthly charge${sub.count === 1 ? "" : "s"} totalling ${money(sub.total_paid)}. Your spending history for this subscription will be removed.`,
      okLabel: "Cancel subscription",
    });
    if (!ok) return;
    try {
      await SpendSenseAPI.deleteDataset(sub.id);
      toast(`Cancelled "${sub.name}" (${sub.count} rows removed).`, "success");
      setDetail(null);
      await load();
      await reload();
    } catch (e) { toast(e.message || "Could not cancel.", "error"); }
  }

  const active = items.filter((s) => !s.paused);
  const paused = items.filter((s) => s.paused);
  const monthlyCost = active.reduce((s, x) => s + Number(x.amount || 0), 0);
  const totalPaidAll = items.reduce((s, x) => s + Number(x.total_paid || 0), 0);
  const nextDueSub = active
    .filter((s) => s.next_due)
    .sort((a, b) => a.next_due.localeCompare(b.next_due))[0];
  const nextDueDays = nextDueSub ? daysUntil(nextDueSub.next_due) : null;

  return (
    <>
      {/* 4 summary tiles */}
      <section className="tx2-kpis">
        <article className="tx2-kpi tx2-kpi-pink">
          <div className="tx2-kpi-ic"><Repeat size={20} /></div>
          <div className="tx2-kpi-body">
            <span className="tx2-kpi-label">Active Subscriptions</span>
            <div className="tx2-kpi-val">{active.length}</div>
            <div className="tx2-kpi-foot"><span>{paused.length} paused</span></div>
          </div>
        </article>
        <article className="tx2-kpi tx2-kpi-blue">
          <div className="tx2-kpi-ic"><Wallet size={20} /></div>
          <div className="tx2-kpi-body">
            <span className="tx2-kpi-label">Monthly Cost</span>
            <div className="tx2-kpi-val">{money(monthlyCost)}</div>
            <div className="tx2-kpi-foot"><span>Sum of active charges</span></div>
          </div>
        </article>
        <article className="tx2-kpi tx2-kpi-mint">
          <div className="tx2-kpi-ic"><TrendingUp size={20} /></div>
          <div className="tx2-kpi-body">
            <span className="tx2-kpi-label">Total Paid</span>
            <div className="tx2-kpi-val">{money(totalPaidAll)}</div>
            <div className="tx2-kpi-foot"><span>Across all cycles</span></div>
          </div>
        </article>
        <article className="tx2-kpi tx2-kpi-yellow">
          <div className="tx2-kpi-ic"><CalendarDays size={20} /></div>
          <div className="tx2-kpi-body">
            <span className="tx2-kpi-label">Next Charge</span>
            <div className="tx2-kpi-val tx2-kpi-val-sm">
              {nextDueSub ? fmtDate(nextDueSub.next_due) : "—"}
            </div>
            <div className="tx2-kpi-foot">
              <span>
                {!nextDueSub
                  ? "No active subscriptions"
                  : nextDueDays === 0 ? "Today"
                  : nextDueDays === 1 ? `Tomorrow · ${nextDueSub.name}`
                  : nextDueDays > 0 ? `In ${nextDueDays} days · ${nextDueSub.name}`
                  : `${Math.abs(nextDueDays)} days overdue · ${nextDueSub.name}`}
              </span>
            </div>
          </div>
        </article>
      </section>

      {/* List */}
      {loading ? (
        <article className="card"><div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>Loading…</div></article>
      ) : items.length === 0 ? (
        <article className="card">
          <div className="empty-state">
            <Repeat size={28} />
            <h3>No subscriptions yet</h3>
            <p>Register a recurring charge from the Transactions page — or use the "Add Subscription" button above.</p>
            {onAdd && (
              <button className="tx2-btn tx2-btn-dark" onClick={onAdd}>
                <Plus size={14} /> Add Subscription
              </button>
            )}
          </div>
        </article>
      ) : (
        <section className="sub-grid">
          {items.map((s) => {
            const meta = catMeta(s.category);
            const Icon = meta.Icon;
            const days = daysUntil(s.next_due);
            return (
              <article key={s.id} className={`sub-card ${s.paused ? "is-paused" : ""}`}>
                <div className="sub-head">
                  <div className={`sub-ic tx2-desc-ic-${meta.tone}`}>
                    <Icon size={18} />
                  </div>
                  <div className="sub-id">
                    <div className="sub-name">{s.name}</div>
                    <div className="sub-sub">{s.category} · {s.payment || "—"}</div>
                  </div>
                  <span className={`sub-chip ${s.paused ? "is-paused" : "is-active"}`}>
                    {s.paused ? "Paused" : "Active"}
                  </span>
                </div>

                <div className="sub-amt-row">
                  <div className="sub-amt">
                    <strong>{money(s.amount)}</strong>
                    <em>/month</em>
                  </div>
                  <div className="sub-next">
                    {s.paused ? (
                      <><Pause size={12} /> No upcoming charge</>
                    ) : s.next_due ? (
                      <>
                        <Clock size={12} />
                        {days === 0 ? "due today"
                          : days === 1 ? "due tomorrow"
                          : days > 0 ? `due in ${days}d`
                          : `${Math.abs(days)}d ago`}
                        <span className="sub-next-date">({fmtDate(s.next_due)})</span>
                      </>
                    ) : (
                      <>Awaiting next cycle</>
                    )}
                  </div>
                </div>

                <div className="sub-stats">
                  <div><span>Charged</span><strong>{s.count}×</strong></div>
                  <div><span>Total paid</span><strong>{money(s.total_paid)}</strong></div>
                  <div><span>Since</span><strong>{s.first_date ? fmtMonthKey(s.first_date.slice(0, 7)) : "—"}</strong></div>
                </div>

                <div className="sub-actions">
                  <button className="tx2-btn tx2-btn-ghost" onClick={() => togglePause(s)}>
                    {s.paused ? <><Play size={14} /> Resume</> : <><Pause size={14} /> Pause</>}
                  </button>
                  <button className="tx2-btn tx2-btn-ghost" onClick={() => setDetail(s)}>
                    <Info size={14} /> Details
                  </button>
                  <button className="tx2-btn sub-btn-cancel" onClick={() => cancelSub(s)}>
                    <Trash2 size={14} /> Cancel
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {detail && (
        <DetailModal
          sub={detail}
          onClose={() => setDetail(null)}
          onTogglePause={() => togglePause(detail)}
          onCancel={() => cancelSub(detail)}
        />
      )}
    </>
  );
}

function DetailModal({ sub, onClose, onTogglePause, onCancel }) {
  const meta = catMeta(sub.category);
  const Icon = meta.Icon;
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-root">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal sub-detail" role="dialog" aria-modal="true">
        <button type="button" className="sub-detail-close" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>

        <div className="sub-detail-head">
          <div className={`sub-ic sub-ic-lg tx2-desc-ic-${meta.tone}`}>
            <Icon size={28} />
          </div>
          <div style={{ flex: 1 }}>
            <h2 className="modal-title" style={{ marginBottom: 2 }}>{sub.name}</h2>
            <div className="sub-detail-meta">
              {sub.category} · {sub.payment || "—"}
              {sub.notes ? <> · <em>{sub.notes}</em></> : null}
            </div>
          </div>
          <span className={`sub-chip ${sub.paused ? "is-paused" : "is-active"}`}>
            {sub.paused ? "Paused" : "Active"}
          </span>
        </div>

        <div className="sub-detail-grid">
          <div className="sub-detail-stat"><span>Amount</span><strong>{money(sub.amount)}<em>/mo</em></strong></div>
          <div className="sub-detail-stat"><span>Total paid</span><strong>{money(sub.total_paid)}</strong></div>
          <div className="sub-detail-stat"><span>Charges</span><strong>{sub.count}×</strong></div>
          <div className="sub-detail-stat"><span>Started</span><strong>{sub.first_date ? fmtDate(sub.first_date) : "—"}</strong></div>
          <div className="sub-detail-stat"><span>Last charge</span><strong>{sub.last_date ? fmtDate(sub.last_date) : "—"}</strong></div>
          <div className="sub-detail-stat">
            <span>Next due</span>
            <strong>{sub.paused ? "Paused" : sub.next_due ? fmtDate(sub.next_due) : "—"}</strong>
          </div>
        </div>

        <div className="sub-history-head">
          <h3>Charge history</h3>
          <span>{sub.history.length} rows</span>
        </div>
        <div className="sub-history">
          {sub.history.map((h, i) => (
            <div className="sub-history-row" key={i}>
              <div className="sub-history-dot" />
              <span className="sub-history-date">{fmtDate(h.date)}</span>
              <span className="sub-history-amt">− {money(h.amount)}</span>
            </div>
          ))}
        </div>

        <div className="sub-detail-actions">
          <button className="tx2-btn tx2-btn-ghost" onClick={onTogglePause}>
            {sub.paused ? <><Play size={14} /> Resume</> : <><Pause size={14} /> Pause</>}
          </button>
          <button className="tx2-btn sub-btn-cancel" onClick={onCancel}>
            <Trash2 size={14} /> Cancel subscription
          </button>
        </div>
      </div>
    </div>
  );
}
