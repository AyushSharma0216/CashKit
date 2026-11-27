import { useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Home, Activity, Wallet, TrendingUp, LineChart } from "lucide-react";
import SidebarSnapshot from "./SidebarSnapshot.jsx";

const PAGES = [
  { to: "/dashboard",    Icon: Home,       label: "Home",     shortcut: "1" },
  { to: "/transactions", Icon: Activity,   label: "Activity", shortcut: "2" },
  { to: "/budgets",      Icon: Wallet,     label: "Budgets",  shortcut: "3" },
  { to: "/predictions",  Icon: TrendingUp, label: "Forecast", shortcut: "4" },
  { to: "/reports",      Icon: LineChart,  label: "Insights", shortcut: "5" },
];

export default function Sidebar({ open }) {
  const navigate = useNavigate();

  // Alt+1..5 → page. Ignored when typing in a field.
  useEffect(() => {
    function onKey(e) {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const hit = PAGES.find((p) => p.shortcut === e.key);
      if (hit) { e.preventDefault(); navigate(hit.to); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  return (
    <aside className={`sidebar ${open ? "is-open" : ""}`} aria-label="Primary navigation">
      <div className="sidebar-brand">
        <div className="logo-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="32" height="32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="2" y="2" width="28" height="28" rx="9" />
            <path d="M22.5 11.5a7 7 0 1 0 0 9" strokeWidth="2.8" strokeLinecap="round" />
            <path d="M16 7v18" strokeWidth="2.6" strokeLinecap="round" />
          </svg>
        </div>
        <div className="brand-text">
          <div className="brand-name">CashKit</div>
          <div className="brand-tagline">Spend with intention.</div>
        </div>
      </div>

      <div className="nav-section-label">
        <span>Workspace</span>
      </div>
      <nav className="sidebar-nav" aria-label="Pages">
        {PAGES.map((p) => (
          <NavItem key={p.to} {...p} />
        ))}
      </nav>

      <div className="sidebar-footer">
        <SidebarSnapshot />
      </div>
    </aside>
  );
}

function NavItem({ to, Icon, label, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `nav-item ${isActive ? "is-active" : ""}`}
    >
      <Icon size={18} />
      <span className="nav-item-label">{label}</span>
    </NavLink>
  );
}
