"""
SpendSense — MongoDB layer (Phase 2).

Thin wrapper around PyMongo used by the Flask API routes.
Keeps the database connection lazy so the app can boot and
report a friendly error if Mongo is unreachable.
"""

from __future__ import annotations

import os
from typing import Any, Iterable

from pymongo import MongoClient, ASCENDING
from pymongo.errors import PyMongoError

MONGODB_URI = os.environ.get("MONGODB_URI", "mongodb://localhost:27017/")
MONGODB_DB = os.environ.get("MONGODB_DB", "spendsense")

_client: MongoClient | None = None


def get_client() -> MongoClient:
    global _client
    if _client is None:
        _client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=1500)
    return _client


def get_db():
    return get_client()[MONGODB_DB]


def ping() -> tuple[bool, str]:
    """Return (healthy, message) without raising."""
    try:
        get_client().admin.command("ping")
        return True, "Connected"
    except PyMongoError as e:
        return False, str(e)
    except Exception as e:
        return False, str(e)


# ---------- Collections ----------

def transactions_col():
    return get_db()["transactions"]


def budgets_col():
    return get_db()["budgets"]


def datasets_col():
    return get_db()["datasets"]


def users_col():
    return get_db()["users"]


def ensure_indexes() -> None:
    try:
        # Drop stale pre-auth indexes that were created as unique on a single
        # field — they conflict with the multi-user model where many users
        # legitimately share a category name or a '__total__' marker.
        for stale in ("category_1", "user_id_1_category_1"):
            try:
                existing = budgets_col().index_information()
                if stale in existing and existing[stale].get("unique"):
                    budgets_col().drop_index(stale)
            except PyMongoError:
                pass

        transactions_col().create_index([("user_id", ASCENDING), ("date", ASCENDING)])
        transactions_col().create_index([("category", ASCENDING)])
        transactions_col().create_index([("import_id", ASCENDING)])
        # NOT unique — different users can both have a "Food" sub-budget.
        budgets_col().create_index([("user_id", ASCENDING), ("category", ASCENDING)])
        datasets_col().create_index([("imported_at", ASCENDING)])
        users_col().create_index([("email", ASCENDING)], unique=True)
    except PyMongoError:
        # Index creation is best-effort — we don't crash the server if Mongo is down.
        pass


# ---------- Users ----------

from werkzeug.security import generate_password_hash, check_password_hash
import secrets as _user_secrets
import datetime as _user_dt


def create_user(email: str, password: str, name: str = "") -> dict:
    """Create a new user. Raises ValueError on invalid input or duplicate email."""
    email = (email or "").strip().lower()
    password = password or ""
    name = (name or "").strip()
    if not email or "@" not in email:
        raise ValueError("Please enter a valid email address.")
    if len(password) < 6:
        raise ValueError("Password must be at least 6 characters.")
    if users_col().find_one({"email": email}):
        raise ValueError("An account with this email already exists.")
    uid = "u_" + _user_secrets.token_hex(6)
    doc = {
        "_id": uid,
        "email": email,
        "name": name or email.split("@")[0],
        "password_hash": generate_password_hash(password),
        "created_at": _user_dt.datetime.utcnow().isoformat(),
    }
    users_col().insert_one(doc)
    return {"id": uid, "email": email, "name": doc["name"]}


def verify_user(email: str, password: str) -> dict | None:
    """Return a safe user dict if the email+password match, else None."""
    email = (email or "").strip().lower()
    if not email or not password:
        return None
    doc = users_col().find_one({"email": email})
    if not doc:
        return None
    if not check_password_hash(doc.get("password_hash", ""), password):
        return None
    return {"id": doc["_id"], "email": doc["email"], "name": doc.get("name", "")}


def get_user(user_id: str) -> dict | None:
    if not user_id:
        return None
    doc = users_col().find_one({"_id": user_id})
    if not doc:
        return None
    return {"id": doc["_id"], "email": doc["email"], "name": doc.get("name", "")}


def ensure_demo_user() -> str:
    """Make sure the demo account exists and own the legacy unowned rows.
    Returns the demo user's id."""
    demo = users_col().find_one({"email": "demo@spendsense.local"})
    if not demo:
        demo_id = "u_demo000000000000"
        users_col().insert_one({
            "_id": demo_id,
            "email": "demo@spendsense.local",
            "name": "Demo account",
            "password_hash": generate_password_hash("demo1234"),
            "created_at": _user_dt.datetime.utcnow().isoformat(),
        })
    else:
        demo_id = demo["_id"]
    # Adopt every legacy row that has no owner.
    try:
        transactions_col().update_many({"user_id": {"$exists": False}}, {"$set": {"user_id": demo_id}})
        budgets_col().update_many({"user_id": {"$exists": False}}, {"$set": {"user_id": demo_id}})
    except PyMongoError:
        pass
    return demo_id


# ---------- CRUD helpers ----------

def _strip_id(doc: dict) -> dict:
    if doc is None:
        return doc
    doc = dict(doc)
    # We store our own string ids as `_id`, so just expose it as `id`.
    if "_id" in doc:
        doc["id"] = doc.pop("_id")
    return doc


def list_transactions(user_id: str) -> list[dict]:
    return [_strip_id(d) for d in transactions_col().find({"user_id": user_id}).sort("date", -1)]


def upsert_transaction(doc: dict, user_id: str) -> dict:
    _id = doc.get("id") or doc.get("_id")
    if not _id:
        raise ValueError("transaction requires an id")
    payload = {
        "_id": _id,
        "user_id": user_id,
        "description": str(doc.get("description", "")).strip(),
        "amount": float(doc.get("amount") or 0),
        "category": str(doc.get("category", "Other")),
        "date": str(doc.get("date", "")),
        "payment": str(doc.get("payment", "")),
        "notes": str(doc.get("notes", "") or ""),
    }
    if doc.get("import_id"):
        payload["import_id"] = str(doc["import_id"])
    if doc.get("imported_at"):
        payload["imported_at"] = str(doc["imported_at"])
    transactions_col().replace_one({"_id": _id, "user_id": user_id}, payload, upsert=True)
    return _strip_id(payload)


def delete_transaction(tx_id: str, user_id: str) -> bool:
    res = transactions_col().delete_one({"_id": tx_id, "user_id": user_id})
    return res.deleted_count > 0


def create_recurring_subscription(
    description: str,
    amount: float,
    category: str,
    first_date: str,
    user_id: str,
    payment: str = "",
    notes: str = "Recurring subscription",
) -> dict:
    """
    Insert one transaction per month from first_date up to today.
    Each row carries notes='Recurring' (default) so every downstream
    detector (Overview Upcoming card, Suggested cuts, Recurring+Variable
    forecast split) picks it up immediately.
    """
    import datetime as _dt
    import calendar as _cal
    import secrets as _secrets

    try:
        start = _dt.date.fromisoformat(first_date)
    except ValueError:
        raise ValueError(f"invalid first_date: {first_date!r}")

    today = _dt.date.today()
    if start > today:
        raise ValueError("first_date is in the future — nothing to generate yet")

    import_id = "sub_" + _secrets.token_hex(5)
    imported_at = _dt.datetime.now().replace(microsecond=0).isoformat()

    created_ids: list[str] = []
    last_created_date: _dt.date | None = None
    current = start
    while current <= today:
        _id = f"t_{_secrets.token_hex(5)}"
        transactions_col().replace_one(
            {"_id": _id},
            {
                "_id": _id,
                "user_id": user_id,
                "description": str(description),
                "amount": float(amount),
                "category": str(category or "Other"),
                "date": current.isoformat(),
                "payment": str(payment or ""),
                "notes": str(notes or "Recurring"),
                "import_id": import_id,
                "imported_at": imported_at,
            },
            upsert=True,
        )
        created_ids.append(_id)
        last_created_date = current

        # Advance one calendar month, clamping to end-of-month if needed
        next_year = current.year
        next_month = current.month + 1
        if next_month > 12:
            next_month = 1
            next_year += 1
        max_day = _cal.monthrange(next_year, next_month)[1]
        day = min(start.day, max_day)
        current = _dt.date(next_year, next_month, day)

    # Register this as a tiny dataset so it can be deleted as a batch
    try:
        datasets_col().replace_one(
            {"_id": import_id},
            {
                "_id": import_id,
                "user_id": user_id,
                "name": f"Subscription: {description}",
                "imported_at": imported_at,
                "source": "subscription",
            },
            upsert=True,
        )
    except PyMongoError:
        pass

    return {
        "import_id": import_id,
        "created": len(created_ids),
        "first_date": start.isoformat(),
        "last_date": last_created_date.isoformat() if last_created_date else None,
        "next_due": current.isoformat() if last_created_date else None,
    }


TOTAL_BUDGET_ID = "b_total"


def _total_budget_id(user_id: str) -> str:
    return f"{TOTAL_BUDGET_ID}__{user_id}"


def list_budgets(user_id: str, include_total: bool = False) -> list[dict]:
    """Return category sub-budgets. The master total is excluded by default.
    Filters out both the new per-user total (_id = b_total__<uid>) and any
    legacy total rows left from pre-auth builds (category = '__total__')."""
    q = {"user_id": user_id}
    if not include_total:
        q["_id"] = {"$ne": _total_budget_id(user_id)}
        q["category"] = {"$ne": "__total__"}
    return [_strip_id(d) for d in budgets_col().find(q).sort("category", 1)]


def get_total_budget(user_id: str) -> dict | None:
    """Return the master monthly budget doc, or None if not set."""
    doc = budgets_col().find_one({"_id": _total_budget_id(user_id), "user_id": user_id})
    return _strip_id(doc) if doc else None


def set_total_budget(amount: float, user_id: str) -> dict:
    """Create or update the master monthly budget."""
    tid = _total_budget_id(user_id)
    payload = {
        "_id": tid,
        "user_id": user_id,
        "category": "__total__",
        "amount": float(amount),
    }
    budgets_col().replace_one({"_id": tid}, payload, upsert=True)
    return _strip_id(payload)


def delete_total_budget(user_id: str) -> bool:
    res = budgets_col().delete_one({"_id": _total_budget_id(user_id), "user_id": user_id})
    return res.deleted_count > 0


def upsert_budget(doc: dict, user_id: str) -> dict:
    _id = doc.get("id") or doc.get("_id")
    if not _id:
        raise ValueError("budget requires an id")
    payload = {
        "_id": _id,
        "user_id": user_id,
        "category": str(doc.get("category", "Other")),
        "amount": float(doc.get("amount") or 0),
    }
    budgets_col().replace_one({"_id": _id, "user_id": user_id}, payload, upsert=True)
    return _strip_id(payload)


def delete_budget(b_id: str, user_id: str) -> bool:
    res = budgets_col().delete_one({"_id": b_id, "user_id": user_id})
    return res.deleted_count > 0


# ---------- Seed ----------

def _seed_data() -> tuple[list[dict], list[dict]]:
    """Illustrative sample so a fresh database is useful on first visit.

    Spreads across the last 6 months so the Phase-3 forecast models
    (which need ≥3 months) have real signal to learn from.
    """
    import datetime as dt
    import secrets

    today = dt.date.today()

    def uid(prefix: str) -> str:
        return f"{prefix}_{secrets.token_hex(5)}"

    def days(n: int) -> str:
        return (today - dt.timedelta(days=n)).isoformat()

    # (description, amount, category, payment, notes, days_ago)
    samples: list[tuple] = [
        # ---- Current month (last ~30 days) — fullest, so pacing + forecast are real
        ("Campus canteen lunch", 180, "Food", "UPI", "", 0),
        ("Metro card top-up", 500, "Transport", "UPI", "Weekly commute", 1),
        ("Netflix subscription", 199, "Entertainment", "Credit card", "Recurring", 2),
        ("Groceries", 1240, "Food", "Debit card", "", 3),
        ("Coursera course", 2499, "Education", "Credit card", "", 5),
        ("Pharmacy", 320, "Health", "Cash", "", 6),
        ("Shoes", 2199, "Shopping", "Credit card", "", 7),
        ("Electricity bill", 1450, "Bills", "Net banking", "", 9),
        ("Coffee with friend", 240, "Food", "UPI", "", 10),
        ("Movie night", 420, "Entertainment", "UPI", "", 11),
        ("Auto rickshaw", 120, "Transport", "Cash", "", 12),
        ("Internet bill", 799, "Bills", "UPI", "", 14),
        ("Stationery", 160, "Education", "UPI", "", 15),
        ("Lunch out", 380, "Food", "UPI", "", 17),
        ("Phone recharge", 299, "Bills", "UPI", "Recurring", 19),
        ("Spotify subscription", 119, "Entertainment", "Credit card", "Recurring", 21),
        ("T-shirt", 699, "Shopping", "Debit card", "", 24),
        ("Gym pass", 999, "Health", "UPI", "", 28),

        # ---- ~1 month ago
        ("Last month groceries", 1180, "Food", "Debit card", "", 35),
        ("Fuel", 2100, "Transport", "Credit card", "", 38),
        ("Streaming bundle", 349, "Entertainment", "Credit card", "", 40),
        ("Textbooks", 1699, "Education", "UPI", "", 43),
        ("Winter jacket", 2499, "Shopping", "Credit card", "", 46),
        ("Water bill", 320, "Bills", "UPI", "", 48),
        ("Clinic visit", 500, "Health", "Cash", "", 52),
        ("Metro recharge", 500, "Transport", "UPI", "", 55),
        ("Weekend dinner", 820, "Food", "UPI", "", 58),

        # ---- ~2 months ago
        ("Birthday gift", 1800, "Shopping", "Credit card", "", 65),
        ("Festival sweets", 450, "Food", "Cash", "", 68),
        ("Mobile data plan", 299, "Bills", "UPI", "", 71),
        ("Concert tickets", 1500, "Entertainment", "Credit card", "", 74),
        ("Lab supplies", 420, "Education", "UPI", "", 78),
        ("Ola ride", 240, "Transport", "UPI", "", 82),
        ("Groceries", 1340, "Food", "Debit card", "", 86),
        ("Pharmacy refill", 260, "Health", "Cash", "", 89),

        # ---- ~3 months ago
        ("Rent split", 4500, "Bills", "Net banking", "Shared", 95),
        ("Dinner outing", 980, "Food", "UPI", "", 98),
        ("Gym top-up", 999, "Health", "UPI", "", 101),
        ("Bus pass", 350, "Transport", "Cash", "", 105),
        ("Online course", 1899, "Education", "Credit card", "", 109),
        ("New headphones", 1799, "Shopping", "Credit card", "", 113),
        ("Movie night", 400, "Entertainment", "UPI", "", 118),

        # ---- ~4 months ago
        ("Groceries", 1080, "Food", "Debit card", "", 125),
        ("Metro card", 500, "Transport", "UPI", "", 128),
        ("Spotify", 119, "Entertainment", "Credit card", "", 131),
        ("Lab materials", 320, "Education", "UPI", "", 135),
        ("Fuel", 1950, "Transport", "Credit card", "", 139),
        ("Clothing", 1250, "Shopping", "Debit card", "", 143),
        ("Pharmacy", 180, "Health", "Cash", "", 148),

        # ---- ~5 months ago
        ("Groceries", 1020, "Food", "Debit card", "", 155),
        ("Dinner with family", 1600, "Food", "Credit card", "", 160),
        ("Prime subscription", 1499, "Entertainment", "Credit card", "Annual", 164),
        ("Bus fare", 90, "Transport", "Cash", "", 170),
        ("Books", 820, "Education", "UPI", "", 175),
        ("Gym pass", 999, "Health", "UPI", "", 178),
    ]

    tx = [
        {
            "_id": uid("t"),
            "description": d,
            "amount": float(a),
            "category": c,
            "payment": p,
            "notes": n,
            "date": days(off),
        }
        for d, a, c, p, n, off in samples
    ]

    budget_targets = [
        ("Food", 4000),
        ("Transport", 1500),
        ("Entertainment", 1500),
        ("Bills", 3500),
        ("Shopping", 2500),
        ("Education", 3000),
    ]
    budgets = [{"_id": uid("b"), "category": c, "amount": float(a)} for c, a in budget_targets]
    return tx, budgets


def seed_if_empty(user_id: str) -> dict:
    """Insert the demo set only if this user has no data yet."""
    result = {"transactions_inserted": 0, "budgets_inserted": 0}
    try:
        if transactions_col().count_documents({"user_id": user_id}) == 0:
            tx, _ = _seed_data()
            for t in tx:
                t["user_id"] = user_id
            transactions_col().insert_many(tx)
            result["transactions_inserted"] = len(tx)
        if budgets_col().count_documents({"user_id": user_id, "_id": {"$ne": _total_budget_id(user_id)}}) == 0:
            _, budgets = _seed_data()
            for b in budgets:
                b["user_id"] = user_id
            budgets_col().insert_many(budgets)
            result["budgets_inserted"] = len(budgets)
    except PyMongoError:
        pass
    return result


def reset_and_seed(user_id: str) -> dict:
    """Drop this user's data and insert a fresh demo set."""
    tx, budgets = _seed_data()
    for t in tx: t["user_id"] = user_id
    for b in budgets: b["user_id"] = user_id
    transactions_col().delete_many({"user_id": user_id})
    budgets_col().delete_many({"user_id": user_id})
    transactions_col().insert_many(tx)
    budgets_col().insert_many(budgets)
    return {"transactions_inserted": len(tx), "budgets_inserted": len(budgets)}


# ---------- CSV import ----------

import csv as _csv
import datetime as _dt
import io as _io
import re as _re
import secrets as _secrets


_COLUMN_ALIASES = {
    "description": {"description", "desc", "memo", "name", "title", "narration", "details", "merchant"},
    "amount": {"amount", "value", "price", "cost", "debit", "spent", "paid"},
    "category": {"category", "cat", "type", "tag"},
    "date": {"date", "when", "timestamp", "datetime", "txn_date", "transaction date"},
    "payment": {"payment", "method", "payment_method", "payment method", "mode", "channel"},
    "notes": {"notes", "note", "comment", "comments", "remark", "remarks"},
}


_KNOWN_CATEGORIES = {
    "food", "transport", "shopping", "entertainment", "bills",
    "education", "health", "other",
}


def _map_headers(fieldnames: list[str]) -> dict[str, str]:
    """Return {canonical_name: original_header}."""
    out: dict[str, str] = {}
    for h in fieldnames or []:
        key = (h or "").strip().lower()
        for canonical, aliases in _COLUMN_ALIASES.items():
            if canonical in out:
                continue
            if key in aliases:
                out[canonical] = h
                break
    return out


def _parse_date(s: str) -> str | None:
    s = (s or "").strip()
    if not s:
        return None
    s = s.split("T")[0].split(" ")[0]  # strip time if present
    patterns = ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y", "%d.%m.%Y", "%Y/%m/%d")
    for p in patterns:
        try:
            return _dt.datetime.strptime(s, p).date().isoformat()
        except ValueError:
            continue
    return None


_AMOUNT_CLEANER = _re.compile(r"[^\d\.\-]")


def _parse_amount(s) -> float | None:
    if s is None:
        return None
    txt = _AMOUNT_CLEANER.sub("", str(s))
    if not txt or txt in ("-", "."):
        return None
    try:
        return abs(float(txt))
    except ValueError:
        return None


def _normalize_category(s: str) -> str:
    s = (s or "").strip()
    if not s:
        return "Other"
    low = s.lower()
    if low in _KNOWN_CATEGORIES:
        return low.capitalize() if low != "other" else "Other"
    return s.strip()[:40]  # keep whatever the user supplied, trimmed


def import_csv_text(text: str, user_id: str, max_rows: int = 5000, dataset_name: str | None = None) -> dict:
    """Parse a CSV string and upsert each valid row. Returns a report.

    Tags every inserted row with an `import_id` so the whole batch can be
    listed on the Datasets panel and deleted as one.
    """
    import_id = "imp_" + _secrets.token_hex(5)
    imported_at = _dt.datetime.now().replace(microsecond=0).isoformat()
    name = (dataset_name or "").strip() or f"Imported {imported_at.replace('T', ' ')}"

    report = {
        "inserted": 0,
        "updated": 0,
        "skipped": 0,
        "errors": [],
        "total_rows": 0,
        "import_id": import_id,
        "dataset_name": name,
    }

    # Strip BOM if present
    if text.startswith("﻿"):
        text = text.lstrip("﻿")

    try:
        reader = _csv.DictReader(_io.StringIO(text))
    except Exception as e:
        report["errors"].append({"row": 0, "reason": f"could not parse CSV: {e}"})
        return report

    headers = _map_headers(reader.fieldnames or [])
    missing = [k for k in ("description", "amount", "date") if k not in headers]
    if missing:
        report["errors"].append(
            {"row": 0, "reason": f"missing required column(s): {', '.join(missing)}"}
        )
        return report

    for idx, row in enumerate(reader, start=2):  # row 1 is the header
        report["total_rows"] += 1
        if report["inserted"] + report["updated"] >= max_rows:
            report["errors"].append({"row": idx, "reason": f"row limit {max_rows} reached"})
            break

        desc = (row.get(headers["description"]) or "").strip()
        amt = _parse_amount(row.get(headers["amount"]))
        date = _parse_date(row.get(headers["date"]))

        if not desc or amt is None or amt <= 0 or not date:
            report["skipped"] += 1
            report["errors"].append({
                "row": idx,
                "reason": (
                    "missing/invalid " +
                    ", ".join(filter(None, [
                        "description" if not desc else "",
                        "amount" if (amt is None or amt <= 0) else "",
                        "date" if not date else "",
                    ]))
                ).strip(),
            })
            continue

        payload = {
            "id": "t_" + _secrets.token_hex(5),
            "description": desc[:120],
            "amount": amt,
            "category": _normalize_category(
                row.get(headers["category"], "") if "category" in headers else ""
            ),
            "date": date,
            "payment": (row.get(headers["payment"], "") if "payment" in headers else "").strip()[:40],
            "notes": (row.get(headers["notes"], "") if "notes" in headers else "").strip()[:240],
            "import_id": import_id,
            "imported_at": imported_at,
        }
        try:
            upsert_transaction(payload, user_id)
            report["inserted"] += 1
        except Exception as e:
            report["skipped"] += 1
            report["errors"].append({"row": idx, "reason": str(e)})

    # Cap error list so a bad file doesn't explode the response
    if len(report["errors"]) > 50:
        extra = len(report["errors"]) - 50
        report["errors"] = report["errors"][:50]
        report["errors"].append({"row": 0, "reason": f"...and {extra} more"})

    # Record the dataset itself if anything landed, so the UI can list and delete it
    if report["inserted"] > 0:
        try:
            datasets_col().replace_one(
                {"_id": import_id},
                {
                    "_id": import_id,
                    "user_id": user_id,
                    "name": name[:80],
                    "imported_at": imported_at,
                    "source": "csv",
                },
                upsert=True,
            )
        except PyMongoError:
            pass

    return report


# ---------- Datasets & months ----------

def list_datasets(user_id: str) -> list[dict]:
    """Return every CSV import batch with its live transaction stats."""
    pipeline = [
        {"$match": {"user_id": user_id}},
        {
            "$group": {
                "_id": "$import_id",
                "count": {"$sum": 1},
                "total": {"$sum": "$amount"},
                "first_date": {"$min": "$date"},
                "last_date": {"$max": "$date"},
            }
        },
        {"$match": {"_id": {"$ne": None}}},
    ]
    stats = {}
    try:
        for row in transactions_col().aggregate(pipeline):
            stats[row["_id"]] = row
    except PyMongoError:
        return []

    out: list[dict] = []
    try:
        for d in datasets_col().find({"user_id": user_id}).sort("imported_at", -1):
            info = stats.pop(d["_id"], None)
            out.append({
                "id": d["_id"],
                "name": d.get("name", d["_id"]),
                "imported_at": d.get("imported_at", ""),
                "source": d.get("source", "csv"),
                "count": (info or {}).get("count", 0),
                "total": float((info or {}).get("total", 0.0)),
                "first_date": (info or {}).get("first_date", ""),
                "last_date": (info or {}).get("last_date", ""),
            })
    except PyMongoError:
        pass

    # Also surface imports whose dataset doc was lost but whose rows survive
    for import_id, info in stats.items():
        out.append({
            "id": import_id,
            "name": import_id,
            "imported_at": "",
            "source": "csv",
            "count": info.get("count", 0),
            "total": float(info.get("total", 0.0)),
            "first_date": info.get("first_date", ""),
            "last_date": info.get("last_date", ""),
        })
    return out


def delete_dataset(import_id: str, user_id: str) -> dict:
    """Delete every transaction tagged with this import batch, and the batch itself."""
    tx_removed = transactions_col().delete_many({"import_id": import_id, "user_id": user_id}).deleted_count
    try:
        datasets_col().delete_one({"_id": import_id, "user_id": user_id})
    except PyMongoError:
        pass
    return {"removed_transactions": int(tx_removed)}


# ---------- Recurring subscriptions (views + pause/resume) ----------

def list_subscriptions(user_id: str) -> list[dict]:
    """Return every subscription dataset for this user with aggregated stats
    + a computed next_due date. Treats 'subscription' source in the datasets
    collection as the source of truth for what is a subscription."""
    import datetime as _dt
    import calendar as _cal

    out: list[dict] = []
    try:
        for d in datasets_col().find(
            {"user_id": user_id, "source": "subscription"}
        ).sort("imported_at", -1):
            sub_id = d["_id"]
            rows = list(
                transactions_col()
                .find({"import_id": sub_id, "user_id": user_id})
                .sort("date", 1)
            )
            if not rows:
                continue
            amt = float(rows[0].get("amount", 0))
            dates = [r["date"] for r in rows if r.get("date")]
            first_date = min(dates) if dates else ""
            last_date = max(dates) if dates else ""

            next_due = None
            if last_date and not d.get("paused"):
                try:
                    last = _dt.date.fromisoformat(last_date)
                    y = last.year
                    m = last.month + 1
                    if m > 12:
                        m = 1; y += 1
                    day = min(last.day, _cal.monthrange(y, m)[1])
                    next_due = _dt.date(y, m, day).isoformat()
                except ValueError:
                    pass

            display_name = d.get("name", "")
            if display_name.startswith("Subscription: "):
                display_name = display_name[len("Subscription: "):]

            out.append({
                "id": sub_id,
                "name": display_name or rows[0].get("description", sub_id),
                "description": rows[0].get("description", ""),
                "amount": amt,
                "category": rows[0].get("category", "Other"),
                "payment": rows[0].get("payment", ""),
                "notes": rows[0].get("notes", ""),
                "count": len(rows),
                "total_paid": sum(float(r.get("amount", 0)) for r in rows),
                "first_date": first_date,
                "last_date": last_date,
                "next_due": next_due,
                "paused": bool(d.get("paused", False)),
                "imported_at": d.get("imported_at", ""),
                "history": [
                    {"date": r.get("date", ""), "amount": float(r.get("amount", 0))}
                    for r in sorted(rows, key=lambda r: r.get("date", ""), reverse=True)
                ],
            })
    except PyMongoError:
        pass
    return out


def set_subscription_paused(sub_id: str, user_id: str, paused: bool) -> bool:
    """Toggle the 'paused' flag on a subscription dataset. The existing
    transactions stay as they are — pausing just stops the UI from showing
    a next expected charge."""
    try:
        res = datasets_col().update_one(
            {"_id": sub_id, "user_id": user_id, "source": "subscription"},
            {"$set": {"paused": bool(paused)}},
        )
        return res.matched_count > 0
    except PyMongoError:
        return False


def list_months(user_id: str) -> list[dict]:
    """Return distinct months (YYYY-MM) that have transactions, newest first."""
    pipeline = [
        {"$match": {"user_id": user_id}},
        {
            "$group": {
                "_id": {"$substrCP": ["$date", 0, 7]},
                "count": {"$sum": 1},
                "total": {"$sum": "$amount"},
            }
        },
        {"$match": {"_id": {"$ne": ""}}},
        {"$sort": {"_id": -1}},
    ]
    try:
        return [
            {"month": r["_id"], "count": int(r["count"]), "total": float(r["total"])}
            for r in transactions_col().aggregate(pipeline)
            if r.get("_id")
        ]
    except PyMongoError:
        return []


def delete_month(month: str, user_id: str) -> dict:
    """Delete every transaction whose date starts with the given YYYY-MM prefix."""
    if not month or len(month) != 7 or month[4] != "-":
        raise ValueError("month must look like YYYY-MM")
    res = transactions_col().delete_many({"date": {"$regex": f"^{month}-"}, "user_id": user_id})
    return {"removed_transactions": int(res.deleted_count)}


def sample_csv() -> str:
    """A tiny template users can download, fill in and re-upload."""
    rows = [
        ["description", "amount", "category", "date", "payment", "notes"],
        ["Campus canteen lunch", "180", "Food", "2026-10-28", "UPI", ""],
        ["Metro card top-up", "500", "Transport", "2026-10-27", "UPI", "Weekly commute"],
        ["Groceries", "1240", "Food", "2026-10-25", "Debit card", ""],
    ]
    buf = _io.StringIO()
    writer = _csv.writer(buf)
    writer.writerows(rows)
    return buf.getvalue()
