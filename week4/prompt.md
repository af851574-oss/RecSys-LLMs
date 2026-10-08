# Week 4 — LLM prompt journal

The starting point is the HW4 starter in `week4/`: a dictionary-encoded UCI
Online Retail dataset (`transactions.js`, 17,080 baskets, 3,653 items), a page
with two sliders (minimum support, minimum confidence) and a "Run rules"
button, and a `script.js` with seven `TODO(hw4)` stubs (`dedupeBasket`,
`countItemset`, `computeSupport`, `computeConfidence`, `computeLift`,
`findFrequentItemsets`, `generateRules`). Everything else — dataset decoding,
the inverted index (`buildIndex` / `asIndex`), `countItem` / `countPair`,
rendering, the worked example and the 11-check test harness — is scaffolding
and stays untouched.

## 1. BUILD — inspect the baseline

> Run the starter as-is before writing anything: what does the harness report with the stubs untouched, what shape is the dataset, and how expensive is the slider minimum? Check with node against the real files, not browser guesswork. Do not change code yet.

Recorded before any change (starter `script.js` from `/tmp/a04-starter/`, run
under `node:vm` with the real `transactions.js`): the page's own harness
reports **2 passed / 0 failed / 9 pending** — the two scaffolding checks
(empty-state rendering, threshold validation) pass, the nine checks that touch
a stub report `PENDING`. That matches the readme's stated baseline. The
dataset decodes to **17,080 baskets** and **3,653 distinct items**; the most
frequent item `85123A` (WHITE HANGING HEART T-LIGHT HOLDER) is in **1,959
baskets = 11.47%**, the readme's anchor fact. The slider minimum is 0.5%
support = **86 baskets**, and a prototype Apriori that counts candidates
through the starter's inverted index finishes 0.5% in ~3 s in node, so no
faster miner is needed to stay responsive in the browser.

## 2. ASK WHY — counting, closure, and which metric to trust

> Why is an inverted index enough for Apriori here, why does the support slider move everything while the confidence slider moves nothing, and why is lift the metric that separates a real cross-sell from a popularity echo?

- **Counting.** `countItemset` only ever needs "how many baskets contain all
  of these stocks", and the starter's index already answers that by
  intersecting posting lists (smallest first). Apriori needs the same
  primitive at every level, so the miner reuses `countItemset` / `asIndex`
  instead of adding a second counting path that could disagree with the table.
- **Downward closure.** A k-itemset can only be frequent if all its (k−1)-
  subsets are, so support filters cascade: kill one frequent pair and every
  triple containing it disappears without being counted. That is why support
  is the expensive knob (it re-mines) while confidence is free (it only
  filters splits of itemsets already mined) — visible in the sweep: 0.5%→3%
  support collapses 5,255 itemsets to 115, while 30%→60% confidence at fixed
  1% support leaves the 1,219 itemsets untouched and cuts only the rules.
- **Lift vs confidence.** Confidence into a very frequent item is inflated by
  that item's baseline rate: `85123A` is in 11.47% of baskets, so a rule
  ending in it reaches double-digit confidence by pure popularity. Lift
  divides confidence by that baseline (`count(B)/N`), so lift ≈ 1 exposes the
  echo and lift ≫ 1 survives it.

## 3. TEST — make the math checkable

> Write a plain-node test with no dependencies that loads the REAL transactions.js and the REAL script.js (unchanged, browser behaviour identical), runs the starter's own harness, pins the dataset anchors, reproduces the lecture example and the direction example, checks every generated rule against both thresholds and lift symmetry, and hand-computes one real rule from raw counts. No frameworks, no edits to script.js for testability.

`week4/test.mjs` boots the unmodified `script.js` in a `node:vm` sandbox with a
minimal `window`/`document` stub (an element whose `innerHTML` is readable
back through `textContent`, which is all the harness needs), then asserts:

- the starter harness is **11 passed / 0 failed / 0 pending**, and no
  `throw new Error("TODO(hw4)` stub remains;
- anchors: **N = 17,080**, **3,653 items**, **count(85123A) = 1959 = 11.47%**;
- `dedupeBasket` first-appearance order over mixed strings/objects;
  `countItemset` returns 0 for an empty request, an unknown stock, and dedupes
  the request;
- **lecture-slide example** on 8 baskets (count(A)=5, count(B)=5,
  count(A∩B)=3): support 3/8 = **37.5%**, confidence 3/5 = **60%**,
  lift 0.6 / (5/8) = **0.96**;
- **direction example** (count(A)=5, count(B)=6, joint=3, N=8):
  confidence(A→B) = **60%** ≠ confidence(B→A) = **50%**, lift = **0.8 both ways**;
- zero denominators: `computeSupport(·,0)`, `computeConfidence(·,0)`,
  `computeLift` with undefined confidence / `count(B)=0` / `N=0` all return
  `{ value: 0, defined: false }`;
- at the chosen thresholds (1% / 50%): every frequent itemset's support
  ≥ 1% **and** its count matches a recount through the index; every (k−1)-subset
  of every frequent itemset is present in the output (downward closure);
  every table rule satisfies **both** thresholds with confidence = joint/count(A),
  support = joint/N, lift = (joint/count(A)) / (count(B)/N); every rule whose
  mirror direction also passes the confidence cut has its mirror generated,
  and **lift(A→B) = lift(B→A)** for all of them;
- **one real rule hand-computed from raw counts** (verified by an independent
  plain-loop scan over the decoded baskets, not the index):
  `22916 → 22917` (HERB MARKER THYME → HERB MARKER ROSEMARY)

  - count(22916) = **186**, count(22917) = **190**, count(22916 ∩ 22917) = **176**, N = **17080**
  - support = 176 / 17080 = **0.010304 → 1.03%**
  - confidence = 176 / 186 = **0.946237 → 94.62%**
  - P(B) = 190 / 17080 = 0.011124
  - lift = 0.946237 / 0.011124 = **85.0617**
  - the same numbers come out of `computeSupport` / `computeConfidence` /
    `computeLift`, out of `generateRules`, and out of the page (see
    verification), so the table, the detail panel and the report cannot disagree.

## 4. EXPLAIN — in my own words

**Why lift, not confidence, backs the useful rule.** My useful rule is
`{22697 GREEN REGENCY TEACUP AND SAUCER, 22699 ROSES REGENCY TEACUP AND
SAUCER} → 22698 PINK REGENCY TEACUP AND SAUCER`: count(A) = 541,
count(A∪B) = 390, confidence 72.09%, lift **22.35**. Confidence alone is not
the argument, because a random basket already contains 22698 in 3.2% of cases
(551/17,080), so a 72% conditional could in principle be bought by B's own
popularity. Lift divides that baseline out and says baskets with the green and
roses cups buy the pink cup ~22× more often than chance — with support 2.28%
(390 baskets) that is a real, actionable pattern (a “complete the trio”
recommendation slot or a bundled SKU), which confidence by itself could not
tell me.

**Why the misleading rule misleads.** `23206 LUNCH BAG APPLE DESIGN → 85123A
WHITE HANGING HEART T-LIGHT HOLDER` (0.5% / 10% setting) shows confidence
13.76% — the highest among rules whose lift sits in [0.8, 1.2] — with lift
**1.1995**: a naive reading mines the rule, concludes lunch-bag buyers also
buy the heart t-light holder, and cross-merchandises them. But 85123A sits in
**1,959 of 17,080 baskets (11.47%)** all by itself, so ~11% of *any* slice of
baskets would contain it; 13.76% is barely above that baseline and lift 1.2
means the pair is close to independent — the confidence is bought by B's
frequency, not by a relationship. At this support level no genuinely
high-confidence rule has lift near 1 (50% confidence into an 11.47% item
already forces lift ≥ ~4.4), so the misleading family is exactly these
low-cut rules into super-frequent items, plus their mirror in the analysis:
99%+ confidence rules whose antecedent is a 4–5-item herb-marker subset that
occurs in ~133 baskets — the confidence mostly restates that one wholesale
line was bought as a set.

**Threshold trade-off in terms of downward closure.** Support gates the whole
lattice — 0.5% keeps 5,255 itemsets (sizes 1–6) and 5,812 rules at 50%
confidence, 1% keeps 1,219 itemsets and 456 rules, 2% keeps 294 and 36, 3%
keeps 115 and 6 — and the collapse is non-linear precisely because of downward
closure: once a pair drops below the cut, every triple containing it is pruned
before it is ever counted, and past 2% no 3-itemset survives at all, which
forbids every 2-item antecedent. Confidence never re-mines: at 1% support,
30%→60% confidence keeps the same 1,219 itemsets and only shrinks the rule
list 950 → 238, so the cheap way to trim the table is the confidence slider
and the structure-changing one is support. I keep **1% / 50%** because 456
rules is a readable table that still contains 3-itemset bundles, mining takes
~1.3–1.4 s, and every one of the 456 rules has lift > 1.

**Association is not causation.** `A → B` is only a statement about
co-occurrence in past invoices, so promoting A does not have to move B.
For my teacup rule the obvious confounder is that all three items are one
product line (the Regency range) bought by the same wholesale gift-shop
customers who stock the full range to resell: the segment and the range do the
work, and the pink cup would have been bought whether or not the other two
were "promoted". A campaign pushing the green and roses cups might mostly
attract the same resellers who were buying all three anyway, so incremental
sales of 22698 could be near zero despite lift 22.

**Validation plan (no usable timestamps in the exported data).** The source
log has `InvoiceDate`, but the starter exports baskets keyed by `InvoiceNo`
only — there is **no usable per-basket timestamp**, so a temporal split, a
later-period stability check or a seasonality check **cannot be run on this
data**, and I did not simulate one. If later-period baskets are obtained, I
would mine the rule on the earlier window and measure it on the held-out later
window, accepting it only if support stays ≥ ~1%, confidence stays within a
95% binomial band of the training value, and lift stays ≥ 10 (well above the
≈1 that would mean the pattern decayed to popularity). The smallest real
experiment with the current shop is an **A/B test**: the treatment group sees
the "complete the trio" slot for 22698 on baskets containing 22697/22699, the
control sees nothing, the metric is the incremental attach rate of 22698, and
the pre-registered decision rule is to ship only if the treatment attach rate
beats control by a fixed margin (e.g. ≥ +5 pp) under a two-proportion z-test
at α = 0.05 with enough baskets powered for that margin. Both the later-period
data and the experiment require data the starter does not contain.

## 5. IMPROVE — implement the smallest reliable version

> Implement only the seven stubs in plain JavaScript, leave the scaffolding byte-for-byte as it is, keep the page working from file:// with no server, and make sure the slider minimum (0.5% support) stays responsive.

Implemented in `week4/script.js`, nothing else touched there:

- `dedupeBasket` — one pass, `stockOf`, first-appearance order.
- `countItemset` — dedupe the request, fetch posting lists from `asIndex`
  (0 for an unknown stock), intersect smallest-first, return the intersection
  size.
- `computeSupport` / `computeConfidence` / `computeLift` — guarded divisions
  returning `{ value, defined }`, `defined: false` with `value: 0` on a zero
  denominator (`N = 0`, `count(A) = 0`, `count(B) = 0`, or an undefined
  incoming confidence).
- `findFrequentItemsets` — level-wise **Apriori**: frequent single items,
  then per level candidates by prefix-joining frequent (k−1)-itemsets,
  downward-closure pruning (every (k−1)-subset must already be frequent), and
  counting through the shared inverted index via `countItemset`. Threshold is
  `count ≥ ceil(minSupport·N − ε)` so exact multiples do not round up.
- `generateRules` — every non-empty proper subset of each frequent itemset
  (≥ 2 items) as antecedent, complement as consequent, which yields both
  directions; subset counts come from the frequent-itemset list itself
  (guaranteed by downward closure), metrics from `computeConfidence` /
  `computeLift` with N recovered from the itemset's own support; keeps
  `confidence ≥ minConfidence`; sorted by lift, then confidence, then
  lexicographically, so the table order is deterministic and the strongest
  rule is the first clickable row.

The rule table keeps every rule that passes both sliders (no lift filter in
the UI — that is the scaffolding's contract); lift > 1 retention is applied in
the analysis, where it is reported, not silently dropped. Zero-denominator
rules never occur from generated rules (count(A) > 0 always), and the detail
panel already shows the inline note if one ever did.

## Verification actually run

- `node week4/test.mjs` — **PASS, 13/13 checks** (output below), ~1.7 s.
- `node week4/analysis.mjs` — full deterministic output below, ~5.5 s.
- `node --check week4/script.js` — exit 0.
- Headless Chrome over the **Chrome DevTools Protocol** (node's built-in
  WebSocket, no npm packages, driver at `/tmp/a04-cdp.mjs`, outside the repo)
  against `file:///tmp/recsys-a04/week4/index.html`:
  - `#run-tests` → `#testLog`: **"HW4 self-checks — pass 11, fail 0, pending 0 (of 11)"**;
  - sliders set to 1.0% / 50% (input + change events dispatched), `#run-rules`
    → status "Done — **456 rule(s)** at support ≥ 1.0% and confidence ≥ 50%",
    pipeline **1,119 ms** in the browser; first row
    `22916 — HERB MARKER THYME | 22917 — HERB MARKER ROSEMARY | 176 | 186 | 190 | 1.03% | 94.62% | 85.0617`;
  - clicking row 1 → `#rule-detail` shows the same numbers; **Reverse
    direction (B → A)** shows confidence **92.63%** (changed) and lift
    **85.0617** (unchanged). Chrome was killed and the temp profile removed.
- `cmp week4/transactions.js /tmp/a04-starter/transactions.js` etc. —
  `transactions.js`, `readme.md`, `index.html`, `style.css` are **byte-identical**
  to the starter; only `script.js` differs (the seven stubs).
- Baseline reproduced before implementing: starter harness reports
  **2 passed / 0 failed / 9 pending**.

### node week4/test.mjs

```
PASS no unimplemented TODO(hw4) stub throws remain
PASS starter harness: 11 passed / 0 failed / 0 pending
PASS dataset anchors: N = 17080 baskets, 3653 distinct items, count(85123A) = 1959
PASS dedupeBasket keeps first-appearance order over strings and objects
PASS countItemset: 0 for empty request, 0 for unknown stock, dedupes the request
PASS lecture example: support 37.5%, confidence 60%, lift 0.96
PASS direction example: A->B 60% vs B->A 50%, identical lift 0.8
PASS zero denominators return defined: false
PASS every frequent itemset really satisfies minSupport (recounted)
PASS downward closure: every (k-1)-subset of a frequent itemset is in the output
PASS every table rule satisfies BOTH thresholds and carries correct raw counts
PASS both directions are generated, and lift(A->B) = lift(B->A) for every rule
PASS hand-computed rule 22916 -> 22917 matches raw basket scans and the pipeline

HW4 test.mjs: all 13 checks passed.
```

### Sweep (node week4/analysis.mjs), miner wall-clock included

(mine times are wall-clock and move by ±100 ms between runs; every count in
this table is identical run to run)

```
support | conf  | itemsets by size (size:count) | total sets | rules   | lift > 1 | miner
--------|-------|-------------------------------|------------|---------|----------|------
   0.5% |   30% | 1:1320 2:2206 3:1161 4:474 5:88 6:6 |       5255 |   10723 |    10723 | 3462 ms
   0.5% |   50% | 1:1320 2:2206 3:1161 4:474 5:88 6:6 |       5255 |    5812 |     5812 | 3462 ms
   0.5% |   60% | 1:1320 2:2206 3:1161 4:474 5:88 6:6 |       5255 |    3958 |     3958 | 3462 ms
   1.0% |   30% | 1:691 2:413 3:109 4:6         |       1219 |     950 |      950 | 1343 ms
   1.0% |   50% | 1:691 2:413 3:109 4:6         |       1219 |     456 |      456 | 1343 ms
   1.0% |   60% | 1:691 2:413 3:109 4:6         |       1219 |     238 |      238 | 1343 ms
   2.0% |   30% | 1:242 2:51 3:1                |        294 |      96 |       96 |  267 ms
   2.0% |   50% | 1:242 2:51 3:1                |        294 |      36 |       36 |  267 ms
   2.0% |   60% | 1:242 2:51 3:1                |        294 |      20 |       20 |  267 ms
   3.0% |   30% | 1:109 2:6                     |        115 |      12 |       12 |   76 ms
   3.0% |   50% | 1:109 2:6                     |        115 |       6 |        6 |   76 ms
   3.0% |   60% | 1:109 2:6                     |        115 |       5 |        5 |   76 ms
```

### Final rule table at the chosen 1% / 50% — top 15 by lift (of 456)

```
 1 | 22916 HERB MARKER THYME | 22917 HERB MARKER ROSEMARY |  186 |  190 |  176 |   1.03% |     94.62% | 85.0617
 2 | 22917 HERB MARKER ROSEMARY | 22916 HERB MARKER THYME |  190 |  186 |  176 |   1.03% |     92.63% | 85.0617
 3 | 22916 HERB MARKER THYME | 22918 HERB MARKER PARSLEY |  186 |  187 |  171 |   1.00% |     91.94% | 83.9710
 4 | 22918 HERB MARKER PARSLEY | 22916 HERB MARKER THYME |  187 |  186 |  171 |   1.00% |     91.44% | 83.9710
 5 | 22918 HERB MARKER PARSLEY | 22917 HERB MARKER ROSEMARY |  187 |  190 |  174 |   1.02% |     93.05% | 83.6454
 6 | 22917 HERB MARKER ROSEMARY | 22918 HERB MARKER PARSLEY |  190 |  187 |  174 |   1.02% |     91.58% | 83.6454
 7 | 22917 HERB MARKER ROSEMARY | 22920 HERB MARKER BASIL |  190 |  187 |  172 |   1.01% |     90.53% | 82.6839
 8 | 22920 HERB MARKER BASIL | 22917 HERB MARKER ROSEMARY |  187 |  190 |  172 |   1.01% |     91.98% | 82.6839
 9 | 22918 HERB MARKER PARSLEY | 22919 HERB MARKER MINT |  187 |  191 |  171 |   1.00% |     91.44% | 81.7728
10 | 22919 HERB MARKER MINT | 22918 HERB MARKER PARSLEY |  191 |  187 |  171 |   1.00% |     89.53% | 81.7728
11 | 22917 HERB MARKER ROSEMARY | 22919 HERB MARKER MINT |  190 |  191 |  173 |   1.01% |     91.05% | 81.4230
12 | 22919 HERB MARKER MINT | 22917 HERB MARKER ROSEMARY |  191 |  190 |  173 |   1.01% |     90.58% | 81.4230
13 | 23170 REGENCY TEA PLATE ROSES + 23171 REGENCY TEA PLATE GREEN | 23172 REGENCY TEA PLATE PINK |  229 |  224 |  185 |   1.08% |     80.79% | 61.5993
14 | 23172 REGENCY TEA PLATE PINK | 23170 REGENCY TEA PLATE ROSES + 23171 REGENCY TEA PLATE GREEN |  224 |  229 |  185 |   1.08% |     82.59% | 61.5993
15 | 23170 REGENCY TEA PLATE ROSES + 23172 REGENCY TEA PLATE PINK | 23171 REGENCY TEA PLATE GREEN |  197 |  269 |  185 |   1.08% |     93.91% | 59.6267
```

### Useful candidates (lift > 1, count(A) ≥ 500; 65 rules qualify) — top of the list

```
22697 GREEN REGENCY TEACUP AND SAUCER + 22699 ROSES REGENCY TEACUP AND SAUCER | 22698 PINK REGENCY TEACUP AND SAUCER |  541 |  551 |  390 |   2.28% |     72.09% | 22.3462
22698 PINK REGENCY TEACUP AND SAUCER | 22697 GREEN REGENCY TEACUP AND SAUCER + 22699 ROSES REGENCY TEACUP AND SAUCER |  551 |  541 |  390 |   2.28% |     70.78% | 22.3462
22697 GREEN REGENCY TEACUP AND SAUCER | 22698 PINK REGENCY TEACUP AND SAUCER + 22699 ROSES REGENCY TEACUP AND SAUCER |  691 |  436 |  390 |   2.28% |     56.44% | 22.1100
22698 PINK REGENCY TEACUP AND SAUCER | 22697 GREEN REGENCY TEACUP AND SAUCER |  551 |  691 |  460 |   2.69% |     83.48% | 20.6356
22697 GREEN REGENCY TEACUP AND SAUCER | 22698 PINK REGENCY TEACUP AND SAUCER |  691 |  551 |  460 |   2.69% |     66.57% | 20.6356
```

### Misleading candidates (loosest setting 0.5% / 10%, 19,058 rules)

Highest confidence with lift in [0.8, 1.2] — every one of them ends in 85123A:

```
23206 LUNCH BAG APPLE DESIGN | 85123A WHITE HANGING HEART T-LIGHT HOLDER |  865 | 1959 |  119 |   0.70% |     13.76% | 1.1995
23355 HOT WATER BOTTLE KEEP CALM | 85123A WHITE HANGING HEART T-LIGHT HOLDER |  715 | 1959 |   97 |   0.57% |     13.57% | 1.1828
22138 BAKING SET 9 PIECE RETROSPOT | 85123A WHITE HANGING HEART T-LIGHT HOLDER |  851 | 1959 |  114 |   0.67% |     13.40% | 1.1680
21790 VINTAGE SNAP CARDS | 85123A WHITE HANGING HEART T-LIGHT HOLDER |  720 | 1959 |   92 |   0.54% |     12.78% | 1.1141
23245 SET OF 3 REGENCY CAKE TINS | 85123A WHITE HANGING HEART T-LIGHT HOLDER |  714 | 1959 |   90 |   0.53% |     12.61% | 1.0990
```

Highest confidence with the smallest antecedents (thin evidence):

```
22916 THYME + 22917 ROSEMARY + 22919 MINT + 22920 BASIL + 22921 CHIVES | 22918 PARSLEY |  133 |  187 |  132 |   0.77% |     99.25% | 90.6502
23290 SPACEBOY BOWL + 23291 DOLLY GIRL CUP + 23292 SPACEBOY CUP | 23289 DOLLY GIRL BOWL |   90 |  141 |   89 |   0.52% |     98.89% | 119.7888
23170 PLATE ROSES + 23172 PLATE PINK + 23173 TEAPOT ROSES + 23174 SUGAR BOWL GREEN | 23171 PLATE GREEN |   88 |  269 |   87 |   0.51% |     98.86% | 62.7729
```

Rules ending in 85123A (161 at 0.5%/10%), top by confidence:

```
21733 RED HANGING HEART T-LIGHT HOLDER + 22804 CANDLEHOLDER PINK HANGING HEART | 85123A WHITE HANGING HEART T-LIGHT HOLDER |  199 | 1959 |  167 |   0.98% |     83.92% | 7.3167
22804 CANDLEHOLDER PINK HANGING HEART | 85123A WHITE HANGING HEART T-LIGHT HOLDER |  408 | 1959 |  302 |   1.77% |     74.02% | 6.4536
21733 RED HANGING HEART T-LIGHT HOLDER | 85123A WHITE HANGING HEART T-LIGHT HOLDER |  677 | 1959 |  457 |   2.68% |     67.50% | 5.8855
```

### A → B vs B → A (identical lift, different confidence)

```
22916 HERB MARKER THYME -> 22917 HERB MARKER ROSEMARY
   count(A)=186  count(B)=190  count(AuB)=176  N=17080
   confidence(A->B)=94.62%   confidence(B->A)=92.63%   lift=85.0617 both ways (|diff|=0)
22697 GREEN REGENCY TEACUP AND SAUCER + 22699 ROSES REGENCY TEACUP AND SAUCER -> 22698 PINK REGENCY TEACUP AND SAUCER
   count(A)=541  count(B)=551  count(AuB)=390  N=17080
   confidence(A->B)=72.09%   confidence(B->A)=70.78%   lift=22.3462 both ways (|diff|=0)
23170 REGENCY TEA PLATE ROSES + 23171 REGENCY TEA PLATE GREEN -> 23172 REGENCY TEA PLATE PINK
   count(A)=229  count(B)=224  count(AuB)=185  N=17080
   confidence(A->B)=80.79%   confidence(B->A)=82.59%   lift=61.5993 both ways (|diff|=7.1e-15)
```

### Basket-size distribution (distinct items per basket)

```
baskets=17080  min=2  median=16  mean=22.54  p90=48  max=540
```

Only 568 itemsets of size ≥ 4 survive even at 0.5% support — long baskets are
rare, so most evidence sits in pairs, and the wholesale multi-line baskets
(max 540 items) are exactly the ones that make co-occurrence counts look
wholesale-shaped rather than retail-shaped.

### Residual risks / honest limitations

- The dataset mixes wholesale and retail baskets and carries no per-basket
  timestamp, so seasonality and period stability are untestable on this export.
- `generateRules` recovers N from the itemset's own support (`count/support`);
  with a miner that reports rounded supports this would lose precision — ours
  does not (the float round-trip error is ≤ 1e-12 relative, and every metric is
  cross-checked against the index counts in the detail panel and tests).
- The UI table shows all threshold-passing rules including lift ≤ 1 by design
  (scaffolding contract); at the chosen settings every rule happens to have
  lift > 1 anyway.

Live app: https://af851574-oss.github.io/RecSys-LLMs/week4/
