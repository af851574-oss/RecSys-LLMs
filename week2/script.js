// ============================================================================
// CORE:START — pure math/data functions, extracted and unit-tested by test.mjs
// ============================================================================

// Build the binary genre vector for a movie: one dimension per genre name,
// in the same order as genreNames in data.js.
function buildGenreVector(genres) {
    return genreNames.map(name => genres.includes(name) ? 1 : 0);
}

// Cosine similarity between two equal-length numeric vectors:
// dot(A, B) / (|A| * |B|). Returns 0 when either vector has zero length
// (a movie with no genre flags cannot be compared).
function cosineSimilarity(vecA, vecB) {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dot += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) {
        return 0;
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Average of several movie vectors: the taste profile vector. Every picked
// movie contributes weight 1/n to each genre dimension.
function buildProfileVector(movieVectors) {
    const profile = new Array(genreNames.length).fill(0);
    for (const vector of movieVectors) {
        for (let i = 0; i < profile.length; i++) {
            profile[i] += vector[i];
        }
    }
    return profile.map(sum => sum / movieVectors.length);
}

// Top-k movies by cosine similarity to the profile vector, excluding the
// given movie ids. Returns { id, title, score } sorted by score descending
// (ties broken by movie id for a stable order).
function recommendTopK(profileVector, candidateMovies, k, excludeIds) {
    return candidateMovies
        .filter(movie => !excludeIds.has(movie.id))
        .map(movie => ({
            id: movie.id,
            title: movie.title,
            score: cosineSimilarity(profileVector, buildGenreVector(movie.genres))
        }))
        .sort((a, b) => b.score - a.score || a.id - b.id)
        .slice(0, k);
}

// ============================================================================
// CORE:END
// ============================================================================

// Maximum number of watched movies the user can pick for the profile
const MAX_SELECTED_MOVIES = 3;

// Initialize the application when the window loads
window.onload = async function() {
    try {
        // Display loading message
        const resultElement = document.getElementById('result');
        resultElement.textContent = "Loading movie data...";
        resultElement.className = 'loading';

        // Load data
        await loadData();

        // Populate dropdown and update status
        populateMoviesDropdown();

        // Keep the selection within the profile limit (up to 3 movies)
        const selectElement = document.getElementById('movie-select');
        selectElement.addEventListener('change', () => {
            const selected = [...selectElement.selectedOptions];
            if (selected.length > MAX_SELECTED_MOVIES) {
                selected.slice(MAX_SELECTED_MOVIES).forEach(option => {
                    option.selected = false;
                });
            }
        });

        resultElement.textContent = "Data loaded. Select 1–3 movies you have watched.";
        resultElement.className = 'success';
    } catch (error) {
        console.error('Initialization error:', error);
        // Error message already set in data.js
    }
};

// Populate the movies dropdown with sorted movie titles
function populateMoviesDropdown() {
    const selectElement = document.getElementById('movie-select');

    // Clear existing options except the first placeholder
    while (selectElement.options.length > 1) {
        selectElement.remove(1);
    }

    // Sort movies alphabetically by title
    const sortedMovies = [...movies].sort((a, b) => a.title.localeCompare(b.title));

    // Add movies to dropdown
    sortedMovies.forEach(movie => {
        const option = document.createElement('option');
        option.value = movie.id;
        option.textContent = movie.title;
        selectElement.appendChild(option);
    });
}

// Main recommendation function: item-to-item for 1 selected movie,
// profile-based for 2-3 selected movies
function getRecommendations() {
    const resultElement = document.getElementById('result');
    const listElement = document.getElementById('recommendations');

    try {
        // Step 1: Get user input (up to 3 selected movie ids)
        const selectElement = document.getElementById('movie-select');
        const selectedIds = [...selectElement.selectedOptions]
            .map(option => parseInt(option.value))
            .filter(id => !isNaN(id));

        if (selectedIds.length === 0) {
            resultElement.textContent = "Please select at least one movie first.";
            resultElement.className = 'error';
            listElement.innerHTML = '';
            return;
        }

        // Step 2: Find the watched movies
        const selectedMovies = selectedIds
            .map(id => movies.find(movie => movie.id === id))
            .filter(movie => movie !== undefined);

        if (selectedMovies.length === 0) {
            resultElement.textContent = "Error: Selected movies not found in database.";
            resultElement.className = 'error';
            return;
        }

        // Show loading message while processing
        resultElement.textContent = "Calculating recommendations...";
        resultElement.className = 'loading';

        // Use setTimeout to allow the UI to update before the computation
        setTimeout(() => {
            try {
                // Step 3: Build the profile vector. With 1 movie this is the
                // movie's own vector (item-to-item); with 2-3 movies it is
                // the average of their vectors (profile-based).
                const movieVectors = selectedMovies.map(movie => buildGenreVector(movie.genres));
                const profileVector = selectedMovies.length === 1
                    ? movieVectors[0]
                    : buildProfileVector(movieVectors);
                const mode = selectedMovies.length === 1 ? 'item-to-item' : 'profile-based';

                // Step 4: Top-5 by cosine similarity, excluding the selected movies
                const recommendations = recommendTopK(profileVector, movies, 5, new Set(selectedIds));

                // Step 5: Show the active mode and the recommendation list
                // with similarity scores (textContent only — titles come from
                // the data file and must never be parsed as HTML)
                resultElement.textContent = `Mode: ${mode} — because you watched: ${selectedMovies.map(movie => `"${movie.title}"`).join(', ')}`;
                resultElement.className = 'success';

                listElement.innerHTML = '';
                recommendations.forEach(rec => {
                    const item = document.createElement('li');
                    item.textContent = rec.title;
                    const score = document.createElement('span');
                    score.className = 'score';
                    score.textContent = `similarity: ${rec.score.toFixed(4)}`;
                    item.appendChild(score);
                    listElement.appendChild(item);
                });
            } catch (error) {
                console.error('Error in recommendation calculation:', error);
                resultElement.textContent = "An error occurred while calculating recommendations.";
                resultElement.className = 'error';
            }
        }, 100);
    } catch (error) {
        console.error('Error in getRecommendations:', error);
        resultElement.textContent = "An unexpected error occurred.";
        resultElement.className = 'error';
    }
}
