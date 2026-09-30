// ---------------------------------------------------------------------------
// HW3 — Collaborative Filtering (iteration 2)
//
// Missing-value strategy (week3/readme.md section 6), chosen EXACTLY ONE and
// applied consistently in every similarity below — neighbour selection AND
// the weighted averages:
//
//   WEIGHTED: co-rated cosine discounted by co-rated evidence,
//     sim = cos(a, b) * min(n, SIGNIFICANCE_SHRINK) / SIGNIFICANCE_SHRINK
//   where cos(a, b) is the cosine over entries rated by BOTH vectors only,
//   n is the number of such entries and SIGNIFICANCE_SHRINK = 50.
//
//   Why: iteration 1 shipped co-rated-only cosine and testing exposed two
//   defects. (1) Any two users sharing exactly one movie get similarity
//   exactly 1.0 (x·y / sqrt(x²·y²) = 1): 9 of 942 users scored 1.0 against
//   user 1, and 7 of user 1's top-20 neighbours shared only 1 movie —
//   neighbours were selected on almost no evidence, and user-based CF
//   covered only 29.0% of held-out pairs (RMSE 1.0973). (2) The item-based
//   Top-5 for user 1 were movies with 1-2 raters in the whole dataset
//   (Cyclo, Entertaining Angels, Office Killer, King of New York, Little
//   City), because every pairwise similarity rested on that same single
//   rater. The discount shrinks both pathologies (1 shared movie contributes
//   1/50 weight) and measures better on the fixed seed-42 holdout:
//   user-based RMSE 1.0405 at 93.0% coverage (vs 1.0973 at 29.0%), item-
//   based RMSE 1.0281 vs 1.0335 co-rated-only — full comparison in
//   week3/analysis.mjs, which still measures the other strategies (co-rated
//   only, mean imputation) and matrix factorization against this choice.
//
// MIN_SUPPORT below is a CANDIDATE/CONFIDENCE FILTER, not a second
// missing-value strategy: a candidate is only recommended/predicted if its
// estimate rests on at least MIN_SUPPORT DISTINCT OTHER USERS (user-based:
// neighbours who rated the movie; item-based: users who rated both the
// movie and at least one of the active user's rated movies that contributed
// with positive similarity). Iteration 1 counted contributing rating
// ENTRIES instead, so a movie with a single rater passed with support 37 —
// 37 of the active user's movies were "similar" to it, all through that
// one rater.
// ---------------------------------------------------------------------------

// CORE:START — pure CF logic, no DOM/fetch. week3/test.mjs and
// week3/analysis.mjs extract this block and run it in a node:vm sandbox
// together with the real data.js parsers (see week2/test.mjs for the
// pattern). Globals used here (ratingMatrix, movies, numUsers, numMovies)
// are provided by data.js.

const NUM_NEIGHBOURS = 20;      // user-based: consult the N most similar users
const MIN_SUPPORT = 5;          // distinct-user confidence filter, see header comment
const SIGNIFICANCE_SHRINK = 50; // weighted strategy: sim *= min(n, 50) / 50

// Raw co-rated cosine plus the co-rated count n, shared by the two public
// similarity functions below: an index contributes only if a[i] !== 0 AND
// b[i] !== 0, so both norms are taken over the same co-rated subset. sim = 0
// when there is no co-rated entry (zero denominator) — the guarded
// no-signal case.
function coRatedCosine(a, b) {
    let dot = 0, normA = 0, normB = 0, n = 0;
    for (let i = 0; i < a.length; i++) {
        const x = a[i];
        if (x === 0) continue;
        const y = b[i];
        if (y === 0) continue;
        n++;
        dot += x * y;
        normA += x * x;
        normB += y * y;
    }
    if (dot === 0 || normA === 0 || normB === 0) return { sim: 0, n };
    return { sim: dot / Math.sqrt(normA * normB), n };
}

// The readme's similarity function name: RAW co-rated cosine, no discount.
// Kept as the reference so the hand-computed cosine test stays meaningful.
function cosineSimilarity(a, b) {
    return coRatedCosine(a, b).sim;
}

// The app's missing-value strategy (readme section 6, weighted approach):
// raw co-rated cosine discounted by min(n, SIGNIFICANCE_SHRINK) /
// SIGNIFICANCE_SHRINK with n = number of co-rated entries. One shared movie
// no longer yields similarity 1.0 (it yields 1/50 of the raw cosine); 50+
// co-rated entries are undiscounted. Used for user-user AND item-item
// similarity, in neighbour selection and in the weighted averages.
function weightedSimilarity(a, b) {
    const { sim, n } = coRatedCosine(a, b);
    return sim * Math.min(n, SIGNIFICANCE_SHRINK) / SIGNIFICANCE_SHRINK;
}

// Sparse indexes over ratingMatrix, built once and cached on the matrix
// reference (a rebuilt matrix has a new reference, so the cache invalidates).
let itemIndexCache = null; // { matrix, movieRaters }
let moviesByIdCache = null; // { movies, byId }

// Per-movie sparse rater lists: movieRaters[m] = [{ userId, rating }, ...].
// Built once so item-based similarity costs O(co-raters) per pair instead of
// scanning a dense 943-row column — keeps the browser responsive.
function getMovieRaters() {
    if (!itemIndexCache || itemIndexCache.matrix !== ratingMatrix) {
        const movieRaters = new Array(numMovies + 1);
        for (let m = 0; m <= numMovies; m++) movieRaters[m] = [];
        for (let u = 1; u <= numUsers; u++) {
            const row = ratingMatrix[u];
            for (let m = 1; m <= numMovies; m++) {
                if (row[m] !== 0) movieRaters[m].push({ userId: u, rating: row[m] });
            }
        }
        itemIndexCache = { matrix: ratingMatrix, movieRaters };
    }
    return itemIndexCache.movieRaters;
}

function getMoviesById() {
    if (!moviesByIdCache || moviesByIdCache.movies !== movies) {
        const byId = {};
        for (const movie of movies) byId[movie.id] = movie;
        moviesByIdCache = { movies, byId };
    }
    return moviesByIdCache.byId;
}

// The active user's sparse rating list: [{ movieId, rating }, ...].
function getUserRatings(userId) {
    const row = ratingMatrix[userId];
    const list = [];
    for (let m = 1; m <= numMovies; m++) {
        if (row[m] !== 0) list.push({ movieId: m, rating: row[m] });
    }
    return list;
}

// The NUM_NEIGHBOURS most similar users under the weighted strategy
// (positive similarity only).
function computeUserNeighbours(activeUserId, n = NUM_NEIGHBOURS) {
    const activeRow = ratingMatrix[activeUserId];
    const sims = [];
    for (let v = 1; v <= numUsers; v++) {
        if (v === activeUserId) continue;
        const sim = weightedSimilarity(activeRow, ratingMatrix[v]);
        if (sim > 0) sims.push({ userId: v, sim });
    }
    sims.sort((a, b) => b.sim - a.sim || a.userId - b.userId);
    return sims.slice(0, n);
}

// Weighted-average prediction of movieId from `neighbours` who rated it.
// support = DISTINCT users: the neighbours who rated the movie (neighbour
// ids are unique by construction). Returns { score, support } or null when
// support < minSupport / no signal.
function userBasedAggregate(movieId, neighbours, minSupport) {
    let num = 0, den = 0, support = 0;
    for (const nb of neighbours) {
        const r = ratingMatrix[nb.userId][movieId];
        if (r === 0) continue;
        num += nb.sim * r;
        den += nb.sim;
        support++;
    }
    if (support < minSupport || den === 0) return null;
    return { score: num / den, support };
}

// Item-based evidence for one candidate movie: sum over the user's rated
// movies i of weightedSim(i, candidate) * r(u, i), divided by the sum of
// weightedSim(i, candidate) (positive similarities only) — a predicted
// rating on the same 1-5 scale as user-based. weightedSim(i, j) is the raw
// co-rated cosine over the co-raters of i and j, discounted by
// min(n, SIGNIFICANCE_SHRINK)/SIGNIFICANCE_SHRINK — identical to
// weightedSimilarity on the two dense rating columns but computed from the
// sparse rater lists. i === candidateId is skipped so that predicting an
// already-rated movie (prediction panel) cannot leak the user's own rating.
// excludeUserId removes that user from the candidate's co-raters (leave-one-
// out for an already-rated candidate: without it, r(u, candidate) would
// still enter every sim(i, candidate) through the co-rater sets).
// support = DISTINCT users who rated the candidate AND at least one
// contributing movie of the active user (collected in `evidence`), not a
// count of rating entries — iteration 1 counted entries, so a 1-rater movie
// passed with support 37, all through that single rater.
function itemBasedAggregate(candidateId, userRatings, movieRaters, minSupport, excludeUserId = 0) {
    const ratersOfCandidate = movieRaters[candidateId];
    if (!ratersOfCandidate || ratersOfCandidate.length === 0) return null;
    const candRatings = new Map(ratersOfCandidate.map(e => [e.userId, e.rating]));
    if (excludeUserId) candRatings.delete(excludeUserId);
    let num = 0, den = 0;
    const evidence = new Set();
    for (const { movieId, rating } of userRatings) {
        if (movieId === candidateId) continue;
        let dot = 0, normI = 0, normJ = 0, n = 0;
        for (const rater of movieRaters[movieId]) {
            const other = candRatings.get(rater.userId);
            if (other === undefined) continue;
            n++;
            evidence.add(rater.userId);
            dot += rater.rating * other;
            normI += rater.rating * rater.rating;
            normJ += other * other;
        }
        if (dot === 0) continue; // no co-rated raters -> similarity 0
        const sim = (dot / Math.sqrt(normI * normJ)) *
            Math.min(n, SIGNIFICANCE_SHRINK) / SIGNIFICANCE_SHRINK;
        num += sim * rating;
        den += sim;
    }
    const support = evidence.size;
    if (support < minSupport || den === 0) return null;
    return { score: num / den, support };
}

// Predicted rating of (activeUserId, movieId) via User-Based CF, or null.
// Leave-one-out for the pair: an already-rated movie is masked from the
// active user's row before neighbour selection, so the prediction is
// computed exactly as if that rating did not exist (the rating otherwise
// shifts every neighbour similarity). Top-5 scoring only touches unrated
// movies and uses userBasedAggregate directly, so no masking there.
function predictUserBased(activeUserId, movieId, minSupport = MIN_SUPPORT) {
    const activeRow = ratingMatrix[activeUserId];
    const saved = activeRow[movieId];
    activeRow[movieId] = 0;
    try {
        return userBasedAggregate(movieId, computeUserNeighbours(activeUserId), minSupport);
    } finally {
        activeRow[movieId] = saved;
    }
}

// Predicted rating of (activeUserId, movieId) via Item-Based CF, or null.
// excludeUserId = activeUserId gives the same leave-one-out guarantee.
function predictItemBased(activeUserId, movieId, minSupport = MIN_SUPPORT) {
    return itemBasedAggregate(movieId, getUserRatings(activeUserId), getMovieRaters(),
        minSupport, activeUserId);
}

// Top-K recommendations over all movies the user has not rated.
// Candidates are scored, filtered by minSupport, sorted by score descending
// (movie id ascending as a deterministic tie-break) and cut to topK.
function getUserBasedRecommendations(activeUserId, topK = 5, minSupport = MIN_SUPPORT) {
    const neighbours = computeUserNeighbours(activeUserId);
    const rated = new Set(getUserRatings(activeUserId).map(e => e.movieId));
    const byId = getMoviesById();
    const candidates = [];
    for (let m = 1; m <= numMovies; m++) {
        if (rated.has(m) || !byId[m]) continue;
        const agg = userBasedAggregate(m, neighbours, minSupport);
        if (agg) candidates.push({ movieId: m, title: byId[m].title, score: agg.score, support: agg.support });
    }
    candidates.sort((a, b) => b.score - a.score || a.movieId - b.movieId);
    return candidates.slice(0, topK);
}

function getItemBasedRecommendations(activeUserId, topK = 5, minSupport = MIN_SUPPORT) {
    const userRatings = getUserRatings(activeUserId);
    const rated = new Set(userRatings.map(e => e.movieId));
    const byId = getMoviesById();
    const movieRaters = getMovieRaters();
    const candidates = [];
    for (let m = 1; m <= numMovies; m++) {
        if (rated.has(m) || !byId[m]) continue;
        const agg = itemBasedAggregate(m, userRatings, movieRaters, minSupport);
        if (agg) candidates.push({ movieId: m, title: byId[m].title, score: agg.score, support: agg.support });
    }
    candidates.sort((a, b) => b.score - a.score || a.movieId - b.movieId);
    return candidates.slice(0, topK);
}

// CORE:END

// Initialize the application when the window loads
window.onload = async function() {
    const userBased = document.getElementById('user-based-result');
    const itemBased = document.getElementById('item-based-result');

    try {
        userBased.innerHTML = '<p>Loading movie data...</p>';
        itemBased.innerHTML = '<p>Loading movie data...</p>';

        await loadData();

        populateUserDropdown();
        populateMovieDropdown();

        userBased.innerHTML = '<p>Data loaded. Select a user.</p>';
        itemBased.innerHTML = '<p>Data loaded. Select a user.</p>';
    } catch (error) {
        console.error('Initialization error:', error);
        // The error message is already shown by data.js
    }
};

// Populate the user dropdown with one option per user id found in u.data
function populateUserDropdown() {
    const selectElement = document.getElementById('user-select');

    // Clear existing options except the first placeholder
    while (selectElement.options.length > 1) {
        selectElement.remove(1);
    }

    for (let userId = 1; userId <= numUsers; userId++) {
        const option = document.createElement('option');
        option.value = userId;
        option.textContent = `User ${userId}`;
        selectElement.appendChild(option);
    }
}

// Populate the optional movie dropdown used for the (user, movie) prediction
function populateMovieDropdown() {
    const selectElement = document.getElementById('movie-select');

    while (selectElement.options.length > 1) {
        selectElement.remove(1);
    }

    for (const movie of movies) {
        const option = document.createElement('option');
        option.value = movie.id;
        option.textContent = movie.title;
        selectElement.appendChild(option);
    }
}

// Read the selected user (and optional movie) and render the two Top-5 lists,
// plus the prediction panel when a movie is picked
function getRecommendations() {
    const userId = parseInt(document.getElementById('user-select').value, 10);

    if (isNaN(userId)) {
        renderList('user-based-result', [], 'Please select a user first.');
        renderList('item-based-result', [], 'Please select a user first.');
        document.getElementById('prediction-result').textContent = '';
        return;
    }

    renderList('user-based-result', getUserBasedRecommendations(userId));
    renderList('item-based-result', getItemBasedRecommendations(userId));

    const movieId = parseInt(document.getElementById('movie-select').value, 10);
    const panel = document.getElementById('prediction-result');
    if (isNaN(movieId)) {
        panel.textContent = '';
    } else {
        renderPrediction(userId, movieId);
    }
}

// Render the User-Based and Item-Based CF predicted ratings for one
// (user, movie) pair, plus the actual rating if the user already rated it.
// Leave-one-out for the pair: predictUserBased / predictItemBased mask the
// active user's own rating of movieId, so an existing rating is displayed
// but never feeds its own prediction.
function renderPrediction(userId, movieId) {
    const panel = document.getElementById('prediction-result');
    panel.textContent = '';

    const movie = getMoviesById()[movieId];
    if (!movie) return;

    const heading = document.createElement('h3');
    heading.textContent = `Rating prediction for "${movie.title}" (User ${userId})`;
    panel.appendChild(heading);

    const list = document.createElement('ul');

    const userBased = predictUserBased(userId, movieId);
    const itemBased = predictItemBased(userId, movieId);
    const actual = ratingMatrix[userId][movieId];

    const rows = [
        `User-Based CF prediction: ${formatPrediction(userBased)}`,
        `Item-Based CF prediction: ${formatPrediction(itemBased)}`,
    ];
    if (actual !== 0) {
        rows.push(`Actual rating: ${actual}`);
    } else {
        rows.push('Actual rating: not rated by this user yet');
    }

    for (const text of rows) {
        const li = document.createElement('li');
        li.textContent = text;
        list.appendChild(li);
    }
    panel.appendChild(list);
}

function formatPrediction(agg) {
    if (!agg) return `not enough data (estimate rests on fewer than MIN_SUPPORT = ${MIN_SUPPORT} distinct users)`;
    return `score ${agg.score.toFixed(3)} - ${agg.support} distinct user${agg.support === 1 ? '' : 's'}`;
}

// Render a list of { title, score } into the given element using DOM APIs
// (textContent, never innerHTML with data) and messages for the empty case
function renderList(elementId, items, message) {
    const el = document.getElementById(elementId);
    el.textContent = '';

    const p = document.createElement('p');
    if (message) {
        p.textContent = message;
        el.appendChild(p);
        return;
    }

    if (!items || items.length === 0) {
        p.textContent = 'No recommendations found for this user.';
        el.appendChild(p);
        return;
    }

    const list = document.createElement('ul');
    for (const item of items) {
        const li = document.createElement('li');
        // Support shown next to the score: how many distinct users the
        // prediction rests on (the MIN_SUPPORT confidence filter).
        li.textContent = `${item.title} — score ${Number(item.score).toFixed(3)} - ` +
            `${item.support} user${item.support === 1 ? '' : 's'}`;
        list.appendChild(li);
    }
    el.appendChild(list);
}
