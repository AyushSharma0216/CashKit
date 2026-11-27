import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Bell, LogOut, ChevronDown, X } from "lucide-react";
import { useAuth } from "../store/authStore.jsx";

const IS_MAC = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
const SHORTCUT_LABEL = IS_MAC ? "⌘ K" : "Ctrl K";

export default function Topbar({ title }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const menuRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    function onDoc(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // ⌘K / Ctrl+K focuses search. Ignored while typing in another input.
  useEffect(() => {
    function onKey(e) {
      const isK = e.key === "k" || e.key === "K";
      if (!isK) return;
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      e.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function submitSearch(e) {
    e.preventDefault();
    const q = query.trim();
    const target = q ? `/transactions?search=${encodeURIComponent(q)}` : "/transactions";
    navigate(target);
  }

  async function handleLogout() {
    await logout();
    navigate("/", { replace: true });
  }

  const initials = (user?.name || user?.email || "?")
    .split(/[\s@]+/).filter(Boolean).slice(0, 2)
    .map((s) => s[0]?.toUpperCase() || "").join("") || "?";

  return (
    <header className="topbar">
      <div className="topbar-left">
        <h1 className="page-title">{title}</h1>
        <form className="search-pill" role="search" onSubmit={submitSearch}>
          <Search size={16} aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            placeholder="Search transactions, categories…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search"
          />
          {query ? (
            <button
              type="button"
              className="search-clear"
              aria-label="Clear search"
              onClick={() => { setQuery(""); searchRef.current?.focus(); }}
            >
              <X size={14} />
            </button>
          ) : (
            <kbd className="search-kbd" aria-hidden="true">{SHORTCUT_LABEL}</kbd>
          )}
        </form>
      </div>
      <div className="topbar-right">
        <button className="icon-btn" aria-label="Notifications"><Bell size={18} /></button>
        <div className="profile-chip-wrap" ref={menuRef}>
          <button
            className="profile-chip profile-chip-btn"
            onClick={() => setOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={open}
          >
            <div className="avatar" aria-hidden="true">{initials}</div>
            <div className="profile-meta">
              <div className="profile-name">{user?.name || "Account"}</div>
              <div className="profile-sub">{user?.email || "—"}</div>
            </div>
            <ChevronDown size={14} />
          </button>
          {open && (
            <div className="profile-menu" role="menu">
              <div className="profile-menu-head">
                <div className="profile-menu-name">{user?.name || "Account"}</div>
                <div className="profile-menu-sub">{user?.email || "—"}</div>
              </div>
              <button type="button" role="menuitem" onClick={handleLogout}>
                <LogOut size={14} /> Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
