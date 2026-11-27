import { useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar.jsx";
import Topbar from "./Topbar.jsx";
import Toasts from "./Toasts.jsx";
import OfflineBanner from "./OfflineBanner.jsx";
import ConfirmProvider from "./ConfirmModal.jsx";
import FloatingActions from "./FloatingActions.jsx";

const TITLES = {
  "/dashboard": "Home",
  "/transactions": "Activity",
  "/budgets": "Budgets",
  "/predictions": "Forecast",
  "/reports": "Insights",
};
function titleFor(path) {
  if (TITLES[path]) return TITLES[path];
  if (path.startsWith("/budgets/")) {
    return decodeURIComponent(path.split("/")[2] || "") + " Budget";
  }
  return "CashKit";
}

export default function Layout() {
  const [navOpen, setNavOpen] = useState(false);
  const loc = useLocation();
  const title = titleFor(loc.pathname);

  // Close mobile nav on route change.
  useEffect(() => { setNavOpen(false); }, [loc.pathname]);

  return (
    <ConfirmProvider>
      <div className="app-shell">
        <button
          className="mobile-nav-toggle"
          aria-label="Open navigation menu"
          aria-expanded={navOpen}
          onClick={() => setNavOpen((o) => !o)}
        >
          <i data-lucide="menu">☰</i>
        </button>

        <Sidebar open={navOpen} />
        <div
          className={`scrim ${navOpen ? "is-open" : ""}`}
          aria-hidden="true"
          onClick={() => setNavOpen(false)}
        />

        <main className="main" id="main-content">
          <Topbar title={title} />
          <section className="page-body">
            <OfflineBanner />
            <Outlet />
          </section>
        </main>
      </div>

      <FloatingActions />
      <Toasts />
    </ConfirmProvider>
  );
}
