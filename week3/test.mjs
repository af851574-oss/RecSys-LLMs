import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

// Run the real, unmodified data.js in a sandbox so the test exercises the
// exact parsing logic the browser uses (parseItemData / parseRatingData /
// buildRatingMatrix).
const context = vm.createContext({ console });
vm.runInContext(read('data.js'), context);
const core = (expression) => vm.runInContext(expression, context);

// Extract the CORE block from script.js (the pure CF functions) and run it in
// the same sandbox, so it sees the same ratingMatrix/movies globals.
const scriptSource = read('script.js');
const coreMatch = scriptSource.match(/\/\/ CORE:START[\s\S]*\/\/ CORE:END/);
assert.ok(coreMatch, 'script.js must contain a // CORE:START ... // CORE:END block');
vm.runInContext(coreMatch[0], context);

// --- 1. Real parsing logic on the real data files ---------------------------
core('parseItemData')(read('u.item'));
core('parseRatingData')(read('u.data'));

const movies = core('movies');
const ratings = core('ratings');
assert.equal(movies.length, 1682, 'u.item must parse to 1682 movies');
assert.equal(ratings.length, 100000, 'u.data must parse to 100000 ratings');

// Mirror what loadData() does before buildRatingMatrix()
core('numUsers = ratings.reduce((max, r) => Math.max(max, r.userId), 0)');
core('numMovies = movies.length');
core('buildRatingMatrix()');

assert.equal(core('numUsers'), 943, 'numUsers must be 943');
assert.equal(core('numMovies'), 1682, 'numMovies must be 1682');

const ratingMatrix = core('ratingMatrix');
assert.equal(ratingMatrix.length, 944, 'ratingMatrix must have 944 rows (index 0 unused)');
assert.ok(ratingMatrix.every(row => row.length === 1683),
    'every ratingMatrix row must have 1683 columns (index 0 unused)');
const nonZero = core(
    'ratingMatrix.reduce((acc, row) => acc + row.reduce((a, v) => a + (v !== 0 ? 1 : 0), 0), 0)');
assert.equal(nonZero, 100000, 'ratingMatrix must hold exactly 100000 non-zero entries');

// --- 2. Cosine sanity: identity ~1, no co-rated items ~0 --------------------
const cosineSimilarity = core('cosineSimilarity');
assert.ok(Math.abs(cosineSimilarity([3, 0, 4], [3, 0, 4]) - 1) < 1e-12,
    'cosine(v, v) must be 1');
assert.ok(Math.abs(cosineSimilarity([5, 0, 0], [0, 0, 2])) < 1e-12,
    'cosine of vectors with no co-rated items must be 0');
assert.equal(cosineSimilarity([0, 0, 0], [1, 5, 2]), 0,
    'cosine against a zero vector must hit the zero-denominator guard (0)');

// --- 3. Hand-computed cosine between two REAL users of u.data ----------------
// Users 1 and 166 share EXACTLY two co-rated movies in u.data:
//   movie 258: user 1 rated 5, user 166 rated 4
//   movie 243: user 1 rated 1, user 166 rated 3
// co-rated cosine = (5*4 + 1*3) / (sqrt(5^2+1^2) * sqrt(4^2+3^2))
//                 = 23 / (sqrt(26) * 5) = 23 / 25.495098 = 0.902134
const coRated = [];
for (let m = 1; m <= 1682; m++) {
    if (ratingMatrix[1][m] !== 0 && ratingMatrix[166][m] !== 0) {
        coRated.push([m, ratingMatrix[1][m], ratingMatrix[166][m]]);
    }
}
assert.deepEqual(coRated, [[243, 1, 3], [258, 5, 4]],
    'users 1 and 166 must share exactly movies 258 and 243 with these ratings');
const realSim = cosineSimilarity(ratingMatrix[1], ratingMatrix[166]);
assert.ok(Math.abs(realSim - 0.902134) < 1e-6,
    `cosine(user 1, user 166) must be 0.902134, got ${realSim.toFixed(6)}`);

// The app strategy discounts raw cosine by min(n, 50)/50 with n = 2 co-rated
// movies: weighted = 0.902134 * 2 / 50 = 0.902134 * 0.04 = 0.036085 (6 dec.)
const weightedSimilarity = core('weightedSimilarity');
const weightedPair = weightedSimilarity(ratingMatrix[1], ratingMatrix[166]);
assert.ok(Math.abs(weightedPair - 0.036085) < 1e-6,
    `weightedSimilarity(user 1, user 166) must be 0.902134*2/50 = 0.036085, got ${weightedPair.toFixed(6)}`);

// --- 4. Hand-computed user-based prediction on a tiny synthetic matrix ------
// ratingMatrix (rows = users, columns = movies, index 0 unused):
//   user 1: [ -, 5, 3, - ]   (active user, movie 3 unrated)
//   user 2: [ -, 5, 4, 4 ]
//   user 3: [ -, 4, 3, 1 ]
// Raw co-rated cosine (n = 2 co-rated movies for both pairs):
// sim(1,2) = (5*5 + 3*4) / (sqrt(25+9) * sqrt(25+16)) = 37 / (sqrt(34)*sqrt(41)) = 0.990992
// sim(1,3) = (5*4 + 3*3) / (sqrt(25+9) * sqrt(16+9))  = 29 / (sqrt(34)*5)      = 0.994692
// Weighted (the app strategy): both pairs shrink by min(2,50)/50 = 2/50 = 0.04,
// sim12w = 0.990992*0.04 = 0.039640, sim13w = 0.994692*0.04 = 0.039788.
// predict(user 1, movie 3) = (sim12w*4 + sim13w*1) / (sim12w + sim13w)
//   the common factor 0.04 cancels in the weighted average, so exactly
//   (0.990992*4 + 0.994692*1) / (0.990992 + 0.994692) = 4.958660 / 1.985684 = 2.497205
core('ratingMatrix = [[0, 0, 0, 0], [0, 5, 3, 0], [0, 5, 4, 4], [0, 4, 3, 1]]');
core('numUsers = 3');
core('numMovies = 3');
const predictUserBased = core('predictUserBased');
const tinyPrediction = predictUserBased(1, 3, 1); // minSupport=1: only 2 neighbours exist
assert.ok(tinyPrediction, 'tiny matrix prediction must succeed with minSupport=1');
assert.ok(Math.abs(tinyPrediction.score - 2.497205) < 1e-6,
    `user-based prediction on tiny matrix must be 2.497205 (the 0.04 shrink cancels in the average), got ${tinyPrediction.score}`);
assert.equal(tinyPrediction.support, 2,
    'tiny matrix support must be 2 distinct neighbours who rated movie 3');
assert.equal(predictUserBased(1, 3, 3), null,
    'the same candidate must be rejected when minSupport=3 exceeds the support of 2');

// --- 5. Real Top-5 lists for user 1 (restore the real matrix first) ---------
core('numUsers = 943');
core('numMovies = 1682');
core('buildRatingMatrix()');

const MIN_SUPPORT = core('MIN_SUPPORT');
assert.equal(MIN_SUPPORT, 5, 'MIN_SUPPORT must be 5');
assert.equal(core('NUM_NEIGHBOURS'), 20, 'NUM_NEIGHBOURS must be 20');
assert.equal(core('SIGNIFICANCE_SHRINK'), 50, 'SIGNIFICANCE_SHRINK must be 50');

const checkTop5 = (label, top5, ratedSet) => {
    assert.equal(top5.length, 5, `${label}: Top-5 must return exactly 5 items`);
    for (const rec of top5) {
        assert.ok(!ratedSet.has(rec.movieId), `${label}: must not recommend already-rated movie ${rec.movieId}`);
        assert.ok(rec.score >= 1 && rec.score <= 5, `${label}: score ${rec.score} must be in [1, 5]`);
        assert.ok(rec.support >= MIN_SUPPORT,
            `${label}: candidate ${rec.movieId} must meet MIN_SUPPORT, got support ${rec.support}`);
    }
    for (let i = 1; i < top5.length; i++) {
        assert.ok(top5[i - 1].score >= top5[i].score, `${label}: must be sorted by score descending`);
    }
};

const user1Rated = new Set(core('getUserRatings')(1).map(e => e.movieId));
const userTop5 = core('getUserBasedRecommendations')(1);
const itemTop5 = core('getItemBasedRecommendations')(1);
checkTop5('user-based', userTop5, user1Rated);
checkTop5('item-based', itemTop5, user1Rated);

// Sparse item similarity must equal the dense-column similarities (raw AND
// weighted) for the movie pair (1, 50), and the aggregate must run on it
const itemSimilarityCheck = core(`
    (function () {
        const col = (m) => ratingMatrix.map(row => row[m]);
        return {
            sparse: itemBasedAggregate(50, getUserRatings(1), getMovieRaters(), 1) !== null,
            denseSim: cosineSimilarity(col(1), col(50)),
            denseWeighted: weightedSimilarity(col(1), col(50))
        };
    })()
`);
// recompute the same sims the sparse way for movie pair (1, 50)
const sparseSims = core(`
    (function () {
        const raters = getMovieRaters();
        const mapJ = new Map(raters[50].map(e => [e.userId, e.rating]));
        let dot = 0, nI = 0, nJ = 0, n = 0;
        for (const e of raters[1]) {
            const other = mapJ.get(e.userId);
            if (other === undefined) continue;
            n++;
            dot += e.rating * other; nI += e.rating * e.rating; nJ += other * other;
        }
        if (dot === 0) return { raw: 0, weighted: 0 };
        const raw = dot / Math.sqrt(nI * nJ);
        return { raw, weighted: raw * Math.min(n, SIGNIFICANCE_SHRINK) / SIGNIFICANCE_SHRINK };
    })()
`);
assert.ok(Math.abs(sparseSims.raw - itemSimilarityCheck.denseSim) < 1e-12,
    'sparse item cosine must equal the dense-column cosine');
assert.ok(Math.abs(sparseSims.weighted - itemSimilarityCheck.denseWeighted) < 1e-12,
    'sparse weighted item similarity must equal the dense-column weightedSimilarity');

// User 1's top-20 neighbours under the app (weighted) strategy must all rest
// on substantial overlap. Observed co-rated counts: min 52, median 80.5,
// max 155 (iteration 1, co-rated-only: 7 of 20 shared only ONE movie).
const neighbourEvidence = core(`
    (function () {
        return computeUserNeighbours(1).map(nb => {
            let c = 0;
            for (let m = 1; m <= numMovies; m++) {
                if (ratingMatrix[1][m] !== 0 && ratingMatrix[nb.userId][m] !== 0) c++;
            }
            return c;
        });
    })()
`);
assert.equal(neighbourEvidence.length, 20, 'must have 20 neighbours');
assert.ok(Math.min(...neighbourEvidence) >= 52,
    `every top-20 neighbour of user 1 must share at least 52 co-rated movies ` +
    `(observed minimum), got min ${Math.min(...neighbourEvidence)}`);

// Leave-one-out for the pair: predicting an already-rated movie must be
// computed as if that rating did not exist. User 1 rated movie 50 (Star
// Wars) 5; the app predictions (which mask the rating) must be identical to
// predictions computed from a matrix with the entry removed.
assert.notEqual(ratingMatrix[1][50], 0, 'precondition: user 1 has rated movie 50');
const loo = core(`
    (function () {
        const userPred = predictUserBased(1, 50);
        const itemPred = predictItemBased(1, 50);
        const saved = ratingMatrix;
        ratingMatrix = ratingMatrix.map(row => Array.from(row));
        ratingMatrix[1][50] = 0;   // leave the active rating out
        const userPredLOO = predictUserBased(1, 50);
        const itemPredLOO = predictItemBased(1, 50);
        ratingMatrix = saved;
        return { userPred, itemPred, userPredLOO, itemPredLOO };
    })()
`);
assert.ok(loo.userPred && loo.itemPred, 'both methods must predict a popular movie for user 1');
assert.equal(loo.userPred.score, loo.userPredLOO.score,
    'user-based prediction must not use the active rating of the predicted movie');
assert.equal(loo.userPred.support, loo.userPredLOO.support,
    'user-based support must be identical with and without the active rating');
assert.equal(loo.itemPred.score, loo.itemPredLOO.score,
    'item-based prediction must not use the active rating of the predicted movie');
assert.equal(loo.itemPred.support, loo.itemPredLOO.support,
    'item-based support must be identical with and without the active rating');

// --- 6. TODO placeholders and unchosen checkboxes are gone -------------------
assert.doesNotMatch(scriptSource, /TODO \(HW3\)/, 'script.js TODOs must be gone');
assert.doesNotMatch(scriptSource, /your implementation here/, 'script.js stubs must be gone');
assert.doesNotMatch(scriptSource, /\[ \]/, 'the two unchosen strategy checkboxes must be deleted');
assert.match(scriptSource, /WEIGHTED: co-rated cosine discounted/, 'the chosen strategy must be stated');
assert.match(scriptSource, /SIGNIFICANCE_SHRINK = 50/, 'the shrink constant must be stated');
const dataSource = read('data.js');
assert.doesNotMatch(dataSource, /TODO \(HW3\)/, 'data.js TODOs must be gone');
assert.doesNotMatch(dataSource, /your implementation here/, 'data.js stubs must be gone');

// --- Report the concrete numbers required by the assignment -----------------
const showTop5 = (label, top5) => {
    console.log(`\nTop-5 ${label}:`);
    for (const rec of top5) {
        console.log(`  ${String(rec.movieId).padStart(4)}  ${rec.title}  score=${rec.score.toFixed(3)}  support=${rec.support}`);
    }
};

showTop5('User-Based CF for user 1', userTop5);
showTop5('Item-Based CF for user 1', itemTop5);

console.log(`\nPASS: matrix 944x1683 with 100000 non-zero entries, numUsers=943, numMovies=1682, ` +
    `cosine identities hold, cosine(user1,user166)=0.902134, weighted=0.036085 (=0.902134*2/50), ` +
    `tiny-matrix prediction=2.497205 (0.04 shrink cancels), both Top-5 lists valid ` +
    `(support >= ${MIN_SUPPORT} distinct users), top-20 neighbours share >= 52 movies, ` +
    `leave-one-out holds, TODOs gone`);
