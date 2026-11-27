"""
SpendSense — ML layer (Phase 3, v2).

What this module does, in one paragraph:
    - Aggregates every transaction into monthly totals (overall + per category).
    - Trains three competing forecasts (LinearRegression, Ridge, 3-month moving
      average), scores them with WALK-FORWARD validation on the user's own
      history, and reports the winner — not the prettiest in-sample fit.
    - Produces a next-month prediction interval using the walk-forward residual
      spread, so a confidence band is actually honest.
    - Trains BOTH a MultinomialNB and a LogisticRegression text classifier,
      cross-validates both, keeps the better one, and reports per-class
      precision / recall / F1.
    - Scores budget-overrun risk from a blend of linear pacing and historical
      mean, pushed through a logistic function on the standardised gap.

Every public function hands back an EXPLANATION array of step-by-step entries
    [{"label": "...", "value": "...", "note": "..."}]
so the UI can show the user exactly how a number was arrived at — using the
user's own numbers, not a textbook example.
"""

from __future__ import annotations

import calendar as _calendar
import datetime as _dt
import math as _math
from collections import defaultdict as _dd

import numpy as _np
from sklearn.feature_extraction.text import TfidfVectorizer as _Tfidf
from sklearn.linear_model import LinearRegression as _LR
from sklearn.linear_model import LogisticRegression as _LogReg
from sklearn.linear_model import Ridge as _Ridge
from sklearn.metrics import classification_report as _clf_report
from sklearn.model_selection import cross_val_score as _cvs
from sklearn.naive_bayes import MultinomialNB as _NB

import db as _db


MIN_MONTHS_FOR_REGRESSION = 3
MIN_ROWS_FOR_CLASSIFIER = 10
WALK_FORWARD_MIN_TRAIN = 3   # need at least 3 months to fit before scoring
MIN_MONTHS_FOR_SEASONAL = 6  # need enough points for the sine/cosine features
RECURRING_MIN_OCCURRENCES = 3  # same (desc, amount) in >=3 months → treated as recurring


# ---------- Shared helpers ----------

def _month_key(iso: str) -> str:
    return (iso or "")[:7]


def _next_month(key: str) -> str:
    y, m = (int(x) for x in key.split("-"))
    first_of_next = _dt.date(y, m, 1) + _dt.timedelta(days=32)
    first_of_next = first_of_next.replace(day=1)
    return f"{first_of_next.year:04d}-{first_of_next.month:02d}"


def _this_month(today: _dt.date | None = None) -> str:
    today = today or _dt.date.today()
    return f"{today.year:04d}-{today.month:02d}"


def _fmt_inr(amount: float) -> str:
    try:
        return f"₹{round(float(amount)):,}"
    except Exception:
        return str(amount)


def _monthly_totals(tx: list[dict]) -> dict[str, float]:
    out: dict[str, float] = _dd(float)
    for t in tx:
        mk = _month_key(t.get("date"))
        if mk:
            out[mk] += float(t.get("amount") or 0)
    return dict(out)


def _monthly_by_category(tx: list[dict]) -> dict[str, dict[str, float]]:
    out: dict[str, dict[str, float]] = _dd(lambda: _dd(float))
    for t in tx:
        mk = _month_key(t.get("date"))
        cat = (t.get("category") or "Other").strip() or "Other"
        if mk:
            out[cat][mk] += float(t.get("amount") or 0)
    return {k: dict(v) for k, v in out.items()}


# ---------- Model implementations ----------

def _predict_linear(y: _np.ndarray, next_x: int) -> tuple[float, dict]:
    X = _np.arange(len(y), dtype=float).reshape(-1, 1)
    model = _LR().fit(X, y)
    pred = float(model.predict(_np.array([[next_x]], dtype=float))[0])
    return max(0.0, pred), {"slope": float(model.coef_[0]), "intercept": float(model.intercept_)}


def _predict_ridge(y: _np.ndarray, next_x: int) -> tuple[float, dict]:
    X = _np.arange(len(y), dtype=float).reshape(-1, 1)
    model = _Ridge(alpha=1.0).fit(X, y)
    pred = float(model.predict(_np.array([[next_x]], dtype=float))[0])
    return max(0.0, pred), {"slope": float(model.coef_[0]), "intercept": float(model.intercept_)}


def _predict_moving_avg(y: _np.ndarray, next_x: int, window: int = 3) -> tuple[float, dict]:
    w = min(window, len(y))
    pred = float(_np.mean(y[-w:]))
    return max(0.0, pred), {"window": int(w)}


def _predict_holt_winters(y: _np.ndarray, next_x: int) -> tuple[float, dict]:
    """
    Holt's exponential smoothing (level + trend). Industry baseline for
    short univariate time series — robust, no training-data assumptions.
    """
    try:
        from statsmodels.tsa.holtwinters import ExponentialSmoothing
    except Exception:
        return _predict_moving_avg(y, next_x)
    if len(y) < 4:
        return _predict_moving_avg(y, next_x)
    try:
        model = ExponentialSmoothing(y, trend="add", seasonal=None, initialization_method="estimated")
        fit = model.fit(optimized=True)
        pred = float(fit.forecast(1)[0])
        return max(0.0, pred), {"alpha": float(fit.params.get("smoothing_level", 0.0)),
                                "beta": float(fit.params.get("smoothing_trend", 0.0))}
    except Exception:
        return _predict_moving_avg(y, next_x)


def _predict_holt_winters_seasonal(y: _np.ndarray, next_x: int) -> tuple[float, dict]:
    """Holt-Winters with a 12-month seasonal cycle — needs ≥24 months to be meaningful."""
    try:
        from statsmodels.tsa.holtwinters import ExponentialSmoothing
    except Exception:
        return _predict_moving_avg(y, next_x)
    if len(y) < 24:
        return _predict_holt_winters(y, next_x)
    try:
        model = ExponentialSmoothing(y, trend="add", seasonal="add", seasonal_periods=12,
                                     initialization_method="estimated")
        fit = model.fit(optimized=True)
        pred = float(fit.forecast(1)[0])
        return max(0.0, pred), {}
    except Exception:
        return _predict_holt_winters(y, next_x)


def _seasonal_features(x_indices: _np.ndarray, start_month: int) -> _np.ndarray:
    """
    Build features [month_index, sin(2π*m/12), cos(2π*m/12)] so a linear model
    can learn a 12-month seasonal pattern plus a long-term trend.
    """
    months_in_year = ((start_month - 1 + x_indices) % 12)
    sin_feat = _np.sin(2 * _np.pi * months_in_year / 12.0)
    cos_feat = _np.cos(2 * _np.pi * months_in_year / 12.0)
    return _np.column_stack([x_indices, sin_feat, cos_feat])


def _make_seasonal_predictor(start_month: int):
    """Return a predictor fn capturing the start_month in closure."""
    def _predict(y: _np.ndarray, next_x: int) -> tuple[float, dict]:
        if len(y) < MIN_MONTHS_FOR_SEASONAL:
            # Not enough history for seasonality — fall back to a plain line.
            return _predict_linear(y, next_x)
        X = _seasonal_features(_np.arange(len(y)), start_month)
        y_arr = y
        model = _Ridge(alpha=1.0).fit(X, y_arr)
        Xp = _seasonal_features(_np.array([next_x]), start_month)
        pred = float(model.predict(Xp)[0])
        return max(0.0, pred), {
            "trend_coef": float(model.coef_[0]),
            "seasonal_coef_sin": float(model.coef_[1]),
            "seasonal_coef_cos": float(model.coef_[2]),
        }
    return _predict


# The list of models is built dynamically per-call because seasonal and ensemble
# predictors need the surrounding context (start month, other models).


# ---------- Recurring / variable split ----------

def _detect_recurring_fingerprints(tx: list[dict]) -> set[tuple]:
    """
    A (description, rounded_amount) pair that shows up in RECURRING_MIN_OCCURRENCES
    or more distinct months is treated as recurring (rent, subs, bills, gym etc.).
    Returns the set of fingerprints — any transaction matching one is "recurring".
    """
    buckets: dict[tuple, set[str]] = _dd(set)
    for t in tx:
        mk = _month_key(t.get("date"))
        if not mk:
            continue
        desc = str(t.get("description") or "").strip().lower()
        if not desc:
            continue
        amt = round(float(t.get("amount") or 0), 0)
        buckets[(desc, amt)].add(mk)
    return {fp for fp, months in buckets.items() if len(months) >= RECURRING_MIN_OCCURRENCES}


def _split_monthly(tx: list[dict]) -> tuple[dict[str, float], dict[str, float], float]:
    """
    Returns (monthly_recurring, monthly_variable, recurring_next_month_estimate).

    The recurring estimate for the upcoming month = average per-month total of the
    recurring charges across the months where any recurring charge appeared.
    """
    recurring_fps = _detect_recurring_fingerprints(tx)
    rec_monthly: dict[str, float] = _dd(float)
    var_monthly: dict[str, float] = _dd(float)
    for t in tx:
        mk = _month_key(t.get("date"))
        if not mk:
            continue
        desc = str(t.get("description") or "").strip().lower()
        amt = round(float(t.get("amount") or 0), 0)
        if (desc, amt) in recurring_fps:
            rec_monthly[mk] += float(t.get("amount") or 0)
        else:
            var_monthly[mk] += float(t.get("amount") or 0)

    # Project next-month recurring as the average of recent months' recurring totals.
    rec_vals = list(rec_monthly.values())
    if rec_vals:
        rec_estimate = float(sum(rec_vals[-3:]) / min(3, len(rec_vals)))
    else:
        rec_estimate = 0.0

    return dict(rec_monthly), dict(var_monthly), rec_estimate


# ---------- Walk-forward validation ----------

def _walk_forward(y: _np.ndarray, model_fn) -> list[tuple[int, float, float]]:
    """
    Returns [(month_index, actual, predicted)] for each holdout step.
    Trains on y[:i] and predicts y[i], for i from WALK_FORWARD_MIN_TRAIN..len(y)-1.
    """
    records = []
    for i in range(WALK_FORWARD_MIN_TRAIN, len(y)):
        train = y[:i]
        actual = float(y[i])
        pred, _ = model_fn(train, next_x=i)
        records.append((i, actual, pred))
    return records


def _score(records: list[tuple[int, float, float]]) -> dict:
    if not records:
        return {"mae": None, "rmse": None, "folds": 0}
    errs = _np.array([abs(a - p) for _, a, p in records])
    sq = _np.array([(a - p) ** 2 for _, a, p in records])
    return {
        "mae": float(_np.mean(errs)),
        "rmse": float(_math.sqrt(_np.mean(sq))),
        "folds": len(records),
    }


# ---------- Monthly-total forecast ----------

def forecast_total(
    monthly: dict[str, float],
    tx: list[dict] | None = None,
    cat_monthly: dict[str, dict[str, float]] | None = None,
) -> dict:
    sorted_keys = sorted(monthly.keys())
    y = _np.array([monthly[k] for k in sorted_keys], dtype=float)
    n = len(y)

    if n < MIN_MONTHS_FOR_REGRESSION:
        return {
            "available": False,
            "months_used": n,
            "reason": f"Need at least {MIN_MONTHS_FOR_REGRESSION} months of data (have {n}).",
            "history": [{"month": k, "amount": round(v, 2)} for k, v in zip(sorted_keys, y.tolist())],
        }

    # Build candidate models dynamically — some need extra context (start month,
    # transactions for recurring split, categories for the per-cat-sum variant).
    start_month = int(sorted_keys[0].split("-")[1])

    candidates: list[dict] = [
        {"name": "LinearRegression", "fn": _predict_linear,
         "desc": "Straight line through monthly totals."},
        {"name": "Ridge", "fn": _predict_ridge,
         "desc": "LinearRegression with L2 regularisation — resists one freak month."},
        {"name": "3-month MovingAverage", "fn": _predict_moving_avg,
         "desc": "Mean of the last 3 months."},
        {"name": "Holt-Winters (trend)", "fn": _predict_holt_winters,
         "desc": "Exponential smoothing — recent months weigh more than old ones."},
        # Pruned (never win on realistic personal-expense data):
        #   Holt-Winters (seasonal) — identical to the trend variant until ≥24 months
        #   SeasonalRidge          — sin/cos features overfit short series without strong seasonality
        #   Per-category sum       — collapses to the same answer as plain LinearRegression
    ]

    # Recurring/variable split — forecast the variable part with LinearRegression,
    # add the recurring estimate deterministically.
    # LEAKAGE FIX: the recurring fingerprints must be detected using ONLY the
    # transactions in the training window, never the full dataset. We re-detect
    # for each walk-forward step.
    if tx:
        # Pre-group transactions by month for fast per-slice redetection.
        tx_by_month: dict[str, list[dict]] = _dd(list)
        for t in tx:
            mk = _month_key(t.get("date"))
            if mk:
                tx_by_month[mk].append(t)

        def _predict_split(y_total: _np.ndarray, next_x: int) -> tuple[float, dict]:
            # Build the training slice's transactions ONLY — no future months.
            train_keys = sorted_keys[:len(y_total)]
            train_tx = [t for k in train_keys for t in tx_by_month.get(k, [])]
            if not train_tx or len(train_keys) < 2:
                return _predict_linear(y_total, next_x)
            rec_monthly, var_monthly, _ = _split_monthly(train_tx)
            var_series = _np.array([var_monthly.get(k, 0.0) for k in train_keys], dtype=float)
            rec_series = [rec_monthly.get(k, 0.0) for k in train_keys]
            if len(var_series) >= MIN_MONTHS_FOR_REGRESSION:
                var_pred, _ = _predict_linear(var_series, next_x=len(var_series))
            elif len(var_series):
                var_pred = float(_np.mean(var_series))
            else:
                var_pred = 0.0
            rec_pred = float(sum(rec_series[-3:]) / min(3, len(rec_series))) if rec_series else 0.0
            return max(0.0, var_pred + rec_pred), {
                "variable_pred": round(var_pred, 2),
                "recurring_pred": round(rec_pred, 2),
            }
        candidates.append({
            "name": "Recurring+Variable split",
            "fn": _predict_split,
            "desc": "Fixed charges forecast separately (per-fold detection, no leakage).",
        })

    # (Per-category sum was pruned — it collapsed to the same number as LinearRegression.)

    # Score every candidate via walk-forward
    model_runs = []
    for m in candidates:
        try:
            pred_next, meta = m["fn"](y, next_x=n)
            wf = _walk_forward(y, m["fn"])
            scores = _score(wf)
            model_runs.append({
                "name": m["name"],
                "desc": m["desc"],
                "next_month_amount": round(pred_next, 2),
                "holdout_mae": round(scores["mae"], 2) if scores["mae"] is not None else None,
                "holdout_rmse": round(scores["rmse"], 2) if scores["rmse"] is not None else None,
                "folds": scores["folds"],
                "walk_forward": [{"index": i, "actual": round(a, 2), "predicted": round(p, 2)} for i, a, p in wf],
                "meta": {k: round(v, 2) if isinstance(v, float) else v for k, v in meta.items()},
            })
        except Exception as e:
            model_runs.append({
                "name": m["name"], "desc": m["desc"],
                "next_month_amount": None, "holdout_mae": None, "holdout_rmse": None,
                "folds": 0, "walk_forward": [], "meta": {}, "error": str(e),
            })

    # Ensemble: WEIGHTED average of the top-3 by inverse MAE (so better models
    # get more say). Also only include models within 2× the best MAE — anything
    # much worse just drags the ensemble down.
    valid = sorted(
        [m for m in model_runs if m["holdout_mae"] is not None and m["next_month_amount"] is not None and m["holdout_mae"] > 0],
        key=lambda m: m["holdout_mae"],
    )
    best_mae_so_far = valid[0]["holdout_mae"] if valid else None
    top = [m for m in valid[:3] if best_mae_so_far is not None and m["holdout_mae"] <= 2.0 * best_mae_so_far]

    if len(top) >= 2:
        weights = _np.array([1.0 / m["holdout_mae"] for m in top])
        weights /= weights.sum()
        ensemble_next = float(_np.dot(weights, [m["next_month_amount"] for m in top]))

        step_errs = []
        for i_idx in range(len(top[0]["walk_forward"])):
            preds = _np.array([m["walk_forward"][i_idx]["predicted"] for m in top])
            actual = top[0]["walk_forward"][i_idx]["actual"]
            avg_pred = float(_np.dot(weights, preds))
            step_errs.append((top[0]["walk_forward"][i_idx]["index"], actual, avg_pred))
        ens_scores = _score(step_errs)

        model_runs.append({
            "name": f"Ensemble (weighted top-{len(top)})",
            "desc": f"Inverse-MAE weighted average of: {', '.join(m['name'] for m in top)}.",
            "next_month_amount": round(max(0.0, ensemble_next), 2),
            "holdout_mae": round(ens_scores["mae"], 2) if ens_scores["mae"] is not None else None,
            "holdout_rmse": round(ens_scores["rmse"], 2) if ens_scores["rmse"] is not None else None,
            "folds": ens_scores["folds"],
            "walk_forward": [
                {"index": i, "actual": round(a, 2), "predicted": round(p, 2)}
                for i, a, p in step_errs
            ],
            "meta": {
                "members": [m["name"] for m in top],
                "weights": [round(float(w), 3) for w in weights],
            },
        })

    # Choose the model with the lowest holdout MAE (ties: first wins)
    scored = [m for m in model_runs if m["holdout_mae"] is not None]
    chosen = min(scored, key=lambda m: m["holdout_mae"]) if scored else model_runs[0]

    # Residuals on walk-forward to produce a 1-sigma prediction interval.
    # HONESTY GUARD: only report an interval when we have enough holdouts to
    # estimate σ reliably — otherwise σ is itself a wild guess.
    MIN_FOLDS_FOR_INTERVAL = 4
    next_pred = chosen["next_month_amount"]
    if chosen["walk_forward"] and chosen["folds"] >= MIN_FOLDS_FOR_INTERVAL:
        residuals = _np.array([r["actual"] - r["predicted"] for r in chosen["walk_forward"]])
        sigma = float(_np.std(residuals, ddof=1))  # Bessel-corrected sample stdev
        interval = {
            "sigma": round(sigma, 2),
            "low": round(max(0.0, next_pred - sigma), 2),
            "high": round(next_pred + sigma, 2),
            "available": True,
            "folds_used": chosen["folds"],
        }
    else:
        sigma = None
        interval = {
            "sigma": None,
            "low": None,
            "high": None,
            "available": False,
            "folds_used": chosen["folds"] if chosen["walk_forward"] else 0,
            "reason": f"Need at least {MIN_FOLDS_FOR_INTERVAL} holdout months to estimate a confidence band honestly.",
        }

    mean_abs = float(_np.mean(_np.abs(y))) or 1.0
    reference_err = chosen["holdout_mae"] if chosen["holdout_mae"] is not None else (sigma or mean_abs)
    confidence = max(0.0, min(1.0, 1.0 - reference_err / mean_abs))

    # In-sample R² via LinearRegression fit on y[].
    # This measures how much of the month-to-month variation is captured by a
    # linear trend. It's independent of which model wins the MAE contest.
    X_lr = _np.arange(n, dtype=float).reshape(-1, 1)
    lr_fit = _LR().fit(X_lr, y)
    yhat_in = lr_fit.predict(X_lr)
    denom = float(_np.sum((y - y.mean()) ** 2))
    r2_in = float(1.0 - _np.sum((y - yhat_in) ** 2) / denom) if denom > 0 else 0.0
    r2_in = max(0.0, r2_in)

    next_month_key = _next_month(sorted_keys[-1])

    # ---------- Build the human-readable walkthrough ----------
    avg_month = float(_np.mean(y))
    min_month = float(_np.min(y))
    max_month = float(_np.max(y))

    explanation = [
        {
            "label": "1. Collect monthly totals",
            "value": f"{n} months of history",
            "note": f"{sorted_keys[0]} → {sorted_keys[-1]} · avg {_fmt_inr(avg_month)}/mo · range {_fmt_inr(min_month)}–{_fmt_inr(max_month)}",
        },
        {
            "label": f"2. Try {len(model_runs)} forecasting methods",
            "value": "Trend, smoothing, ensemble & more",
            "note": "Each one predicts next month differently. See Model comparison below for the full line-up and scores.",
        },
        {
            "label": "3. Walk-forward validation",
            "value": f"{chosen['folds']} holdout step{'s' if chosen['folds'] != 1 else ''}",
            "note": "For each month with enough prior history, we trained on earlier months only and scored the prediction against what actually happened.",
        },
        {
            "label": "4. Pick the winner",
            "value": chosen["name"],
            "note": f"Holdout MAE {_fmt_inr(chosen['holdout_mae'])} — the error we expect on NEW months, not training ones.",
        },
        {
            "label": "5. Predict next month",
            "value": f"{_fmt_inr(next_pred)}",
            "note": f"For {next_month_key}. The winning model, applied one step ahead.",
        },
        {
            "label": "6. Add a confidence band",
            "value": f"±{_fmt_inr(sigma)}" if sigma else "Not reported",
            "note": (
                f"Walk-forward residual stdev. Next month will likely land between "
                f"{_fmt_inr(interval['low'])} and {_fmt_inr(interval['high'])}."
                if sigma else
                "Not enough holdout months to estimate a band honestly."
            ),
        },
    ]

    # Data-driven trend: average of the last 3 months vs the 3 months before.
    # Independent of the chosen forecasting model, so it reflects what's actually
    # happening regardless of whether MovingAverage or LinearRegression won.
    if n >= 6:
        recent_avg = float(_np.mean(y[-3:]))
        prior_avg = float(_np.mean(y[-6:-3]))
        data_slope = (recent_avg - prior_avg) / 3.0
    elif n >= 2:
        data_slope = float(y[-1] - y[-2])
    else:
        data_slope = 0.0

    return {
        "available": True,
        "months_used": int(n),
        "next_month_key": next_month_key,
        "next_month_amount": round(next_pred, 2),
        "chosen_model": chosen["name"],
        "chosen_description": chosen["desc"],
        "slope_per_month": round(data_slope, 2),
        "model_slope_per_month": chosen["meta"].get("slope", 0),
        "mae": chosen["holdout_mae"],
        "rmse": chosen["holdout_rmse"],
        "r2": round(r2_in, 3),
        "confidence": round(confidence, 3),
        "prediction_interval": interval,
        "models": model_runs,
        "history": [{"month": k, "amount": round(v, 2)} for k, v in zip(sorted_keys, y.tolist())],
        "fit": [round(float(v), 2) for v in yhat_in.tolist()],
        "explanation": explanation,
    }


# ---------- Per-category forecast ----------

def forecast_by_category(cat_monthly: dict[str, dict[str, float]]) -> list[dict]:
    rows: list[dict] = []
    for cat, monthly in cat_monthly.items():
        if not monthly:
            continue
        sorted_keys = sorted(monthly.keys())
        y = _np.array([monthly[k] for k in sorted_keys], dtype=float)

        if len(y) >= MIN_MONTHS_FOR_REGRESSION:
            pred, _ = _predict_linear(y, next_x=len(y))
            method = "LinearRegression"
        elif len(y) >= 1:
            pred = float(_np.mean(y))
            method = "Historical average (not enough months for regression)"
        else:
            pred = 0.0
            method = "No data"

        rows.append({
            "category": cat,
            "available": len(y) >= 2,
            "months_used": int(len(y)),
            "next_month_amount": round(max(0.0, pred), 2),
            "last_month_amount": round(float(y[-1]), 2) if len(y) else 0.0,
            "avg_amount": round(float(_np.mean(y)), 2) if len(y) else 0.0,
            "method": method,
        })

    rows.sort(key=lambda r: -(r.get("next_month_amount") or 0.0))
    return rows


# ---------- Budget-overrun risk ----------

def budget_risk(
    cat_monthly: dict[str, dict[str, float]],
    budgets: list[dict],
    today: _dt.date | None = None,
) -> list[dict]:
    today = today or _dt.date.today()
    current = _this_month(today)
    y, m = today.year, today.month
    days_in_month = _calendar.monthrange(y, m)[1]
    days_elapsed = min(today.day, days_in_month)

    out: list[dict] = []
    for b in budgets:
        cat = (b.get("category") or "Other").strip() or "Other"
        amount = float(b.get("amount") or 0)
        if amount <= 0:
            continue

        monthly = cat_monthly.get(cat, {})
        current_spent = float(monthly.get(current, 0.0))
        past = [v for k, v in monthly.items() if k < current]

        paced = current_spent * (days_in_month / days_elapsed) if days_elapsed > 0 else current_spent

        if past:
            hist_mean = float(sum(past) / len(past))
            projected = 0.6 * paced + 0.4 * hist_mean
            hist_std = float(_np.std(past, ddof=0)) if len(past) >= 2 else max(0.3 * hist_mean, 1.0)
        else:
            hist_mean = None
            projected = paced
            hist_std = max(0.3 * paced, 1.0)

        # You cannot un-spend money. The month-end total must be at least what has already been spent.
        projected = max(projected, current_spent)

        # If the budget is already blown, overrun is a certainty — not a probability.
        if current_spent >= amount:
            prob = 1.0
            status = "danger"
            already_over = True
        else:
            z = (projected - amount) / (hist_std if hist_std > 0 else 1.0)
            z_clipped = max(-10.0, min(10.0, z))
            prob = 1.0 / (1.0 + _math.exp(-z_clipped))
            if prob < 0.33:
                status = "safe"
            elif prob < 0.66:
                status = "watch"
            else:
                status = "danger"
            already_over = False

        # Plain-language explanation using the user's own numbers.
        if already_over:
            explanation = (
                f"You've already spent {_fmt_inr(current_spent)} against a {_fmt_inr(amount)} budget — "
                f"that's {_fmt_inr(current_spent - amount)} over. "
                f"The month isn't done yet (day {days_elapsed} of {days_in_month}), "
                f"so the final total will keep rising from here. "
                f"Probability of ending over budget is 100% — this isn't a forecast anymore, it's already happened."
            )
        elif hist_mean is not None:
            gap = projected - amount
            over_or_under = "over" if gap > 0 else "under"
            explanation = (
                f"You've spent {_fmt_inr(current_spent)} of {_fmt_inr(amount)} so far. "
                f"At the current pace you'd finish the month around {_fmt_inr(paced)}. "
                f"Historical average for {cat} is {_fmt_inr(hist_mean)}, "
                f"so the blended projection is {_fmt_inr(projected)} — "
                f"{_fmt_inr(abs(gap))} {over_or_under} the budget. "
                f"That gap, scaled by your historical variability, maps to "
                f"a {int(prob * 100)}% probability of overspend — labelled '{status}'."
            )
        else:
            explanation = (
                f"No history for {cat} yet. Based on this month's pace alone, "
                f"you'd finish around {_fmt_inr(paced)} vs a budget of {_fmt_inr(amount)}. "
                f"Risk estimated at {int(prob * 100)}% — '{status}'."
            )

        out.append({
            "category": cat,
            "budget": round(amount, 2),
            "spent_so_far": round(current_spent, 2),
            "projected_month_total": round(projected, 2),
            "paced": round(paced, 2),
            "historical_mean": round(hist_mean, 2) if hist_mean is not None else None,
            "historical_std": round(hist_std, 2),
            "days_elapsed": int(days_elapsed),
            "days_in_month": int(days_in_month),
            "probability": round(prob, 3),
            "status": status,
            "months_of_history": int(len(past)),
            "explanation": explanation,
        })

    out.sort(key=lambda r: -r["probability"])
    return out


# ---------- Budget trajectory (within current month) ----------

def budget_trajectory(
    cat_monthly: dict[str, dict[str, float]],
    budgets: list[dict],
    today: _dt.date | None = None,
    tx: list[dict] | None = None,
) -> list[dict]:
    """
    For each category with a budget: compute daily burn rate, project end-of-month
    total, and estimate the day the budget will be hit (if ever).

    Projection is recurring-aware — fixed charges (rent, subs) don't get
    extrapolated as if they repeat daily.
    """
    today = today or _dt.date.today()
    current = _this_month(today)
    y, m = today.year, today.month
    days_in_month = _calendar.monthrange(y, m)[1]
    days_elapsed = min(today.day, days_in_month)

    # Per-category recurring-this-month, for pacing correction
    recurring_by_cat_this_month = _dd(float)
    if tx:
        for t in tx:
            if _month_key(t.get("date")) != current:
                continue
            if "recurr" in (t.get("notes") or "").lower():
                cat_t = (t.get("category") or "Other").strip() or "Other"
                recurring_by_cat_this_month[cat_t] += float(t.get("amount") or 0)

    out: list[dict] = []
    for b in budgets:
        cat = (b.get("category") or "Other").strip() or "Other"
        amount = float(b.get("amount") or 0)
        if amount <= 0:
            continue

        monthly = cat_monthly.get(cat, {})
        current_spent = float(monthly.get(current, 0.0))
        past = [v for k, v in monthly.items() if k < current]

        # Smart projection: recurring is paid once per month; only variable paces.
        recurring_this = recurring_by_cat_this_month.get(cat, 0.0)
        variable_this = max(0.0, current_spent - recurring_this)
        variable_rate = variable_this / days_elapsed if days_elapsed > 0 else 0
        variable_projection = variable_rate * days_in_month

        # If very few days have passed and variable data is thin, fall back to
        # historical variable average for the category (total minus typical recurring)
        if days_elapsed < 8 and variable_this < 200 and past:
            hist_mean = sum(past) / len(past)
            # Assume historical month also included this amount of recurring
            hist_variable_mean = max(0.0, hist_mean - recurring_this)
            variable_projection = hist_variable_mean

        daily_rate = variable_rate  # for display purposes
        projected = recurring_this + variable_projection
        projected = max(projected, current_spent)  # never below what's already spent

        # Days to blow the budget at this rate — use VARIABLE rate, since recurring
        # won't keep adding. But first check: if projected total already exceeds budget,
        # the hit happens when cumulative projected spending crosses the cap.
        if current_spent >= amount:
            hit_date = None
            will_hit = True
            hit_day_text = "Already hit."
        elif variable_rate > 0 and projected > amount:
            # Variable will push over the cap; find the day
            budget_left = amount - current_spent
            days_to_hit = budget_left / variable_rate
            hit_day = today.day + int(_math.ceil(days_to_hit))
            if hit_day > days_in_month:
                hit_date = None
                will_hit = False
                hit_day_text = f"After {_calendar.month_name[m]} ends — on track."
            else:
                hit_date = _dt.date(y, m, hit_day).isoformat()
                will_hit = True
                hit_day_text = f"Day {hit_day} of {_calendar.month_name[m]}"
        elif projected > amount:
            # Projected over (based on historical fallback), but no variable rate yet
            hit_date = None
            will_hit = False
            hit_day_text = f"Projected over by {_fmt_inr(projected - amount)}"
        else:
            hit_date = None
            will_hit = False
            hit_day_text = f"After {_calendar.month_name[m]} ends — on track." if days_elapsed > 0 else "No spending yet."

        # Burn rate vs history (daily rate this month vs typical daily rate across past months)
        if past:
            avg_past_monthly = sum(past) / len(past)
            avg_past_daily = avg_past_monthly / 30.0
            burn_ratio = daily_rate / avg_past_daily if avg_past_daily > 0 else None
        else:
            burn_ratio = None

        if burn_ratio is None:
            burn_text = "No history to compare pace against."
        elif burn_ratio >= 1.3:
            burn_text = f"Spending {burn_ratio:.1f}× faster than usual."
        elif burn_ratio >= 1.1:
            burn_text = f"Slightly above normal pace ({burn_ratio:.1f}×)."
        elif burn_ratio <= 0.7:
            burn_text = f"Spending slower than usual ({burn_ratio:.1f}× typical pace)."
        else:
            burn_text = "On a normal pace."

        if current_spent >= amount:
            status = "exceeded"
        elif will_hit:
            status = "will_overshoot"
        elif projected > amount * 0.9:
            status = "watch"
        else:
            status = "on_track"

        out.append({
            "category": cat,
            "budget": round(amount, 2),
            "spent_so_far": round(current_spent, 2),
            "daily_rate": round(daily_rate, 2),
            "projected_month_total": round(projected, 2),
            "days_elapsed": int(days_elapsed),
            "days_in_month": int(days_in_month),
            "will_hit": will_hit,
            "hit_date": hit_date,
            "hit_day_text": hit_day_text,
            "burn_ratio": round(burn_ratio, 2) if burn_ratio is not None else None,
            "burn_text": burn_text,
            "status": status,
            "slack": round(max(0.0, amount - projected), 2),
            "overshoot_estimate": round(max(0.0, projected - amount), 2),
        })

    # Sort by urgency: exceeded/will_overshoot first, then by hit date
    status_order = {"exceeded": 0, "will_overshoot": 1, "watch": 2, "on_track": 3}
    out.sort(key=lambda r: (status_order.get(r["status"], 9), r["hit_date"] or "9999-12-31"))
    return out


# ---------- Category-level insights ----------

def category_insights(cat_monthly: dict[str, dict[str, float]]) -> dict:
    """
    Returns:
      - fastest_growing: categories whose recent 3-month average is higher than their earlier average
      - shrinking:       opposite direction
      - composition_shift: how each category's share of total spending has moved
      - most_slack / least_slack: computed when budgets are joined in the bundle
    """
    growing: list[dict] = []
    shrinking: list[dict] = []
    composition: list[dict] = []

    # Overall totals per month across all categories, for share calculations
    all_months = sorted({mk for monthly in cat_monthly.values() for mk in monthly.keys()})
    if not all_months:
        return {"fastest_growing": [], "shrinking": [], "composition_shift": []}

    recent_window = all_months[-3:]
    earlier_window = all_months[:-3] if len(all_months) > 3 else all_months[:1]

    def _mean(vals):
        return float(sum(vals) / len(vals)) if vals else 0.0

    # Monthly totals for share calcs
    total_recent = _mean([
        sum(cat_monthly.get(cat, {}).get(mk, 0.0) for cat in cat_monthly)
        for mk in recent_window
    ])
    total_earlier = _mean([
        sum(cat_monthly.get(cat, {}).get(mk, 0.0) for cat in cat_monthly)
        for mk in earlier_window
    ])

    for cat, monthly in cat_monthly.items():
        recent_vals = [monthly.get(mk, 0.0) for mk in recent_window]
        earlier_vals = [monthly.get(mk, 0.0) for mk in earlier_window]
        recent_avg = _mean(recent_vals)
        earlier_avg = _mean(earlier_vals)

        # Skip categories with nothing in both windows
        if recent_avg == 0 and earlier_avg == 0:
            continue

        # Skip discontinued categories — had activity before but zero recent spend.
        # These are not "shrinking" in the real sense; they just stopped being used
        # (e.g. category rename, lifestyle change, legacy imports).
        if recent_avg == 0 and earlier_avg > 0:
            continue
        # Also skip brand-new categories (nothing earlier) — not a real growth signal
        if earlier_avg == 0 and recent_avg > 0:
            # Still include in composition shift so the mix change is visible
            recent_share = (recent_avg / total_recent * 100) if total_recent > 0 else 0
            earlier_share = 0
            share_change = recent_share
            if share_change >= 2:
                composition.append({
                    "category": cat,
                    "earlier_share_pct": 0.0,
                    "recent_share_pct": round(recent_share, 1),
                    "change_pct": round(share_change, 1),
                })
            continue

        pct_change = (recent_avg - earlier_avg) / earlier_avg * 100

        row = {
            "category": cat,
            "recent_avg": round(recent_avg, 2),
            "earlier_avg": round(earlier_avg, 2),
            "pct_change": round(pct_change, 1),
            "delta": round(recent_avg - earlier_avg, 2),
        }
        if pct_change >= 15:
            growing.append(row)
        elif pct_change <= -15:
            shrinking.append(row)

        # Composition shift — share of total spending (both windows active)
        recent_share = (recent_avg / total_recent * 100) if total_recent > 0 else 0
        earlier_share = (earlier_avg / total_earlier * 100) if total_earlier > 0 else 0
        share_change = recent_share - earlier_share
        if abs(share_change) >= 2:  # Only report meaningful shifts
            composition.append({
                "category": cat,
                "earlier_share_pct": round(earlier_share, 1),
                "recent_share_pct": round(recent_share, 1),
                "change_pct": round(share_change, 1),
            })

    growing.sort(key=lambda r: -r["pct_change"])
    shrinking.sort(key=lambda r: r["pct_change"])
    composition.sort(key=lambda r: -abs(r["change_pct"]))

    return {
        "fastest_growing": growing[:5],
        "shrinking": shrinking[:5],
        "composition_shift": composition[:5],
        "window_recent": recent_window,
        "window_earlier": earlier_window,
    }


# ---------- Suggested cuts (recurring expenses by annual cost) ----------

def suggested_cuts(tx: list[dict]) -> list[dict]:
    """
    Identify recurring charges and rank them by annual cost so the user
    can see the biggest potential savings from cancelling or reducing one.
    """
    # Group by (desc, rounded amount) — collect months and compute cadence
    buckets: dict[tuple, dict] = {}
    for t in tx:
        mk = _month_key(t.get("date"))
        if not mk:
            continue
        desc = str(t.get("description") or "").strip()
        if not desc:
            continue
        amt = round(float(t.get("amount") or 0), 0)
        key = (desc.lower(), amt)
        b = buckets.setdefault(key, {
            "description": desc,
            "amount": amt,
            "months": set(),
            "category": t.get("category") or "Other",
            "payment": t.get("payment") or "",
        })
        b["months"].add(mk)

    recurring = []
    for key, b in buckets.items():
        n_months = len(b["months"])
        if n_months < RECURRING_MIN_OCCURRENCES:
            continue
        # Infer cadence: span of months divided by occurrences
        sorted_months = sorted(b["months"])
        if len(sorted_months) >= 2:
            first_y, first_m = map(int, sorted_months[0].split("-"))
            last_y, last_m = map(int, sorted_months[-1].split("-"))
            span_months = (last_y - first_y) * 12 + (last_m - first_m) + 1
            cadence = span_months / n_months  # months per occurrence
        else:
            cadence = 1.0

        if cadence <= 1.3:
            frequency = "monthly"
            annual_cost = b["amount"] * 12
            monthly_cost = b["amount"]
        elif cadence <= 3.5:
            frequency = f"every ~{int(round(cadence))} months"
            annual_cost = b["amount"] * (12 / cadence)
            monthly_cost = annual_cost / 12
        else:
            frequency = f"every ~{int(round(cadence))} months"
            annual_cost = b["amount"] * (12 / cadence)
            monthly_cost = annual_cost / 12

        recurring.append({
            "description": b["description"],
            "category": b["category"],
            "payment": b["payment"],
            "amount": round(b["amount"], 2),
            "frequency": frequency,
            "months_seen": n_months,
            "monthly_cost": round(monthly_cost, 2),
            "annual_cost": round(annual_cost, 2),
        })

    recurring.sort(key=lambda r: -r["annual_cost"])
    return recurring[:10]


# ---------- Description → category classifier ----------

def _text_corpus(tx: list[dict]) -> tuple[list[str], list[str]]:
    docs, labels = [], []
    for t in tx:
        parts = []
        if t.get("description"):
            parts.append(str(t["description"]))
        if t.get("notes"):
            parts.append(str(t["notes"]))
        if t.get("payment"):
            parts.append(str(t["payment"]))
        if not parts:
            continue
        docs.append(" ".join(parts))
        labels.append(str(t.get("category") or "Other"))
    return docs, labels


_CLASSIFIER_CACHE: dict | None = None


def _invalidate_classifier():
    global _CLASSIFIER_CACHE
    _CLASSIFIER_CACHE = None


def _signature(tx: list[dict]) -> tuple:
    return (len(tx), round(sum(float(t.get("amount") or 0) for t in tx), 2))


def _get_classifier(user_id: str) -> tuple[tuple | None, dict]:
    """Train BOTH NB and LogReg, keep the better one. Returns ((vect, model), info)."""
    global _CLASSIFIER_CACHE
    tx = _db.list_transactions(user_id)
    # Cache per-user so one user's classifier doesn't bleed into another's.
    sig = (user_id, _signature(tx))
    if _CLASSIFIER_CACHE and _CLASSIFIER_CACHE.get("signature") == sig:
        return _CLASSIFIER_CACHE["model"], _CLASSIFIER_CACHE["info"]

    docs, labels = _text_corpus(tx)
    classes = sorted(set(labels))

    if len(docs) < MIN_ROWS_FOR_CLASSIFIER or len(classes) < 2:
        info = {
            "available": False,
            "rows_used": len(docs),
            "classes": classes,
            "reason": f"Need at least {MIN_ROWS_FOR_CLASSIFIER} transactions across 2+ categories.",
        }
        _CLASSIFIER_CACHE = {"signature": sig, "model": None, "info": info}
        return None, info

    vect = _Tfidf(lowercase=True, ngram_range=(1, 2), min_df=1)
    X = vect.fit_transform(docs)

    import collections as _c
    counts = _c.Counter(labels)
    min_per_class = min(counts.values())
    folds = max(2, min(5, min_per_class))

    def _cv_score(estimator):
        try:
            if min_per_class >= 2 and len(docs) >= folds:
                return float(_np.mean(_cvs(estimator, X, labels, cv=folds)))
        except Exception:
            return None
        return None

    nb = _NB()
    lr = _LogReg(max_iter=1000, class_weight="balanced", n_jobs=None)

    nb_acc = _cv_score(nb)
    lr_acc = _cv_score(lr)

    candidates = []
    if nb_acc is not None:
        candidates.append(("MultinomialNB", nb, nb_acc))
    if lr_acc is not None:
        candidates.append(("LogisticRegression", lr, lr_acc))

    if not candidates:
        chosen_name, chosen_clf, chosen_acc = "MultinomialNB", nb, None
    else:
        chosen_name, chosen_clf, chosen_acc = max(candidates, key=lambda t: t[2])

    chosen_clf.fit(X, labels)

    # Per-class precision/recall/F1 using in-sample predictions (indicative only).
    try:
        y_pred = chosen_clf.predict(X)
        report = _clf_report(labels, y_pred, output_dict=True, zero_division=0)
        per_class = []
        for cls in classes:
            row = report.get(cls, {})
            per_class.append({
                "class": cls,
                "precision": round(float(row.get("precision", 0)), 3),
                "recall": round(float(row.get("recall", 0)), 3),
                "f1": round(float(row.get("f1-score", 0)), 3),
                "support": int(row.get("support", 0)),
            })
    except Exception:
        per_class = []

    info = {
        "available": True,
        "rows_used": len(docs),
        "classes": classes,
        "accuracy": round(chosen_acc, 3) if chosen_acc is not None else None,
        "folds": folds,
        "chosen_model": chosen_name,
        "candidates": [
            {"name": "MultinomialNB", "accuracy": round(nb_acc, 3) if nb_acc is not None else None},
            {"name": "LogisticRegression", "accuracy": round(lr_acc, 3) if lr_acc is not None else None},
        ],
        "per_class": per_class,
        "explanation": [
            {
                "label": "1. Build a corpus",
                "value": f"{len(docs)} text snippets",
                "note": "Each transaction's description, notes and payment method become one document.",
            },
            {
                "label": "2. Vectorise text",
                "value": "TfidfVectorizer (1-2 grams)",
                "note": "Words and 2-word phrases are turned into numeric weights that emphasise rare, informative terms.",
            },
            {
                "label": "3. Train two classifiers",
                "value": "MultinomialNB and LogisticRegression",
                "note": (
                    "NB is fast and robust; LogReg often does better when the vocabulary is small. "
                    f"CV accuracy: NB {('%.1f%%' % (nb_acc*100)) if nb_acc else '—'}, "
                    f"LogReg {('%.1f%%' % (lr_acc*100)) if lr_acc else '—'}."
                ),
            },
            {
                "label": "4. Pick the better one",
                "value": chosen_name,
                "note": f"Winner by {folds}-fold cross-validation on your own transactions.",
            },
        ],
    }
    _CLASSIFIER_CACHE = {"signature": sig, "model": (vect, chosen_clf), "info": info}
    return (vect, chosen_clf), info


def suggest_category(text: str, user_id: str) -> dict:
    model, info = _get_classifier(user_id)
    if not model:
        return {"available": False, "reason": info.get("reason")}
    vect, clf = model
    X = vect.transform([text or ""])
    try:
        probs = clf.predict_proba(X)[0]
    except Exception:
        # LogisticRegression supports predict_proba; this is defensive only.
        pred = clf.predict(X)[0]
        return {"available": True, "category": pred, "confidence": None, "top_3": []}
    classes = list(clf.classes_)
    ranked = sorted(zip(classes, probs), key=lambda p: -p[1])
    top = ranked[:3]
    return {
        "available": True,
        "category": top[0][0],
        "confidence": round(float(top[0][1]), 3),
        "top_3": [{"category": c, "p": round(float(p), 3)} for c, p in top],
        "rows_used": info["rows_used"],
        "chosen_model": info.get("chosen_model"),
    }


# ---------- Public bundle ----------

def predictions_bundle(user_id: str) -> dict:
    today = _dt.date.today()
    tx = _db.list_transactions(user_id)
    budgets = _db.list_budgets(user_id)

    monthly = _monthly_totals(tx)
    cat_monthly = _monthly_by_category(tx)

    # EXCLUDE THE CURRENT INCOMPLETE MONTH from forecast training.
    # The month is still in progress (today < last day of month), so its running
    # total is NOT comparable to prior full months. Training on it biases every
    # forecaster downward. The current month is still shown separately in the
    # this_month_pacing / budget_trajectory / budget_risk cards.
    current_key = _this_month(today)
    _, days_in_this_month = today.year, _calendar.monthrange(today.year, today.month)[1]
    current_is_partial = today.day < days_in_this_month
    monthly_for_forecast = {k: v for k, v in monthly.items() if k != current_key} if current_is_partial else monthly
    cat_monthly_for_forecast = (
        {cat: {k: v for k, v in mm.items() if k != current_key} for cat, mm in cat_monthly.items()}
        if current_is_partial else cat_monthly
    )
    tx_for_forecast = [t for t in tx if _month_key(t.get("date")) != current_key] if current_is_partial else tx

    forecast = forecast_total(monthly_for_forecast, tx=tx_for_forecast, cat_monthly=cat_monthly_for_forecast)
    by_cat = forecast_by_category(cat_monthly)
    risk = budget_risk(cat_monthly, budgets, today=today)
    trajectory = budget_trajectory(cat_monthly, budgets, today=today, tx=tx)
    insights = category_insights(cat_monthly)
    cuts = suggested_cuts(tx)
    _, classifier_info = _get_classifier(user_id)

    # Join real budget headroom into insights.
    # Only show categories genuinely "on track" — a 'watch' status means
    # projected > 90% of budget, so showing it as "slack" is misleading.
    slack = []
    for row in trajectory:
        if row["budget"] > 0 and row["status"] == "on_track" and row["slack"] >= 0.1 * row["budget"]:
            slack.append({
                "category": row["category"],
                "budget": row["budget"],
                "projected": row["projected_month_total"],
                "slack": row["slack"],
                "slack_pct": round(row["slack"] / row["budget"] * 100, 1) if row["budget"] > 0 else 0,
            })
    slack.sort(key=lambda r: -r["slack"])
    insights["most_slack"] = slack[:5]

    current_key = _this_month(today)
    y, m = today.year, today.month
    days_in_month = _calendar.monthrange(y, m)[1]
    days_elapsed = min(today.day, days_in_month)
    spent_so_far = float(monthly.get(current_key, 0.0))

    # ----- Smarter pacing projection -----
    # Naive pacing (spent × days_in_month / days_elapsed) blows up early in the
    # month because recurring charges (rent, bills, subs) front-load spending and
    # won't repeat. Split recurring vs variable so the projection stays sane.
    tx_this_month = [t for t in tx if _month_key(t.get("date")) == current_key]
    recurring_this_month = sum(
        float(t.get("amount") or 0)
        for t in tx_this_month
        if "recurr" in (t.get("notes") or "").lower()
    )
    variable_this_month = spent_so_far - recurring_this_month

    # Build a historical "variable per month" baseline from prior months
    prior_month_keys = sorted(k for k in monthly.keys() if k != current_key)
    hist_variable_monthly = []
    for mk in prior_month_keys:
        rec = sum(
            float(t.get("amount") or 0)
            for t in tx
            if _month_key(t.get("date")) == mk
            and "recurr" in (t.get("notes") or "").lower()
        )
        tot = monthly.get(mk, 0.0)
        hist_variable_monthly.append(max(0.0, tot - rec))
    hist_variable_avg = (
        sum(hist_variable_monthly) / len(hist_variable_monthly)
        if hist_variable_monthly else 0.0
    )

    # Variable projection: use current pace once we have a few days of signal;
    # otherwise fall back to historical variable average.
    MIN_DAYS_FOR_VARIABLE_PACE = 8
    if days_elapsed >= MIN_DAYS_FOR_VARIABLE_PACE and variable_this_month > 0:
        variable_rate = variable_this_month / days_elapsed
        projected_variable = variable_rate * days_in_month
    elif variable_this_month > 0:
        # Blend: trust current pace partially, historical average mostly
        pace_estimate = (variable_this_month / days_elapsed) * days_in_month
        weight = days_elapsed / MIN_DAYS_FOR_VARIABLE_PACE
        projected_variable = weight * pace_estimate + (1 - weight) * hist_variable_avg
    else:
        projected_variable = hist_variable_avg

    # Recurring charges happen once per month — if they've already fired, they
    # don't repeat; if they haven't, assume they will (use historical recurring total).
    hist_recurring = []
    for mk in prior_month_keys:
        rec = sum(
            float(t.get("amount") or 0)
            for t in tx
            if _month_key(t.get("date")) == mk
            and "recurr" in (t.get("notes") or "").lower()
        )
        hist_recurring.append(rec)
    hist_recurring_avg = sum(hist_recurring) / len(hist_recurring) if hist_recurring else 0.0
    projected_recurring = max(recurring_this_month, hist_recurring_avg)

    paced = projected_recurring + projected_variable
    paced = max(paced, spent_so_far)  # never project below what's already spent

    pace_explanation = (
        f"You've spent {_fmt_inr(spent_so_far)} by day {days_elapsed} of {days_in_month} "
        f"({_fmt_inr(recurring_this_month)} recurring + {_fmt_inr(variable_this_month)} variable). "
        f"Recurring charges won't repeat this month, so projected total is "
        f"{_fmt_inr(projected_recurring)} recurring + {_fmt_inr(projected_variable)} variable "
        f"= {_fmt_inr(paced)}."
    )

    this_month = {
        "month": current_key,
        "spent_so_far": round(spent_so_far, 2),
        "projected_total": round(paced, 2),
        "days_elapsed": days_elapsed,
        "days_in_month": days_in_month,
        "explanation": pace_explanation,
    }

    # ----- Budget recommendation ---------------------------------------
    # Use the chosen forecast + optional safety buffer so the user can set a
    # monthly cap that reflects what they'll ACTUALLY spend, with a cushion.
    recommended = _recommend_budget(forecast)

    return {
        "trained_at": _dt.datetime.now().replace(microsecond=0).isoformat(),
        "data": {
            "transactions": len(tx),
            "months_with_data": len(monthly),
            "earliest_month": min(monthly) if monthly else None,
            "latest_month": max(monthly) if monthly else None,
        },
        "forecast_total": forecast,
        "forecast_by_category": by_cat,
        "this_month_pacing": this_month,
        "budget_risk": risk,
        "budget_trajectory": trajectory,
        "category_insights": insights,
        "suggested_cuts": cuts,
        "classifier": classifier_info,
        "recommended_budget": recommended,
    }


def _recommend_budget(forecast: dict) -> dict:
    """
    Suggest a monthly budget cap based on the forecast and three buffer levels.
    - 'tight' (forecast only): hits budget on target
    - 'balanced' (+ 1σ buffer): clears the budget with ~84% confidence
    - 'cautious' (+ 2σ buffer): clears it with ~98% confidence
    Falls back to historical mean when no reliable interval is available.
    """
    if not forecast.get("available"):
        return {
            "available": False,
            "reason": forecast.get("reason", "Forecast not yet trained."),
        }

    base = float(forecast.get("next_month_amount") or 0)
    interval = forecast.get("prediction_interval") or {}
    sigma = interval.get("sigma")

    options = []
    if sigma:
        options.append({
            "label": "Tight",
            "amount": round(base, 2),
            "buffer": 0.0,
            "clears_prob_pct": 50,
            "note": "Equals the central forecast. You'd overshoot about half the time.",
        })
        options.append({
            "label": "Balanced",
            "amount": round(base + sigma, 2),
            "buffer": round(sigma, 2),
            "clears_prob_pct": 84,
            "note": "Forecast + 1σ buffer. Clears budget ~84% of months.",
        })
        options.append({
            "label": "Cautious",
            "amount": round(base + 2 * sigma, 2),
            "buffer": round(2 * sigma, 2),
            "clears_prob_pct": 98,
            "note": "Forecast + 2σ buffer. Clears budget ~98% of months.",
        })
        default_label = "Balanced"
    else:
        # Thin data — fall back to a flat 10% cushion on the forecast
        options.append({
            "label": "Forecast",
            "amount": round(base, 2),
            "buffer": 0.0,
            "clears_prob_pct": None,
            "note": "Central forecast. Confidence band not available until there's more history.",
        })
        options.append({
            "label": "With 10% cushion",
            "amount": round(base * 1.10, 2),
            "buffer": round(base * 0.10, 2),
            "clears_prob_pct": None,
            "note": "Forecast + 10% safety margin — rough rule-of-thumb while data is thin.",
        })
        default_label = "With 10% cushion"

    return {
        "available": True,
        "month_key": forecast.get("next_month_key"),
        "forecast": round(base, 2),
        "sigma": round(sigma, 2) if sigma else None,
        "default_label": default_label,
        "options": options,
        "note": (
            "These probabilities assume prediction errors are normally distributed, which is a "
            "simplification. Treat as a planning guide, not a guarantee."
        ),
    }
