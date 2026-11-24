"""HW2 personal verification: hand-recomputed metrics, leakage audit, reproducibility.

Checks (each prints PASS/FAIL with details):
 1. Protocol match between the baseline run and the profile run.
 2. Hand-recomputed nDCG@10 for the first nonempty-truth user, per method.
 3. Prompt leakage audit: dates, allowlist, no ISINs/names.
 4. Fresh recomputation of profile rankings from saved texts.
 5. Valid-only (fallback-excluded) means for the two profile methods.
 6. Sparse subgroup (<=3 distinct pre-cutoff assets) statistics.
Everything except per_user.json/predictions.csv/metrics.json is re-derived from
the raw CSV files under the starter's row policy.
"""
from __future__ import annotations

import csv
import json
import math
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'far-trans-llm'))
import profile_encoder as pe  # noqa: E402

BASE = ROOT / 'outputs' / 'baselines'
RUN = ROOT / 'outputs' / 'profile_run'
DATA = Path('D:/Anna/Documents/LLM4Rec/FAR-Trans')
CUTOFF = '2021-06-01'
END = '2021-07-01'

failures = []


def check(name, ok, detail=''):
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" -- {detail}" if detail else ''))
    if not ok:
        failures.append(name)


def rows(path):
    with path.open(encoding='utf-8-sig', newline='') as stream:
        yield from csv.DictReader(stream)


# ---------- raw data re-derivation under the starter's row policy ----------
assets_priced = {r['ISIN'] for r in rows(DATA / 'close_prices.csv')
                 if r['timestamp'][:10] < CUTOFF and float(r['closePrice']) > 0}
asset_rows = {}
for row in rows(DATA / 'asset_information.csv'):
    if row['timestamp'][:10] < CUTOFF and row['ISIN'] in assets_priced:
        previous = asset_rows.get(row['ISIN'])
        if previous is None or row['timestamp'] > previous['timestamp']:
            asset_rows[row['ISIN']] = row
eligible = sorted(asset_rows)
truth, hist = defaultdict(set), defaultdict(Counter)
seen = set()
for row in rows(DATA / 'transactions.csv'):
    key = tuple(sorted(row.items()))
    if key in seen or int(row['transactionID']) < 0:
        seen.add(key)
        continue
    seen.add(key)
    if row['transactionType'] != 'Buy' or row['ISIN'] not in asset_rows:
        continue
    if row['timestamp'][:10] < CUTOFF:
        hist[row['customerID']][row['ISIN']] += 1
    elif row['timestamp'][:10] < END:
        truth[row['customerID']].add(row['ISIN'])
pop = Counter(i for counts in hist.values() for i in counts)

# ---------- 1. Protocol match ----------
base_protocol = json.loads((BASE / 'protocol.json').read_text())
manifest = json.loads((RUN / 'run_manifest.json').read_text())
check('same users', base_protocol['users'] == manifest['users'])
check('eligible assets re-derived == baseline protocol', eligible == base_protocol['eligible_assets'],
      f'{len(eligible)} assets')
check('same data hashes', base_protocol['source_sha256'] == manifest['data_sha256'])
check('same cutoff and horizon', base_protocol['cutoff'] == manifest['cutoff'] == CUTOFF
      and base_protocol['end_exclusive'] == manifest['end_exclusive'] == END)

users = manifest['users']
nonempty = [u for u in users if truth.get(u)]
check('nonempty truth count is 11', len(nonempty) == 11, f'got {len(nonempty)}')

# ---------- stored results ----------
records = json.loads((RUN / 'per_user.json').read_text())
by_user_method = {(r['user_id'], r['method']): r for r in records}
rankings = defaultdict(dict)
for row in csv.DictReader((RUN / 'predictions.csv').open(encoding='utf-8', newline='')):
    rankings[row['user_id']].setdefault(row['method'], []).append((int(row['rank']), row['ISIN']))
for uid in rankings:
    rankings[uid] = {m: [i for _, i in sorted(pairs)] for m, pairs in rankings[uid].items()}

# ---------- 2. Hand-recomputed nDCG@10 ----------
def hand_ndcg(ranking, truth_set):
    if not truth_set:
        return 0.0
    gain = sum(1 / math.log2(i + 2) for i, isin in enumerate(ranking[:10])
               if isin in truth_set)
    ideal = sum(1 / math.log2(i + 2) for i in range(min(10, len(truth_set))))
    return gain / ideal


target = nonempty[0]
relevant = truth[target] & set(eligible)
print(f"\nHand check on {target}: truth re-derived = {sorted(relevant)}")
for method in ('cbf', 'popularity', 'latest_buy', 'latest_buy_or_sell',
               'llm_profile', 'template_profile'):
    hand = hand_ndcg(rankings[target][method], relevant)
    stored = by_user_method[(target, method)]['ndcg_at_10']
    check(f'nDCG hand==stored [{method}]', abs(hand - stored) < 1e-12,
          f'hand={hand:.10f} stored={stored:.10f}')

# ---------- 3. Prompt leakage audit ----------
date_re = re.compile(r'\b(20\d{2})-(\d{2})-(\d{2})\b')
isin_re = re.compile(r'\b[A-Z]{2}[A-Z0-9]{9}\d\b')
allow = {'category', 'subcategory', 'sector', 'industry', 'market', 'buy_count'}
bad_dates = bad_fields = isins_in_facts = 0
prompts = {json.loads(line)['user_id']: json.loads(line)['prompt']
           for line in (RUN / 'profile_prompts.jsonl').read_text().splitlines()}
check('prompt count = users', len(prompts) == len(users))
for prompt in prompts.values():
    for y, m, d in date_re.findall(prompt):
        if f'{y}-{m}-{d}' >= CUTOFF:
            bad_dates += 1
    facts = json.loads(prompt.split('Facts: ', 1)[1])
    if set(facts) != {'purchases'} or any(set(p) != allow for p in facts['purchases']):
        bad_fields += 1
    if isin_re.search(prompt.split('Facts: ', 1)[1]):
        isins_in_facts += 1
check('no post-cutoff dates in prompts', bad_dates == 0, f'{bad_dates} found')
check('facts use the allowlist only', bad_fields == 0, f'{bad_fields} rows')
check('no ISIN-like tokens in facts', isins_in_facts == 0, f'{isins_in_facts} found')

# ---------- 4. Fresh recomputation of profile rankings ----------
documents = {i: pe.asset_text(asset_rows[i]) for i in eligible}
vectors, df, n = pe.fit_tfidf(documents)
texts = {json.loads(line)['user_id']: json.loads(line)
         for line in (RUN / 'profile_texts.jsonl').read_text().splitlines()}
fallback_users = {json.loads(line)['user_id']
                  for line in (RUN / 'profile_failures.jsonl').read_text().splitlines()}
repro_targets = [u for u in nonempty[:3] if u not in fallback_users][:2] or nonempty[:1]
for repro in repro_targets:
    for method, key in (('llm_profile', 'llm_profile'), ('template_profile', 'template_profile')):
        fresh, _ = pe.profile_ranking(texts[repro][key], vectors, df, n, pop, eligible)
        check(f'fresh ranking == stored [{method}, {repro[:8]}…]',
              fresh == rankings[repro][method],
              f'{fresh[:2]} vs {rankings[repro][method][:2]}')

# ---------- 5. Valid-only means ----------
for method in ('llm_profile', 'template_profile'):
    valid = [r for r in records
             if r['method'] == method and r['user_id'] not in fallback_users]
    all_mean = sum(r['ndcg_at_10'] for r in valid) / len(valid)
    ne = [r for r in valid if r['relevant_count']]
    ne_mean = sum(r['ndcg_at_10'] for r in ne) / len(ne)
    print(f"       {method}: valid-only n={len(valid)}  all={all_mean:.4f}  "
          f"nonempty={ne_mean:.4f} (n={len(ne)})")

# ---------- 6. Sparse subgroup ----------
sparse = [u for u in users if len(hist[u]) <= 3]
sparse_ne = [u for u in sparse if truth.get(u)]
print(f"\nSparse subgroup (<=3 distinct pre-cutoff assets): {len(sparse)}/100 users, "
      f"{len(sparse_ne)} with nonempty truth")
for method in ('cbf', 'popularity', 'latest_buy', 'latest_buy_or_sell',
               'llm_profile', 'template_profile'):
    vals = [by_user_method[(u, method)]['ndcg_at_10'] for u in sparse]
    ne_vals = [by_user_method[(u, method)]['ndcg_at_10'] for u in sparse_ne]
    print(f"       {method:22s} all={sum(vals) / len(vals):.4f}  "
          f"nonempty={sum(ne_vals) / len(ne_vals) if ne_vals else 0:.4f} (n={len(ne_vals)})")
repeats = sum(1 for u in nonempty if truth[u] & set(hist[u]))
print(f"       repeat buyers among the 11 nonempty users: {repeats}")

print('\n' + ('ALL CHECKS PASSED' if not failures else f'FAILED: {failures}'))
sys.exit(1 if failures else 0)
