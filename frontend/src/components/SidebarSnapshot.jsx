import { CalendarDays } from "lucide-react";
import { useData } from "../store/dataStore.jsx";
import { money, thisMonthKey, totalForMonth } from "../lib/format.js";

export default function SidebarSnapshot() {
  const { transactions, totalBudget, online, loaded } = useData();

  if (!loaded) {
    return (
      <div className="sidebar-snapshot">
        <div className="snap-label"><CalendarDays size={14} /><span>This month</span></div>
        <div className="snap-amount">—</div>
        <div className="snap-progress"><div className="snap-progress-fill" style={{ width: "0%" }} /></div>
        <div className="snap-meta">Loading…</div>
      </div>
    );
  }
  if (!online) {
    return (
      <div className="sidebar-snapshot">
        <div className="snap-label"><CalendarDays size={14} /><span>This month</span></div>
        <div className="snap-amount">—</div>
        <div className="snap-progress"><div className="snap-progress-fill" style={{ width: "0%" }} /></div>
        <div className="snap-meta">Offline</div>
      </div>
    );
  }

  const monthKey = thisMonthKey();
  const spent = totalForMonth(transactions, monthKey);
  const now = new Date();
  const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dom = now.getDate();
  const daysLeft = Math.max(0, dim - dom);
  const monthLabel = now.toLocaleString("en-GB", { month: "long" });

  let pct, meta, overClass = "";
  const totalAmount = totalBudget ? Number(totalBudget.amount || 0) : 0;

  if (totalAmount > 0) {
    pct = Math.min(100, (spent / totalAmount) * 100);
    const remaining = totalAmount - spent;
    if (remaining >= 0) {
      meta = `${money(remaining)} left · ${daysLeft} day${daysLeft === 1 ? "" : "s"} to go`;
    } else {
      meta = <>Over by {money(Math.abs(remaining))} · {daysLeft} day{daysLeft === 1 ? "" : "s"} to go</>;
    }
    if (spent > totalAmount) overClass = "over-budget";
  } else {
    pct = (dom / dim) * 100;
    meta = `Day ${dom} of ${dim} · ${daysLeft} left`;
  }

  return (
    <div className="sidebar-snapshot">
      <div className="snap-label"><CalendarDays size={14} /><span>{monthLabel}</span></div>
      <div className="snap-amount">{money(spent)}</div>
      <div className="snap-progress">
        <div className={`snap-progress-fill ${overClass}`} style={{ width: `${pct.toFixed(1)}%` }} />
      </div>
      <div className="snap-meta">{meta}</div>
    </div>
  );
}
