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
