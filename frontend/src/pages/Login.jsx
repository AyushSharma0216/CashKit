import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Mail, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import { useAuth } from "../store/authStore.jsx";
import AuthShell from "../components/AuthShell.jsx";

export default function Login() {
  const { login, toast } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login({ email: email.trim().toLowerCase(), password });
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || "Login failed.");
    } finally {
      setSubmitting(false);
    }
  }

  function fillDemo() {
    setEmail("demo@spendsense.local");
    setPassword("demo1234");
  }

  return (
    <AuthShell>
      <div className="auth2-form-head">
        <h2>Welcome back <span className="auth2-wave" aria-hidden="true">👋</span></h2>
        <p>Log in to your CashKit account and keep your finances on track.</p>
      </div>

      <form className="auth2-form" onSubmit={submit} noValidate>
        <div className="auth2-field">
          <label htmlFor="login-email">Email</label>
          <div className="auth2-input-wrap">
            <Mail size={16} className="auth2-input-ic" />
            <input id="login-email" type="email" autoComplete="email" required
              value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email" autoFocus />
          </div>
        </div>

        <div className="auth2-field">
          <div className="auth2-label-row">
            <label htmlFor="login-password">Password</label>
            <button type="button" className="auth2-link-btn"
                    onClick={() => alert("Password reset isn't wired up in the demo build — use the demo account instead.")}>
              Forgot password?
            </button>
          </div>
          <div className="auth2-input-wrap">
            <Lock size={16} className="auth2-input-ic" />
            <input id="login-password"
              type={showPw ? "text" : "password"}
              autoComplete="current-password" required
              value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password" />
            <button type="button" className="auth2-input-eye"
                    aria-label={showPw ? "Hide password" : "Show password"}
                    onClick={() => setShowPw((s) => !s)}>
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {error && <div className="auth2-error">{error}</div>}

        <button type="submit" className="auth2-submit" disabled={submitting}>
          {submitting ? "Logging in…" : <>Log In <ArrowRight size={16} /></>}
        </button>
      </form>

      <div className="auth2-divider"><span>or continue with</span></div>

      <button type="button" className="auth2-google"
              onClick={() => alert("Google sign-in isn't configured in this build. Use the demo account button below.")}>
        <GoogleG />
        <span>Continue with Google</span>
      </button>

      <button type="button" className="auth2-demo" onClick={fillDemo}>
        Try the demo account
      </button>

      <div className="auth2-switch">
        Don't have an account? <Link to="/signup" className="auth2-switch-cta">Sign Up</Link>
      </div>
    </AuthShell>
  );
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.9 32.1 29.4 35 24 35c-6.1 0-11-4.9-11-11s4.9-11 11-11c2.8 0 5.3 1 7.3 2.8l5.7-5.7C33.6 6.7 29 5 24 5 13.5 5 5 13.5 5 24s8.5 19 19 19c10.5 0 19-8.5 19-19 0-1.2-.1-2.3-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c2.8 0 5.3 1 7.3 2.8l5.7-5.7C33.6 6.7 29 5 24 5 16.3 5 9.6 9.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 43c4.9 0 9.4-1.6 12.9-4.4l-6-5.1c-2 1.5-4.5 2.5-6.9 2.5-5.4 0-9.9-2.9-11.3-7l-6.5 5C9.4 39.6 16.1 43 24 43z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.9 2.5-2.6 4.6-4.7 6l6 5.1C40.9 36.3 44 30.6 44 24c0-1.2-.1-2.3-.4-3.5z"/>
    </svg>
  );
}
