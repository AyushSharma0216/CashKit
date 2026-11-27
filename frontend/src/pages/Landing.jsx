import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, Play, CheckCircle2, BarChart3, Layers, Zap, TrendingUp,
  UserPlus, Database, Github, Mail,
  Sparkles, Wallet, Shield, RefreshCw, Plus, Minus, PieChart, Scale,
} from "lucide-react";

/* ================================================================
   SpendSense — Landing page v2.
   Yellow-pill nav · hero · tech strip · 6 features · preview
   gallery · 3-step · stats · FAQ · yellow CTA band · footer.
   ================================================================ */

export default function Landing() {
  return (
    <div className="lp2">
      <span className="lp2-blob lp2-blob-tr" aria-hidden="true" />
      <span className="lp2-blob lp2-blob-bl" aria-hidden="true" />
      <span className="lp2-blob lp2-blob-br" aria-hidden="true" />
      <span className="lp2-blob lp2-blob-mid" aria-hidden="true" />

      {/* ========== NAV ========== */}
      <header className="lp2-nav">
        <div className="lp2-brand">
          <div className="lp2-brand-mark"><LogoMark /></div>
          <div>
            <div className="lp2-brand-name">CashKit</div>
            <div className="lp2-brand-tag">Spend with intention.</div>
          </div>
        </div>
        <nav className="lp2-nav-links">
          <a href="#home" className="lp2-nav-link is-active">Home</a>
          <a href="#features" className="lp2-nav-link">Features</a>
          <a href="#how" className="lp2-nav-link">How it Works</a>
          <a href="#preview" className="lp2-nav-link">Preview</a>
          <a href="#faq" className="lp2-nav-link">FAQ</a>
        </nav>
        <div className="lp2-nav-actions">
          <Link to="/login" className="lp2-nav-login">Log In</Link>
          <Link to="/signup" className="lp2-btn lp2-btn-dark">Sign Up</Link>
        </div>
      </header>

      {/* ========== HERO ========== */}
      <section id="home" className="lp2-hero">
        <div className="lp2-hero-left">
          <span className="lp2-pill">
            <BarChart3 size={14} />
            AI-Powered Expense Tracker
          </span>
          <h1 className="lp2-h1">
            Track, Analyze &<br />
            Predict Your<br />
            <span className="lp2-h1-hi">Spending.</span>
          </h1>
          <p className="lp2-lead">
            A personal expense tracker with budgets, insights, and
            AI-based predictions to help you stay in control.
          </p>
          <div className="lp2-cta-row">
            <Link to="/signup" className="lp2-btn lp2-btn-dark lp2-btn-lg">
              Get Started <ArrowRight size={16} />
            </Link>
            <Link to="/login" className="lp2-btn lp2-btn-ghost lp2-btn-lg">
              <span className="lp2-play"><Play size={10} fill="currentColor" /></span>
              View Demo
            </Link>
          </div>
          <ul className="lp2-checks">
            <li><CheckCircle2 size={16} /> Track Expenses</li>
            <li><CheckCircle2 size={16} /> Set Budgets</li>
            <li><CheckCircle2 size={16} /> Get Predictions</li>
          </ul>
        </div>

        <div className="lp2-hero-right">
          <svg className="lp2-sparkle" width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
            <path d="M6 4 L8 12" stroke="#D9C800" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M18 2 L18 10" stroke="#D9C800" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M30 4 L28 12" stroke="#D9C800" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          <HeroMock />
        </div>
      </section>

      {/* ========== STACK STRIP (powered by) ========== */}
      <section className="lp2-stack-strip">
        <span className="lp2-strip-label">Built on</span>
        <div className="lp2-strip-items">
          <span>MongoDB</span>
          <span>·</span>
          <span>Flask</span>
          <span>·</span>
          <span>scikit-learn</span>
          <span>·</span>
          <span>statsmodels</span>
          <span>·</span>
          <span>React</span>
          <span>·</span>
          <span>Chart.js</span>
        </div>
        <span className="lp2-strip-label">100% open-source</span>
      </section>

      {/* ========== PROJECT FACTS STRIP ========== */}
      <section className="lp2-trusted">
        <div className="lp2-trusted-item">
          <strong>6</strong> independent ML models
        </div>
        <div className="lp2-trusted-sep" />
        <div className="lp2-trusted-item">
          <strong>Walk-forward</strong> validation
        </div>
        <div className="lp2-trusted-sep" />
        <div className="lp2-trusted-item">
          <strong>100%</strong> open-source stack
        </div>
      </section>

      {/* ========== FEATURES (6 cards, wrapped in yellow wash) ========== */}
      <section id="features" className="lp2-section lp2-wash lp2-wash-yellow">
        <div className="lp2-section-head">
          <span className="lp2-section-pill">Features</span>
          <h2>Everything you need to manage your money.</h2>
          <p>Simple tracking, smart insights, and honest predictions — all in one place.</p>
        </div>
        <div className="lp2-feature-grid">
          <article className="lp2-feature yellow">
            <div className="lp2-feature-ic"><Layers size={22} /></div>
            <h3>Expense Tracking</h3>
            <p>Log and categorize every rupee in seconds. CSV import with flexible column mapping.</p>
          </article>
          <article className="lp2-feature blue">
            <div className="lp2-feature-ic"><Wallet size={22} /></div>
            <h3>Smart Budgets</h3>
            <p>Two-tier budgets — master monthly cap split across categories, with overrun warnings.</p>
          </article>
          <article className="lp2-feature pink">
            <div className="lp2-feature-ic"><Zap size={22} /></div>
            <h3>AI Predictions</h3>
            <p>Six independent ML models forecast next month. Lowest-error model wins automatically.</p>
          </article>
          <article className="lp2-feature mint">
            <div className="lp2-feature-ic"><TrendingUp size={22} /></div>
            <h3>Insightful Reports</h3>
            <p>Monthly trends, day-of-week patterns, payment mix, top descriptions. One-click export.</p>
          </article>
          <article className="lp2-feature lavender">
            <div className="lp2-feature-ic"><RefreshCw size={22} /></div>
            <h3>Recurring Subscriptions</h3>
            <p>Register a subscription once; it auto-generates monthly rows and powers smart projections.</p>
          </article>
          <article className="lp2-feature peach">
            <div className="lp2-feature-ic"><Shield size={22} /></div>
            <h3>Honest by Design</h3>
            <p>Walk-forward validated. Confidence bands withheld when the sample is too thin.</p>
          </article>
        </div>
      </section>

      {/* ========== PREVIEW GALLERY (mint wash) ========== */}
      <section id="preview" className="lp2-section lp2-section-tight lp2-wash lp2-wash-mint">
        <div className="lp2-section-head">
          <span className="lp2-section-pill">Preview</span>
          <h2>See it in action.</h2>
          <p>Five pages, one application. Here's what the dashboard actually looks like.</p>
        </div>
        <div className="lp2-preview-grid">
          <PreviewCard
            tone="pink" icon={<BarChart3 size={14} />}
            title="Home"
            caption="Donut hero, pastel KPIs, biggest expenses, latest entries."
          >
            <OverviewPreview />
          </PreviewCard>
          <PreviewCard
            tone="blue" icon={<Wallet size={14} />}
            title="Budgets"
            caption="Two-tier design: master cap + per-category sub-budgets with sparklines."
          >
            <BudgetsPreview />
          </PreviewCard>
          <PreviewCard
            tone="yellow" icon={<Sparkles size={14} />}
            title="Forecast"
            caption="Next-month forecast, confidence band, six-model comparison."
          >
            <PredictionsPreview />
          </PreviewCard>
        </div>
      </section>

      {/* ========== HOW IT WORKS (pink wash) ========== */}
      <section id="how" className="lp2-section lp2-section-tight lp2-wash lp2-wash-pink">
        <div className="lp2-section-head">
          <span className="lp2-section-pill">How it Works</span>
          <h2>Get started in 3 simple steps.</h2>
        </div>
        <div className="lp2-steps-grid">
          <Step n={1} colorClass="pink" icon={<UserPlus size={26} />}
            title="Create Your Account"
            body="Sign up and your workspace seeds with 18 months of realistic demo data."
          />
          <Step n={2} colorClass="blue" icon={<Database size={26} />}
            title="Track Your Spending"
            body="Add transactions, import CSVs, or register recurring subscriptions."
          />
          <Step n={3} colorClass="mint" icon={<TrendingUp size={26} />}
            title="Get Smart Insights"
            body="View forecasts, spot trends, and keep your budgets on track."
          />
        </div>
      </section>

      {/* ========== HOW IT'S HONEST (replaces the fake stats banner) ========== */}
      <section id="about" className="lp2-stats">
        <div className="lp2-stat">
          <Scale size={30} />
          <div><strong>Walk-forward</strong><span>Every metric from unseen holdout months</span></div>
        </div>
        <div className="lp2-stat">
          <Shield size={30} />
          <div><strong>Earned bands</strong><span>Confidence intervals withheld on thin data</span></div>
        </div>
        <div className="lp2-stat">
          <RefreshCw size={30} />
          <div><strong>Reproducible</strong><span>Every number re-printed by audit.py</span></div>
        </div>
      </section>

      {/* ========== FAQ (lavender wash) ========== */}
      <section id="faq" className="lp2-section lp2-section-tight lp2-wash lp2-wash-lav">
        <div className="lp2-section-head">
          <span className="lp2-section-pill">FAQ</span>
          <h2>Common questions.</h2>
          <p>Everything you'd want to know before signing up.</p>
        </div>
        <div className="lp2-faq">
          <Faq q="Is my data private?">
            Yes — every transaction and budget is scoped to your user account in MongoDB.
            No other user can see your data, and nothing is sent to third parties.
          </Faq>
          <Faq q="How accurate are the predictions?">
            It depends entirely on <em>your</em> data. Every forecast is validated using
            walk-forward holdouts (predict a month → compare to the real one → repeat),
            so the accuracy you see is the accuracy on months the model never trained on.
            The Predictions page shows the MAE, MAPE and R² of each model side-by-side —
            nothing is in-sample, nothing is inflated.
          </Faq>
          <Faq q="Which ML models do you use?">
            Six run in parallel: LinearRegression, Ridge, 3-month MovingAverage, Holt-Winters,
            a Recurring+Variable split, and a weighted top-3 ensemble. The lowest-error model wins.
          </Faq>
          <Faq q="Can I import my bank statements?">
            Yes. CSV import accepts flexible column names (<code>date</code>, <code>desc</code>,
            <code>amount</code>, …) and dates in multiple formats. Download the template on the
            Transactions page.
          </Faq>
          <Faq q="Is it free?">
            Yes, completely. It's a final-year CSE project — open-source, no billing, no account
            upgrades. You run it locally or on your own server.
          </Faq>
          <Faq q="What's the tech stack?">
            Python 3.13, Flask, MongoDB, PyMongo, scikit-learn, statsmodels on the backend.
            React 18, Vite, Chart.js, lucide-react on the frontend. Nothing proprietary.
          </Faq>
        </div>
      </section>

      {/* ========== CTA BAND ========== */}
      <section className="lp2-cta">
        <div className="lp2-cta-left">
          <h2>Take control of your<br />finances with CashKit.</h2>
          <p>Track, plan, and predict — all in one place.</p>
        </div>
        <Link to="/signup" className="lp2-btn lp2-btn-dark lp2-btn-lg lp2-cta-btn">
          Get Started for Free <ArrowRight size={16} />
        </Link>
      </section>

      {/* ========== FOOTER ========== */}
      <footer className="lp2-footer">
        <div className="lp2-brand">
          <div className="lp2-brand-mark"><LogoMark /></div>
          <div>
            <div className="lp2-brand-name">CashKit</div>
            <div className="lp2-brand-tag">Spend with intention.</div>
          </div>
        </div>
        <nav className="lp2-nav-links lp2-footer-links">
          <a href="#home" className="lp2-nav-link">Home</a>
          <a href="#features" className="lp2-nav-link">Features</a>
          <a href="#how" className="lp2-nav-link">How it Works</a>
          <a href="#faq" className="lp2-nav-link">FAQ</a>
        </nav>
        <div className="lp2-footer-ics">
          <a href="https://github.com/" target="_blank" rel="noreferrer" aria-label="GitHub" className="lp2-footer-ic"><Github size={16} /></a>
          <a href="mailto:hello@spendsense.local" aria-label="Email" className="lp2-footer-ic"><Mail size={16} /></a>
        </div>
      </footer>
    </div>
  );
}

/* ================================================================
   Sub-components
   ================================================================ */
function LogoMark() {
  return (
    <svg viewBox="0 0 32 32" width="22" height="22" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="28" height="28" rx="9" />
      <path d="M22.5 11.5a7 7 0 1 0 0 9" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M16 7v18" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

function Step({ n, colorClass, icon, title, body }) {
  return (
    <div className="lp2-step">
      <div className={`lp2-step-ic ${colorClass}`}>
        <span className={`lp2-step-num ${colorClass}`}>{n}</span>
        {icon}
      </div>
      <div className="lp2-step-body">
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
    </div>
  );
}

function PreviewCard({ tone, icon, title, caption, children }) {
  return (
    <article className={`lp2-preview lp2-preview-${tone}`}>
      <div className="lp2-preview-chip">{icon}{title}</div>
      <div className="lp2-preview-canvas">{children}</div>
      <p className="lp2-preview-caption">{caption}</p>
    </article>
  );
}

function Faq({ q, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`lp2-faq-item ${open ? "is-open" : ""}`}>
      <button type="button" className="lp2-faq-q" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>{q}</span>
        {open ? <Minus size={18} /> : <Plus size={18} />}
      </button>
      {open && <div className="lp2-faq-a">{children}</div>}
    </div>
  );
}

/* --- hero mock --- */
function HeroMock() {
  return (
    <div className="lp2-mock">
      <div className="lp2-mock-sb">
        <div className="lp2-mock-brand">
          <span className="lp2-mock-mark"><LogoMark /></span>
          <div>
            <div className="lp2-mock-bname">CashKit</div>
            <div className="lp2-mock-btag">Spend with intention.</div>
          </div>
        </div>
        <div className="lp2-mock-sec">GENERAL</div>
        <ul className="lp2-mock-nav">
          <li className="is-active">Overview</li>
          <li>Transactions</li>
          <li>Budgets</li>
          <li>Predictions</li>
          <li>Reports</li>
        </ul>
        <div className="lp2-mock-sec">TOOLS</div>
        <ul className="lp2-mock-nav">
          <li>Export CSV</li>
          <li>Quick add</li>
        </ul>
        <div className="lp2-mock-snap">
          <div className="lp2-mock-snap-lbl">📅 NOVEMBER</div>
          <div className="lp2-mock-snap-amt">₹10,706</div>
          <div className="lp2-mock-snap-bar"><span style={{width:"55%"}} /></div>
          <div className="lp2-mock-snap-meta">Day 19 of 30 · 11 left</div>
        </div>
      </div>
      <div className="lp2-mock-main">
        <div className="lp2-mock-top">
          <strong>Overview</strong>
          <div className="lp2-mock-search">🔍 Search transactions...</div>
          <div className="lp2-mock-chips">
            <span className="lp2-mock-chip blue">Transactions</span>
            <span className="lp2-mock-chip yellow">Budgets</span>
            <span className="lp2-mock-chip pink">Predictions</span>
            <span className="lp2-mock-chip mint">Reports</span>
          </div>
        </div>
        <div className="lp2-mock-body">
          <h4>Your spending &amp; insights</h4>
          <div className="lp2-mock-sub">What you've spent, what you've set aside, and where this month stands.</div>
          <div className="lp2-mock-row">
            <div className="lp2-mock-donut">
              <DonutSvg size={140} />
              <div className="lp2-mock-donut-ctr">
                <div className="lp2-mock-donut-lbl">SPENT THIS MONTH</div>
                <div className="lp2-mock-donut-amt">₹10,706</div>
                <div className="lp2-mock-donut-meta">across 7 categories</div>
              </div>
            </div>
            <ul className="lp2-mock-legend">
              <li><span className="lp2-dot" style={{background:"#FBD6E3"}}/> Education <em>₹2,659 · 25%</em></li>
              <li><span className="lp2-dot" style={{background:"#E0D6F5"}}/> Bills <em>₹2,249 · 21%</em></li>
              <li><span className="lp2-dot" style={{background:"#FBECAD"}}/> Shopping <em>₹2,199 · 21%</em></li>
              <li><span className="lp2-dot" style={{background:"#FBD5BB"}}/> Food <em>₹2,040 · 19%</em></li>
              <li><span className="lp2-dot" style={{background:"#CFE1F6"}}/> Transport <em>₹620 · 6%</em></li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function DonutSvg({ size = 140 }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size}>
      <circle cx="60" cy="60" r="46" fill="none" stroke="#F3EFE3" strokeWidth="18" />
      <circle cx="60" cy="60" r="46" fill="none" stroke="#FBD6E3" strokeWidth="18" strokeDasharray="72 289" transform="rotate(-90 60 60)" />
      <circle cx="60" cy="60" r="46" fill="none" stroke="#E0D6F5" strokeWidth="18" strokeDasharray="60 289" transform="rotate(-5 60 60)" />
      <circle cx="60" cy="60" r="46" fill="none" stroke="#FBECAD" strokeWidth="18" strokeDasharray="60 289" transform="rotate(70 60 60)" />
      <circle cx="60" cy="60" r="46" fill="none" stroke="#FBD5BB" strokeWidth="18" strokeDasharray="55 289" transform="rotate(145 60 60)" />
      <circle cx="60" cy="60" r="46" fill="none" stroke="#CFE1F6" strokeWidth="18" strokeDasharray="17 289" transform="rotate(212 60 60)" />
    </svg>
  );
}

/* --- preview-gallery mini canvases --- */
function OverviewPreview() {
  return (
    <div className="lp2-pv-overview">
      <div className="lp2-pv-donut">
        <DonutSvg size={90} />
        <div className="lp2-pv-donut-ctr">
          <div className="lp2-pv-donut-lbl">SPENT</div>
          <div className="lp2-pv-donut-amt">₹10,706</div>
        </div>
      </div>
      <div className="lp2-pv-kpis">
        <div className="lp2-pv-kpi pink"><span>SPENT</span><strong>₹10,706</strong></div>
        <div className="lp2-pv-kpi blue"><span>BUDGET</span><strong>₹18,500</strong></div>
        <div className="lp2-pv-kpi yellow"><span>LEFT</span><strong>₹7,794</strong></div>
      </div>
    </div>
  );
}

function BudgetsPreview() {
  const rows = [
    { cat: "Bills", spent: 92, color: "#FBD6E3", amt: "₹7,598 / ₹8,500" },
    { cat: "Food", spent: 65, color: "#FBECAD", amt: "₹2,840 / ₹4,500" },
    { cat: "Shopping", spent: 88, color: "#E0D6F5", amt: "₹2,199 / ₹2,500" },
    { cat: "Transport", spent: 32, color: "#CFE1F6", amt: "₹620 / ₹2,000" },
  ];
  return (
    <div className="lp2-pv-budgets">
      {rows.map((r) => (
        <div key={r.cat} className="lp2-pv-bud">
          <div className="lp2-pv-bud-head">
            <span>{r.cat}</span>
            <em>{r.amt}</em>
          </div>
          <div className="lp2-pv-bud-track">
            <span style={{ width: `${r.spent}%`, background: r.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function PredictionsPreview() {
  const models = [
    { name: "Ensemble (top-3)", val: 16789, won: true },
    { name: "Holt-Winters", val: 16640 },
    { name: "Ridge", val: 16900 },
    { name: "Linear", val: 17210 },
    { name: "MovingAvg(3)", val: 15880 },
  ];
  const max = Math.max(...models.map((m) => m.val));
  return (
    <div className="lp2-pv-predict">
      <div className="lp2-pv-head">
        <div>
          <div className="lp2-pv-label">NEXT MONTH · NOV</div>
          <div className="lp2-pv-amt">₹16,789</div>
        </div>
        <span className="lp2-pv-tag">likely ₹15.4k – ₹17.3k</span>
      </div>
      <div className="lp2-pv-models">
        {models.map((m) => (
          <div key={m.name} className={`lp2-pv-model ${m.won ? "is-winner" : ""}`}>
            <span className="lp2-pv-model-name">{m.name}</span>
            <div className="lp2-pv-model-bar">
              <span style={{ width: `${(m.val / max) * 100}%` }} />
            </div>
            <span className="lp2-pv-model-val">₹{m.val.toLocaleString("en-IN")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
