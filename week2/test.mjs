import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

// Run the real, unmodified data.js in a sandbox so the test exercises the
// exact parsing logic the browser uses (parseItemData / parseRatingData).
const context = vm.createContext({ console });
vm.runInContext(read('data.js'), context);
const core = (expression) => vm.runInContext(expression, context);

// Extract the CORE block from script.js (the pure math/data functions) and
// run it in the same sandbox, so it sees the same genreNames/movies globals.
const scriptSource = read('script.js');
const coreMatch = scriptSource.match(/\/\/ CORE:START[\s\S]*\/\/ CORE:END/);
assert.ok(coreMatch, 'script.js must contain a // CORE:START ... // CORE:END block');
vm.runInContext(coreMatch[0], context);

const buildGenreVector = core('buildGenreVector');
const cosineSimilarity = core('cosineSimilarity');
const buildProfileVector = core('buildProfileVector');
const recommendTopK = core('recommendTopK');

// --- 1. Real parsing logic on the real data files -------------------------
core('parseItemData')(read('u.item'));
core('parseRatingData')(read('u.data'));

const movies = core('movies');
const ratings = core('ratings');
assert.equal(movies.length, 1682, 'u.item must parse to 1682 movies');
assert.equal(ratings.length, 100000, 'u.data must parse to 100000 ratings');

const byId = (id) => {
    const movie = movies.find(m => m.id === id);
    assert.ok(movie, `movie id ${id} must exist`);
    return movie;
};

// --- 2. Cosine sanity: identity ~1, disjoint ~0 -----------------------------
const starWars = byId(50);
const toyStory = byId(1);

const starWarsVector = buildGenreVector(starWars.genres);
assert.equal(starWarsVector.length, 18, 'genre vectors must have 18 dimensions');
assert.ok(Math.abs(cosineSimilarity(starWarsVector, starWarsVector) - 1) < 1e-9,
    'cosine(v, v) must be approximately 1');

// Toy Story (Animation/Children's/Comedy) and GoodFellas (Crime/Drama)
// share no genre flags in u.item, so their cosine must be 0.
const goodFellas = byId(182);
const disjoint = cosineSimilarity(buildGenreVector(toyStory.genres), buildGenreVector(goodFellas.genres));
assert.ok(Math.abs(disjoint) < 1e-9, 'cosine of disjoint genre vectors must be approximately 0');

// --- 3. Hand-computed pair from the raw u.item genre flags ------------------
// Star Wars (1977) flags:        Action, Adventure, Romance, Sci-Fi, War  -> 5 genres
// Empire Strikes Back (1980):    Action, Adventure, Drama, Romance, Sci-Fi, War -> 6 genres
// Shared genres = 5, so cosine = 5 / (sqrt(5) * sqrt(6)) = 5 / sqrt(30) = 0.912871
const empire = byId(172);
assert.equal(starWars.title, 'Star Wars (1977)');
assert.equal(empire.title, 'Empire Strikes Back, The (1980)');
assert.equal(starWars.genres.length, 5, 'Star Wars must have 5 genre flags set');
assert.equal(empire.genres.length, 6, 'Empire Strikes Back must have 6 genre flags set');

const pairScore = cosineSimilarity(buildGenreVector(starWars.genres), buildGenreVector(empire.genres));
assert.ok(Math.abs(pairScore - 0.912871) < 1e-6,
    `cosine(50, 172) must be 0.912871, got ${pairScore}`);

// --- 4. 3-movie profile Top-5 ------------------------------------------------
const profileIds = [50, 172, 182];
const profileMovies = profileIds.map(byId);
const profileVector = buildProfileVector(profileMovies.map(m => buildGenreVector(m.genres)));
const top5 = recommendTopK(profileVector, movies, 5, new Set(profileIds));

assert.equal(top5.length, 5, 'Top-5 must return exactly 5 recommendations');
assert.ok(top5.every(rec => !profileIds.includes(rec.id)), 'Top-5 must not contain the profile movies');
assert.ok(top5.every(rec => rec.score > 0 && rec.score <= 1), 'every Top-5 score must be in (0, 1]');
for (let i = 1; i < top5.length; i++) {
    assert.ok(top5[i - 1].score >= top5[i].score, 'Top-5 must be sorted by score descending');
}

// --- 5. Jaccard replaced by cosine in script.js ------------------------------
assert.match(scriptSource, /cosineSimilarity/, 'script.js must implement cosineSimilarity');
assert.doesNotMatch(scriptSource, /jaccard/i, 'the Jaccard formula must be gone from script.js');

// --- Report the concrete numbers required by the assignment -----------------
const showTop5 = (label, vector, excludeIds) => {
    console.log(`\nTop-5 ${label}:`);
    for (const rec of recommendTopK(vector, movies, 5, excludeIds)) {
        console.log(`  ${rec.id}  ${rec.title}  ${rec.score.toFixed(6)}`);
    }
};

showTop5('for single movie 50 "Star Wars (1977)" (item-to-item)', starWarsVector, new Set([50]));
showTop5('for profile [50 Star Wars, 172 Empire Strikes Back, 182 GoodFellas]',
    profileVector, new Set(profileIds));

console.log(`\nPASS: 1682 movies, 100000 ratings, cosine(50,172)=0.912871, ` +
    `profile Top-5 valid, Jaccard removed`);
