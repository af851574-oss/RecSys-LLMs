# Week 2 — LLM prompt journal

The starting point is the baseline content-based recommender in `week2/`: a
single-movie dropdown, Jaccard similarity over genre sets, top-2 output.

## 1. BUILD — inspect the baseline

> Serve week2/ locally and confirm the app really loads its data before I change anything: how many movies come out of u.item and how many ratings out of u.data? Show me a quick node check against the real parsing code, not browser guesswork. Do not change code yet.

Recorded before any change: running the real `data.js` parsing functions under
node (same functions the browser runs) gives **1682 movies** from `u.item` and
**100000 ratings** from `u.data`; `wc -l` agrees. `python3 -m http.server` on
the repo root served `/week2/` with HTTP 200.

One data quirk found while reading the parser: `u.item` has 19 genre flag
columns (plus an "unknown" placeholder first) but `genreNames` lists 18, and
`parseItemData` maps flag column i to name i, so internal genre labels are
shifted by one column and the Western flag is never read. This is a consistent
dimension permutation for every movie, so cosine scores are unaffected (cosine
does not care about dimension order); per the assignment I kept data loading
as is and noted it instead of "fixing" it silently.

## 2. ASK WHY — why replace Jaccard?

> The app matches genres with the Jaccard index. Why is that a weak choice for content-based filtering, and what would cosine similarity over binary genre vectors plus a user profile fix? Use the actual data format in your answer, no new libraries.

- Jaccard is unweighted binary overlap: |intersection| / |union| of two genre
  sets. It only sees which flags are set, never how much of each vector is
  filled, so a movie tagged with a single genre that matches scores as high as
  a rich genre mix that matches almost fully.
- Jaccard compares exactly two sets, so the app is stuck at item-to-item with
  one liked movie; there is no way to fold several watched movies into one
  taste profile.
- Cosine over the 18-dimensional binary vectors from `u.item` fixes the first
  point: the dot product counts shared genres, but dividing by both vector
  lengths means only the genre *mix* (the angle) matters, and the score is
  bounded in [0, 1].
- Averaging the vectors of up to 3 watched movies gives a profile vector whose
  strongest dimensions are the genres the picks share, so Top-5 can follow the
  overlap of all picks instead of one item.

## 3. TEST — make the math checkable

> Extract the pure functions (genre vector, cosine, profile average, top-k) into a marked CORE block in script.js and write a plain-node test: parse the real data files and assert 1682/100000; assert cosine(v,v)=1 and disjoint vectors give 0; hand-check one real movie pair against a hardcoded 6-decimal value; build a 3-movie profile and assert Top-5 (exactly 5, no inputs, scores in (0,1], descending); assert script.js has cosineSimilarity and no Jaccard. No frameworks, no dependencies.

`week2/test.mjs` loads the unmodified `data.js` in a `node:vm` sandbox (real
parsing), extracts the `// CORE:START ... // CORE:END` block from `script.js`,
and runs all checks above. The hand-checked pair is movies 50 and 172:

- Star Wars (1977): Action, Adventure, Romance, Sci-Fi, War → 5 genres
- Empire Strikes Back, The (1980): Action, Adventure, Drama, Romance, Sci-Fi,
  War → 6 genres
- shared = 5 → cosine = 5 / (√5 · √6) = 5 / √30 = **0.912871** (6 decimals)

## 4. EXPLAIN — in my own words

> Explain briefly why cosine normalization stops multi-genre blockbusters from dominating, and how profile averaging changes the Top-5 versus a single item.

Cosine divides the shared-genre count by both vector lengths, so every movie
is compared at unit length: a blockbuster tagged with ten genres does not win
by sheer size, because its long vector shrinks the quotient — it only scores
high on movies whose genre mix it actually matches, and the score stays ≤ 1.
With a profile of 2–3 movies each genre enters with weight 1/n, so the
profile points at the genres the picks share, while a genre tagged on only
one pick is diluted. In the actual run the profile of Star Wars, Empire
Strikes Back and GoodFellas kept the action/adventure leaders (Return of the
Jedi) but pulled in Drama-leaning titles like The Crying Game and First
Knight while dropping Stargate, and every score went down because the
profile vector spans more genres than the single Star Wars vector.

## 5. IMPROVE — implement the smallest reliable version

> Implement it in plain HTML/CSS/JS with no build step: cosine over the 18 genre flags, a multi-select for up to 3 watched movies, mode display (item-to-item vs profile-based) and similarity scores in the UI, Top-5 excluding the picks. Keep the existing style and keep data loading (u.item, u.data) as is. Update the README with a week2 section.

Implemented: `script.js` now has the CORE block (`buildGenreVector`,
`cosineSimilarity`, `buildProfileVector`, `recommendTopK`) plus a multi-select
dropdown capped at 3 picks and a Top-5 list with scores; `index.html` has the
multiple select, a hint line and the results list; `style.css` adds list
styling in the existing look; repo `README.md` gained the week2 section.

## Verification actually run

- `node week2/test.mjs` — PASS (1682 movies, 100000 ratings, cosine identities,
  hand-checked 0.912871, valid 3-movie Top-5, Jaccard gone)
- `node --check week2/script.js && node --check week2/data.js` — exit 0
- `python3 -m http.server` on the repo root: `GET /week2/` → HTTP 200
- headless Chrome `--headless=new --dump-dom --virtual-time-budget=8000` on the
  served page: DOM renders in the loaded state and the dropdown has 1683
  options (placeholder + 1682 movies)
- Button clicks are not drivable with `--dump-dom` alone, so per the fallback
  the Top-5 lists below come from the real extracted CORE functions under
  node, and the served page + dropdown count come from the DOM dump.

Top-5 for single movie 50 "Star Wars (1977)" (item-to-item):

| id  | title                            | score    |
|-----|----------------------------------|----------|
| 181 | Return of the Jedi (1983)        | 1.000000 |
| 172 | Empire Strikes Back, The (1980)  | 0.912871 |
| 271 | Starship Troopers (1997)         | 0.894427 |
| 498 | African Queen, The (1951)        | 0.894427 |
| 62  | Stargate (1994)                  | 0.774597 |

Top-5 for profile [50 Star Wars, 172 Empire Strikes Back, 182 GoodFellas]:

| id  | title                            | score    |
|-----|----------------------------------|----------|
| 181 | Return of the Jedi (1983)        | 0.894427 |
| 271 | Starship Troopers (1997)         | 0.800000 |
| 498 | African Queen, The (1951)        | 0.800000 |
| 631 | Crying Game, The (1992)          | 0.800000 |
| 720 | First Knight (1995)              | 0.800000 |

Live app: https://af851574-oss.github.io/RecSys-LLMs/week2/
