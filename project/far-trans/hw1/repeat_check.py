"""Why does recency beat CBF on sparse users? Two checks on one starter run.

Usage: python3 repeat_check.py RUN_DIR DATA_DIR [--max-assets 3]

1. Share of sparse users with exactly one distinct pre-cutoff asset: for them any
   reweighting of history through the encoder seam leaves the CBF ranking unchanged.
2. Share of truth items (future Buy in the 30-day window, intersected with the eligible
   set) that the user had already bought before the cutoff.
3. Position of a one-asset user's own asset in the `cbf` Top-10 (ties of identical
   token sets are broken by ISIN, so the own asset is not always first).
Reads only contexts.jsonl, predictions.csv and the raw transactions.csv.
"""
import argparse
import collections
import csv
import json
from datetime import date, timedelta
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument("run", type=Path)
ap.add_argument("data", type=Path)
ap.add_argument("--max-assets", type=int, default=3)
ap.add_argument("--cutoff", default="2021-06-01")
ap.add_argument("--horizon-days", type=int, default=30)
a = ap.parse_args()

ctx = {}
with open(a.run / "contexts.jsonl") as f:
    for line in f:
        c = json.loads(line)
        ctx[c["user_id"]] = c
hist = {u: {h["id"] for h in c["history"]} for u, c in ctx.items()}
sparse = {u for u, h in hist.items() if 1 <= len(h) <= a.max_assets}
one = {u for u in sparse if len(hist[u]) == 1}
print(f"sparse users (1..{a.max_assets} assets): {len(sparse)}; exactly one asset: {len(one)} "
      f"({len(one) / len(sparse):.3f})")

end = (date.fromisoformat(a.cutoff) + timedelta(days=a.horizon_days)).isoformat()
future = collections.defaultdict(set)
with open(a.data / "transactions.csv") as f:
    for r in csv.DictReader(f):
        if (r["transactionType"] == "Buy" and r["customerID"] in sparse
                and a.cutoff <= r["timestamp"][:10] < end):
            future[r["customerID"]].add(r["ISIN"])
truth = {u: future[u] & set(ctx[u]["eligible_asset_ids"]) for u in sparse}
truth = {u: t for u, t in truth.items() if t}
items = sum(len(t) for t in truth.values())
repeat = sum(len(t & hist[u]) for u, t in truth.items())
users_rep = sum(1 for u, t in truth.items() if t & hist[u])
print(f"sparse users with nonempty truth: {len(truth)}; truth items: {items}; "
      f"already bought before cutoff: {repeat} ({repeat / items:.3f}); users with >=1 repeat: {users_rep}")

top = collections.defaultdict(list)
with open(a.run / "predictions.csv") as f:
    for r in csv.DictReader(f):
        if r["method"] == "cbf" and r["user_id"] in one:
            top[r["user_id"]].append((int(r["rank"]), r["ISIN"]))
pos = collections.Counter()
for u in one:
    ranking = [i for _, i in sorted(top[u])]
    own = next(iter(hist[u]))
    pos[ranking.index(own) + 1 if own in ranking else 0] += 1
print("own asset position in cbf Top-10 for one-asset users (0 = not in Top-10):",
      dict(sorted(pos.items())))
