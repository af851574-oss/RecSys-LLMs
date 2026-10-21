# Week 6 — LLM prompt journal

Starting point: the HW6 starter in `week6/` — a MovieLens-100k page (`u.data`,
`u.item`, the week5 `data.js` loader and chronological split, d3 graph view,
4-node teaching fixture) plus seven `TODO(hw6)` stubs: in `graph.js`
`buildGraph`, `rowNormalize`, `pageRank`, `personalizedPageRank`, in `script.js`
`movieScores`, `recommendTopK`, `recallAtK`. Everything else — the TF.js
bootstrap, the split/popularity/cohort indices, the provided **MF reference**,
the four-method comparison runner, the alpha sweep, the two-user demo, the
12-check harness and the three exporters — is starter code and was not modified.
`data.js`, `index.html`, `style.css`, `u.data`, `u.item`, `readme.md` and
`vendor/` are byte-identical to the upstream starter (verified: `diff` against
`/tmp/a06-upstream/week6` and `md5` of `u.data` = `6e47046882bad158b0efbb84cd5cb987`,
same as `week5/u.data`). The `TODO(hw5)` comment at `data.js:134` is a stale
label above a *fully implemented* `splitByTimestamp()` (the file is identical to
`week5/data.js`, where that split has been in use since week 5) — nothing to
implement there.

All numbers below were produced by actually running the app (macOS, headless
Chrome **155.0.8059.85** over CDP, TensorFlow.js **4.22.0** from the CDN,
backend **webgl**; Node v24.10.0 with the npm `@tensorflow/tfjs@4.22.0` package
for the CPU-side harness runs). Nothing is typed in by hand: every table value
comes from `browser-run.json` / `browser-run2.json` (captured panel text and the
page's own `serialize*()` output) or from an independent Python recomputation of
`u.data`.

## 1. BUILD — untouched starter, then the seven stubs

Untouched starter (`/tmp/a06-upstream/week6` loaded in the Node vm harness):
**2 passed / 0 failed / 10 PENDING** — exactly the two scaffolding checks that
need no student code (restart distributions, public surface); all ten
stub-backed checks report PENDING, as the starter's harness intends.

Dataset anchors as loaded by the page (and re-derived independently in §3):

| fact | value |
|---|---|
| ratings loaded | 100,000 (943 users, 1,682 movies in the catalog) |
| split train / val / test | 79,619 / 9,596 / 10,785 (0 users skipped) |
| training users / training movies | 943 / 1,611 |
| positive training interactions (≥ 4.0) | 45,602 |
| zero-degree users / movies | 1 (user 685) / 253 |
| graph nodes (no padding node) | 2,554 = 943 + 1,611 |
| matrix sparsity | 93.71% |

Implementation notes (what the seven stubs now do):

- `buildGraph(train)` — node universe = ids *observed in training* (any rating
  value), sorted, mapped to contiguous indices, users `[0, 943)` then movies
  `[943, 2554)`; `R[u][i] = 1` iff training rating ≥ 4.0; bipartite degree over
  both node kinds; duplicate records guarded.
- `rowNormalize(graph)` — plain `number[][]` (testable without a backend):
  each positive-degree row divided by its degree, zero-degree rows all-zero and
  flagged in `danglingMask`. Never called on the 2,554-node MovieLens graph by
  the product path (that would be a 2,554² dense matrix); the propagation uses
  the two off-diagonal blocks instead.
- `pageRank(alpha, opts)` / `personalizedPageRank(userId, alpha, opts)` — one
  shared TensorFlow.js power iteration. MovieLens path: `Ru` [943×1611] (user
  rows ÷ user degree) and `Rm` [1611×943] (movie rows ÷ movie degree), so the
  square `A = [[0,R],[Rᵀ,0]]` is never materialized; one update is
  `(Pᵀp)[users] = Rmᵀ·p_movies`, `(Pᵀp)[movies] = Ruᵀ·p_users`
  (`tf.matMul(..., true)`), plus the readme 3.3 dangling term
  `alpha·(Pᵀp + d·v) + (1−alpha)·v` with `d` read off a zero-degree indicator
  vector. `opts.transition` (the 4-node fixture) takes a literal
  `tf.tensor2d(Q).transpose()` path. `p₀ = v`; stop when the L1 change
  < 1e-6 or at 500 iterations; `converged` is false when only the cap stopped
  it. Per iteration the walk runs in `tf.tidy`, the previous `p` is disposed,
  the residual is read with `dataSync()` because the page's adapter consumes the
  result synchronously.
- `movieScores(p, graph)` — movie-node slice `[userNodeCount …]` in
  `graph.movieIds` order, length exactly `movieIds.length`.
- `recommendTopK(method, userId, K, split)` — candidate pool
  `HW6_STATE.candidateIds`, exclusion via `hw6ExclusionSet` (test: train+val,
  val: train only), sort score desc / movie id asc, slice to K, attach title,
  genres, training popularity. Untrained MF returns `[]` rather than a list of
  `-Infinity` scores.
- `recallAtK(method, K, split)` — cohort from `hw6SharedCohort(split)` (the same
  users for all four methods), relevance = rating ≥ 4.0 in the split ∩ training
  pool ∩ not excluded, macro-average of hit/relevant, exclusion counts from the
  starter's own `hw6CohortExclusions` so panel, table and CSV quote one number.

After implementation, the page's own harness in the browser (graph built):
**12 passed / 0 failed / 0 pending**; in Node (CPU backend) 11/0/1 before the
graph is built and 12/0/0 after (`verification.json` records the browser run).

## 2. ASK WHY — assumptions and contract corners

- **Pᵀ, not P.** The readme's `p_next = alpha·Pᵀ·p + (1−alpha)·v` collects mass
  at the *destination*. In the bipartite block form that means user nodes
  receive from the movie→user block (`Rmᵀ·p_movies`), movie nodes from the
  user→movie block (`Ruᵀ·p_users`). My first draft had the two matmuls the
  other way round (`Ru·p_movies`), which computes `P·p`; the harness's
  orientation check caught it (see §5 — the failure case below).
- **Restart argument: raw user id or node index?** `graph.js`'s JSDoc says the
  first argument of `personalizedPageRank` is a node index, but the page's
  adapter (`hw6RunPPR` → `hw6AdapterPPR`) passes the **raw user id**. These
  differ by one on MovieLens (node = userIndex of the id, ids start at 1), so
  guessing wrong would silently personalize to the wrong user. I resolved it
  unambiguously: a value present in `graph.userIndexOf` is treated as a raw
  user id (its node), otherwise an in-range integer is used as a node index,
  anything else throws. Check 8 (`hw6AdapterPPR(graph, 1, 0.85, 2)`) passes the
  raw id `2`, whose node (index 1) is exactly the intended zero-degree seed —
  confirming the raw-id-first reading.
- **float32 vs the 1e-6 reference tolerance.** TF.js tensors are float32 and the
  harness compares the readme 4.1 vectors per node at 1e-6. Stopping at
  `L1 < 1e-6` bounds the distance to the true stationary vector by
  `alpha/(1−alpha)·residual ≈ 5.7e-6` in the worst case, which looked too loose,
  so I simulated the exact 4-node iteration in Python *before* writing the JS:
  the actual worst per-node error is **1.7e-7** (uniform) and **8.3e-8**
  (restart at A), because the error constant is far below the bound. No change
  needed — but this is why the check passes and it is not luck.
- **Why blocks instead of the square matrix.** 2,554×2,554 float32 would be
  ~23 MB *per copy* and `rowNormalize`'s plain `number[][]` Q would be worse.
  Two 943×1611 blocks carry the same information; one update is two thin
  matmuls (~3 M MACs) — the whole 91-iteration PPR run takes ~230 ms on the
  measured WebGL backend.
- **Tensor lifecycle.** The transition tensors are long-lived (cached per active
  graph object, rebuilt and disposed when a different graph is installed), `p`
  is disposed every iteration, the fixture path disposes in a `finally`.
  Measured: `tf.memory().numTensors` 7 → 7 across three PPR runs in the
  browser, 5 → 5 across five runs in Node, 17 tensors after the full
  evaluation + 120 recommendation rows + exports.
- **The provided MF reference is the *starter's*, not my week5 model.** It is a
  seeded (20261013) 16-factor Adam model with `reg 0.05`, batch 512, 30 epochs,
  checkpointed by validation RMSE — and with those fixed hyperparameters it
  **does not learn**: `MF_INFO.history` shows train/val RMSE constant at
  1.1052 / 1.1830 for all 30 epochs, checkpoint epoch 1, and every MF score
  equals the global mean 3.5806 (so its Top-10 is just ascending movie id among
  eligible candidates). This is the same per-batch-L2 collapse I diagnosed and
  fixed by lowering `reg` to 0.0001 in week 5; here `MF_CONFIG` is a starter
  constant with no UI control and the starter says students do not rebuild the
  model, so I left it untouched and report it as a degenerate reference rather
  than silently “repairing” the baseline my graph methods are compared against.
- **Selection vs evaluation.** The alpha sweep (validation only) selected
  **alpha 0.50**; the first evaluation click ran at the slider default 0.85,
  so I re-ran the whole four-method comparison with the slider at the selected
  0.50 (`results.csv` carries those primary rows, plus the sweep rows). The
  sweep itself reproduced bit-identically in both browser sessions
  (0.11448315913208877 at 0.50), which is decent evidence the pipeline is
  deterministic.

## 3. TEST — what was actually verified

1. **Page harness (browser, webgl): 12/12** after building the graph —
   including both readme 4.1 vectors reproduced by *my* `pageRank` /
   `personalizedPageRank` through the frozen `opts.transition` interface
   (uniform `[0.372527, 0.195824, 0.394149, 0.037500]`, ranking C > A > B > D;
   restart-at-A `[0.452233, 0.192199, 0.355568, 0]`, ranking A > C > B > D).
   `verification.json` is that run's own export.
2. **Same harness in Node** (`@tensorflow/tfjs@4.22.0`, CPU backend): 12/12,
   i.e. the implementation is backend-independent, not a WebGL accident.
3. **Independent recomputation from raw `u.data`** (Python, zero shared code —
   `verify_independent.py`): split 79,619/9,596/10,785 with 0 skipped users;
   943 training users, 1,611 training movies, 45,602 positive pairs; 1
   zero-degree user (685) and 253 zero-degree movies; **test cohort 861**;
   **popularity Recall@10 = 0.0760229134** (app: 0.07602291343770759 — matches
   to 10 decimal places); user 1's popularity top-10 hits {100 Fargo, 258
   Contact} of 19 relevant → 2/19 = 0.105263; movie 50's popularity = 449 by
   two different counting paths.
4. **Hand-derived stationary point** for the synthetic 1-user/2-movie graph:
   solving `u = 0.85·2m + 0.05`, `m = 0.425·u + 0.05` gives `u = 0.486486…`,
   `m = 0.256757…`; the harness's orientation check reports exactly
   `p = [0.486486, 0.256757, 0.256757]` from my implementation.
5. **No-leak checks**: tensors 7 → 7 over repeated PPR runs in the browser,
   5 → 5 over five runs in Node, and the exported CSVs equal the page's own
   `serialize*()` strings byte-for-byte (the downloads come from the real
   export buttons; the only difference in `verification.json` was the
   `generated_at` timestamp between the click and the later comparison read).

## 4. EXPLAIN — the measured results in my own words

| method (test, shared cohort 861) | alpha | Recall@10 | mean list popularity | iterations / residual |
|---|---|---|---|---|
| popularity | — | 0.0760 | 272.00 | — |
| global PageRank | 0.50 | 0.0797 | 257.82 | 19 / 5.47e-7, converged |
| **PPR** | **0.50** | **0.1122** | 244.21 | 22 / 5.01e-7, converged |
| MF reference (starter) | — | 0.0211 | 96.76 | degenerate, see §2 |

Validation alpha sweep (cohort 846): 0.50 → **0.1145**, 0.70 → 0.1048,
0.85 → 0.0900, 0.95 → 0.0738; ties broken toward the smaller alpha were not
needed (no exact tie). Selected **alpha = 0.50** and used for the primary
comparison above and for the global-PageRank row (disclosed: global PageRank
was not independently tuned).

Reading it: restarting half the time keeps the walk close to the user's own
positive edges, so the ranking leans on *who else rated what this user rated*;
letting the walk diffuse (alpha 0.95) drops validation recall to 0.0738, i.e.
back toward the unpersonalized methods — at the same alpha and split the
contrast is direct (test, alpha 0.85: PPR 0.1000 vs global PageRank 0.0805).
The gain of PPR over popularity (0.1122 vs 0.0760, +48%)
is real but modest, and the recommended lists stay strongly popular: user 1's
PPR list has mean training popularity 228 (Fargo 377, Contact 307, English
Patient 279 …) — the walk still lands on hub movies because the graph's edges
*are* co-rating popularity. The MF row is **not** evidence that “MF is worse
than PPR”: with the starter's fixed `reg 0.05` the model never leaves the mean
predictor, so the comparison is against a broken MF, and I say so rather than
concluding PPR beats matrix factorization.

**One-factor-at-a-time demo** (readme 6.2, users fixed = the two smallest test-
cohort ids, 1 and 2):

| setting | user | alpha | shared with baseline | mean list popularity |
|---|---|---|---|---|
| baseline | 1 | 0.85 | — | 245.5 |
| change seed only | 2 | 0.85 | **0 / 10** | 254.9 |
| change alpha only | 1 | 0.50 | **7 / 10** | 228.4 |

Changing the restart user to user 2 replaces the whole list (0 shared) — the
seed dominates personalization, as expected for a one-hot restart. Changing
only alpha to 0.50 keeps 7 of 10 and swaps in Trainspotting (164), Sense and
Sensibility (178) and E.T. (167) for Scream (226), Air Force One (235) and
Titanic (219): a *lower* mean popularity (228 vs 246), i.e. more restart →
more niche picks, not “larger alpha improves novelty”. Between the two users
the overlap within each method is small: popularity 1/10, PageRank 1/10,
PPR 1/10 at alpha 0.50 (MF 2/10, but its list is ascending-id noise). The
mechanisms differ, though: popularity produces the *same* global ranking for
everyone and the lists only diverge because each user's already-rated movies
are excluded (user 1 has 217 training ratings, so most of the global top-10 is
removed for them), whereas PPR's lists differ because the walk itself starts
at a different node.

User profiles behind those lists (from training data): user 1 = 272 ratings,
217 training, 131 positive, top genres Drama 61 / Comedy 39 / Action 36;
user 2 = 62 ratings, 49 training, 32 positive, top genres Drama 18 / Comedy 11 /
Romance 11, whose own 5-star training picks include Sense and Sensibility (275)
and Fargo (100). User 2's PPR@0.85 list is nonetheless action/sci-fi heavy
(Return of the Jedi 339, Raiders 312, Twelve Monkeys 234): with only 32
positive edges the walk is dominated by what *co-raters* of those edges also
rated, not by the user's own 5-star tastes. Descriptive, not a defect claim.

## 5. Failure case (real error → root cause → fix → confirmation)

**Error.** First Node harness run after implementing the stubs:

```text
FAIL  one extra update produces approximately the same distribution — L1 change after one update = 0.5666667401790619
FAIL  matrix orientation: probability collects at the pointed-to node, not the source — pageRank hub mass 0.333333 should exceed movie mass 0.333333
```

The second message is the tell: on the 1-user/2-movie fixture my PageRank
returned exactly the uniform restart vector after **1 iteration**, residual
8.9e-8, `converged: true`.

**Root cause.** In the bipartite block update I had written
`walk = [Ru·p_movies ; Rm·p_users]`, which is `P·p`, not `Pᵀ·p`. The fixture
made it invisible to the eye: `P` there is symmetric-ish (`[[0,.5,.5],[1,0,0],[1,0,0]]`),
and `P·v = v` exactly for the uniform start vector, so the iteration looked
“converged” immediately. `Pᵀ·v = (2/3, 1/6, 1/6)` is what should have come out.

**Fix.** Swap the two matmuls to the transposed form:
`(Pᵀp)[users] = tf.matMul(Rm, pMovies, /*transposeA*/ true)`,
`(Pᵀp)[movies] = tf.matMul(Ru, pUsers, true)`.

**Confirmation.** Same harness: 12/12 (both formerly failing checks now PASS,
the orientation check printing `p = [0.486486, 0.256757, 0.256757]`, which is
the hand-derived stationary point from §3.4); the readme 4.1 checks were
unaffected because the fixture path was already transposing correctly — the
bug lived only in the MovieLens block path, which is exactly where the two
synthetic-graph checks pointed.

(A second, tooling-side failure, recorded for honesty: my CDP driver polled
`window.HW6_STATE`, which is always `undefined` — top-level `const` in a classic
script is not a `window` property — so the driver reported “timeout waiting for
bootstrap” while the page was in fact fully loaded. Fixed by polling the bare
identifier; unrelated to the homework code.)

## 6. IMPROVE — one variable next

Re-run the comparison against a *working* MF: expose `reg` (or lower it to the
week5-selected 0.0001) for the provided reference, keeping its scoring and
checkpoint rule untouched, and re-measure the same cohort. That single change
would turn the fourth row from “degenerate mean predictor” into a real
competitor and is the one variable I would change with more time. Second:
PPR is recomputed per user because the page's cache holds one entry; batching
the restart vectors (`[n × batch]` propagation) would make the whole sweep one
batched iteration loop instead of ~3,400 sequential per-user runs (measured
22 iterations per PPR at alpha 0.50 and 91 at 0.85; the sweep also covers 0.95).

## 7. Business question (readme §8) — one recommendation

**Keep MF as the main recommender and add PPR as a separate discovery section;
do not replace MF on this evidence.** The measured support: PPR wins retrieval
Recall@10 on the shared cohort (0.1122 vs 0.0797 global PageRank and 0.0760
popularity at the selected alpha 0.50), its lists are user-specific where
popularity's are not (both methods show 1/10 overlap between users 1 and 2, but
popularity ranks every user with one shared global list and the lists only
diverge through each user's exclusions, whereas PPR's lists differ because the
walk itself starts at a different node), and lowering alpha traded popular
titles for lower-popularity ones (mean list popularity 246 → 228) without
collapsing recall — the profile of a discovery/“more like your taste” section. But the MF
row cannot arbitrate a replacement: the starter's reference is degenerate
(constant RMSE, mean-valued scores, ascending-id lists), so the only honest
comparison is PPR vs popularity, and my week5 model was not reloaded here.
Section purposes if split: **MF stays the personalized main feed** (rating
prediction, trained on explicit feedback), **PPR powers “because you rated…” /
discovery** (graph-walk relevance from positive edges, needs no training, and is
recomputed per user in ~0.2 s on the measured backend).

What offline Recall@10 cannot establish: current-session intent, watching
completion, retention or revenue — a list that retrieves held-out ratings is
not a list users click. Proposed online experiment before any rollout:
**intervention** — show the PPR-based discovery section to the treatment group
(the MF main feed is unchanged for both groups); **primary outcome** —
acceptance rate (clicks → plays) on the discovery section's slots per exposed
user; **guardrail** — overall engagement (sessions/week and watch completion
rate) plus MF-feed CTR must not drop; **assignment** — user-level sticky
assignment hashed on user id with a 50/50 split, so a user never sees both
variants and no within-user contamination biases the guardrail; run for at
least two full weekly cycles to see habit effects.

## 8. Limitations

- Offline Recall@10 on a chronological per-user split; it says nothing about
  current-session intent, watching completion, retention or revenue, and the
  split is not globally time-consistent (MovieLens records rating times, not
  viewing sessions).
- Warm-user evaluation only: every cohort user has ≥ 1 positive training
  edge, so cold-start behaviour is untested.
- The MF baseline is degenerate under the starter's fixed hyperparameters
  (§2); the comparison must not be read as “PPR > MF”.
- The two users' lists are descriptive evidence of personalization, not proof;
  1/10 overlap between two users is expected from personalized lists, not a
  quality metric.
- PPR scores are long-run walk probabilities; they are not ratings, not
  purchase probabilities, and not comparable in scale to MF's 1–5 predictions.
- Exclusion accounting: the app's `excluded_unseen_ids` (13) counts relevant
  test ratings on movies absent from the training pool over all users with any
  test ratings; my independent script counted 12 over cohort users only —
  different denominators, both disclosed.

## 9. How to reproduce

```bash
cd week6 && python3 -m http.server 8000   # open http://localhost:8000/index.html
# order: Run tests → Build graph → Run tests → Run PageRank → Run PPR →
#        Run evaluation (trains the MF reference lazily) → Run two-user demo →
#        Recommend Top-10 → the three Export buttons
```
Node harness against the shipped files (no browser):
`node:vm` loader with the npm `@tensorflow/tfjs@4.22.0` package; 12/12 after
the graph is built. Versions actually used: TensorFlow.js 4.22.0 (CDN in the
page, npm in Node), Chrome 155.0.8059.85, Node 24.10.0, Python 3 for the
independent recomputation.
