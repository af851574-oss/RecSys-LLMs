# Week 3 — LLM prompt journal

The starting point is the HW3 starter in `week3/`: the same MovieLens 100K
data files as week 2, a `data.js` with working parsers but an empty
`buildRatingMatrix()`, and a `script.js` with three TODO stubs (cosine
similarity, User-Based CF, Item-Based CF). The app must recommend Top-5 two
ways for one user — User-Based CF and Item-Based CF.

## 1. BUILD — inspect the baseline

> Serve week3/ and confirm what the starter really does before I change anything: what do the parsers produce, what matrix shape does the assignment need, how sparse is the data? Use node against the real parsing code, not browser guesswork. Do not change code yet.

Recorded before any change: running the real `data.js` parsers under node gives
**1682 movies** and **100000 ratings**; `numUsers` (max id) is **943**, so
`buildRatingMatrix()` has to produce a **944 × 1683** matrix (row/column 0
unused) with `ratingMatrix[userId][movieId] === rating` and `0 = not rated`
(unambiguous because ratings are 1–5). The data is **93.70% sparse**
(100000 of 943 × 1682 = 1586126 cells filled). `cmp` shows `u.data`, `u.item`
and `readme.md` are byte-identical to the week 2 copies, per the assignment.

One quirk carried over from the starter: `data.js` still has the week 2
genre-name shift — `u.item` has 19 flag columns (unknown + 18 genres) but
`genreNames` lists 18 names, so genre labels are shifted one column. It does
**not** affect this assignment at all, because collaborative filtering uses
only the rating matrix; genres are never read. Left as is on purpose.

## 2. ASK WHY — two directions, sparse data

> The app compares rating patterns instead of genres. Why do user-based and item-based behave differently on 943 users vs 1682 items, and which single missing-value strategy should I commit to on a matrix that is 93.7% empty?

- User-based compares **rows** (a user against 942 others); item-based
  compares **columns** (a movie against 1681 others). With 1682 items, each
  movie accumulates far more raters (avg ~59) than a random pair of users
  shares movies, so item similarities stand on more evidence and are more
  stable; user similarities are cheap to compute (943 rows) but often rest on
  a handful of co-rated movies.
- Cost per request: user-based needs 942 cosine comparisons (~2 ms here),
  item-based needs, per candidate movie, similarities to everything the user
  rated (~0.9 s per user here, kept responsive by building per-movie sparse
  rater lists once instead of scanning dense columns).
- Missing values: the matrix is 93.7% empty, so *what we do with the empty
  cells decides everything*. I committed to **co-rated entries only** (readme
  section 6, first option): cosine sums only indices where both vectors have a
  rating. It invents no evidence — with mean imputation, 93.7% of every
  comparison would be manufactured agreement with the mean. The alternatives
  are not dismissed; they are measured in `analysis.mjs` (see verification).

## 3. TEST — make the math checkable

> Extract the pure CF functions into a marked CORE block in script.js and write a plain-node test: assert the matrix shape 944x1683 and exactly 100000 non-zero entries, cosine identity/no-overlap cases, one hand-computed cosine between two REAL users that share only 2–3 movies, one hand-computed user-based prediction on a tiny matrix, and that Top-5 for a real user is exactly 5 unseen movies with scores in [1,5] sorted descending and meeting MIN_SUPPORT. No frameworks, no dependencies.

`week3/test.mjs` loads the unmodified `data.js` in a `node:vm` sandbox, runs
the real parsers and `buildRatingMatrix()`, then runs the `// CORE:START ...
// CORE:END` block from `script.js` in the same sandbox (week 2 pattern).

Hand-checked cosine between real users **1 and 166**, who share exactly two
movies in `u.data`:

- movie 258: user 1 rated **5**, user 166 rated **4** → 5·4 = 20
- movie 243: user 1 rated **1**, user 166 rated **3** → 1·3 = 3
- dot = 20 + 3 = 23; ‖u₁‖ = √(5² + 1²) = √26 ≈ 5.099020; ‖u₁₆₆‖ = √(4² + 3²) = √25 = 5
- cosine = 23 / (√26 · 5) = 23 / 25.495098 = **0.902134** (6 decimals)

Hand-checked user-based prediction on a tiny matrix (rows = users, cols =
movies; user 1 = [5, 3, –], user 2 = [5, 4, 4], user 3 = [4, 3, 1]):

- sim(1,2) = (5·5 + 3·4) / (√(25+9)·√(25+16)) = 37 / (√34·√41) = 0.990992
- sim(1,3) = (5·4 + 3·3) / (√(25+9)·√(16+9)) = 29 / (√34·5) = 0.994692
- predict(u1, movie 3) = (0.990992·4 + 0.994692·1) / (0.990992 + 0.994692) =
  4.958660 / 1.985684 = **2.497205**

## 4. EXPLAIN — in my own words

> Why user-based vs item-based here? What is the trade-off between the missing-value strategies and matrix factorization? Why does CF fail for new users/items and thin overlap?

**User- vs item-based (943 users, 1682 items).** Item-based wins on quality
here because a movie column has ~59 raters on average while two random users
share a median of only 8 movies, so item similarities rest on much firmer
overlap; the analysis shows item-based covering 99.8% of test pairs vs 29%
for user-based with 20 neighbours. Item-based also scales better as the
catalog grows: item–item similarities are between fewer-but-better-populated
columns and can be precomputed, while every new user immediately invalidates
the user-similarity work. Efficiency flips the other way per request: one
user-based query is ~2 ms because it scans 943 short rows, one item-based
query ~0.9 s because it compares every candidate against everything the user
rated.

**Missing-value trade-off.** Co-rated-only is the simplest and never invents
evidence, but it starves: only pairs with overlapping raters get predictions.
Mean imputation fills 93.7% of cells with a made-up value — it raises coverage
to ~92–99% and even helps item-based RMSE (1.03 → 0.97), because "both users
rated everything at their personal mean" is a weak but real taste signal — yet
it biases similarity toward the average and buries the honest no-signal case.
The min(n,50)/50 weighting keeps co-rated honesty while discounting thin
overlap (n = 1 contributes 1/50 weight), which is the best user-based variant
(RMSE 1.04, coverage 93%). Matrix factorization beats them all (RMSE 0.90)
because it learns latent taste dimensions instead of comparing raw rows, at
the cost of training compute, hyperparameters, and losing the "similar users
liked this" explanation.

**Cold start and sparsity.** With 93.70% of cells empty, a brand-new user has
an all-zero row: cosine against every other user is 0 (zero denominator is
guarded), so there are no neighbours and nothing can be recommended — the same
holds for a new movie with an empty column, which no item-similarity can
reach. Worse, an existing user with few ratings only overlaps with others on a
handful of movies, and a similarity computed from one or two co-rated items is
mostly noise: two users who happened to rate the same obscure film 5 are not
"twins". That is why the app refuses Top-5 candidates resting on fewer than
`MIN_SUPPORT = 3` contributing ratings (see IMPROVE).

## 5. IMPROVE — implement the smallest reliable version

> Implement co-rated-only CF in plain HTML/CSS/JS with no build step: user dropdown plus optional movie dropdown, both Top-5 lists with scores, a prediction panel for the picked (user, movie) pair, efficient item-based scoring, and a support threshold so obscure one-rater movies cannot dominate Top-5. Keep the existing look, render with textContent only, and update the README.

Implemented: `script.js` now states the co-rated-only strategy at the top and
holds the CORE block (`cosineSimilarity`, sparse indexes, `predictUserBased` /
`predictItemBased`, `getUserBasedRecommendations` / `getItemBasedRecommendations`)
with `NUM_NEIGHBOURS = 20` and `MIN_SUPPORT = 3`.

Two things worth pinning down:

- **MIN_SUPPORT is a candidate filter, not a second missing-value strategy.**
  The missing-value convention stays co-rated-only everywhere; MIN_SUPPORT
  only rejects a Top-5 candidate (or a prediction-panel value) that would be
  computed from fewer than 3 contributing ratings — without it, a movie whose
  prediction comes from a single co-rater's 5 stars gets a perfect 5.0 and
  floods the list. The without-threshold Top-5 below shows exactly that.
- **Matrix convention.** The code keeps the starter convention
  `ratingMatrix[userId][movieId]` (users are rows); the course slide draws the
  transposed matrix with users as columns. Same math, transposed axes.

Also: item-based predictions are normalized by the sum of positive
similarities, so both methods output ratings on the 1–5 scale and are directly
comparable; per-movie sparse rater lists are built once (cached on the matrix
reference) so a click stays responsive; all titles are rendered via
`textContent`, never `innerHTML` with data.

## Verification actually run

- `node week3/test.mjs` — PASS: matrix 944×1683 with exactly 100000 non-zero
  entries, `numUsers=943`, `numMovies=1682`, cosine(v,v)=1 / no-overlap=0 /
  zero-vector guard, cosine(user 1, user 166) = 0.902134, tiny-matrix
  prediction = 2.497205, both real Top-5 lists valid (5 unseen movies, scores
  in [1,5], descending, support ≥ 3), TODO placeholders and the two unchosen
  strategy checkboxes gone.
- `node week3/analysis.mjs` — full output below (deterministic, ~16 s).
- `node --check week3/script.js && node --check week3/data.js` — exit 0.
- `python3 -m http.server` on the repo root: `GET /week3/` → HTTP 200.
- Headless Chrome `--headless=new --dump-dom --virtual-time-budget=15000` on
  the served page: DOM shows the loaded state and `#user-select` populated
  with 943 user options. Honest limitation: `--dump-dom` cannot click the
  button, so the recommendation/prediction paths were verified by running the
  exact CORE functions in node (test.mjs and analysis.mjs above).

RMSE / MAE on 2000 held-out pairs (fixed-seed 10% holdout, seed 42; CF
fallback = user train mean; coverage = share the method itself predicted):

| method                                  |   RMSE |   MAE | coverage |   time |
|-----------------------------------------|-------:|------:|---------:|-------:|
| global-mean baseline                    | 1.1055 | 0.9264 |   100.0% |    0 ms |
| user-mean baseline                      | 1.0339 | 0.8343 |   100.0% |    0 ms |
| user-based CF (co-rated only)           | 1.0973 | 0.8614 |    29.0% | 1875 ms |
| user-based CF (mean imputation)         | 1.0698 | 0.8266 |    92.3% | 3510 ms |
| user-based CF (weighted min(n,50)/50)   | 1.0405 | 0.8090 |    93.0% | 1884 ms |
| item-based CF (co-rated only)           | 1.0335 | 0.8333 |    99.8% |  914 ms |
| item-based CF (mean imputation)         | 0.9686 | 0.7769 |    99.5% | 1805 ms |
| item-based CF (weighted min(n,50)/50)   | 1.0281 | 0.8232 |    99.8% |  911 ms |
| matrix factorization (bias SGD)         | 0.9012 | 0.7152 |   100.0% |    0 ms |

MF hyperparameters: k=20, epochs=20, lr=0.01, reg=0.05, seed=42, init
U(-0.05, 0.05), biases on a global mean; training 145 ms, table time =
predicting the 2000 pairs. Sparsity: 93.70%. Co-rated counts over 10000
random user pairs: median 8, 32.1% share fewer than 5 co-rated items. Per-user
time (user 1, app CORE functions): user-based 4.5 ms first call / 2.4 ms
repeat; item-based 915.3 ms first call (one-time sparse index build) / 877.8 ms
repeat.

Top-5 User-Based CF for user 1 (with MIN_SUPPORT=3):

| id  | title                        | score | support |
|-----|------------------------------|------:|--------:|
| 881 | Money Talks (1997)           | 4.667 | 3 |
| 898 | Postman, The (1997)          | 4.666 | 3 |
| 354 | Wedding Singer, The (1998)   | 4.502 | 4 |
| 339 | Mad City (1997)              | 4.332 | 3 |
| 880 | Soul Food (1997)             | 4.331 | 3 |

Top-5 User-Based CF for user 1 (WITHOUT MIN_SUPPORT): Deceiver (1997),
Schindler's List (1993), Desperate Measures (1998), 187 (1997), Critical Care
(1997) — all score 5.000 from a **single** co-rater. This junk list is precisely
what MIN_SUPPORT filters out.

Top-5 Item-Based CF for user 1 (with MIN_SUPPORT=3; identical without the
threshold because item candidates naturally rest on many co-raters):

| id   | title                                            | score | support |
|------|--------------------------------------------------|------:|--------:|
| 1156 | Cyclo (1995)                                     | 4.378 | 37 |
| 1653 | Entertaining Angels: The Dorothy Day Story (1996)| 4.375 | 8 |
| 1601 | Office Killer (1997)                             | 4.279 | 43 |
| 1618 | King of New York (1990)                          | 4.222 | 27 |
| 1656 | Little City (1998)                               | 4.184 | 108 |

Cold start (through the app CORE functions): a new user with zero ratings gets
0 neighbours, an empty Top-5 and no item-based prediction; a movie with zero
ratings gets no item similarity and is never predicted.

Iteration-2 verification runs are recorded in the Iteration 2 section below.

Live app: https://af851574-oss.github.io/RecSys-LLMs/week3/

---

# Iteration 2 (IMPROVE)

## Prompt (round 2)

> I tested the iteration-1 app and two things are wrong. (1) With co-rated-only
> cosine, any two users who share exactly one movie get similarity exactly 1.0,
> so user-based neighbours are picked on almost no evidence and coverage is
> 29%. (2) The item-based Top-5 for user 1 are movies with 1-2 raters in the
> whole dataset — my MIN_SUPPORT counted my own rated movies with positive
> similarity, not actual raters of the candidate. Fix both: switch the one
> missing-value strategy to the weighted approach from readme section 6
> (co-rated cosine discounted by min(n, 50)/50), redefine MIN_SUPPORT as the
> number of DISTINCT other users an estimate rests on and set it to 5, show
> that support in the UI, compute prediction-panel answers leave-one-out when
> the movie is already rated, and update tests, analysis and README. Keep the
> dataset, the look and the offline/no-build rules.

## TEST — what the iteration-1 testing exposed (numbers reproduced)

- **Neighbours on no evidence.** Any two users with exactly one co-rated movie
  have cosine exactly 1.0 (x·y / √(x²·y²) = 1). Against user 1, **9 of 942**
  users sit at similarity exactly 1.0, and of the top-20 neighbours **7 share
  only 1 movie and 6 only 2** (co-rated counts: min 1, median 2, max 10).
  This is also why user-based CF covered only **29.0%** of held-out pairs —
  for most pairs none of the 20 neighbours had rated the movie.
- **Item-based Top-5 was the single-rater echo chamber.** The Top-5 for user 1
  were **Cyclo (1 rater in the whole dataset), Entertaining Angels (1), Office
  Killer (1), King of New York (1), Little City (2)**. The old support counter
  showed 37/8/43/27/108 — but it counted the active user's rated movies with
  positive similarity, and every one of those similarities was computed from
  that same single rater of the candidate. MIN_SUPPORT never saw the problem.

## Decision

- **Weighted strategy (readme section 6, third option).**
  `similarity = co-rated cosine × min(n, SIGNIFICANCE_SHRINK) / SIGNIFICANCE_SHRINK`
  with `SIGNIFICANCE_SHRINK = 50` and n = number of co-rated entries, applied
  consistently to user-user and item-item similarity, in neighbour selection
  and in the weighted averages. One shared movie now contributes 1/50 of the
  raw cosine instead of a full 1.0. Measured on the seed-42 holdout (full
  table below): user-based RMSE **1.0405 at 93.0% coverage** vs 1.0973 at
  29.0% co-rated-only; item-based RMSE **1.0281** vs 1.0335. The other
  strategies stay measured in `analysis.mjs`.
- **MIN_SUPPORT = 5 distinct other users**, a candidate/confidence filter, not
  a second missing-value strategy: user-based = neighbours who rated the
  candidate; item-based = users who rated both the candidate and at least one
  of the active user's rated movies that contributed with positive similarity.
- **Prediction panel.** Same functions and threshold; below the threshold the
  panel shows "not enough data" instead of a number; an existing rating is
  still displayed as "Actual rating" but never feeds its own prediction.
  Writing the leave-one-out test caught a real leak: skipping the candidate
  in the item loop was not enough, because r(u, candidate) still entered
  every sim(i, candidate) through the co-rater sets — and in user-based the
  rating shifted all neighbour similarities. Both `predictUserBased` and
  `predictItemBased` now mask the rating explicitly (verified by asserting
  the prediction equals one computed from a matrix with the entry removed).
- **UI.** Each recommendation line shows the evidence: e.g.
  `Wings of Desire (1987) — score 4.032 - 57 users`.

## EXPLAIN — why item-based still favours the long tail

The item-based score is a weighted average of *my own* ratings on similar
movies, so it measures "how much people like me enjoyed this", not "how many
people liked it" — a niche title similar to films I rated 5 scores ~4-5 no
matter how small its audience, while a blockbuster I would rate 4 can never
score above 4. Ranking by that predicted rating therefore pushes titles whose
small audiences loved them to the top: even after the MIN_SUPPORT = 5 filter,
the new Top-5 for user 1 (A Chef in Love, the Leni Riefenstahl documentary,
Ruby in Paradise, Alphaville, Wings of Desire) is all art-house with 8-57
raters. That is a real catalog-discovery trade-off: the list surfaces
deep-catalog titles a popularity ranker would never show — genuine personal
discovery — but it under-recommends safe popular hits, and a high score for a
10-rater film still rests on thin evidence compared with a 400-rater one.

## New results (before → after, user 1)

User-Based CF (iteration-1 settings → new app settings; "raters" = raters of
the movie in the whole dataset):

| # | iteration 1 (co-rated, entry support ≥ 3) | raters | new app (weighted, ≥ 5 users) | raters |
|---|-------------------------------------------|-------:|-------------------------------|-------:|
| 1 | Money Talks (1997) — 4.667 (3)            | 45 | Close Shave, A (1995) — 4.857 (7) | 112 |
| 2 | Postman, The (1997) — 4.666 (3)           | 58 | Hamlet (1996) — 4.857 (7)        | 90 |
| 3 | Wedding Singer, The (1998) — 4.502 (4)    | 72 | Rear Window (1954) — 4.801 (10)  | 209 |
| 4 | Mad City (1997) — 4.332 (3)               | 47 | City of Lost Children, The (1995) — 4.800 (5) | 96 |
| 5 | Soul Food (1997) — 4.331 (3)              | 59 | Big Sleep, The (1946) — 4.799 (5) | 73 |

Item-Based CF:

| # | iteration 1 (co-rated, entry support ≥ 3) | raters | new app (weighted, ≥ 5 users) | raters |
|---|-------------------------------------------|-------:|-------------------------------|-------:|
| 1 | Cyclo (1995) — 4.378 (37)                 | **1** | A Chef in Love (1996) — 4.090 (8) | 8 |
| 2 | Entertaining Angels (1996) — 4.375 (8)    | **1** | Wonderful, Horrible Life of Leni Riefenstahl (1993) — 4.079 (10) | 10 |
| 3 | Office Killer (1997) — 4.279 (43)         | **1** | Ruby in Paradise (1993) — 4.037 (23) | 23 |
| 4 | King of New York (1990) — 4.222 (27)      | **1** | Alphaville (1965) — 4.034 (12) | 12 |
| 5 | Little City (1998) — 4.184 (108)          | **2** | Wings of Desire (1987) — 4.032 (57) | 57 |

Every new recommendation now rests on ≥ 5 distinct raters, and for the smaller
titles the support equals the full number of raters in the dataset — the
estimate can no longer be an echo of one person. Neighbour evidence for user 1:
top-20 co-rated counts went from min 1 / median 2 / max 10 (co-rated-only) to
min 52 / median 80.5 / max 155 (weighted), and 0 users sit at weighted
similarity exactly 1.0 against user 1, down from 9 under co-rated-only.
New app Top-5 for user 100 — user-based: The Godfather
Part II (4.882, 7 users), Annie Hall (4.839, 5), 2001 (4.830, 6), Pulp Fiction
(4.787, 10), The Godfather (4.639, 11); item-based: Nina Takes a Lover (3.653,
6 users), Penny Serenade (3.631, 7), Top Hat (3.578, 21), Lassie (3.571, 7),
The Big Green (3.550, 14).

## Verification actually run (iteration 2)

- `node week3/test.mjs` — PASS: all iteration-1 checks kept (matrix 944×1683
  with 100000 non-zeros, cosine identities, raw cosine(user 1, user 166) =
  0.902134, tiny-matrix prediction, Top-5 shape/sort/[1,5]/unrated, TODOs
  gone) plus the new ones: weighted(user 1, user 166) = **0.902134 × 2/50 =
  0.036085** (hand-computed), tiny-matrix prediction still 2.497205 (both
  neighbours shrink by min(2,50)/50 = 0.04, which cancels in the weighted
  average — arithmetic written out in the test), MIN_SUPPORT = 5 and
  SIGNIFICANCE_SHRINK = 50, every top-20 neighbour of user 1 shares ≥ **52**
  co-rated movies (the observed minimum; was 1 in iteration 1), every Top-5
  candidate of both methods has support ≥ 5 distinct users, sparse item
  similarity equals the dense-column raw AND weighted similarity, and the
  leave-one-out property holds for an already-rated movie (user 1, movie 50).
- `node week3/analysis.mjs` — full output below (deterministic, seed 42,
  ~17 s). The evaluation pipeline is unchanged, so the RMSE/MAE/coverage
  table is directly comparable with iteration 1; the two weighted rows are
  now marked `<== app`.
- `node --check week3/script.js && node --check week3/data.js` — exit 0.
- `python3 -m http.server` on the repo root: `GET /week3/` → HTTP 200.
- Headless Chrome `--headless=new --dump-dom --virtual-time-budget=15000` on
  the served page: `#user-select` populated with 943 user options. Honest
  limitation unchanged: `--dump-dom` cannot click, so recommendation /
  prediction rendering paths are verified by running the exact CORE functions
  in node (test.mjs, analysis.mjs).
- `cmp` u.data / u.item / readme.md against the untouched originals — byte
  identical.

RMSE / MAE on 2000 held-out pairs (fixed-seed 10% holdout, seed 42; CF
fallback = user train mean; coverage = share the method itself predicted):

| method                                       |   RMSE |   MAE | coverage |   time |
|----------------------------------------------|-------:|------:|---------:|-------:|
| global-mean baseline                         | 1.1055 | 0.9264 |   100.0% |    0 ms |
| user-mean baseline                           | 1.0339 | 0.8343 |   100.0% |    0 ms |
| user-based CF (co-rated only)                | 1.0973 | 0.8614 |    29.0% | 1957 ms |
| user-based CF (mean imputation)              | 1.0698 | 0.8266 |    92.3% | 3889 ms |
| user-based CF (weighted min(n,50)/50) **<== app** | 1.0405 | 0.8090 |  93.0% | 1999 ms |
| item-based CF (co-rated only)                | 1.0335 | 0.8333 |    99.8% |  919 ms |
| item-based CF (mean imputation)              | 0.9686 | 0.7769 |    99.5% | 1790 ms |
| item-based CF (weighted min(n,50)/50) **<== app** | 1.0281 | 0.8232 |  99.8% |  910 ms |
| matrix factorization (bias SGD)              | 0.9012 | 0.7152 |   100.0% |    0 ms |

The app additionally gates each candidate at MIN_SUPPORT = 5 distinct users
(UI Top-5 and prediction panel only; the table above measures the raw
variants without that filter). Sparsity 93.70%; co-rated counts over 10000
random user pairs: median 8, 32.1% below 5. Per-user time (user 1, app CORE
functions, iteration-2 settings): user-based 2.2 ms first / 2.0 ms repeat;
item-based 1000.9 ms first (one-time sparse index build) / 1021.9 ms repeat —
slightly above iteration 1 because collecting the distinct-evidence user set
costs one Set insert per co-rater. Cold start unchanged: a zero-rating user
gets 0 neighbours and no predictions; a zero-rating movie is never predicted.

Live app: https://af851574-oss.github.io/RecSys-LLMs/week3/
