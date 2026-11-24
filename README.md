# Homework 2 — user-side LLM profile encoder on FAR-Trans

Session 1 question, implemented: does an LLM-written natural-language profile of
a customer's past purchases, used as the TF-IDF query of the content matcher,
improve nDCG@10 over the starter's purchase-count CBF?

- `far-trans/`, `far-trans-llm/` — unmodified copies of the course repository
  (`dryjins/RecSys-LLMs`) except one two-line patch in
  `far-trans-llm/runtime.py` (transformers 5.x renamed the `from_pretrained`
  dtype argument; generation settings unchanged).
- `far-trans-llm/profile_encoder.py` — the experiment: per-user facts (asset
  attributes + buy counts; no names, ISINs, dates), Qwen/Qwen3-1.7B greedy
  (thinking off) writes a profile, TF-IDF cosine over the full eligible
  universe; `template_profile` is the deterministic ablation.
- `far-trans-llm/test_profile_encoder.py` — unit tests (arithmetic, leakage
  allowlist, validation/fallback).
- `verify_hw2.py` — personal verification: protocol match, hand-recomputed
  nDCG@10, prompt leakage audit, fresh-ranking reproduction, subgroup stats.
- `report_hw2.html` / `argrishkina_hw2_report.pdf` — the report.
- `argrishkina_hw2_session.json` — unmodified tool-native AI-session export.

Run outputs (`outputs/`) are generated locally and not committed, per the
course guidance. Model: Qwen/Qwen3-1.7B, revision
`70d244cc86ccca08cf5af4e1e306ecf908b1ad5e`, cached under
`~/.cache/huggingface`.

## Reproduce

```bash
# data: https://researchdata.gla.ac.uk/1658/ extracted to ../FAR-Trans
py far-trans/starter.py run --data-dir ../FAR-Trans --output-dir outputs/baselines

cd far-trans-llm
py -m unittest test_profile_encoder
py profile_encoder.py --data-dir ../../FAR-Trans --output-dir ../outputs/profile_run \
   --model Qwen/Qwen3-1.7B --revision 70d244cc86ccca08cf5af4e1e306ecf908b1ad5e \
   --device cpu --on-invalid fallback

cd ..
py verify_hw2.py   # all checks must print PASS
```

Hardware of the recorded run: CPU float32, 20 logical cores, torch 2.12.0+cpu,
transformers 5.8.1; LLM inference 972 s for 74 unique generations.
