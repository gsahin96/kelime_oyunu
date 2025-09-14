const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Routes for different pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/home', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'home.html'));
});

app.get('/profile', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'profile.html'));
});

app.get('/join', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'join.html'));
});

app.get('/room/:code', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'game.html'));
});

app.get('/room/:code/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'game.html'));
});

// Simple JSON database for words
let database = {};
const dbPath = './database.json';
try {
    database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    console.log("✅ JSON kelime veritabanı yüklendi");
} catch (error) {
    console.error("❌ database.json dosyası yüklenemedi:", error);
    database = {};
}

let rooms = {};

// Simple player statistics - stored in memory for simplicity
let playerStats = {};

const getPlayerStats = (playerName) => {
    if (!playerStats[playerName]) {
        playerStats[playerName] = {
            gamesPlayed: 0,
            gamesWon: 0,
            winRate: 0,
            totalCorrectWords: 0,
            avgResponseTime: 0,
            longestWinStreak: 0,
            currentWinStreak: 0,
            favoriteCategory: 'Henüz yok',
            lastPlayed: new Date(),
            mostUsedWords: []
        };
    }
    return playerStats[playerName];
};

const updatePlayerWordStat = (playerName, word, category, responseTime) => {
    const stats = getPlayerStats(playerName);
    stats.totalCorrectWords++;
    stats.avgResponseTime = ((stats.avgResponseTime * (stats.totalCorrectWords - 1)) + responseTime) / stats.totalCorrectWords;
    if (!stats.favoriteCategory || stats.favoriteCategory === 'Henüz yok') {
        stats.favoriteCategory = category;
    }
    stats.lastPlayed = new Date();
    
    // Update most used words
    const existingWord = stats.mostUsedWords.find(w => w.word === word);
    if (existingWord) {
        existingWord.count++;
    } else {
        stats.mostUsedWords.push({ word, count: 1 });
    }
    // Keep only top 10 words
    stats.mostUsedWords.sort((a, b) => b.count - a.count);
    stats.mostUsedWords = stats.mostUsedWords.slice(0, 10);
};

const updatePlayerGameResult = (playerName, won) => {
    const stats = getPlayerStats(playerName);
    stats.gamesPlayed++;
    if (won) {
        stats.gamesWon++;
        stats.currentWinStreak++;
        if (stats.currentWinStreak > stats.longestWinStreak) {
            stats.longestWinStreak = stats.currentWinStreak;
        }
    } else {
        stats.currentWinStreak = 0;
    }
    stats.winRate = ((stats.gamesWon / stats.gamesPlayed) * 100).toFixed(2);
    stats.lastPlayed = new Date();
};

const createInitialGameState = () => ({
    players: [],
    hostId: null,
    gameInProgress: false,
    roundInProgress: false,
    activePlayersInRound: [],
    currentPlayerIndex: 0,
    currentLetter: '',
    currentCategory: '',
    usedWords: [],
    scores: {},
    settings: {
        scoreGoal: 10,
        turnDuration: 5,
    },
    countdownInterval: null,
    turnResolved: false,
    usedLettersThisGame: [],
    turnStartTime: null,
    currentTimeLeft: null,
    hostDecisionTimeout: null, // Add timeout for host decision
});

const normalizeWord = (word) => {
    if (!word) return '';
    return word.trim()
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
        .toLocaleLowerCase('tr-TR');
};

io.on('connection', (socket) => {

    const getRoomIdFromSocket = () => {
        return Array.from(socket.rooms).find(r => r !== socket.id);
    };
    
    socket.on('createRoom', ({ name, avatar }) => {
        let roomId;
        do {
            roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        } while (rooms[roomId]);

        socket.join(roomId);

        rooms[roomId] = createInitialGameState();
        const gameState = rooms[roomId];

        const newPlayer = { id: socket.id, name: name, playerNumber: 1, avatar: avatar || 1 };
        gameState.hostId = socket.id;
        gameState.players.push(newPlayer);
        gameState.scores[newPlayer.name] = 0;
        
        socket.emit('roomCreated', { roomId, playerDetails: newPlayer });
        broadcastLobbyUpdate(roomId);
        broadcastScoreUpdate(roomId);
    });

    socket.on('joinRoom', ({ name, roomId, avatar }) => {
        const room = rooms[roomId];
        if (!room) {
            return socket.emit('gameError', 'Oda bulunamadı.');
        }
        if (room.players.length >= 8) {
            return socket.emit('gameError', 'Oda dolu.');
        }
        
        // Check if player is already in the room (reconnecting)
        const existingPlayer = room.players.find(p => p.name === name);
        if (existingPlayer) {
            // Reconnecting player
            existingPlayer.id = socket.id;
            socket.join(roomId);
            socket.emit('joined', { playerDetails: existingPlayer, roomId });
            broadcastLobbyUpdate(roomId);
            broadcastScoreUpdate(roomId);
            
            // If game is in progress, send current game state
            if (room.gameInProgress) {
                socket.emit('gameReconnected', {
                    letter: room.currentLetter,
                    category: room.currentCategory,
                    usedWords: room.usedWords,
                    isSpectator: !room.activePlayersInRound.find(p => p.id === socket.id)
                });
            }
            return;
        }
        
        socket.join(roomId);
        const gameState = room;
        const playerNumber = gameState.players.length + 1;
        
        const newPlayer = { 
            id: socket.id, 
            name: name, 
            playerNumber: playerNumber, 
            avatar: avatar || 1,
            isSpectator: gameState.gameInProgress // New players are spectators if game is running
        };

        gameState.players.push(newPlayer);
        gameState.scores[newPlayer.name] = 0;
        
        socket.emit('joined', { playerDetails: newPlayer, roomId });
        broadcastLobbyUpdate(roomId);
        broadcastScoreUpdate(roomId);
        
        // If game is in progress, notify that they'll join next round
        if (gameState.gameInProgress) {
            socket.emit('spectatorMode', {
                letter: gameState.currentLetter,
                category: gameState.currentCategory,
                usedWords: gameState.usedWords
            });
        }
    });

    socket.on('changeAvatar', ({ avatar }) => {
        const roomId = getRoomIdFromSocket();
        if (!rooms[roomId]) return;
        
        const gameState = rooms[roomId];
        const player = gameState.players.find(p => p.id === socket.id);
        
        if (player && avatar >= 1 && avatar <= 16) {
            player.avatar = avatar;
            
            console.log(`✅ Avatar updated for ${player.name}: ${avatar}`);
            
            // Emit lobby update to sync avatar changes
            io.to(roomId).emit('lobbyUpdate', { 
                players: gameState.players, 
                gameHostId: gameState.hostId, 
                settings: gameState.settings 
            });
        }
    });

    socket.on('gameSettingsChanged', (settings) => {
        const roomId = getRoomIdFromSocket();
        const gameState = rooms[roomId];
        if (gameState) {
            // Allow both host and admin (room creator) to change settings
            const isHost = socket.id === gameState.hostId;
            const isAdmin = gameState.players.find(p => p.id === socket.id && p.playerNumber === 1);
            
            if (isHost || isAdmin) {
                gameState.settings.scoreGoal = settings.scoreGoal;
                gameState.settings.turnDuration = settings.turnDuration;
                if (gameState.roundInProgress) {
                    gameState.currentTimeLeft = Math.max(gameState.currentTimeLeft, gameState.settings.turnDuration);
                }
                broadcastLobbyUpdate(roomId);
                console.log(`✅ Settings changed by ${isHost ? 'host' : 'admin'}: scoreGoal=${settings.scoreGoal}, turnDuration=${settings.turnDuration}`);
            } else {
                console.log(`❌ Settings change rejected - not host or admin`);
            }
        }
    });
    
    socket.on('startDiceRoll', () => {
        const roomId = getRoomIdFromSocket();
        const gameState = rooms[roomId];
        if (!gameState) return;

        // Allow both host and admin (room creator) to start the game
        const isHost = socket.id === gameState.hostId;
        const isAdmin = gameState.players.find(p => p.id === socket.id && p.playerNumber === 1);
        
        if (!isHost && !isAdmin) {
            console.log(`❌ Start game rejected - not host or admin`);
            return;
        }

        gameState.gameInProgress = true;
        gameState.roundInProgress = true;
        gameState.usedWords = [];
        io.to(roomId).emit('usedWordsUpdate', { usedWords: gameState.usedWords });
        
        console.log(`✅ Game started by ${isHost ? 'host' : 'admin'}`);
        
        // Include all connected players (including those who joined during game as spectators)
        gameState.activePlayersInRound = gameState.players.filter(p => !p.disconnected);
        
        // Clear spectator status for new round
        gameState.players.forEach(p => {
            if (p.isSpectator) {
                delete p.isSpectator;
            }
        });

        const alphabet = 'ABCÇDEFHIİJKLMNOÖPRSŞTUÜVYZ'.split('');
        const categories = ['İsim', 'Hayvan', 'Bitki/Meyve/Sebze', 'Ülke/Şehir/İlçe', 'Eşya', 'Meslek'];
        let letter, category, validCombo = false;
        
        let availableLetters = alphabet.filter(l => !gameState.usedLettersThisGame.includes(l));
        if (availableLetters.length === 0) {
            gameState.usedLettersThisGame = [];
            availableLetters = [...alphabet];
        }

        while (!validCombo) {
            letter = availableLetters[Math.floor(Math.random() * availableLetters.length)];
            category = categories[Math.floor(Math.random() * categories.length)];
            const normalizedLetter = letter.toLocaleLowerCase('tr-TR');
            if (database[category]?.[normalizedLetter] && database[category][normalizedLetter].length > 0) {
                validCombo = true;
            }
        }
        gameState.currentLetter = letter;
        gameState.currentCategory = category;
        gameState.usedLettersThisGame.push(letter);

        io.to(roomId).emit('diceRolling', {
            finalLetterIndex: alphabet.indexOf(letter),
            finalCategoryIndex: categories.indexOf(category),
            letter: letter,
            category: category
        });

        setTimeout(() => {
            io.to(roomId).emit('gameStart');
            gameState.currentPlayerIndex = Math.floor(Math.random() * gameState.activePlayersInRound.length);
            startTurn(roomId);
        }, 3000);
    });

    socket.on('submitWord', (word) => {
        const roomId = getRoomIdFromSocket();
        const gameState = rooms[roomId];
        if (!gameState || !gameState.roundInProgress) return;

        handleMultiplayerWord(roomId, word);
    });

    function handleMultiplayerWord(roomId, word) {
        const gameState = rooms[roomId];
        const currentPlayer = gameState.activePlayersInRound[gameState.currentPlayerIndex];
        if (!currentPlayer || socket.id !== currentPlayer.id) return;

        clearInterval(gameState.countdownInterval);
        gameState.turnResolved = true;

        // Calculate response time
        const responseTime = gameState.turnStartTime ? (Date.now() - gameState.turnStartTime) / 1000 : 0;

        const normalizedSubmittedWord = normalizeWord(word);
        const normalizedLetter = normalizeWord(gameState.currentLetter);

        // Make dbWords all lowercase for comparison
        const dbWordsRaw = database[gameState.currentCategory]?.[normalizedLetter] || [];
        const dbWords = dbWordsRaw.map(w => normalizeWord(w));

        // Used words also normalized
        const usedWordsNormalized = gameState.usedWords.map(w => normalizeWord(w));

        const isCorrect = normalizedSubmittedWord.startsWith(normalizedLetter)
            && dbWords.includes(normalizedSubmittedWord)
            && !usedWordsNormalized.includes(normalizedSubmittedWord);

        if (isCorrect) {
            // Update player statistics
            updatePlayerWordStat(currentPlayer.name, normalizedSubmittedWord, gameState.currentCategory, responseTime);

            gameState.usedWords.push(normalizedSubmittedWord);
            io.to(roomId).emit('wordAccepted', { playerNumber: currentPlayer.playerNumber, word: normalizedSubmittedWord });
            io.to(roomId).emit('usedWordsUpdate', { usedWords: gameState.usedWords });
            setTimeout(() => nextTurn(roomId), 700);
        } else {
            handlePlayerElimination(roomId, currentPlayer, 'Yanlış veya tekrar edilmiş kelime', normalizedSubmittedWord);
        }
    }

    socket.on('hostDecisionOnWord', ({ add, wordInfo }) => {
        const roomId = getRoomIdFromSocket();
        const gameState = rooms[roomId];
        if (!gameState || socket.id !== gameState.hostId) return;

        // Clear the timeout since decision was made
        if (gameState.hostDecisionTimeout) {
            clearTimeout(gameState.hostDecisionTimeout);
            gameState.hostDecisionTimeout = null;
        }

        if (add) {
            try {
                const normalizedLetter = wordInfo.letter.toLocaleLowerCase('tr-TR');
                const normalizedWord = wordInfo.word.toLocaleLowerCase('tr-TR');
                // Compare normalizedWord with normalized dbWords for existence
                const dbWordsRaw = database[wordInfo.category]?.[normalizedLetter] || [];
                const dbWords = dbWordsRaw.map(w => w.toLocaleLowerCase('tr-TR'));
                if (database[wordInfo.category]?.[normalizedLetter] && !dbWords.includes(normalizedWord)) {
                    database[wordInfo.category][normalizedLetter].push(wordInfo.word);
                    database[wordInfo.category][normalizedLetter].sort();
                    fs.writeFileSync(dbPath, JSON.stringify(database, null, 2), 'utf8');
                    socket.emit('dbUpdateSuccess', `'${wordInfo.word}' eklendi!`);
                } else {
                    socket.emit('dbUpdateError', `'${wordInfo.word}' zaten var veya kategori/harf geçersiz.`);
                }
            } catch (error) {
                console.error("Veritabanı yazma hatası:", error);
                socket.emit('dbUpdateError', 'Dosya yazma hatası!');
            }
        }

        setTimeout(() => resumeGameAfterDecision(roomId), 1000);
    });

    socket.on('resetScores', () => {
        const roomId = getRoomIdFromSocket();
        const gameState = rooms[roomId];
        if (gameState) {
            // Allow both host and admin (room creator) to reset scores
            const isHost = socket.id === gameState.hostId;
            const isAdmin = gameState.players.find(p => p.id === socket.id && p.playerNumber === 1);

            if (isHost || isAdmin) {
                Object.keys(gameState.scores).forEach(name => gameState.scores[name] = 0);
                broadcastScoreUpdate(roomId);
                console.log(`✅ Scores reset by ${isHost ? 'host' : 'admin'}`);
            } else {
                console.log(`❌ Score reset rejected - not host or admin`);
            }
        }
    });

    socket.on('requestPlayerStats', ({ playerName }) => {
        const stats = getPlayerStats(playerName);
        socket.emit('playerStatsUpdate', { playerName, stats });
    });
    
    socket.on('leaveRoom', () => {
        const roomId = getRoomIdFromSocket();
        if (!roomId || !rooms[roomId]) return;

        const gameState = rooms[roomId];
        if(gameState.countdownInterval) clearInterval(gameState.countdownInterval);
        if(gameState.hostDecisionTimeout) clearTimeout(gameState.hostDecisionTimeout);

        const leavingPlayer = gameState.players.find(p => p.id === socket.id);
        if (!leavingPlayer) return;

        const wasHost = leavingPlayer.id === gameState.hostId;

        // Completely remove player from the room
        const playerIndex = gameState.players.indexOf(leavingPlayer);
        if (playerIndex !== -1) {
            gameState.players.splice(playerIndex, 1);
            // Remove from scores
            delete gameState.scores[leavingPlayer.name];
        }

        // Only delete room if ALL players are gone
        if (gameState.players.length === 0) {
            console.log(`Oda ${roomId} kapatıldı - tüm oyuncular ayrıldı.`);
            delete rooms[roomId];
            return;
        }

        // Transfer host to first remaining player if needed
        if (wasHost && gameState.players.length > 0) {
            gameState.hostId = gameState.players[0].id;
        }

        if (gameState.roundInProgress) {
            const activePlayerIndex = gameState.activePlayersInRound.findIndex(p => p.id === socket.id);
            if (activePlayerIndex !== -1) {
                const wasCurrentPlayer = activePlayerIndex === gameState.currentPlayerIndex;
                gameState.activePlayersInRound.splice(activePlayerIndex, 1);

                if (gameState.activePlayersInRound.length <= 1) {
                    handleRoundOver(roomId);
                } else if (wasCurrentPlayer) {
                    startTurn(roomId);
                } else if (gameState.currentPlayerIndex > activePlayerIndex) {
                    gameState.currentPlayerIndex--;
                }
            }
        }

        broadcastLobbyUpdate(roomId);
        broadcastScoreUpdate(roomId);

        // Leave the socket room
        socket.leave(roomId);
    });
    
    socket.on('disconnect', () => {
        const roomId = getRoomIdFromSocket();
        if (!roomId || !rooms[roomId]) return;

        const gameState = rooms[roomId];
        if(gameState.countdownInterval) clearInterval(gameState.countdownInterval);
        if(gameState.hostDecisionTimeout) clearTimeout(gameState.hostDecisionTimeout);

        const disconnectedPlayer = gameState.players.find(p => p.id === socket.id);
        if (!disconnectedPlayer) return;

        const wasHost = disconnectedPlayer.id === gameState.hostId;

        // Completely remove player from the room when they disconnect (close browser)
        const playerIndex = gameState.players.indexOf(disconnectedPlayer);
        if (playerIndex !== -1) {
            gameState.players.splice(playerIndex, 1);
            // Remove from scores
            delete gameState.scores[disconnectedPlayer.name];
        }

        // Only delete room if ALL players are gone
        if (gameState.players.length === 0) {
            console.log(`Oda ${roomId} kapatıldı - tüm oyuncular ayrıldı.`);
            delete rooms[roomId];
            return;
        }

        // Transfer host to first remaining player if needed
        if (wasHost && gameState.players.length > 0) {
            gameState.hostId = gameState.players[0].id;
        }

        if (gameState.roundInProgress) {
            const activePlayerIndex = gameState.activePlayersInRound.findIndex(p => p.id === socket.id);
            if (activePlayerIndex !== -1) {
                const wasCurrentPlayer = activePlayerIndex === gameState.currentPlayerIndex;
                gameState.activePlayersInRound.splice(activePlayerIndex, 1);

                if (gameState.activePlayersInRound.length <= 1) {
                    handleRoundOver(roomId);
                } else if (wasCurrentPlayer) {
                    startTurn(roomId);
                } else if (gameState.currentPlayerIndex > activePlayerIndex) {
                    gameState.currentPlayerIndex--;
                }
            }
        }

        broadcastLobbyUpdate(roomId);
        broadcastScoreUpdate(roomId);
    });
    
    function broadcastLobbyUpdate(roomId) {
        const gameState = rooms[roomId];
        if (!gameState) return;
        io.to(roomId).emit('lobbyUpdate', {
            players: gameState.players,
            gameHostId: gameState.hostId,
            settings: gameState.settings,
            gameInProgress: gameState.gameInProgress
        });
    }

    function broadcastScoreUpdate(roomId, isGameOver = false) {
        const gameState = rooms[roomId];
        if (!gameState) return;
        io.to(roomId).emit('scoreUpdate', { scores: gameState.scores, isGameOver });
    }
    
    function resumeGameAfterDecision(roomId) {
        const gameState = rooms[roomId];
        if (!gameState) return;
        if (gameState.activePlayersInRound.length <= 1) {
            handleRoundOver(roomId);
        } else {
            nextTurn(roomId);
        }
    }

    function startTurn(roomId) {
        const gameState = rooms[roomId];
        if (!gameState) return;
        
        if (gameState.activePlayersInRound.length < 1) return handleRoundOver(roomId, 'Oyuncu kalmadı');
        
        gameState.roundInProgress = true;
        gameState.turnResolved = false;
        gameState.turnStartTime = Date.now(); // Record turn start time for statistics
        
        if (gameState.currentPlayerIndex >= gameState.activePlayersInRound.length) {
            gameState.currentPlayerIndex = 0;
        }

        const currentPlayer = gameState.activePlayersInRound[gameState.currentPlayerIndex];
        if (!currentPlayer) return handleRoundOver(roomId, 'Hata: Oyuncu bulunamadı');

        gameState.currentTimeLeft = gameState.settings.turnDuration;
        io.to(roomId).emit('turnUpdate', {
            player: currentPlayer,
            timeLeft: gameState.currentTimeLeft,
            activePlayersCount: gameState.activePlayersInRound.length,
            letter: gameState.currentLetter,
            category: gameState.currentCategory
        });

        clearInterval(gameState.countdownInterval);
        gameState.countdownInterval = setInterval(() => {
            gameState.currentTimeLeft--;
            io.to(roomId).emit('countdown', gameState.currentTimeLeft);
            if (gameState.currentTimeLeft <= 0) {
                clearInterval(gameState.countdownInterval);
                setTimeout(() => {
                    if (!gameState.turnResolved) {
                        handlePlayerElimination(roomId, currentPlayer, 'Süre doldu');
                    }
                }, 500);
            }
        }, 1000);
    }
    
    function nextTurn(roomId) {
        const gameState = rooms[roomId];
        if (!gameState) return;
        if (gameState.activePlayersInRound.length <= 1) {
            return handleRoundOver(roomId);
        }
        gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.activePlayersInRound.length;
        startTurn(roomId);
    }

    function handlePlayerElimination(roomId, player, reason, spokenWord = null) {
        const gameState = rooms[roomId];
        if (!gameState) return;
        
        const eliminatedPlayerIndex = gameState.activePlayersInRound.findIndex(p => p.id === player.id);
        if (eliminatedPlayerIndex === -1) return;

        gameState.activePlayersInRound.splice(eliminatedPlayerIndex, 1);
        
        io.to(roomId).emit('playerEliminated', {
            loserId: player.id,
            loserName: player.name,
            reason: reason,
            word: spokenWord
        });
        
        if (reason === 'Yanlış veya tekrar edilmiş kelime' && spokenWord && gameState.hostId) {
            io.to(gameState.hostId).emit('askHostAboutWord', {
                word: spokenWord,
                category: gameState.currentCategory,
                letter: gameState.currentLetter
            });
            
            // Set timeout for host decision (10 seconds)
            gameState.hostDecisionTimeout = setTimeout(() => {
                console.log(`Host decision timeout for room ${roomId} - auto-resuming game`);
                // Notify all players that decision timed out
                io.to(roomId).emit('hostDecisionTimeout', { word: spokenWord });
                resumeGameAfterDecision(roomId);
            }, 10000);
        } else {
            setTimeout(() => resumeGameAfterDecision(roomId), 2500);
        }
    }

    function handleRoundOver(roomId, reason = 'Tur bitti') {
        const gameState = rooms[roomId];
        if (!gameState) return;

        clearInterval(gameState.countdownInterval);
        if (gameState.hostDecisionTimeout) {
            clearTimeout(gameState.hostDecisionTimeout);
            gameState.hostDecisionTimeout = null;
        }
        gameState.roundInProgress = false;

        const winner = gameState.activePlayersInRound.length === 1 ? gameState.activePlayersInRound[0] : null;
        if (winner && gameState.scores[winner.name] !== undefined) {
            gameState.scores[winner.name]++;
        }

        io.to(roomId).emit('roundOver', { reason, winner: winner ? winner.name : null });
        broadcastScoreUpdate(roomId);

        setTimeout(() => {
            const finalWinner = Object.entries(gameState.scores).find(([, score]) => score >= gameState.settings.scoreGoal);
            if (finalWinner) {
                // Update statistics for all players
                gameState.players.forEach(player => {
                    const won = player.name === finalWinner[0];
                    updatePlayerGameResult(player.name, won);
                });
                
                io.to(roomId).emit('finalWinner', { winner: finalWinner[0], scores: gameState.scores });
                broadcastScoreUpdate(roomId, true);
                gameState.gameInProgress = false;
            } else {
                // No final winner yet, pause for next round
                gameState.gameInProgress = false;
                io.to(roomId).emit('roundEnded');
            }
        }, 3000);
    }
});

server.listen(PORT, () => console.log(`Sunucu http://localhost:${PORT} adresinde başlatıldı.`));

