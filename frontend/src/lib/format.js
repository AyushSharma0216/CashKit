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

export function money(n, decimals = false) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return decimals ? inrDecimal.format(n) : inr.format(Math.round(n));
}

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit", month: "short", year: "numeric",
});
const MONTH_FMT = new Intl.DateTimeFormat("en-GB", {
  month: "long", year: "numeric",
});

export function fmtDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return isNaN(d) ? iso : DATE_FMT.format(d);
}

export function fmtMonth(d) { return MONTH_FMT.format(d); }

export function fmtMonthKey(key) {
  if (!key || key.length !== 7) return key || "";
  const [y, m] = key.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return isNaN(d) ? key : MONTH_FMT.format(d);
}

export function monthKey(iso) { return (iso || "").slice(0, 7); }

export function thisMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function prevMonthKey() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function totalForMonth(transactions, mKey) {
  return transactions
    .filter((t) => monthKey(t.date) === mKey)
    .reduce((s, t) => s + Number(t.amount || 0), 0);
}

export function groupByCategory(transactions, mKey) {
  const groups = {};
  transactions
    .filter((t) => !mKey || monthKey(t.date) === mKey)
    .forEach((t) => {
      groups[t.category] = (groups[t.category] || 0) + Number(t.amount || 0);
    });
  return groups;
}

export function lastSixMonthsSeries(transactions) {
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
