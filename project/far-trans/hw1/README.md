# HW1 helper scripts

Python 3 standard library only. Run from any directory; `DATA` is the folder holding
the four FAR-Trans CSVs (see the starter README), `RUN` is a starter output directory
(written by `starter.py run`). All scripts are read-only over `RUN` and `DATA`.

```bash
# 0. Download and unzip the archive, then:
DATA=/path/to/FAR-Trans

# 1. Per-CSV header and exact data-row count (newline-safe)
python3 csv_profile.py "$DATA"

# 2. Sparse-subgroup analysis: distribution of distinct pre-cutoff assets per
#    evaluated user, subgroup sizes, and per-method nDCG@10 (all-user and
#    nonempty-truth means, with counts). Recomputes truth from raw
#    transactions.csv as a cross-check.
python3 sparse_analysis.py RUN 3 --data-dir "$DATA"          # sparse = <=3 assets

# 3. One verbatim pre-cutoff Buy row for a sparse evaluated user, with its as-of
#    asset_information and customer_information joins (leakage audit input)
python3 record_dump.py RUN "$DATA" --sparse-max 3 --nth 1

# 4. Hand-check of nDCG@10: rebuild truth from raw transactions, re-derive
#    eligibility from raw metadata+prices, recompute the metric from
#    predictions.csv, compare with per_user.csv
python3 hand_check.py RUN "$DATA" --nth 1 --method cbf

# 5. Audit exported encoder prompts: banned fields, post-cutoff dates,
#    character/word lengths (cost basis)
python3 prompt_audit.py prompts.jsonl

# 6. Why recency beats CBF on sparse users: share of one-asset users (seam
#    reweighting is a no-op for them), share of truth items already bought,
#    and the own asset's position in the cbf Top-10
python3 repeat_check.py RUN "$DATA"
```

Run these from `project/far-trans/hw1/`. They never call a model and never write to
the dataset. `sparse_analysis.py` reads `contexts.jsonl` + `per_user.csv`;
`record_dump.py` and `hand_check.py` additionally read the raw CSVs; `prompt_audit.py`
reads one `prompts.jsonl` from `starter.py export-prompts`.
