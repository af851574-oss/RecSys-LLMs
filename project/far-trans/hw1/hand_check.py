#!/usr/bin/env python3
"""Hand-check nDCG@10 for one evaluated user with nonempty truth.

Independently rebuilds the truth set from raw transactions.csv, re-derives
eligibility from raw metadata + close prices, recomputes nDCG@10 of the cbf
top-10 from predictions.csv, and compares with per_user.csv. Shows arithmetic.

Usage: python3 hand_check.py RUN_DIR DATA_DIR [--nth 1] [--method cbf]
"""
import argparse, csv, json, math
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument('run_dir', type=Path)
ap.add_argument('data_dir', type=Path)
ap.add_argument('--nth', type=int, default=1, help='nth nonempty-truth user in file order')
ap.add_argument('--method', default='cbf')
a = ap.parse_args()
CUTOFF, END = '2021-06-01', '2021-07-01'

# candidate users: nonempty truth per per_user.csv
per_user = list(csv.DictReader((a.run_dir / 'per_user.csv').open(newline='')))
users = [r['user_id'] for r in per_user
         if r['method'] == a.method and int(r['relevant_count']) > 0]
uid = users[a.nth - 1]
row = next(r for r in per_user if r['user_id'] == uid and r['method'] == a.method)
print(f"user {uid} (nth={a.nth} nonempty-truth user for method {a.method}, file order)")

# 1. truth from raw transactions: future Buys in the window
truth_raw = set()
with (a.data_dir / 'transactions.csv').open(encoding='utf-8-sig', newline='') as s:
    for r in csv.DictReader(s):
        if r['customerID'] == uid and r['transactionType'] == 'Buy' and CUTOFF <= r['timestamp'][:10] < END:
            truth_raw.add(r['ISIN'])
print(f"future Buy ISINs in window from raw transactions.csv: {sorted(truth_raw)}")

# 2. eligibility, re-derived from raw metadata + prices (not from protocol.json)
meta_ok, price_ok = set(), set()
with (a.data_dir / 'asset_information.csv').open(encoding='utf-8-sig', newline='') as s:
    for r in csv.DictReader(s):
        if r['ISIN'] in truth_raw and r['timestamp'][:10] < CUTOFF:
            meta_ok.add(r['ISIN'])
with (a.data_dir / 'close_prices.csv').open(encoding='utf-8-sig', newline='') as s:
    for r in csv.DictReader(s):
        if r['ISIN'] in truth_raw and r['timestamp'][:10] < CUTOFF and float(r['closePrice']) > 0:
            price_ok.add(r['ISIN'])
eligible_recomputed = meta_ok & price_ok
truth = truth_raw & eligible_recomputed
print(f"as-of metadata before cutoff: {sorted(meta_ok)}")
print(f"positive pre-cutoff close price: {sorted(price_ok)}")
print(f"recomputed truth (intersection with re-derived eligible): {sorted(truth)}")

ctx = None
for line in (a.run_dir / 'contexts.jsonl').read_text(encoding='utf-8').splitlines():
    if line.strip() and json.loads(line)['user_id'] == uid:
        ctx = json.loads(line)
print(f"starter relevant_count (per_user.csv) = {row['relevant_count']}; "
      f"mine = {len(truth)}; eligible-set size in context = {len(ctx['eligible_asset_ids'])}")

# 3. ranking from predictions.csv and nDCG@10 arithmetic
ranking = [r['ISIN'] for r in per_user if False] or []
with (a.run_dir / 'predictions.csv').open(newline='') as s:
    ranking = [r['ISIN'] for r in csv.DictReader(s)
               if r['user_id'] == uid and r['method'] == a.method]
print(f"{a.method} top-10 from predictions.csv: {ranking}")
hits = [(i + 1, isin) for i, isin in enumerate(ranking[:10]) if isin in truth]
gain = sum(1 / math.log2(rank + 1) for rank, _ in hits)
ideal = sum(1 / math.log2(i + 2) for i in range(min(10, len(truth))))
print(f"hits at ranks: {hits}")
print("gain = " + " + ".join(f"1/log2({rank}+1)" for rank, _ in hits) + f" = {gain:.10f}")
print(f"ideal = sum over {min(10, len(truth))} positions = {ideal:.10f}")
print(f"nDCG@10 = {gain:.10f} / {ideal:.10f} = {gain / ideal:.10f}")
print(f"per_user.csv ndcg_at_10 = {row['ndcg_at_10']}")
print(f"match: {abs(gain / ideal - float(row['ndcg_at_10'])) < 1e-12}")
