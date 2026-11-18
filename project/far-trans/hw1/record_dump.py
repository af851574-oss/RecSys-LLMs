#!/usr/bin/env python3
"""Pick one pre-cutoff Buy row for a sparse evaluated user and dump its as-of joins.

Prints the verbatim transaction row, the as-of asset_information row and the
as-of customer_information row for the same ids, with a leakage note per field.

Usage: python3 record_dump.py RUN_DIR DATA_DIR [--sparse-max 3] [--nth 1]
"""
import argparse, csv
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument('run_dir', type=Path)
ap.add_argument('data_dir', type=Path)
ap.add_argument('--sparse-max', type=int, default=3)
ap.add_argument('--nth', type=int, default=1, help='take the nth matching pre-cutoff Buy row')
a = ap.parse_args()
CUTOFF = '2021-06-01'

import json
hist_len, eligible = {}, {}
for line in (a.run_dir / 'contexts.jsonl').read_text(encoding='utf-8').splitlines():
    if line.strip():
        c = json.loads(line)
        hist_len[c['user_id']] = len(c['history'])
        eligible[c['user_id']] = set(c['eligible_asset_ids'])
sparse = sorted(u for u, n in hist_len.items() if n <= a.sparse_max)

candidates = []
with (a.data_dir / 'transactions.csv').open(encoding='utf-8-sig', newline='') as s:
    for row in csv.DictReader(s):
        if (row['customerID'] in sparse and row['transactionType'] == 'Buy'
                and row['transactionID'].lstrip('-').isdigit()
                and int(row['transactionID']) >= 0
                and row['timestamp'][:10] < CUTOFF
                and row['ISIN'] in eligible[row['customerID']]):
            candidates.append(row)
row = candidates[a.nth - 1]
print(f"sparse evaluated users: {len(sparse)}; matching pre-cutoff Buy rows: {len(candidates)}; "
      f"showing candidate #{a.nth}\n")

print("TRANSACTION (transactions.csv) — fields and verbatim values")
for k, v in row.items():
    print(f"  {k} = {v!r}")

def latest_before(path, key, keyval):
    best = None
    with path.open(encoding='utf-8-sig', newline='') as s:
        for r in csv.DictReader(s):
            if r[key] == keyval and r['timestamp'][:10] < CUTOFF:
                if best is None or r['timestamp'] > best['timestamp']:
                    best = r
    return best

asset = latest_before(a.data_dir / 'asset_information.csv', 'ISIN', row['ISIN'])
cust = latest_before(a.data_dir / 'customer_information.csv', 'customerID', row['customerID'])
print("\nAS-OF asset_information row (latest strictly before cutoff)")
for k, v in asset.items():
    print(f"  {k} = {v!r}")
print("\nAS-OF customer_information row (latest strictly before cutoff)")
for k, v in cust.items():
    print(f"  {k} = {v!r}")
print(f"\nwindow: pre-cutoff history split (cutoff {CUTOFF}); the truth window is "
      f"{CUTOFF} .. 2021-06-30 (exclusive end) and is NOT shown here")
