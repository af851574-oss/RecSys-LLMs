# Week 5 — LLM prompt journal

The starting point is the HW5 starter in `week5/`: a MovieLens-100k page
(`u.data`, `u.item`, `data.js` loader + chronological 80/10/10 split) and a
`script.js` with six `TODO(hw5)` stubs (`predictRating`, `initializeFactors`,
`trainMF`, `selectBestCheckpoint`, `recommendTopK`, `recallAtK`). Everything
else — TF.js bootstrap (`initTf`), the shared metrics (`computeRMSEFor`,
`computeBaselineRMSE`), the renderers, the hyper-parameter reader, the
pipeline wrapper and the 11-check harness — came from the starter. The one inconsistent rank-11 harness fixture needed a minimal correction (see §2); all data files and the UI remain untouched.

All commands below were actually run on this machine (macOS, headless
Chrome **155.0.8059.41** driven over CDP — version read from
`Browser.getVersion`, Node v24.10.0). Numbers are copied from the runs, not
estimated. "Default" means the page's own input values (epochs 20, lr 0.01,
reg 0.05, batch 64); "custom" means one value was changed through the page's
input before clicking Train. Earlier draft runs of this journal quoted an
unverified browser version; it has been replaced with the one CDP reports.

## 1. BUILD — measure the untouched harness and the dataset

> Run the page as-is, press Run tests, and recompute the dataset anchors
> independently of `data.js`.

Starter harness (stubs untouched), served over HTTP and opened in headless
Chrome: **4 passed / 0 failed / 7 pending** — the four scaffolding checks pass,
the seven stub-backed checks report PENDING. That matches the readme §7.2.

Independent anchor recomputation (raw parse of `u.data` / `u.item`, no
`data.js` code) — all six anchors match the assignment brief exactly:

| fact | recomputed |
|---|---|
| ratings | 100,000 |
| users | 943 |
| movies | 1,682 (max id 1682) |
| split (train/val/test) | 79,619 / 9,596 / 10,785 (0 users skipped) |
| training-set mean | 3.580603 |
| baseline test RMSE (predict the mean) | 1.228900 |

`splitByTimestamp()` from `data.js` reproduces the same 79,619/9,596/10,785,
so the split logic is the documented one (per user, ascending timestamp,
`floor(0.8n) / floor(0.1n) / remainder`, ties by movieId).

## 2. ASK WHY — assumptions and contract corners

- **Prediction rule.** `mu + p_u . q_i` clamped to [1, 5], factors indexed by
  *raw* ids (`[944, 16]` users, `[1683, 16]` movies). A missing row (an id with
  no allocated factor) must fall back to `globalMean`, never throw. All 943
  test users occur in training, but 71 catalog movies do not; factor rows for
  allocated but untrained movie ids are not a learned cold-start solution.
- **Candidates vs the ranked list — a genuine spec/harness contradiction.**
  The readme §6 defines the Recall@10 candidate set as **the movie ids that
  appear anywhere in the training split**, and read strictly that restricts
  *both* the relevant items (denominator) and the ranked list. The starter's
  harness fixture `recallFixture(11)` contradicted that reading: it put only
  3 distinct movie ids into `trainSet` (ids 1, 2, 3) yet expected the
  relevant movie to land at **rank 11 of 12** — constructible only if the
  nine never-in-train movies (4–12) were rankable, i.e. only under a
  "rank the whole catalog" implementation. My first implementation followed
  that fixture (ranking the full catalog in `recallAtK`, using the pool only
  to filter the relevant set) and I wrongly called the contradiction
  "resolved by interpretation". An independent review correctly rejected
  that: filtering only the relevant set does **not** satisfy readme §6.
  Resolution applied (minimal, fixture-side plus one optional argument):
  `recommendTopK` gained an optional `candidatePool` argument so `recallAtK`
  now ranks **only training-movie ids** (the UI Top-10 button keeps ranking
  the full catalog), and the fixture was corrected by adding movies 4–12 to
  user 2's training rows, giving user 1 exactly 11 eligible pool candidates
  after their own movie 1 is excluded — so rank-11 is now reachable *within
  the strict pool*. Verified in the browser: pool = 1,611 ids, catalog =
  1,682, and every sampled recall list contains only pool ids. The strict
  pre-patch catalog-ranking run measured 0.0497 while the post-patch strict
  run measured 0.0554. These used different random initializations, so the
  difference cannot be attributed solely to filtering 71 cold catalog ids.
- **`optimizer.minimize(..., false)` returns null.** The readme's sample
  snippet chains `.dispose()` on that return value, which would throw
  (`null.dispose`). With `returnCost = false` TF.js disposes the cost tensor
  itself, so the loop calls `minimize(f, false, varList)` and disposes
  nothing afterwards; per-batch intermediates are handled by the engine's
  forward tidy. Verified against `tfjs-core/dist/optimizers/optimizer.js`.
- **`tf.variable(tf.randomNormal(...))` leaks the initializer.** `Variable`
  shares the `dataId` with the initial tensor but registers a second tensor,
  so the inline `randomNormal` is never released — measured +2 tensors per
  "Train" click. Fixed by creating each variable inside `tf.tidy` (the source
  tensor is released, the returned variable is kept). After the fix: 27 → 27
  tensors across repeated Train clicks.
- **Which backend?** `initTf()` selected **webgl**; every timing below is a
  WebGL timing on this machine, not CPU.
- **Regularization semantics.** The readme's loss is
  `MSE(batch) + reg * (‖P‖² + ‖Q‖²)` summed over the *full* matrices, applied
  once per mini-batch. With batch 64 that is ~1,245 L2 applications per epoch
  against ~1 MSE application per rating row per epoch — see §5 for why the
  default `reg = 0.05` is far too strong at that ratio.

## 3. TEST — hand computation and bounded node/browser checks

Node check (`/tmp/a05-work/nodetest.mjs`, real `@tensorflow/tfjs` 4.22.0
installed in a scratch directory, page files loaded verbatim into `node:vm`):

- hand dot+clamp: user factors `[1, 2]`, movie `[3, 4]`, mean 3 →
  3 + (1·3 + 2·4) = 14 → clamp → **5**; out-of-range user → **3**. Matches.
- hand RMSE fixture: predictions 4 and 2 vs actual 3 and 4 →
  sqrt((1 + 4)/2) = **1.581139**. `computeRMSEFor` returns the same.
- hand Recall@10 fixture: user 1 train-rated movie 1 (excluded), relevant
  test movie 2 is in the pool through user 2, distractor 3 scores higher →
  Top-2 = **[3, 2]**, hit 1/1 = **1.0**, no exclusions.
- hand exclusion fixture: relevant-but-unseen movie 9 → `unseenIds [9]`;
  users 1 (only unseen relevant) and 3 (test but nothing relevant) →
  `usersWithoutRelevant [1, 3]`.
- the page's own `runTests()` under node: **11 passed / 0 failed / 0 pending**.

Real browser (HTTP server + headless Chrome 155.0.8059.41 over CDP, actual
button clicks). Numbers below are from the **post-review verification run**
(on the patched code, see §8); earlier pre-patch runs reached the same
conclusions and are not reused as current results.

- "Run tests" → **pass 11, fail 0, pending 0**, before and after training.
- "Train" (defaults except reg = 0.0001 set in the page's input) →
  **103.4 s** wall, backend webgl, history length **20**.
- "Recommend Top-10" for users 1 and 405 → lists rendered; programmatic
  overlap check `train/val ∩ top10 = 0` for both users.
- "Evaluate Recall@10" → rendered table; strict training-pool ranking;
  **13** unseen relevant ids and **82** users without a relevant candidate
  reported as exclusions (matches an independent recomputation from the raw
  split).
- repeated "Train" → history length stays **20** (not 40), best epoch stays
  within 1–20, restored val RMSE equals `bestCheckpoint.valRMSE` exactly,
  and `tf.memory().numTensors` stays **27 → 27** (delta 0).

## 4. EXPLAIN — the two users (own words, real titles)

**User 1** rated 244 movies (mean 3.578) and leans Drama (93), Comedy (81),
Action (69); five-star picks include *Monty Python and the Holy Grail*,
*The Empire Strikes Back*, *Jean de Florette*, *Dead Poets Society*. The
model's Top-10 (post-patch second Train click, scores = `mu + dot`): *Contact* (5.40),
*Casablanca* (5.19), *A Close Shave* (5.15), *Lawrence of Arabia* (5.04),
*The Wrong Trousers* (5.03), *Dr. Strangelove* (5.02), *Fargo* (4.99),
*Titanic* (4.95), *One Flew Over the Cuckoo's Nest* (4.95), *Good Will
Hunting* (4.91) — prestige Drama/Comedy with two Aardman animations and
several pre-1990 classics absent from this user's train/validation history.
The list is **discovery shaped at recommendation time**: all ten were then
unseen. Four later appear in this user's held-out test ratings: *Contact*,
*The Wrong Trousers*, *Fargo* (all rated 5), and *Good Will Hunting* (rated 3);
the other six are unrated in this export. Classics such as *Casablanca*
and *Lawrence of Arabia* are hypotheses for discovery, not proof of viewing.

**User 405** rated 662 movies with a harsh mean of **1.921**; top picks are
*Scream*, *The Wizard of Oz*, *The Shawshank Redemption*, *Raiders of the
Lost Ark*, *The Godfather Part II*. The Top-10 (post-patch second Train click) is *Boogie
Nights* (6.70), *Die Hard* (5.68), *Face/Off* (5.38), *Liar Liar* (5.29),
*Willy Wonka and the Chocolate Factory* (5.17), *Hearts and Minds* (5.17),
*Someone Else's America* (4.78), *The Fifth Element* (4.74), *Mighty
Aphrodite* (4.67), *Les Boys* (4.65). Because the model adds
the *global* mean to every dot product and this user's dots are strongly
positive, predicted "ratings" run above 5 for the top hits — the ranking
is still correct (it is a monotone transform), but the printed scores are
not plausible 1–5 ratings. The list itself is mainstream 1996–97 fare in
the user's Drama/Comedy/Action lane.

**Business answer (familiar vs discovery).** For a streaming platform the
model is mostly a **familiarity engine with a discovery fringe**: the lists
stay inside the genre profile the user already built (user 1: prestige
drama/thriller; user 405: mainstream 90s drama/action), and 20/20
recommended movies were absent from train/validation, not necessarily unrated
forever (four of user 1's movies appear later in test). But the *kind* of movie repeats: user 1's list is "more of what you rate
highly", user 405's is "more 90s hits". The value is safe session-length
retention (familiar, low-risk picks), not taste expansion; a platform that
wants discovery would need to damp popularity/mainstream direction (e.g.
bias terms or a popularity prior) on top of this factor model.

## 5. IMPROVE — one hyperparameter, selected on validation only

Selection runs (each a full 20-epoch train): reg 0.05 (default) gave a
degenerate model — **trainRMSE and valRMSE identical at every epoch**
(1.1052 / 1.1830), every recommendation scored exactly the global mean
3.5806, and test RMSE 1.2289 = the baseline to four decimals. Root cause:
the L2 term `reg · (‖P‖²+‖Q‖²)` over the full matrices is applied once per
mini-batch — 1,245 times per epoch — while a rating's MSE gradient reaches
its rows only when its batch comes up. At `reg = 0.05` the per-step L2 pull
dominates the sign of nearly every Adam update and the factors collapse
to ~0, i.e. the model degenerates to the mean predictor. A tiny toy-data
training run (where the per-row MSE signal is much denser) trains fine at
reg 0.05, which is why the harness never catches it.

Validation selection (one variable, `reg`; every other input at default;
these three selection runs predate the review patch, whose changes — history
reset, tie-break, candidate pool — do not alter the training math, so the
selection stands):

| reg | best val RMSE | best epoch | test RMSE (that run) |
|---|---|---|---|
| 0.05 (default) | 1.1830 | 1 | 1.2289 (= baseline) |
| 0 | 1.0207 | 1 | 1.0613 |
| **0.0001** | **0.9990** | 20 | 1.0498 |

reg 0.0001 wins on validation, so that is the configuration re-run end to
to end after the review patch (fresh random init): best checkpoint **epoch 20,
val RMSE 1.0037**, restored-checkpoint **test RMSE 1.0535**, mean-rating
baseline **1.2289** — the factorization beats the baseline by ~0.18 RMSE.
(A second consecutive Train click, a fresh stochastic run, selected epoch 14
with val RMSE 0.9959 and test RMSE 1.0472; run-to-run spread comes from the
random initialization and batch shuffling, and every run beat the baseline.)
The restored-weights check: after training, `computeRMSEFor(valSet)` returns
exactly `bestCheckpoint.valRMSE` (verified in both post-patch runs), so the
reported test RMSE is the selected checkpoint's, not the last epoch's.

**The default must not be demoed as-is**: at reg 0.05 the model equals the
baseline, so a live demo or rerun needs `reg` set to **0.0001** in the page's
L2 input before pressing Train.

## 6. Numbers summary (post-patch verification session, reg 0.0001 custom,
rest default, headless Chrome 155.0.8059.41, webgl)

- backend: **webgl**; train wall time **103.4 s** (first click) / **105.9 s**
  (second click) for 20 epochs each
- final model (click 2, also used for the lists and recall): best checkpoint
  epoch **14**, val RMSE **0.9959**, test RMSE **1.0472**; baseline test
  RMSE **1.2289**; beats baseline: **yes**. Click 1, a separate random run,
  selected epoch 20, val RMSE 1.0037 and test RMSE 1.0535.
- history length **20** on both clicks (no accumulation across clicks)
- Recall@10 (strict training-pool ranking): **0.0554** (326 hits / 5,142
  relevant candidates over **861** evaluable users); exclusions: **13**
  unseen relevant test ids, **82** users without a relevant candidate;
  recall evaluation wall time ~2.6 s
  (a separate pre-patch full-catalog run measured 0.0497; different candidate
  semantics AND random initialization, so the difference is not a controlled comparison)
- repeated Train clicks: `tf.memory().numTensors` 27 → 27 (delta 0)

## 7. What was verified in-session vs trusted

*(All checks below were executed by the AI coding session and by scripted
browser/node runs; nothing here claims human manual verification.)*

Verified by hand computation inside those runs: the dot+clamp prediction,
the RMSE fixture, the Recall fixture and both exclusion lists, the dataset
anchors (independent parser), the val-RMSE-of-restored-weights identity, the
tensor-count stability across Train clicks, the history-length-20 invariant
across repeated Train clicks, the strict-pool membership of recall lists,
and the API semantics of `optimizer.minimize(..., false)` and
`tf.variable(...)` (read in the installed tfjs source, not assumed).

Trusted without independent verification: the internal correctness of the
TensorFlow.js kernels themselves, and that headless-Chrome WebGL timings
represent what a normal browser would see.

## 8. Review corrections (post-hoc honesty log)

An independent review of the first implementation found real defects; all
were fixed and re-verified, and the earlier journal claims that were wrong
are corrected here rather than silently rewritten:

1. **Repeat-Train regression.** `trainMF` appended to the module-level
   `trainingHistory`, so a second Train click produced 40 rows and could
   select a stale epoch from the previous run. Fixed by resetting the
   history at the start of `trainMF`; verified in the browser: two clicks
   → length 20 both times, best epoch always within 1–20, restored val RMSE
   equals `bestCheckpoint.valRMSE` exactly.
2. **Unsorted-history tie-break.** `selectBestCheckpoint` now picks the
   smallest `epoch` on equal `valRMSE` even when the input rows are not in
   epoch order (verified with an unsorted fixture in node).
3. **Recall candidate semantics.** readme §6 defines candidates as
   training-split movie ids; the first implementation ranked the full
   catalog and used the pool only to filter the relevant set — that does
   **not** satisfy the spec, and the earlier §2 claim that the contradiction
   was "resolved by interpretation, no scaffold change needed" was wrong.
   `recommendTopK` now takes an optional `candidatePool` (recall ranks only
   training ids; the UI Top-10 keeps ranking the catalog) and the starter
   fixture was minimally corrected (movies 4–12 added to user 2's training
   rows) so rank-11 is reachable inside the strict pool. See §2.
4. **Browser version.** The first journal draft quoted "Chrome
   138.0.7204.183" without checking. The actual version, read from CDP
   `Browser.getVersion` in the verification run, is **155.0.8059.41**.
5. **Default hyperparameters.** The journal previously implied the default
   reg 0.05 run was merely weak; it is degenerate (model ≡ mean predictor,
   test RMSE equals the baseline). Any live demo must set reg = 0.0001.
