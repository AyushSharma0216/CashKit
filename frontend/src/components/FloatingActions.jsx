import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Download, RefreshCw } from "lucide-react";

const ACTIONS = [
  { label: "New transaction",  to: "/transactions?add=1",    Icon: Plus,      tone: "lime"  },
  { label: "New subscription", to: "/transactions?addSub=1", Icon: RefreshCw, tone: "amber" },
  { label: "Export CSV",       to: "/reports#exportCsvBtn",  Icon: Download,  tone: "neutral" },
];

export default function FloatingActions() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const closeTimer = useRef(null);
  const navigate = useNavigate();

  function openNow() {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    setOpen(true);
  }
  function closeSoon() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 160);
  }

  useEffect(() => {
    function onDoc(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  function handleSelect(e, to) {
    e.preventDefault();
    setOpen(false);
    if (to.startsWith("/")) navigate(to);
    else window.location.href = to;
  }

  return (
    <div ref={rootRef} className={`fab-root ${open ? "is-open" : ""}`}>
      <ul
        className="fab-menu"
        role="menu"
        aria-hidden={!open}
        onMouseEnter={openNow}
        onMouseLeave={closeSoon}
      >
        {ACTIONS.map(({ label, to, Icon, tone }) => (
          <li key={to}>
            <a
              href={to}
              role="menuitem"
              className="fab-item"
              tabIndex={open ? 0 : -1}
              onClick={(e) => handleSelect(e, to)}
            >
              <span className="fab-item-label">{label}</span>
              <span className={`fab-item-chip fab-item-chip-${tone}`}>
                <Icon size={15} />
              </span>
            </a>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="fab-main"
        aria-label="Quick actions"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => (open ? setOpen(false) : openNow())}
        onMouseEnter={openNow}
        onMouseLeave={closeSoon}
        onFocus={openNow}
        onBlur={closeSoon}
      >
        <Plus size={24} strokeWidth={2.4} />
      </button>
    </div>
  );
}
