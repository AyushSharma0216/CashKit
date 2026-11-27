# SpendSense — React Frontend

A React (Vite) port of the original Jinja2 + vanilla-JS frontend. The Flask backend, MongoDB layer and ML engine are **unchanged** — this just talks to the same `/api/*` endpoints.

## What this is

- 5 pages: Overview, Transactions, Budgets, Predictions, Reports
- Same pastel aesthetic — the original `static/css/style.css` is copied verbatim to `src/index.css`
- Same Chart.js charts via `react-chartjs-2`
- Same lucide icons via `lucide-react`
- Routing via `react-router-dom` (client-side)
- One shared data store via React Context (replaces the `window.SS.Store` singleton)

## Running it

**Terminal 1 — Flask backend (unchanged):**

```bash
cd ..                 # back to the project root
python app.py
# serves at http://127.0.0.1:5000
```

**Terminal 2 — React frontend:**

```bash
cd frontend
npm install
npm run dev
# serves at http://localhost:5173
```

Open http://localhost:5173. The Vite dev server proxies every `/api/*` request to Flask on port 5000 (see `vite.config.js`), so the API calls look local to the React app.

## Building for production

```bash
npm run build
# emits a static bundle into frontend/dist
```

To serve the built bundle from Flask instead of running Vite:

1. Copy `frontend/dist/` somewhere Flask can serve it (or add a `send_from_directory` route in `app.py`).
2. The React app only uses relative `/api/*` URLs, so same-origin serving works without any CORS setup.

## File map

```
frontend/
├── index.html            # HTML shell, fonts, mount point
├── vite.config.js        # dev server + /api proxy to Flask:5000
├── package.json
└── src/
    ├── main.jsx          # ReactDOM root
    ├── App.jsx           # <Routes>
    ├── index.css         # original style.css, copied unchanged
    ├── lib/
    │   ├── api.js        # fetch wrappers + SpendSenseAPI helpers
    │   ├── constants.js  # CATEGORIES, PALETTE, uid()
    │   ├── format.js     # money(), fmtDate(), aggregation helpers
    │   └── chartOptions.js  # Chart.js base styles
    ├── store/
    │   └── dataStore.jsx # React context — transactions, budgets, totalBudget, actions
    ├── components/
    │   ├── Layout.jsx         # wraps all pages
    │   ├── Sidebar.jsx        # dark nav + snapshot
    │   ├── SidebarSnapshot.jsx
    │   ├── Topbar.jsx
    │   ├── Toasts.jsx
    │   ├── OfflineBanner.jsx
    │   └── ConfirmModal.jsx   # context-based confirm() dialog
    └── pages/
        ├── Overview.jsx       # donut hero, KPIs, latest transactions
        ├── Transactions.jsx   # table + CRUD modal + CSV import + subscription modal
        ├── Budgets.jsx        # two-tier budgets + sparklines + modals
        ├── Predictions.jsx    # forecast + consensus + walkthrough + model comparison
        └── Reports.jsx        # trend / category / DoW / payment / week / top / speed
```

## What the backend still needs

Nothing has changed in `app.py`, `db.py`, `ml.py`. The React app consumes:

- `GET/POST/PUT/DELETE /api/transactions` + `/api/transactions/<id>`
- `POST /api/subscriptions`
- `GET/POST/DELETE /api/budgets`, `/api/budgets/total`
- `GET /api/datasets`, `DELETE /api/datasets/<id>`
- `GET /api/months`, `DELETE /api/months/<month>`
- `GET /api/predictions`, `POST /api/train`
- `GET /api/categorize?text=...`
- `GET /api/sample-csv`
- `POST /api/import` (multipart file upload)

The old Jinja templates in `templates/` and the old JS in `static/js/` are still there — React just doesn't use them. You can delete them once you're happy with the port.
