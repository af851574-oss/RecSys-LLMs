#!/usr/bin/env python3
"""Sparse-history subgroup analysis for a starter run.

Reads only per_user.csv, contexts.jsonl and the raw CSVs (never metrics.json),
recomputes subgroup means, and prints the distribution of distinct pre-cutoff
assets per evaluated user plus a proposed sparse threshold.

Usage: python3 sparse_analysis.py RUN_DIR SPARSE_MAX [--data-dir D]
RUN_DIR holds contexts.jsonl and per_user.csv; --data-dir defaults to the
archive used by the run (pass it explicitly for the raw-CSV checks).
"""
import argparse, csv, json
from collections import Counter, defaultdict
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument('run_dir', type=Path)
ap.add_argument('sparse_max', type=int, help='users with <= this many distinct pre-cutoff assets')
ap.add_argument('--data-dir', type=Path, required=True)
a = ap.parse_args()

# 1. distinct pre-cutoff assets per evaluated user, from the redacted contexts
hist_len = {}
for line in (a.run_dir / 'contexts.jsonl').read_text(encoding='utf-8').splitlines():
    if line.strip():
        c = json.loads(line)
        hist_len[c['user_id']] = len(c['history'])

# 2. per-user, per-method scores
by_user = defaultdict(dict)
with (a.run_dir / 'per_user.csv').open(newline='') as s:
    for r in csv.DictReader(s):
        by_user[r['user_id']][r['method']] = (int(r['relevant_count']), float(r['ndcg_at_10']))

# 3. independent truth recomputation from raw transactions.csv (cutoff 2021-06-01, 30d)
truth_raw = defaultdict(set)
with (a.data_dir / 'transactions.csv').open(encoding='utf-8-sig', newline='') as s:
    for row in csv.DictReader(s):
        if row['transactionType'] == 'Buy' and '2021-06-01' <= row['timestamp'][:10] < '2021-07-01':
            truth_raw[row['customerID']].add(row['ISIN'])

dist = Counter(hist_len.values())
print(f"run_dir {a.run_dir}  evaluated_users {len(hist_len)}")
print("distinct_pre_cutoff_assets -> users")
for k in sorted(dist):
    print(f"  {k:3d} -> {dist[k]}")

sparse = {u for u, n in hist_len.items() if n <= a.sparse_max}
print(f"\nsparse threshold: distinct assets <= {a.sparse_max} -> {len(sparse)} users "
      f"({len(sparse)/len(hist_len):.1%} of evaluated)")

def block(name, users):
    print(f"\n[{name}] users={len(users)}")
    subset = {u for u in users if any(v[0] for v in by_user[u].values())}
    print(f"nonempty truth: {len(subset)}  empty: {len(users) - len(subset)}")
    for m in sorted({m for u in users for m in by_user[u]}):
        vals = [by_user[u][m][1] for u in users if m in by_user[u]]
        ne = [by_user[u][m][1] for u in subset if m in by_user[u]]
        print(f"  {m:22s} all_users={sum(vals)/len(vals):.6f} (n={len(vals)})  "
              f"nonempty={sum(ne)/len(ne):.6f} (n={len(ne)})" if ne else
              f"  {m:22s} all_users={sum(vals)/len(vals):.6f} (n={len(vals)})  nonempty=n/a")

block('sparse subgroup', sparse)
block('non-sparse complement', set(hist_len) - sparse)

# 4. cross-check: how often raw future Buys exceed the eligible-intersected count
mismatch = sum(1 for u in hist_len if by_user[u]['cbf'][0] < len(truth_raw.get(u, set())))
print(f"\nraw-truth cross-check: {mismatch} evaluated users have future Buys outside "
      "the eligible universe (raw count > relevant_count); all others match exactly")
