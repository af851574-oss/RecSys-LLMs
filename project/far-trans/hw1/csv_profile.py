#!/usr/bin/env python3
"""Precise per-CSV header and data-row counts for the FAR-Trans archive."""
import csv, sys
from pathlib import Path

d = Path(sys.argv[1])
for name in sorted(p.name for p in d.glob('*.csv')):
    with (d / name).open(encoding='utf-8-sig', newline='') as s:
        r = csv.reader(s)
        header = next(r, [])
        n = sum(1 for _ in r)
    print(f"{name}\theader={header}\tdata_rows={n}")
