import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";

/* Cross-browser scroll-reveal fallback. Modern Chromium uses
   `animation-timeline: view()` via CSS; browsers without it add the
   `.in-view` class as elements scroll into the viewport. */
function installScrollReveal() {
  if (typeof window === "undefined") return;
  if (CSS.supports && CSS.supports("animation-timeline", "view()")) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const SELECTOR = [
    ".card", ".metric-tile", ".budget-card", ".budget-stat",
    ".risk-row", ".status-pill", ".walk-step", ".budget-rec-tile",
    ".lp2-feature", ".lp2-preview", ".lp2-step", ".lp2-faq-item",
    ".lp2-stat", ".lp2-stack", ".lp2-trusted-item",
    ".auth2-feat", ".auth2-mock", ".auth2-visual-card", ".ap-perks li",
  ].join(", ");

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add("in-view");
        io.unobserve(e.target);
      }
    }
  }, { threshold: 0.15, rootMargin: "0px 0px -60px 0px" });

  const attach = () => {
    document.querySelectorAll(SELECTOR).forEach((el) => {
      if (!el.classList.contains("in-view")) {
        el.classList.add("reveal-pending");
        io.observe(el);
      }
    });
  };
  attach();
  // Re-attach whenever React swaps the tree (route change, data load).
  new MutationObserver(attach).observe(document.body, { childList: true, subtree: true });
}
installScrollReveal();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
