import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

// ---------------------------------------------------------------------------
// Deterministic analysis for HW3 (prints everything; saves nothing to disk).
// Runs the REAL data.js parsers and the REAL CORE block from script.js in a
// node:vm sandbox (same pattern as week2/test.mjs), then evaluates missing-
// value strategies, a matrix-factorization reference and cold start in
// plain node code on top of the same matrix convention.
// Iteration 2: the app strategy is the WEIGHTED variant (marked in the
// table); iteration-1 Top-5 behaviour is reproduced with inline co-rated-
// only re-implementations for before/after comparison.
// ---------------------------------------------------------------------------

// Small seeded PRNG (mulberry32) so every split/sample is reproducible.
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// --- Sandbox: real parsers + CORE functions ---------------------------------
const context = vm.createContext({ console });
vm.runInContext(read('data.js'), context);
const core = (expr) => vm.runInContext(expr, context);
const scriptSource = read('script.js');
const coreMatch = scriptSource.match(/\/\/ CORE:START[\s\S]*\/\/ CORE:END/);
if (!coreMatch) throw new Error('script.js must contain a // CORE:START ... // CORE:END block');
vm.runInContext(coreMatch[0], context);

core('parseItemData')(read('u.item'));
core('parseRatingData')(read('u.data'));
core('numUsers = ratings.reduce((max, r) => Math.max(max, r.userId), 0)');
core('numMovies = movies.length');
core('buildRatingMatrix()');

const NUM_USERS = core('numUsers');
const NUM_MOVIES = core('numMovies');
const allRatings = core('ratings').map(r => ({ userId: r.userId, itemId: r.itemId, rating: r.rating }));

console.log(`data: ${allRatings.length} ratings, ${NUM_USERS} users, ${NUM_MOVIES} movies`);

// ---------------------------------------------------------------------------
// 1. Fixed-seed 10% holdout
// ---------------------------------------------------------------------------
const rand = mulberry32(42);
const indices = allRatings.map((_, i) => i);
for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
}
const heldOut = indices.slice(0, 10000).map(i => allRatings[i]);   // 10% held out
const trainRatings = indices.slice(10000).map(i => allRatings[i]); // 90% train
const evalPairs = heldOut.slice(0, 2000); // fixed-seed sample of 2000 test pairs

// Train-side statistics ------------------------------------------------------
const trainMatrix = Array.from({ length: NUM_USERS + 1 }, () => new Float64Array(NUM_MOVIES + 1));
for (const { userId, itemId, rating } of trainRatings) trainMatrix[userId][itemId] = rating;

const userMap = new Array(NUM_USERS + 1);   // Map movieId -> rating
const userList = new Array(NUM_USERS + 1);  // [{ movieId, rating }]
const userMean = new Array(NUM_USERS + 1);
const userCenteredNorm2 = new Array(NUM_USERS + 1); // sum (r - mean)^2 over the user's ratings
let globalSum = 0;
for (let u = 1; u <= NUM_USERS; u++) {
    const map = new Map(), list = [];
    let sum = 0, sumSq = 0;
    const row = trainMatrix[u];
    for (let m = 1; m <= NUM_MOVIES; m++) {
        const r = row[m];
        if (r === 0) continue;
        map.set(m, r);
        list.push({ movieId: m, rating: r });
        sum += r; sumSq += r * r;
    }
    const n = list.length;
    const mean = n ? sum / n : 0;
    userMap[u] = map; userList[u] = list; userMean[u] = mean;
    userCenteredNorm2[u] = n ? sumSq - n * mean * mean : 0;
    globalSum += sum;
}
const globalMean = globalSum / trainRatings.length;

const movieRaters = new Array(NUM_MOVIES + 1); // [{ userId, rating }]
const movieRaterMap = new Array(NUM_MOVIES + 1); // Map userId -> rating
const movieMean = new Array(NUM_MOVIES + 1);
const movieCenteredNorm2 = new Array(NUM_MOVIES + 1);
for (let m = 1; m <= NUM_MOVIES; m++) movieRaters[m] = [];
for (let u = 1; u <= NUM_USERS; u++) {
    for (const { movieId, rating } of userList[u]) {
        movieRaters[movieId].push({ userId: u, rating });
    }
}
for (let m = 1; m <= NUM_MOVIES; m++) {
    const raters = movieRaters[m];
    let sum = 0, sumSq = 0;
    for (const { rating } of raters) { sum += rating; sumSq += rating * rating; }
    const n = raters.length;
    const mean = n ? sum / n : 0;
    movieMean[m] = mean;
    movieCenteredNorm2[m] = n ? sumSq - n * mean * mean : 0;
    movieRaterMap[m] = new Map(raters.map(e => [e.userId, e.rating]));
}

// ---------------------------------------------------------------------------
// 2. Similarity variants (missing-value strategies)
//    (a) co-rated only              — what the app uses
//    (b) mean imputation            — fill missing with the vector's mean.
//        Algebraically identical to comparing mean-centered ratings with
//        norms over all rated entries: a missing entry filled with the
//        vector's own mean contributes 0 after centering, so the dot product
//        runs over co-rated entries only, while the norms include every
//        rated entry (precomputed *CenteredNorm2 above).
//    (c) co-rated cosine weighted by min(n, 50)/50, n = co-rated count
// ---------------------------------------------------------------------------
function userSimilarity(variant, u, v) {
    const mapV = userMap[v];
    let dot = 0, normU = 0, normV = 0, coRated = 0;
    for (const [m, r] of userMap[u]) {
        const s = mapV.get(m);
        if (s === undefined) continue;
        coRated++;
        dot += r * s; normU += r * r; normV += s * s;
    }
    if (coRated === 0) return 0;
    let sim = dot / Math.sqrt(normU * normV);
    if (variant === 'imputed') {
        sim = 0;
        let dotC = 0;
        const mu = userMean[u], mv = userMean[v];
        for (const [m, r] of userMap[u]) {
            const s = mapV.get(m);
            if (s === undefined) continue;
            dotC += (r - mu) * (s - mv);
        }
        sim = dotC / Math.sqrt(userCenteredNorm2[u] * userCenteredNorm2[v]);
    } else if (variant === 'weighted') {
        sim *= Math.min(coRated, 50) / 50;
    }
    return sim > 0 ? sim : 0;
}

function itemSimilarity(variant, i, j) {
    const mapJ = movieRaterMap[j];
    let dot = 0, normI = 0, normJ = 0, coRated = 0;
    for (const { userId, rating } of movieRaters[i]) {
        const s = mapJ.get(userId);
        if (s === undefined) continue;
        coRated++;
        dot += rating * s; normI += rating * rating; normJ += s * s;
    }
    if (coRated === 0) return 0;
    let sim = dot / Math.sqrt(normI * normJ);
    if (variant === 'imputed') {
        let dotC = 0;
        const mi = movieMean[i], mj = movieMean[j];
        for (const { userId, rating } of movieRaters[i]) {
            const s = mapJ.get(userId);
            if (s === undefined) continue;
            dotC += (rating - mi) * (s - mj);
        }
        sim = dotC / Math.sqrt(movieCenteredNorm2[i] * movieCenteredNorm2[j]);
    } else if (variant === 'weighted') {
        sim *= Math.min(coRated, 50) / 50;
    }
    return sim > 0 ? sim : 0;
}

// ---------------------------------------------------------------------------
// 3. Evaluation: RMSE / MAE over all 2000 pairs; when a CF method cannot
//    predict a pair it falls back to the user mean, and coverage records the
//    share of pairs the CF method itself predicted.
//    (The app's MIN_SUPPORT = 5 distinct-user filter gates UI Top-5
//    candidates and panel predictions only; here every pair with at least
//    one contributor counts as covered.)
// ---------------------------------------------------------------------------
function evaluate(predict) {
    let sq = 0, abs = 0, covered = 0;
    const t0 = performance.now();
    for (const { userId, itemId, rating } of evalPairs) {
        const p = predict(userId, itemId);
        if (p === null) {
            sq += (rating - userMean[userId]) ** 2;
            abs += Math.abs(rating - userMean[userId]);
            continue;
        }
        covered++;
        sq += (rating - p) ** 2;
        abs += Math.abs(rating - p);
    }
    const ms = performance.now() - t0;
    return { rmse: Math.sqrt(sq / evalPairs.length), mae: abs / evalPairs.length, coverage: covered / evalPairs.length, ms };
}

function evaluateUserCF(variant) {
    const cache = new Map();
    return evaluate((u, j) => {
        let neighbours = cache.get(u);
        if (!neighbours) {
            neighbours = [];
            for (let v = 1; v <= NUM_USERS; v++) {
                if (v === u) continue;
                const sim = userSimilarity(variant, u, v);
                if (sim > 0) neighbours.push({ v, sim });
            }
            neighbours.sort((a, b) => b.sim - a.sim || a.v - b.v);
            neighbours = neighbours.slice(0, 20);
            cache.set(u, neighbours);
        }
        let num = 0, den = 0;
        for (const { v, sim } of neighbours) {
            const r = trainMatrix[v][j];
            if (r === 0) continue;
            num += sim * r; den += sim;
        }
        return den === 0 ? null : num / den;
    });
}

function evaluateItemCF(variant) {
    return evaluate((u, j) => {
        let num = 0, den = 0;
        for (const { movieId: i, rating } of userList[u]) {
            if (i === j) continue;
            const sim = itemSimilarity(variant, i, j);
            if (sim <= 0) continue;
            num += sim * rating; den += sim;
        }
        return den === 0 ? null : num / den;
    });
}

// Matrix factorization with biases (SGD), fixed seed -------------------------
function evaluateMF() {
    const k = 20, epochs = 20, lr = 0.01, reg = 0.05, seed = 42;
    const init = mulberry32(seed);
    const P = Array.from({ length: NUM_USERS + 1 }, () => Float64Array.from({ length: k }, () => (init() - 0.5) * 0.1));
    const Q = Array.from({ length: NUM_MOVIES + 1 }, () => Float64Array.from({ length: k }, () => (init() - 0.5) * 0.1));
    const bu = new Float64Array(NUM_USERS + 1);
    const bi = new Float64Array(NUM_MOVIES + 1);

    const t0 = performance.now();
    for (let e = 0; e < epochs; e++) {
        for (const { userId, itemId, rating } of trainRatings) {
            const p = P[userId], q = Q[itemId];
            let dot = 0;
            for (let f = 0; f < k; f++) dot += p[f] * q[f];
            const err = rating - (globalMean + bu[userId] + bi[itemId] + dot);
            bu[userId] += lr * (err - reg * bu[userId]);
            bi[itemId] += lr * (err - reg * bi[itemId]);
            for (let f = 0; f < k; f++) {
                const pf = p[f], qf = q[f];
                p[f] += lr * (err * qf - reg * pf);
                q[f] += lr * (err * pf - reg * qf);
            }
        }
    }
    const trainMs = performance.now() - t0;
    const result = evaluate((u, j) => {
        let dot = 0;
        const p = P[u], q = Q[j];
        for (let f = 0; f < k; f++) dot += p[f] * q[f];
        return globalMean + bu[u] + bi[j] + dot;
    });
    result.trainMs = trainMs;
    return result;
}

// --- Baselines ---------------------------------------------------------------
const evalGlobal = evaluate(() => globalMean);
const evalUserMean = evaluate((u) => userMean[u] || globalMean);

// --- CF variants -------------------------------------------------------------
const rows = [];
const pushRow = (label, r, isApp = false) => { r.app = isApp; rows.push([label, r]); };
pushRow('global-mean baseline', evalGlobal);
pushRow('user-mean baseline', evalUserMean);
for (const [label, variant] of [['co-rated only', 'corated'], ['mean imputation', 'imputed'], ['weighted min(n,50)/50', 'weighted']]) {
    pushRow(`user-based CF (${label})`, evaluateUserCF(variant), variant === 'weighted');
}
for (const [label, variant] of [['co-rated only', 'corated'], ['mean imputation', 'imputed'], ['weighted min(n,50)/50', 'weighted']]) {
    pushRow(`item-based CF (${label})`, evaluateItemCF(variant), variant === 'weighted');
}
const mf = evaluateMF();
pushRow('matrix factorization (bias SGD)', mf);

console.log('\n=== RMSE / MAE on 2000 held-out pairs (10% holdout, seed 42) ===');
console.log('CF fallback: user train mean; coverage = share predicted by the method itself');
console.log('method'.padEnd(48), 'RMSE'.padStart(7), 'MAE'.padStart(7), 'coverage'.padStart(9), 'time'.padStart(10));
for (const [label, r] of rows) {
    console.log((label + (r.app ? '  <== app' : '')).padEnd(48),
        r.rmse.toFixed(4).padStart(7),
        r.mae.toFixed(4).padStart(7),
        (100 * r.coverage).toFixed(1).padStart(8) + '%',
        (r.ms.toFixed(0) + ' ms').padStart(10));
}
console.log('app configuration (script.js): weighted variant for both methods; the UI additionally gates each candidate at MIN_SUPPORT = 5 distinct users.');
console.log('MF hyperparameters: k=20, epochs=20, lr=0.01, reg=0.05, seed=42, init U(-0.05, 0.05), biases on global mean; ' +
    `training wall-clock ${mf.trainMs.toFixed(0)} ms, table time = predicting the 2000 pairs`);

// ---------------------------------------------------------------------------
// 4. Neighbour evidence for user 1 — what the weighted strategy fixes
// ---------------------------------------------------------------------------
const density = allRatings.length / (NUM_USERS * NUM_MOVIES);
console.log(`\nsparsity: ${(100 * (1 - density)).toFixed(2)}% of the 943 x 1682 matrix is unrated ` +
    `(${allRatings.length} ratings / ${NUM_USERS * NUM_MOVIES} cells)`);

const fullMatrix = core('ratingMatrix');
const fullRaters = new Array(NUM_MOVIES + 1).fill(0); // raters of each movie in the FULL dataset
for (let u = 1; u <= NUM_USERS; u++) {
    const row = fullMatrix[u];
    for (let m = 1; m <= NUM_MOVIES; m++) if (row[m] !== 0) fullRaters[m]++;
}

// Every neighbour candidate of user 1 under CO-RATED-ONLY cosine (the
// iteration-1 selection rule), with the co-rated count n for each.
const coratedNeighbours = (() => {
    const sims = [];
    const activeRow = fullMatrix[1];
    for (let v = 1; v <= NUM_USERS; v++) {
        if (v === 1) continue;
        let dot = 0, nu = 0, nv = 0, n = 0;
        const row = fullMatrix[v];
        for (let m = 1; m <= NUM_MOVIES; m++) {
            const a = activeRow[m], b = row[m];
            if (a === 0 || b === 0) continue;
            n++; dot += a * b; nu += a * a; nv += b * b;
        }
        if (dot === 0 || nu === 0 || nv === 0) continue;
        sims.push({ userId: v, sim: dot / Math.sqrt(nu * nv), n });
    }
    sims.sort((a, b) => b.sim - a.sim || a.userId - b.userId);
    return sims;
})();

const stats = (arr) => {
    const s = [...arr].sort((a, b) => a - b);
    const mid = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
    return { min: s[0], median: mid, max: s[s.length - 1] };
};
const fmt = (st) => `min ${st.min}, median ${st.median}, max ${st.max}`;
const coratedTop20 = coratedNeighbours.slice(0, 20).map(e => e.n);
const exact1Count = coratedNeighbours.filter(e => e.sim === 1).length;
const weightedTop20 = core('computeUserNeighbours')(1).map(nb => {
    let c = 0;
    const row = fullMatrix[nb.userId];
    for (let m = 1; m <= NUM_MOVIES; m++) if (fullMatrix[1][m] !== 0 && row[m] !== 0) c++;
    return c;
});
console.log(`\nneighbour evidence for user 1 (co-rated counts of the top-20 neighbours):`);
console.log(`  co-rated-only (iteration 1): ${fmt(stats(coratedTop20))}`);
console.log(`  ${exact1Count} of ${coratedNeighbours.length} users sit at similarity EXACTLY 1.0 under co-rated-only cosine ` +
    `(any single shared movie forces cosine = 1)`);
console.log(`  weighted, app (iteration 2): ${fmt(stats(weightedTop20))}`);

// ---------------------------------------------------------------------------
// 5. Top-5 for user 1 and user 100, with raters-per-recommended-movie
//    Iteration-1 settings (co-rated-only cosine, old support = count of the
//    active user's rated movies with positive similarity, MIN_SUPPORT 3) are
//    re-implemented inline because script.js moved on.
// ---------------------------------------------------------------------------
const moviesById = {};
for (const movie of core('movies')) moviesById[movie.id] = movie;
const fullMovieRaters = new Array(NUM_MOVIES + 1);
for (let m = 1; m <= NUM_MOVIES; m++) fullMovieRaters[m] = [];
for (let u = 1; u <= NUM_USERS; u++) {
    const row = fullMatrix[u];
    for (let m = 1; m <= NUM_MOVIES; m++) {
        if (row[m] !== 0) fullMovieRaters[m].push({ userId: u, rating: row[m] });
    }
}

function iter1UserTop5(activeUser, topK = 5, minSupport = 3) {
    const neighbours = coratedNeighbours.filter(e => e.sim > 0).slice(0, 20);
    const out = [];
    for (let m = 1; m <= NUM_MOVIES; m++) {
        if (fullMatrix[activeUser][m] !== 0 || !moviesById[m]) continue;
        let num = 0, den = 0, support = 0;
        for (const nb of neighbours) {
            const r = fullMatrix[nb.userId][m];
            if (r === 0) continue;
            num += nb.sim * r; den += nb.sim; support++;
        }
        if (support < minSupport || den === 0) continue;
        out.push({ movieId: m, title: moviesById[m].title, score: num / den, support });
    }
    out.sort((a, b) => b.score - a.score || a.movieId - b.movieId);
    return out.slice(0, topK);
}

function iter1ItemTop5(activeUser, topK = 5, minSupport = 3) {
    const activeRow = fullMatrix[activeUser];
    const rated = [];
    for (let m = 1; m <= NUM_MOVIES; m++) {
        if (activeRow[m] !== 0) rated.push({ movieId: m, rating: activeRow[m] });
    }
    const out = [];
    for (let m = 1; m <= NUM_MOVIES; m++) {
        if (activeRow[m] !== 0 || !moviesById[m]) continue;
        const candRatings = new Map(fullMovieRaters[m].map(e => [e.userId, e.rating]));
        let num = 0, den = 0, support = 0;
        for (const { movieId, rating } of rated) {
            if (movieId === m) continue;
            let dot = 0, nI = 0, nJ = 0;
            for (const rater of fullMovieRaters[movieId]) {
                const other = candRatings.get(rater.userId);
                if (other === undefined) continue;
                dot += rater.rating * other; nI += rater.rating * rater.rating; nJ += other * other;
            }
            if (dot === 0) continue;
            const sim = dot / Math.sqrt(nI * nJ);
            num += sim * rating; den += sim; support++;
        }
        if (support < minSupport || den === 0) continue;
        out.push({ movieId: m, title: moviesById[m].title, score: num / den, support });
    }
    out.sort((a, b) => b.score - a.score || a.movieId - b.movieId);
    return out.slice(0, topK);
}

const showTop5 = (label, top5) => {
    console.log(`\n${label}`);
    for (const rec of top5) {
        console.log(`  ${String(rec.movieId).padStart(4)}  ${rec.title}  score=${rec.score.toFixed(3)}  ` +
            `support=${rec.support}  raters(in dataset)=${fullRaters[rec.movieId]}`);
    }
};

showTop5('Top-5 user-based CF for user 1 — ITERATION-1 settings (co-rated-only, entry-count support, MIN_SUPPORT 3):', iter1UserTop5(1));
showTop5('Top-5 item-based CF for user 1 — ITERATION-1 settings (co-rated-only, entry-count support, MIN_SUPPORT 3):', iter1ItemTop5(1));
showTop5('Top-5 user-based CF for user 1 — NEW app settings (weighted min(n,50)/50, MIN_SUPPORT = 5 distinct users):', core('getUserBasedRecommendations')(1));
showTop5('Top-5 item-based CF for user 1 — NEW app settings (weighted min(n,50)/50, MIN_SUPPORT = 5 distinct users):', core('getItemBasedRecommendations')(1));
showTop5('Top-5 user-based CF for user 100 — NEW app settings:', core('getUserBasedRecommendations')(100));
showTop5('Top-5 item-based CF for user 100 — NEW app settings:', core('getItemBasedRecommendations')(100));

// Per-user timing through the app's CORE functions on the FULL matrix.
// First item-based call includes the one-time sparse index build.
let t0 = performance.now();
core('getUserBasedRecommendations')(1);
const tUserCold = performance.now() - t0;
t0 = performance.now();
core('getUserBasedRecommendations')(1);
const tUserWarm = performance.now() - t0;
t0 = performance.now();
core('getItemBasedRecommendations')(1);
const tItemCold = performance.now() - t0;
t0 = performance.now();
core('getItemBasedRecommendations')(1);
const tItemWarm = performance.now() - t0;
console.log(`\nper-user wall-clock time (user 1, full matrix, app CORE functions, iteration-2 settings):`);
console.log(`  user-based: first call ${tUserCold.toFixed(1)} ms, repeat ${tUserWarm.toFixed(1)} ms`);
console.log(`  item-based: first call ${tItemCold.toFixed(1)} ms (includes one-time sparse index build), repeat ${tItemWarm.toFixed(1)} ms`);

// ---------------------------------------------------------------------------
// 6. Co-rated counts between random user pairs
// ---------------------------------------------------------------------------
const pairRand = mulberry32(42);
const coRatedCounts = [];
while (coRatedCounts.length < 10000) {
    const u = 1 + Math.floor(pairRand() * NUM_USERS);
    const v = 1 + Math.floor(pairRand() * NUM_USERS);
    if (u === v) continue;
    let c = 0;
    for (const m of userMap[u].keys()) if (userMap[v].has(m)) c++;
    coRatedCounts.push(c);
}
coRatedCounts.sort((a, b) => a - b);
const median = (coRatedCounts[4999] + coRatedCounts[5000]) / 2;
const shareBelow5 = coRatedCounts.filter(c => c < 5).length / coRatedCounts.length;
console.log(`\nco-rated counts over 10000 random user pairs: median = ${median}, ` +
    `share with fewer than 5 co-rated items = ${(100 * shareBelow5).toFixed(1)}%`);

// ---------------------------------------------------------------------------
// 6. Cold-start demonstration (through the app CORE, on matrix copies)
// ---------------------------------------------------------------------------
console.log('\ncold start:');

// a user with zero ratings has no positive-similarity neighbours
core('var __fullMatrix = ratingMatrix');
core(`(function () {
    const m = ratingMatrix.map(r => Array.from(r));
    m.push(new Array(numMovies + 1).fill(0));   // user 944: no ratings at all
    ratingMatrix = m; numUsers = 944;
})()`);
const coldNeighbours = core('computeUserNeighbours')(944);
const coldRecs = core('getUserBasedRecommendations')(944);
const coldItemPred = core('predictItemBased')(944, 50);
console.log(`  new user 944 with zero ratings: neighbours=${coldNeighbours.length}, ` +
    `user-based Top-5 length=${coldRecs.length}, item-based prediction for movie 50=${coldItemPred}`);
core('ratingMatrix = __fullMatrix; numUsers = 943');

// a movie with zero ratings has no positive item similarity
core(`(function () {
    const m = ratingMatrix.map(r => Array.from(r));
    for (let u = 0; u <= numUsers; u++) m[u][50] = 0;  // wipe movie 50 (Star Wars)
    ratingMatrix = m;
})()`);
const coldMoviePred = core('predictItemBased')(1, 50);
const coldMovieInTop5 = core('getItemBasedRecommendations')(1).some(r => r.movieId === 50);
console.log(`  movie 50 with zero ratings: item-based prediction=${coldMoviePred}, appears in Top-5=${coldMovieInTop5}`);
core('ratingMatrix = __fullMatrix');

console.log('\n(done — nothing was written to disk)');
