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
