const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/test.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'test.html'));
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
    isSinglePlayer: false,
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
    
    socket.on('createRoom', ({ name }) => {
        let roomId;
        do {
            roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        } while (rooms[roomId]);

        socket.join(roomId);

        rooms[roomId] = createInitialGameState();
        const gameState = rooms[roomId];

        const newPlayer = { id: socket.id, name: name, playerNumber: 1, avatar: 1 };
        gameState.hostId = socket.id;
        gameState.players.push(newPlayer);
        gameState.scores[newPlayer.name] = 0;
        
        socket.emit('roomCreated', { roomId, playerDetails: newPlayer });
        broadcastLobbyUpdate(roomId);
        broadcastScoreUpdate(roomId);
    });

    socket.on('joinRoom', ({ name, roomId }) => {
        const room = rooms[roomId];
        if (!room) {
            return socket.emit('gameError', 'Oda bulunamadı.');
        }
        if (room.players.length >= 8) {
            return socket.emit('gameError', 'Oda dolu.');
        }
        if (room.gameInProgress) {
            return socket.emit('gameError', 'Oyun çoktan başladı.');
        }
        
        socket.join(roomId);
        const gameState = room;
        const playerNumber = gameState.players.length + 1;
        
        const newPlayer = { id: socket.id, name: name, playerNumber: playerNumber, avatar: 1 };

        gameState.players.push(newPlayer);
        gameState.scores[newPlayer.name] = 0;
        
        socket.emit('joined', { playerDetails: newPlayer, roomId });
        broadcastLobbyUpdate(roomId);
        broadcastScoreUpdate(roomId);
    });

    socket.on('startSinglePlayer', ({ name }) => {
        const roomId = `SOLO_${socket.id}`;
        socket.join(roomId);
        rooms[roomId] = createInitialGameState();
        const gameState = rooms[roomId];
        
        gameState.isSinglePlayer = true;
        const player = { id: socket.id, name, playerNumber: 1, avatar: 1 };
        gameState.players.push(player);
        gameState.scores[name] = 0;
        gameState.gameInProgress = true;
        gameState.usedWords = [];
        
        socket.emit('singlePlayerStarted');
        socket.emit('usedWordsUpdate', { usedWords: gameState.usedWords });
        startSinglePlayerTurn(roomId);
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
        if (gameState && socket.id === gameState.hostId && !gameState.gameInProgress) {
            gameState.settings.scoreGoal = settings.scoreGoal;
            gameState.settings.turnDuration = settings.turnDuration;
            broadcastLobbyUpdate(roomId);
        }
    });
    
    socket.on('startDiceRoll', () => {
        const roomId = getRoomIdFromSocket();
        const gameState = rooms[roomId];
        if (!gameState || socket.id !== gameState.hostId) return;

        gameState.gameInProgress = true;
        gameState.roundInProgress = true;
        gameState.usedWords = [];
        io.to(roomId).emit('usedWordsUpdate', { usedWords: gameState.usedWords });
        gameState.activePlayersInRound = [...gameState.players];

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

        if (gameState.isSinglePlayer) {
            handleSinglePlayerWord(roomId, word);
        } else {
            handleMultiplayerWord(roomId, word);
        }
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
        const dbWords = database[gameState.currentCategory]?.[normalizedLetter] || [];
        const isCorrect = normalizedSubmittedWord.startsWith(normalizedLetter) && dbWords.includes(normalizedSubmittedWord) && !gameState.usedWords.includes(normalizedSubmittedWord);
        
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

    function handleSinglePlayerWord(roomId, word) {
        const gameState = rooms[roomId];
        clearInterval(gameState.countdownInterval);

        // Calculate response time
        const responseTime = gameState.turnStartTime ? (Date.now() - gameState.turnStartTime) / 1000 : 0;

        const normalizedSubmittedWord = normalizeWord(word);
        const normalizedLetter = normalizeWord(gameState.currentLetter);
        const dbWords = database[gameState.currentCategory]?.[normalizedLetter] || [];
        const isCorrect = normalizedSubmittedWord.startsWith(normalizedLetter) && dbWords.includes(normalizedSubmittedWord) && !gameState.usedWords.includes(normalizedSubmittedWord);

        if (isCorrect) {
            const playerName = gameState.players[0].name;
            
            // Update player statistics
            updatePlayerWordStat(playerName, normalizedSubmittedWord, gameState.currentCategory, responseTime);
            
            gameState.scores[playerName]++;
            gameState.usedWords.push(normalizedSubmittedWord);
            io.to(roomId).emit('usedWordsUpdate', { usedWords: gameState.usedWords });
            startSinglePlayerTurn(roomId);
        } else {
            handleSinglePlayerGameOver(roomId);
        }
    }

    socket.on('hostDecisionOnWord', ({ add, wordInfo }) => {
        const roomId = getRoomIdFromSocket();
        const gameState = rooms[roomId];
        if (!gameState || socket.id !== gameState.hostId) return;

        if (add) {
            try {
                const normalizedLetter = wordInfo.letter.toLocaleLowerCase('tr-TR');
                const normalizedWord = wordInfo.word.toLocaleLowerCase('tr-TR');
                if (database[wordInfo.category]?.[normalizedLetter] && !database[wordInfo.category][normalizedLetter].includes(normalizedWord)) {
                    database[wordInfo.category][normalizedLetter].push(normalizedWord);
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
        if (gameState && socket.id === gameState.hostId) {
            Object.keys(gameState.scores).forEach(name => gameState.scores[name] = 0);
            broadcastScoreUpdate(roomId);
        }
    });

    socket.on('newGame', () => {
        const roomId = getRoomIdFromSocket();
        const gameState = rooms[roomId];
        if (gameState && socket.id === gameState.hostId) {
            rooms[roomId] = {
                ...createInitialGameState(),
                players: gameState.players,
                hostId: gameState.hostId,
                scores: Object.fromEntries(gameState.players.map(p => [p.name, 0])),
                settings: gameState.settings 
            };
            broadcastLobbyUpdate(roomId);
            broadcastScoreUpdate(roomId);
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

        if (gameState.isSinglePlayer) {
            delete rooms[roomId];
            return;
        }
        
        const leavingPlayer = gameState.players.find(p => p.id === socket.id);
        if (!leavingPlayer) return;

        const wasHost = leavingPlayer.id === gameState.hostId;
        
        gameState.players = gameState.players.filter(p => p.id !== socket.id);
        
        if (gameState.players.length === 0) {
            console.log(`Oda ${roomId} kapatıldı.`);
            delete rooms[roomId];
            return;
        }

        if (wasHost) {
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
        } else {
            // If in lobby, just update lobby
            broadcastLobbyUpdate(roomId);
        }
        
        // Leave the socket room
        socket.leave(roomId);
    });
    
    socket.on('disconnect', () => {
        const roomId = getRoomIdFromSocket();
        if (!roomId || !rooms[roomId]) return;

        const gameState = rooms[roomId];
        if(gameState.countdownInterval) clearInterval(gameState.countdownInterval);

        if (gameState.isSinglePlayer) {
            delete rooms[roomId];
            return;
        }
        
        const disconnectedPlayer = gameState.players.find(p => p.id === socket.id);
        if (!disconnectedPlayer) return;

        const wasHost = disconnectedPlayer.id === gameState.hostId;
        
        gameState.players = gameState.players.filter(p => p.id !== socket.id);
        
        if (gameState.players.length === 0) {
            console.log(`Oda ${roomId} kapatıldı.`);
            delete rooms[roomId];
            return;
        }

        if (wasHost) {
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

        let timeLeft = gameState.settings.turnDuration;
        io.to(roomId).emit('turnUpdate', {
            player: currentPlayer,
            timeLeft,
            activePlayersCount: gameState.activePlayersInRound.length,
            letter: gameState.currentLetter,
            category: gameState.currentCategory
        });

        clearInterval(gameState.countdownInterval);
        gameState.countdownInterval = setInterval(() => {
            timeLeft--;
            io.to(roomId).emit('countdown', timeLeft);
            if (timeLeft <= 0) {
                clearInterval(gameState.countdownInterval);
                setTimeout(() => {
                    if (!gameState.turnResolved) {
                        handlePlayerElimination(roomId, currentPlayer, 'Süre doldu');
                    }
                }, 500);
            }
        }, 1000);
    }
    
    function startSinglePlayerTurn(roomId) {
        const gameState = rooms[roomId];
        if (!gameState || !gameState.gameInProgress) return;
        
        gameState.roundInProgress = true;
        gameState.turnStartTime = Date.now(); // Record turn start time for statistics
        const alphabet = 'ABCÇDEFHIİJKLMNOÖPRSŞTUÜVYZ'.split('');
        const categories = ['İsim', 'Hayvan', 'Bitki/Meyve/Sebze', 'Ülke/Şehir/İlçe', 'Eşya', 'Meslek'];
        
        let letter, category, validCombo = false;
        while (!validCombo) {
            letter = alphabet[Math.floor(Math.random() * alphabet.length)];
            category = categories[Math.floor(Math.random() * categories.length)];
            const normalizedLetter = letter.toLocaleLowerCase('tr-TR');
            if (database[category]?.[normalizedLetter] && database[category][normalizedLetter].length > 0) {
                validCombo = true;
            }
        }
        gameState.currentLetter = letter;
        gameState.currentCategory = category;

        const playerName = gameState.players[0].name;
        let timeLeft = 5;
        io.to(roomId).emit('singlePlayerTurnUpdate', {
            letter,
            category,
            score: gameState.scores[playerName],
            timeLeft
        });

        clearInterval(gameState.countdownInterval);
        gameState.countdownInterval = setInterval(() => {
            timeLeft--;
            io.to(roomId).emit('singlePlayerCountdown', timeLeft);
            if (timeLeft <= 0) {
                clearInterval(gameState.countdownInterval);
                handleSinglePlayerGameOver(roomId);
            }
        }, 1000);
    }

    function handleSinglePlayerGameOver(roomId) {
        const gameState = rooms[roomId];
        if (!gameState) return;
        
        clearInterval(gameState.countdownInterval);
        gameState.gameInProgress = false;
        const score = gameState.scores[gameState.players[0].name];
        const playerName = gameState.players[0].name;
        
        // Update single player game statistics (treat any score > 0 as a "win")
        updatePlayerGameResult(playerName, score > 0);
        
        io.to(roomId).emit('singlePlayerGameOver', { score });
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
        } else {
            setTimeout(() => resumeGameAfterDecision(roomId), 2500);
        }
    }

    function handleRoundOver(roomId, reason = 'Tur bitti') {
        const gameState = rooms[roomId];
        if (!gameState) return;

        clearInterval(gameState.countdownInterval);
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
                broadcastLobbyUpdate(roomId);
            }
        }, 3000);
    }
});

server.listen(PORT, () => console.log(`Sunucu http://localhost:${PORT} adresinde başlatıldı.`));

