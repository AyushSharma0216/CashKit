"""
SpendSense — Flask server with session-based auth.

Serves both the (legacy) Jinja pages and the JSON API. The API now requires
a logged-in user; every /api/* request (except the health and auth endpoints)
is scoped to `session["user_id"]`.
"""

from __future__ import annotations

import os
from functools import wraps

from flask import Flask, jsonify, render_template, request, session

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

import db
import ml

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-change-me-in-production")
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    PERMANENT_SESSION_LIFETIME=60 * 60 * 24 * 30,  # 30 days
)


# ---------- Pages ----------
# Kept so the old Jinja routes still render; the React app at :5173
# ignores these in development. In production, React's /dist bundle
# should be served instead.

@app.route("/")
def overview():
    return render_template("index.html", page_id="overview", page_title="Overview")


@app.route("/transactions")
def transactions():
    return render_template(
        "transactions.html", page_id="transactions", page_title="Transactions"
    )


@app.route("/budgets")
def budgets():
    return render_template("budgets.html", page_id="budgets", page_title="Budgets")


@app.route("/predictions")
def predictions():
    return render_template(
        "predictions.html", page_id="predictions", page_title="Predictions"
    )


@app.route("/reports")
def reports():
    return render_template("reports.html", page_id="reports", page_title="Reports")


# ---------- Auth helpers ----------

def _unavailable(reason: str):
    return (
        jsonify({"ok": False, "error": "database_unavailable", "detail": reason}),
        503,
    )


def current_user_id() -> str | None:
    return session.get("user_id")


def login_required(fn):
    """Protect an API endpoint. Returns 401 if no session, or if MongoDB is down."""
    @wraps(fn)
    def wrapped(*args, **kwargs):
        ok, msg = db.ping()
        if not ok:
            return _unavailable(msg)
        uid = current_user_id()
        if not uid:
            return jsonify({"ok": False, "error": "auth_required"}), 401
        return fn(*args, **kwargs)
    return wrapped


# ---------- Auth endpoints ----------

@app.post("/api/auth/signup")
def api_signup():
    ok, msg = db.ping()
    if not ok:
        return _unavailable(msg)
    body = request.get_json(silent=True) or {}
    try:
        user = db.create_user(
            email=body.get("email", ""),
            password=body.get("password", ""),
            name=body.get("name", ""),
        )
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    # Seed the new account with the realistic 18-month demo so the ML
    # pipeline has something to work with on first visit.
    try:
        db.seed_if_empty(user["id"])
    except Exception:
        pass
    session.permanent = True
    session["user_id"] = user["id"]
    return jsonify({"ok": True, "user": user}), 201


@app.post("/api/auth/login")
def api_login():
    ok, msg = db.ping()
    if not ok:
        return _unavailable(msg)
    body = request.get_json(silent=True) or {}
    user = db.verify_user(body.get("email", ""), body.get("password", ""))
    if not user:
        return jsonify({"ok": False, "error": "Invalid email or password."}), 401
    session.permanent = True
    session["user_id"] = user["id"]
    return jsonify({"ok": True, "user": user})


@app.post("/api/auth/logout")
def api_logout():
    session.pop("user_id", None)
    return jsonify({"ok": True})


@app.get("/api/auth/me")
def api_me():
    ok, msg = db.ping()
    if not ok:
        return _unavailable(msg)
    uid = current_user_id()
    if not uid:
        return jsonify({"ok": False, "error": "auth_required"}), 401
    user = db.get_user(uid)
    if not user:
        session.pop("user_id", None)
        return jsonify({"ok": False, "error": "auth_required"}), 401
    return jsonify({"ok": True, "user": user})


# ---------- API ----------

@app.get("/api/health")
def api_health():
    ok, msg = db.ping()
    return jsonify({"ok": ok, "message": msg, "database": db.MONGODB_DB})


@app.get("/api/transactions")
@login_required
def api_list_transactions():
    return jsonify({"ok": True, "items": db.list_transactions(current_user_id())})


@app.post("/api/transactions")
@login_required
def api_create_transaction():
    body = request.get_json(silent=True) or {}
    if not body.get("id") or not body.get("description") or not body.get("date"):
        return jsonify({"ok": False, "error": "invalid_payload"}), 400
    try:
        amt = float(body.get("amount") or 0)
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "invalid_amount"}), 400
    if amt <= 0:
        return jsonify({"ok": False, "error": "invalid_amount"}), 400
    saved = db.upsert_transaction(body, current_user_id())
    return jsonify({"ok": True, "item": saved}), 201


@app.put("/api/transactions/<tx_id>")
@login_required
def api_update_transaction(tx_id: str):
    body = request.get_json(silent=True) or {}
    body["id"] = tx_id
    try:
        amt = float(body.get("amount") or 0)
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "invalid_amount"}), 400
    if amt <= 0:
        return jsonify({"ok": False, "error": "invalid_amount"}), 400
    saved = db.upsert_transaction(body, current_user_id())
    return jsonify({"ok": True, "item": saved})


@app.delete("/api/transactions/<tx_id>")
@login_required
def api_delete_transaction(tx_id: str):
    removed = db.delete_transaction(tx_id, current_user_id())
    return jsonify({"ok": True, "removed": removed})


@app.post("/api/subscriptions")
@login_required
def api_create_subscription():
    body = request.get_json(silent=True) or {}
    description = str(body.get("description", "")).strip()
    first_date = str(body.get("first_date", "")).strip()
    if not description or not first_date:
        return jsonify({"ok": False, "error": "missing description or first_date"}), 400
    try:
        amt = float(body.get("amount") or 0)
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "invalid amount"}), 400
    if amt <= 0:
        return jsonify({"ok": False, "error": "amount must be greater than zero"}), 400
    try:
        result = db.create_recurring_subscription(
            description=description,
            amount=amt,
            category=str(body.get("category") or "Other"),
            first_date=first_date,
            user_id=current_user_id(),
            payment=str(body.get("payment") or ""),
            notes=str(body.get("notes") or "Recurring"),
        )
        return jsonify({"ok": True, **result}), 201
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400


@app.get("/api/budgets")
@login_required
def api_list_budgets():
    return jsonify({"ok": True, "items": db.list_budgets(current_user_id())})


@app.get("/api/budgets/total")
@login_required
def api_get_total_budget():
    return jsonify({"ok": True, "total": db.get_total_budget(current_user_id())})


@app.post("/api/budgets/total")
@login_required
def api_set_total_budget():
    body = request.get_json(silent=True) or {}
    try:
        amt = float(body.get("amount") or 0)
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "invalid_amount"}), 400
    if amt <= 0:
        return jsonify({"ok": False, "error": "amount must be greater than zero"}), 400
    return jsonify({"ok": True, "total": db.set_total_budget(amt, current_user_id())})


@app.delete("/api/budgets/total")
@login_required
def api_delete_total_budget():
    return jsonify({"ok": True, "removed": db.delete_total_budget(current_user_id())})


@app.post("/api/budgets")
@login_required
def api_create_budget():
    body = request.get_json(silent=True) or {}
    if not body.get("id") or not body.get("category"):
        return jsonify({"ok": False, "error": "invalid_payload"}), 400
    try:
        amt = float(body.get("amount") or 0)
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "invalid_amount"}), 400
    if amt <= 0:
        return jsonify({"ok": False, "error": "invalid_amount"}), 400
    saved = db.upsert_budget(body, current_user_id())
    return jsonify({"ok": True, "item": saved}), 201


@app.put("/api/budgets/<b_id>")
@login_required
def api_update_budget(b_id: str):
    body = request.get_json(silent=True) or {}
    body["id"] = b_id
    try:
        amt = float(body.get("amount") or 0)
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "invalid_amount"}), 400
    if amt <= 0:
        return jsonify({"ok": False, "error": "invalid_amount"}), 400
    saved = db.upsert_budget(body, current_user_id())
    return jsonify({"ok": True, "item": saved})


@app.delete("/api/budgets/<b_id>")
@login_required
def api_delete_budget(b_id: str):
    removed = db.delete_budget(b_id, current_user_id())
    return jsonify({"ok": True, "removed": removed})


@app.post("/api/reset")
@login_required
def api_reset():
    return jsonify({"ok": True, **db.reset_and_seed(current_user_id())})


@app.post("/api/import")
@login_required
def api_import():
    text = ""
    dataset_name = (request.form.get("dataset_name") or "").strip()

    if "file" in request.files:
        f = request.files["file"]
        try:
            text = f.read().decode("utf-8-sig", errors="replace")
        except Exception as e:
            return jsonify({"ok": False, "error": f"could not read file: {e}"}), 400
        if not dataset_name:
            dataset_name = (f.filename or "").rsplit(".", 1)[0].strip()
    else:
        body = request.get_json(silent=True)
        if body and isinstance(body.get("csv"), str):
            text = body["csv"]
            dataset_name = dataset_name or (body.get("dataset_name") or "").strip()
        else:
            text = request.get_data(as_text=True)

    if not text.strip():
        return jsonify({"ok": False, "error": "empty payload"}), 400

    report = db.import_csv_text(text, user_id=current_user_id(), dataset_name=dataset_name or None)
    report["ok"] = True
    return jsonify(report)


@app.get("/api/datasets")
@login_required
def api_list_datasets():
    return jsonify({"ok": True, "items": db.list_datasets(current_user_id())})


# ---------- Subscriptions (list + pause/resume) ----------

@app.get("/api/subscriptions")
@login_required
def api_list_subscriptions():
    return jsonify({"ok": True, "items": db.list_subscriptions(current_user_id())})


@app.post("/api/subscriptions/<sub_id>/pause")
@login_required
def api_pause_subscription(sub_id: str):
    body = request.get_json(silent=True) or {}
    paused = bool(body.get("paused", True))
    ok = db.set_subscription_paused(sub_id, current_user_id(), paused)
    if not ok:
        return jsonify({"ok": False, "error": "not_found"}), 404
    return jsonify({"ok": True, "paused": paused})


@app.delete("/api/datasets/<ds_id>")
@login_required
def api_delete_dataset(ds_id: str):
    return jsonify({"ok": True, **db.delete_dataset(ds_id, current_user_id())})


@app.get("/api/months")
@login_required
def api_list_months():
    return jsonify({"ok": True, "items": db.list_months(current_user_id())})


@app.delete("/api/months/<month>")
@login_required
def api_delete_month(month: str):
    try:
        return jsonify({"ok": True, **db.delete_month(month, current_user_id())})
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400


# ---------- ML / Predictions ----------

@app.get("/api/predictions")
@login_required
def api_predictions():
    try:
        return jsonify({"ok": True, **ml.predictions_bundle(current_user_id())})
    except Exception as e:
        return jsonify({"ok": False, "error": f"prediction failed: {e}"}), 500


@app.post("/api/train")
@login_required
def api_train():
    try:
        ml._invalidate_classifier()
        bundle = ml.predictions_bundle(current_user_id())
        return jsonify({"ok": True, **bundle})
    except Exception as e:
        return jsonify({"ok": False, "error": f"train failed: {e}"}), 500


@app.get("/api/categorize")
@login_required
def api_categorize():
    text = (request.args.get("text") or "").strip()
    if not text:
        return jsonify({"ok": False, "error": "missing text"}), 400
    try:
        return jsonify({"ok": True, **ml.suggest_category(text, current_user_id())})
    except Exception as e:
        return jsonify({"ok": False, "error": f"categorize failed: {e}"}), 500


@app.get("/api/sample-csv")
def api_sample_csv():
    from flask import Response
    return Response(
        db.sample_csv(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=spendsense-template.csv"},
    )


# ---------- Startup ----------

def _bootstrap():
    ok, _ = db.ping()
    if ok:
        db.ensure_indexes()
        # Make sure the demo account exists and legacy data is adopted.
        db.ensure_demo_user()


_bootstrap()


if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)
