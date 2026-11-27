# CashKit

A personal expense tracker with a warm, editorial look — React SPA on top of a
Flask + MongoDB backend, with scikit-learn forecasts for next-month spend.

> Spend with intention.

---

## Stack

| Layer      | Choice |
|------------|--------|
| Frontend   | React 18 + Vite + React Router + Chart.js + lucide-react |
| Backend    | Python 3.9+ + Flask (session auth) |
| Database   | MongoDB (local or Atlas) via PyMongo |
| ML         | scikit-learn (walk-forward validation, six baselines) |
| Styling    | Hand-written CSS (design tokens via `:root`), light + dark aware |

---

## What's inside

- **User accounts** — email + password, session cookie, all queries scoped to the user.
- **Transactions** — add / edit / delete, filter by type / category / month / dataset, search, CSV import.
- **Budgets** — per-category caps with a Subscriptions tab (recurring charges with pause/cancel).
- **Forecast** — next-month spending prediction with a confidence band and six-model comparison.
- **Insights** — monthly report: donut, month comparison, day-of-week spending, top descriptions.
- **Floating quick-actions** — hover the + in the corner for New transaction / New subscription / Export CSV.
- **Global search** — `Ctrl` / `⌘` + `K` to focus the topbar search; `Alt` + `1..5` to jump between pages.

---

## Getting started

### Prerequisites

- Python **3.9+**
- Node **18+** and npm
- A reachable **MongoDB** — local (`mongodb://localhost:27017`) or Atlas

### 1. Backend (Flask + Mongo)

```powershell
# From the project root
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Optional — only needed for Atlas or a non-default URI
# echo "MONGODB_URI=mongodb+srv://user:pass@cluster.example.mongodb.net" > .env
# echo "MONGODB_DB=spendsense" >> .env
# echo "SECRET_KEY=something-long-and-random" >> .env

python app.py
```

Flask comes up on **http://127.0.0.1:5000**.

### 2. Frontend (React + Vite)

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Vite serves the app on **http://localhost:5173** and proxies `/api/*` to Flask.

### 3. Log in

Open **http://localhost:5173** and either sign up, or click **Try the demo account**
on the login page (fills in a seeded user you can log in with).

---

## Data model (MongoDB)

Collections (all scoped by `user_id`):

- **users** — email, name, password hash, created_at.
- **transactions** — description, amount, category, date, payment, notes,
  optional `import_id` (`sub_…` for recurring charges).
- **budgets** — per-category caps plus one `__total__` master cap per user.
- **datasets** — CSV imports and subscription definitions (with `paused` flag).

All ids are short string prefixes (`u_`, `t_`, `b_`, `d_`) so nothing ObjectId
leaks into the frontend.

---

## Project layout

```
cashkit/
├── app.py                 # Flask API + session auth
├── db.py                  # PyMongo layer: users, transactions, budgets, datasets, subscriptions
├── ml.py                  # scikit-learn models + walk-forward validation
├── audit.py               # read-only sanity checks on the dataset
├── requirements.txt
├── README.md
├── templates/             # Legacy Jinja pages (kept for API reference)
├── static/                # Legacy static assets
└── frontend/              # React + Vite SPA (the live UI)
    ├── index.html
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── App.jsx
        ├── index.css
        ├── pages/         # Overview, Transactions, Budgets, Predictions, Reports, …
        ├── components/    # Sidebar, Topbar, FloatingActions, SubscriptionsPanel, …
        ├── store/         # dataStore, authStore
        └── lib/           # api.js (fetch wrapper), format helpers
```

---

## Environment variables

| Name         | Default                        | Notes |
|--------------|--------------------------------|-------|
| `MONGODB_URI`| `mongodb://localhost:27017/`   | Local Mongo or Atlas connection string |
| `MONGODB_DB` | `spendsense`                   | Database name (kept for continuity with existing data) |
| `SECRET_KEY` | `dev-secret-change-me-...`     | **Change in production** — signs the session cookie |

---

## License

Personal / educational project.
