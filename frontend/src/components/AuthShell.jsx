import { Link, useLocation } from "react-router-dom";
import { Zap, Target, BarChart3 } from "lucide-react";

/* ================================================================
   Shared chrome for /login and /signup — left visual panel + right
   form card + tab switcher. The form itself is passed as children.
   ================================================================ */
export default function AuthShell({ children }) {
  const { pathname } = useLocation();
  const activeTab = pathname.startsWith("/signup") ? "signup" : "login";

  return (
    <div className="auth2">
      {/* corner blobs */}
      <span className="auth2-blob auth2-blob-tl" aria-hidden="true" />
      <span className="auth2-blob auth2-blob-tr" aria-hidden="true" />
      <span className="auth2-blob auth2-blob-br1" aria-hidden="true" />
      <span className="auth2-blob auth2-blob-br2" aria-hidden="true" />

      {/* ============== LEFT: brand + hero ============== */}
      <aside className="auth2-left">
        <div className="auth2-brand">
          <div className="auth2-brand-mark">
            <svg viewBox="0 0 32 32" width="22" height="22" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="2" y="2" width="28" height="28" rx="9" />
              <path d="M22.5 11.5a7 7 0 1 0 0 9" strokeWidth="2.8" strokeLinecap="round" />
              <path d="M16 7v18" strokeWidth="2.6" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <div className="auth2-brand-name">CashKit</div>
            <div className="auth2-brand-tag">Spend with intention.</div>
          </div>
        </div>

        <h1 className="auth2-h1">
          Track. Predict.<br />
          Spend <span className="auth2-h1-hi">Smarter.</span>
        </h1>
        <p className="auth2-lead">
          A personal expense tracker that helps you understand your spending,
          set budgets, and get AI-powered predictions for what's next.
        </p>

        {/* illustrative donut mock — no live numbers, just the shape of the dashboard */}
        <div className="auth2-mock-wrap">
          <div className="auth2-mock">
            <div className="auth2-mock-donut">
              <svg viewBox="0 0 120 120" width="150" height="150">
                <circle cx="60" cy="60" r="46" fill="none" stroke="#F3EFE3" strokeWidth="18" />
                <circle cx="60" cy="60" r="46" fill="none" stroke="#FBD6E3" strokeWidth="18"
                        strokeDasharray="72 289" strokeLinecap="butt" transform="rotate(-90 60 60)" />
                <circle cx="60" cy="60" r="46" fill="none" stroke="#E0D6F5" strokeWidth="18"
                        strokeDasharray="60 289" transform="rotate(0 60 60)" />
                <circle cx="60" cy="60" r="46" fill="none" stroke="#FBECAD" strokeWidth="18"
                        strokeDasharray="60 289" transform="rotate(75 60 60)" />
                <circle cx="60" cy="60" r="46" fill="none" stroke="#FBD5BB" strokeWidth="18"
                        strokeDasharray="55 289" transform="rotate(150 60 60)" />
                <circle cx="60" cy="60" r="46" fill="none" stroke="#CFE1F6" strokeWidth="18"
                        strokeDasharray="17 289" transform="rotate(216 60 60)" />
              </svg>
              <div className="auth2-mock-donut-center">
                <div className="auth2-mock-month">Your Month</div>
                <div className="auth2-mock-amt">Dashboard</div>
                <div className="auth2-mock-cats">preview</div>
              </div>
            </div>
            <ul className="auth2-mock-legend">
              <li><span className="auth2-dot" style={{background:"#FBD6E3"}} /> Education</li>
              <li><span className="auth2-dot" style={{background:"#E0D6F5"}} /> Bills</li>
              <li><span className="auth2-dot" style={{background:"#FBECAD"}} /> Shopping</li>
              <li><span className="auth2-dot" style={{background:"#FBD5BB"}} /> Food</li>
              <li><span className="auth2-dot" style={{background:"#CFE1F6"}} /> Transport</li>
            </ul>
          </div>
        </div>

        {/* feature pills */}
        <div className="auth2-features">
          <div className="auth2-feat auth2-feat-blue">
            <BarChart3 size={18} />
            <span>Track Expenses</span>
          </div>
          <div className="auth2-feat auth2-feat-yellow">
            <Zap size={18} />
            <span>Predict Spending</span>
          </div>
          <div className="auth2-feat auth2-feat-mint">
            <Target size={18} />
            <span>Stay on Budget</span>
          </div>
        </div>
      </aside>

      {/* ============== RIGHT: form card ============== */}
      <main className="auth2-right">
        <div className="auth2-card">
          <div className="auth2-tabs" role="tablist">
            <Link to="/login" role="tab" aria-selected={activeTab === "login"}
                  className={`auth2-tab ${activeTab === "login" ? "is-active" : ""}`}>
              Login
            </Link>
            <Link to="/signup" role="tab" aria-selected={activeTab === "signup"}
                  className={`auth2-tab ${activeTab === "signup" ? "is-active" : ""}`}>
              Sign Up
            </Link>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
