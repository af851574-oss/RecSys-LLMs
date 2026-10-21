# RecSys-LLMs

Homework for the LLM4Rec course.

## Week 1 — Random Lunch Generator

- Live app: https://af851574-oss.github.io/RecSys-LLMs/week1/
- Prompt journal: [`week1/prompt.md`](week1/prompt.md)
- Report source: [`week1/report.md`](week1/report.md)

Run the regression check:

```bash
node week1/test.mjs
```

## Week 2 — Content-Based Movie Recommender

Content-based filtering on the MovieLens 100K data: movies are represented as
18-dimensional binary genre vectors from `u.item`, and similarity is cosine
similarity (replacing the baseline Jaccard matching). Pick up to 3 watched
movies: with 1 the app is item-to-item, with 2–3 it builds your taste profile
by averaging the movie vectors and recommends Top-5, excluding the picks. The
UI shows the active mode and the similarity scores.

- Live app: https://af851574-oss.github.io/RecSys-LLMs/week2/
- Prompt journal: [`week2/prompt.md`](week2/prompt.md)

Run the check:

```bash
node week2/test.mjs
```

## Week 3 — Collaborative Filtering Movie Recommender

Collaborative filtering on the same MovieLens 100K data: pick a user and get a
Top-5 list two ways — User-Based CF (weighted cosine similarity between user
rating rows, top-20 neighbours) and Item-Based CF (weighted cosine between
movie columns, scored as a similarity-weighted rating average on the 1–5
scale). Missing values use the weighted strategy: similarity = co-rated
cosine × min(n, 50)/50 (significance weighting, `SIGNIFICANCE_SHRINK = 50`),
applied to user-user and item-item similarity alike, so one shared movie can
no longer produce similarity 1.0. Optionally pick a movie to see the predicted
rating for that (user, movie) pair from both methods, plus the actual rating
if one exists (predictions are computed leave-one-out and never use it).
Candidates need support from at least `MIN_SUPPORT = 5` distinct other users;
the UI shows that support next to every score ("score 4.032 - 57 users") and
prints "not enough data" below the threshold.

- Live app: https://af851574-oss.github.io/RecSys-LLMs/week3/
- Prompt journal: [`week3/prompt.md`](week3/prompt.md)

Run the checks:

```bash
node week3/test.mjs      # parses, math and Top-5 invariants
node week3/analysis.mjs  # RMSE/MAE/coverage table, Top-5 with/without support, cold start
```

## Week 4 — Association Rules on the Online Retail Baskets

Apriori association-rule mining on the UCI Online Retail dataset cleaned to
17,080 baskets / 3,653 items: the seven `TODO(hw4)` stubs in `week4/script.js`
are implemented (`dedupeBasket`, `countItemset`, `computeSupport`,
`computeConfidence`, `computeLift`, `findFrequentItemsets`, `generateRules`),
leaving the starter's scaffolding untouched. `findFrequentItemsets` is a
level-wise Apriori (prefix-join candidate generation, downward-closure
pruning, counting through the shared inverted index); `generateRules` splits
every frequent itemset both ways (`A → B` and `B → A`) and keeps rules with
confidence ≥ the slider, so the table, the detail panel and the “Reverse
direction (B → A)” button all agree that confidence flips while lift does not.
At the default 1% support / 50% confidence it mines 1,219 frequent itemsets and
456 rules in ~1.3 s; the slider minimum (0.5%) still finishes in ~3.5 s.

- Live app: https://af851574-oss.github.io/RecSys-LLMs/week4/
- Prompt journal: [`week4/prompt.md`](week4/prompt.md)

Run the checks:

```bash
node week4/test.mjs      # starter harness (11/11), lecture examples, thresholds, lift symmetry, hand-computed rule
node week4/analysis.mjs  # threshold sweep, final rule table, useful vs misleading candidates, basket sizes
```

Both load the real `week4/transactions.js` and the real `week4/script.js` in a
`node:vm` sandbox (no dependencies, no server); the page itself opens from
`file://`.

## Week 5 — Matrix Factorization with TensorFlow.js

The six `TODO(hw5)` stubs in `week5/script.js` are implemented
(`predictRating`, `initializeFactors`, `trainMF`, `selectBestCheckpoint`,
`recommendTopK`, `recallAtK`). The starter's inconsistent rank-11 test fixture
was also corrected to use 12 training-set movie candidates. The outdated
"Implement TODO(hw5)" messages were removed after implementation; dataset,
`index.html`, `style.css` and the instructor readme remain unchanged.
The model is `mu + p_u . q_i` with 16-dimensional `tf.Variable` factors
indexed by raw id (`[944, 16]` users, `[1683, 16]` movies); scalar rating
predictions are clamped to [1, 5], while Top-10 ranking scores are raw and
can exceed 5. Training is a shuffled mini-batch Adam loop built from
`tf.gather` / element-wise ops / `tf.losses.meanSquaredError` plus an L2
penalty, run on the WebGL backend in our browser (CPU fallback is available). While epochs run, the weights of the
best-validation epoch are snapshotted and restored when training ends, so
the page holds the selected checkpoint (the harness's "Run tests" reports
11/11). Two TF.js pitfalls found and handled: `optimizer.minimize(f, false,
varList)` returns `null` (the readme's chained `.dispose()` would throw),
and `tf.variable(tf.randomNormal(...))` keeps the initializer tensor alive,
which leaked 2 tensors per Train click until the creation was wrapped in
`tf.tidy`.

At the page defaults (epochs 20, lr 0.01, batch 64, **reg 0.05**) the
per-batch L2 over the full matrices crushes the factors to ~0 and the model
degenerates to the mean predictor (test RMSE 1.2289 = baseline). Lowering
`reg` — the one tuned variable, selected on validation only — to **0.0001**
gave best val RMSE **0.9959** (epoch 14) and test RMSE **1.0472** vs the
training-mean baseline **1.2289** on the second post-fix Train click
(the same model generated the lists and Recall below; results vary with random initialization). Top-10 lists exclude everything
the user rated in train/validation (verified 0 overlap for users 1 and 405);
Recall@10 with ranking restricted to the **1,611 training-set movies** was
**0.0554** (macro average over 861 evaluable users; 326 hits among 5,142
relevant candidates), with 13 unseen relevant test ids and 82 users without
a relevant candidate reported as exclusions. The UI Top-10 button ranks
the full catalog; only evaluation restricts candidate movies to the train pool.

- Live app: https://af851574-oss.github.io/RecSys-LLMs/week5/
- Prompt journal: [`week5/prompt.md`](week5/prompt.md)

Run the checks: serve the folder (`python3 -m http.server`) and open
`week5/index.html` — press **Run tests** (11/11), set **L2 regularization
to 0.0001** (the untouched starter default 0.05 collapses to the baseline),
then **Train**, **Recommend Top-10**, **Evaluate Recall@10** (~103–106 s for
20 epochs on the measured WebGL backend; first load needs the TensorFlow.js CDN).

## Week 6 — Graph-Based Recommendations with Personalized PageRank

The seven `TODO(hw6)` stubs are implemented: in `week6/graph.js`
`buildGraph`, `rowNormalize`, `pageRank`, `personalizedPageRank`; in
`week6/script.js` `movieScores`, `recommendTopK`, `recallAtK`. Everything else
(the split/popularity/cohort indices, the provided MF reference, the four-method
comparison, the alpha sweep, the two-user demo, the 12-check harness and the
exporters) is untouched starter code; `data.js`, `index.html`, `style.css`,
`u.data`, `u.item`, `readme.md` and `vendor/` are byte-identical to upstream
(the `TODO(hw5)` note above `splitByTimestamp` in `data.js` is a stale label
over an already-implemented function).

The graph is the bipartite user–movie graph over positive (≥ 4.0) training
ratings: 943 user nodes + 1,611 movie nodes = 2,554 nodes, 45,602 positive
edges, 1 zero-degree user (685) and 253 zero-degree movies, no padding node.
Propagation is TensorFlow.js only: the square adjacency matrix is never built —
one update is `(Pᵀp)[users] = Rmᵀ·p_movies` and `(Pᵀp)[movies] = Ruᵀ·p_users`
(two `tf.matMul` calls on the 943×1611 off-diagonal blocks) plus the readme §3.3
dangling-mass correction `alpha·(Pᵀp + d·v) + (1−alpha)·v`; `p` is disposed each
iteration and the transition tensors are cached per active graph, so repeated
runs do not accumulate tensors (7 → 7 tensors over three PPR runs in the
browser, 5 → 5 over five runs in Node). One real bug was caught by the page's
own orientation check: my first block update computed `P·p` instead of `Pᵀ·p`
and returned the uniform vector after one iteration on a symmetric fixture;
same harness is 12/12 after the transpose fix.

Results (MovieLens 100k, chronological 79,619/9,596/10,785 split, shared test
cohort of 861 users, 13 relevant test ratings outside the training pool and 82
users without an eligible relevant movie reported as exclusions). Validation
Recall@10 for PPR selected **alpha 0.50** (0.1145, vs 0.1048 at 0.70, 0.0900 at
0.85, 0.0738 at 0.95; validation only, cohort 846). On test at the selected
alpha: popularity **0.0760**, global PageRank **0.0797** (19 iterations, L1
5.5e-7, converged), **PPR 0.1122** (22 iterations, L1 5.0e-7, converged), and
the provided MF reference **0.0211** — with the important caveat that the
starter's MF is degenerate under its fixed `reg 0.05` (constant 1.1052/1.1830
RMSE for all 30 epochs, checkpoint epoch 1, every score equal to the global
mean 3.5806), so that row is a broken baseline, not evidence that PPR beats
matrix factorization. Mean recommended-list training popularity drops from 272
(popularity) to 244 (PPR), and the one-factor-at-a-time demo (users 1 and 2)
shows 0/10 shared movies when only the restart user changes but 7/10 when only
alpha changes 0.85 → 0.50, with the lower-alpha list swapping in lower-
popularity titles (Trainspotting 164, Sense and Sensibility 178, E.T. 167 for
Scream 226, Air Force One 235, Titanic 219).

- Prompt journal: [`week6/prompt.md`](week6/prompt.md)
- Deliverables: [`week6/verification.json`](week6/verification.json) (the
  harness's own export, 12 pass / 0 fail / 0 pending),
  [`week6/results.csv`](week6/results.csv) (retrieval metrics, cohort, exclusions,
  selected settings) and [`week6/recommendations.csv`](week6/recommendations.csv)
  (120 rows: both demo users × four methods × both alphas with ids, titles,
  genres, scores and training popularity) — all three produced by the page's
  export buttons in headless Chrome, not typed by hand.

Run it: serve the folder and open `week6/index.html` over HTTP (the data layer
uses `fetch`, so `file://` will not work):

```bash
cd week6
python3 -m http.server 8000
```

Then press **Run tests** (12/12 after **Build graph**), **Run PageRank** /
**Run PPR** for the convergence panel, **Run evaluation** for the four-method
comparison and the alpha sweep (it trains the MF reference lazily first; the
full evaluation took ~19 min at alpha 0.85 and ~14 min at alpha 0.50 on the
measured WebGL backend, Chrome 155 / TensorFlow.js 4.22.0 / Node 24.10.0),
**Run two-user demo**, **Recommend Top-10**, and the three **Export** buttons.
Set the alpha slider to the selected 0.50 before re-running the evaluation so
the primary comparison uses the validation-selected alpha.
