import { createContext, useCallback, useContext, useEffect, useState } from "react";

const AuthContext = createContext(null);

async function safeJson(r) { try { return await r.json(); } catch { return null; } }

async function send(path, method, body) {
  const r = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  const data = await safeJson(r);
  return { ok: r.ok, status: r.status, data };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const r = await send("/api/auth/me", "GET");
    if (r.ok && r.data?.user) setUser(r.data.user);
    else setUser(null);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const api = {
    user, loading,
    async signup({ email, password, name }) {
      const r = await send("/api/auth/signup", "POST", { email, password, name });
      if (!r.ok) throw new Error(r.data?.error || "Sign-up failed.");
      setUser(r.data.user);
      return r.data.user;
    },
    async login({ email, password }) {
      const r = await send("/api/auth/login", "POST", { email, password });
      if (!r.ok) throw new Error(r.data?.error || "Login failed.");
      setUser(r.data.user);
      return r.data.user;
    },
    async logout() {
      await send("/api/auth/logout", "POST");
      setUser(null);
    },
    refresh,
  };
  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
