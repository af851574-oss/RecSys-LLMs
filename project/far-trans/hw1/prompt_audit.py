#!/usr/bin/env python3
"""Audit exported encoder prompts: leakage terms, forbidden fields, length stats.

Usage: python3 prompt_audit.py prompts.jsonl
"""
import json, re, sys
from pathlib import Path

path = Path(sys.argv[1])
banned_fields = ('eligible_asset_ids', 'relevant_count', 'truth', 'future',
                 'profitability', 'closePrice', 'totalValue', 'units', 'limit_prices')

cutoff = '2021-06-01'
# any full date strictly at/after the cutoff, excluding the cutoff string itself
future_dates = re.compile(r'(?<!\d)(\d{4}-\d{2}-\d{2})(?!\d)')

n = 0
lengths = []
problems = []
for line in path.read_text(encoding='utf-8').splitlines():
    if not line.strip():
        continue
    rec = json.loads(line)
    n += 1
    prompt = rec['prompt']
    lengths.append(len(prompt))
    payload = json.loads(prompt[prompt.index('{"demonstrations"'):])
    found = [k for k in banned_fields if k in json.dumps(payload)]
    if found:
        problems.append((rec['user_id'], 'field', found))
    dates = sorted({d for d in future_dates.findall(prompt) if d != cutoff and d >= cutoff})
    if dates:
        problems.append((rec['user_id'], 'future_date', dates))

print(f"prompts: {n}")
print(f"chars: min={min(lengths)} max={max(lengths)} mean={sum(lengths)/len(lengths):.0f}")
words = [len(p.split()) for p in
         [json.loads(l)['prompt'] for l in path.read_text(encoding='utf-8').splitlines() if l.strip()]]
print(f"words: min={min(words)} max={max(words)} mean={sum(words)/len(words):.0f}")
print(f"problems: {problems if problems else 'none'}")
