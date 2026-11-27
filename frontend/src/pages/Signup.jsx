import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, User, Eye, EyeOff, ArrowRight } from "lucide-react";
import { useAuth } from "../store/authStore.jsx";
import AuthShell from "../components/AuthShell.jsx";

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setSubmitting(true);
    try {
      await signup({ email: email.trim().toLowerCase(), password, name: name.trim() });
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.message || "Sign-up failed.");
    } finally { setSubmitting(false); }
  }

  return (
    <AuthShell>
      <div className="auth2-form-head">
        <h2>Create your account <span className="auth2-wave" aria-hidden="true">✨</span></h2>
        <p>Takes under a minute — your workspace seeds with 18 months of demo data.</p>
      </div>

      <form className="auth2-form" onSubmit={submit} noValidate>
        <div className="auth2-field">
          <label htmlFor="su-name">Name <em className="auth2-opt">(optional)</em></label>
          <div className="auth2-input-wrap">
            <User size={16} className="auth2-input-ic" />
            <input id="su-name" type="text" autoComplete="name" maxLength={60}
              value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ayush" autoFocus />
          </div>
        </div>

        <div className="auth2-field">
          <label htmlFor="su-email">Email</label>
          <div className="auth2-input-wrap">
            <Mail size={16} className="auth2-input-ic" />
            <input id="su-email" type="email" autoComplete="email" required
              value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com" />
          </div>
        </div>

        <div className="auth2-field">
          <label htmlFor="su-password">Password</label>
          <div className="auth2-input-wrap">
            <Lock size={16} className="auth2-input-ic" />
            <input id="su-password"
              type={showPw ? "text" : "password"}
              autoComplete="new-password" required minLength={6}
              value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="6+ characters" />
            <button type="button" className="auth2-input-eye"
                    aria-label={showPw ? "Hide password" : "Show password"}
                    onClick={() => setShowPw((s) => !s)}>
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div className="auth2-field">
          <label htmlFor="su-confirm">Confirm password</label>
          <div className="auth2-input-wrap">
            <Lock size={16} className="auth2-input-ic" />
            <input id="su-confirm"
              type={showPw ? "text" : "password"}
              autoComplete="new-password" required
              value={confirm} onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter password" />
          </div>
        </div>

        {error && <div className="auth2-error">{error}</div>}

        <button type="submit" className="auth2-submit" disabled={submitting}>
          {submitting ? "Creating account…" : <>Create Account <ArrowRight size={16} /></>}
        </button>
      </form>

      <div className="auth2-divider"><span>or continue with</span></div>

      <button type="button" className="auth2-google"
              onClick={() => alert("Google sign-in isn't configured in this build. Email + password only for now.")}>
        <GoogleG />
        <span>Continue with Google</span>
      </button>

      <div className="auth2-switch">
        Already have an account? <Link to="/login" className="auth2-switch-cta">Login</Link>
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
