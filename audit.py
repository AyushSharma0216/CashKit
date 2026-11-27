"""
SpendSense — one-command honesty audit.

Run this to see a plain-text report of how every forecasting candidate
actually performs on YOUR data: walk-forward MAE, MAPE, prediction interval,
and the probabilities of landing within different ranges.

Usage:
    python audit.py

No prediction scores are fabricated or guaranteed — every number is computed
on the live MongoDB data through the same code path the Predictions page uses.
"""

from __future__ import annotations

import math
import sys
from collections import defaultdict

import numpy as np

import db
import ml


def _print_header(title: str) -> None:
    print()
    print("=" * 80)
    print(title)
    print("=" * 80)


def run() -> int:
    ok, msg = db.ping()
    if not ok:
        print(f"MongoDB not reachable: {msg}")
        print("Start it (`mongod`) or set MONGODB_URI, then retry.")
        return 1

    tx = db.list_transactions()
    if not tx:
        print("No transactions in the database yet. Import a CSV or add rows first.")
        return 1

    _print_header("DATA")
    print(f"Transactions:  {len(tx)}")
    by_month = defaultdict(float)
    for t in tx:
        mk = (t.get("date") or "")[:7]
        if mk:
            by_month[mk] += float(t.get("amount") or 0)
    months = sorted(by_month)
    print(f"Months:        {len(months)} ({months[0]} to {months[-1]})")
    if len(months) < 3:
        print()
        print("Not enough months for forecasting (need >= 3). Add more data and rerun.")
        return 0

    bundle = ml.predictions_bundle()
    f = bundle["forecast_total"]

    _print_header("FORECAST (chosen model)")
    print(f"Chosen model:        {f['chosen_model']}")
    print(f"Next-month forecast: Rs{f['next_month_amount']:,.0f}  for  {f['next_month_key']}")
    print(f"Months used:         {f['months_used']}")

    interval = f.get("prediction_interval", {})
    if interval.get("available"):
        print(f"Sigma (holdout):     Rs{interval['sigma']:,.0f}")
        print(f"68% interval:        Rs{interval['low']:,.0f}  to  Rs{interval['high']:,.0f}")
    else:
        print(f"Prediction interval: NOT REPORTED - {interval.get('reason', 'thin data')}")

    _print_header("MODEL BAKE-OFF (walk-forward MAE, lower is better)")
    print(f"{'Model':<34} {'Next':>12} {'MAE':>10} {'MAPE':>8} {'Folds':>7}")
    print("-" * 80)
    mean_month = float(np.mean([h["amount"] for h in f["history"]]))
    valid = sorted(
        [m for m in f["models"] if m.get("holdout_mae") is not None],
        key=lambda m: m["holdout_mae"],
    )
    for m in valid:
        mark = " <--" if m["name"] == f["chosen_model"] else ""
        mape = m["holdout_mae"] / mean_month * 100
        print(f"{m['name']:<34} Rs{m['next_month_amount']:>9,.0f} "
              f"Rs{m['holdout_mae']:>7,.0f} {mape:>7.1f}% {m['folds']:>7}{mark}")

    _print_header("PROBABILITY OF BEING RIGHT (chosen model, normal assumption)")
    if interval.get("available"):
        sigma = interval["sigma"]
        for delta in (500, 1000, 2000, 3000, 5000, 10000):
            p = math.erf(delta / (sigma * math.sqrt(2))) * 100
            print(f"  P(actual within +/-Rs{delta:>6,} of forecast): {p:5.1f}%")
    else:
        print("  Skipped - too few walk-forward folds to estimate sigma honestly.")

    rec = bundle.get("recommended_budget") or {}
    if rec.get("available"):
        _print_header(f"SUGGESTED BUDGET for {rec['month_key']}")
        for opt in rec["options"]:
            prob = f"{opt['clears_prob_pct']}% clears" if opt.get("clears_prob_pct") is not None else "no probability"
            default = "  (default)" if opt["label"] == rec["default_label"] else ""
            print(f"  {opt['label']:<22} Rs{opt['amount']:>10,.0f}   buffer Rs{opt['buffer']:>8,.0f}   [{prob}]{default}")
        print()
        print("  Note:", rec["note"])

    c = bundle.get("classifier") or {}
    if c.get("available"):
        _print_header("CATEGORY CLASSIFIER")
        print(f"Chosen:     {c.get('chosen_model', '?')}")
        print(f"CV accuracy: {(c.get('accuracy') or 0) * 100:.1f}%   (via {c.get('folds')}-fold cross-validation)")
        print(f"Rows:        {c.get('rows_used')}")
        print(f"Classes:     {', '.join(c.get('classes') or [])}")

    print()
    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(run())
