// Profile page functionality
document.addEventListener('DOMContentLoaded', function() {
    let socket = null;

    // Initialize page
    function initializePage() {
        const currentUser = gameState.getCurrentUser();
        
        if (!currentUser) {
            // Redirect to home if no user
            window.location.href = '/';
            return;
        }

        // Initialize socket and request stats
        socket = gameState.initializeSocket();
        socket.emit('requestPlayerStats', { playerName: currentUser.username });

        // Set up socket listeners
        socket.on('playerStatsUpdate', ({ stats }) => {
            updatePlayerStatsDisplay(stats);
        });
    }

    function updatePlayerStatsDisplay(stats) {
        // Game Statistics
        document.getElementById('stat-games-played').textContent = stats.gamesPlayed || 0;
        document.getElementById('stat-games-won').textContent = stats.gamesWon || 0;
        document.getElementById('stat-win-rate').textContent = stats.winRate || 0;
        document.getElementById('stat-longest-streak').textContent = stats.longestWinStreak || 0;
        document.getElementById('stat-current-streak').textContent = stats.currentWinStreak || 0;
        
        // Word Statistics
        document.getElementById('stat-total-words').textContent = stats.totalCorrectWords || 0;
        document.getElementById('stat-avg-time').textContent = (stats.avgResponseTime || 0).toFixed(2);
        document.getElementById('stat-fav-category').textContent = stats.favoriteCategory || 'Henüz yok';
        
        // Last Played
        const lastPlayed = stats.lastPlayed ? new Date(stats.lastPlayed) : null;
        document.getElementById('stat-last-played').textContent = lastPlayed ? 
            lastPlayed.toLocaleDateString('tr-TR') : 'Hiç';
        
        // Most Used Words
        updateMostUsedWords(stats.mostUsedWords || []);
    }

    function updateMostUsedWords(mostUsedWords) {
        const container = document.getElementById('most-used-words');
        
        if (mostUsedWords.length === 0) {
            container.innerHTML = '<p class="text-gray-500 col-span-full text-center">Henüz kelime verisi yok</p>';
        } else {
            container.innerHTML = '';
            mostUsedWords.forEach(({ word, count }) => {
                const wordElement = document.createElement('div');
                wordElement.className = 'themed-bg-secondary p-3 rounded-lg text-center border border-gray-600';
                wordElement.innerHTML = `
                    <div class="font-bold themed-text text-lg">${word}</div>
                    <div class="text-sm themed-text-muted">${count} kez</div>
                `;
                container.appendChild(wordElement);
            });
        }
    }

    // Initialize page
    initializePage();
});