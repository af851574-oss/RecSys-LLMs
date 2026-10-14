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
