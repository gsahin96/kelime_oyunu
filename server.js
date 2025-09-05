const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const dbPath = path.join(__dirname, 'database.json');

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/test.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'test.html'));
});

let database = {};
try {
    const dbData = fs.readFileSync(dbPath, 'utf8');
    database = JSON.parse(dbData);
    console.log("Veritabanı başarıyla yüklendi.");
} catch (error) {
    console.error("Veritabanı (database.json) yüklenirken hata oluştu:", error);
    process.exit(1);
}

let gameState = {
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
    scoreGoal: 10,
    countdownInterval: null,
    turnResolved: false,
    usedLettersThisGame: [],
};

const normalizeWord = (word) => {
    if (!word) return '';
    return word.trim()
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
        .toLocaleLowerCase('tr-TR');
};

io.on('connection', (socket) => {

    socket.on('joinGame', ({ name, isTestMode = false }) => {
        if (gameState.players.length >= 8) {
            return socket.emit('gameError', 'Oyun dolu.');
        }
        const playerNumber = gameState.players.length + 1;
        const newPlayer = { id: socket.id, name: name, playerNumber: playerNumber, isTestMode };

        if (!gameState.hostId) {
            gameState.hostId = socket.id;
        }

        gameState.players.push(newPlayer);
        if (!isTestMode) {
            gameState.scores[newPlayer.name] = 0;
        }
        socket.join('gameLobby');
        socket.emit('joined', { playerDetails: newPlayer });
        broadcastLobbyUpdate();
        if (!isTestMode) broadcastScoreUpdate();
    });

    socket.on('scoreGoalChanged', (newGoal) => {
        if (socket.id === gameState.hostId && !gameState.gameInProgress) {
            gameState.scoreGoal = newGoal;
            broadcastLobbyUpdate();
        }
    });

    socket.on('startDiceRoll', () => {
        const player = gameState.players.find(p => p.id === socket.id);
        if (!player || socket.id !== gameState.hostId) return;

        gameState.gameInProgress = true;
        gameState.roundInProgress = true;
        gameState.usedWords = [];
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
        if(!player.isTestMode) gameState.usedLettersThisGame.push(letter);

        io.to('gameLobby').emit('diceRolling', {
            finalLetterIndex: alphabet.indexOf(letter),
            finalCategoryIndex: categories.indexOf(category),
            letter: letter,
            category: category
        });

        setTimeout(() => {
            if (player.isTestMode) {
                gameState.currentPlayerIndex = 0;
                startTestLoop();
            } else {
                io.to('gameLobby').emit('gameStart');
                gameState.currentPlayerIndex = Math.floor(Math.random() * gameState.activePlayersInRound.length);
                startTurn();
            }
        }, 3000);
    });

    socket.on('wordSpoken', (word) => {
        const currentPlayer = gameState.activePlayersInRound[gameState.currentPlayerIndex];
        if (!currentPlayer || socket.id !== currentPlayer.id || !gameState.roundInProgress) return;

        clearInterval(gameState.countdownInterval);
        gameState.turnResolved = true;

        const normalizedSpokenWord = normalizeWord(word);
        const normalizedLetter = normalizeWord(gameState.currentLetter);
        const dbWords = database[gameState.currentCategory]?.[normalizedLetter] || [];
        const isCorrect = normalizedSpokenWord.startsWith(normalizedLetter) && dbWords.includes(normalizedSpokenWord) && !gameState.usedWords.includes(normalizedSpokenWord);

        if(currentPlayer.isTestMode){
             if (isCorrect) {
                io.to(currentPlayer.id).emit('testFeedback', { message: 'Doğru! Yeni tur başlıyor...', correct: true });
                setTimeout(startTestLoop, 1500);
            } else {
                 io.to(currentPlayer.id).emit('testFeedback', {
                    message: `Yanlış! ("${word}") Kelimeyi eklemek ister misin?`,
                    correct: false, word, category: gameState.currentCategory, letter: gameState.currentLetter
                });
            }
            return;
        }
        
        if (isCorrect) {
            gameState.usedWords.push(normalizedSpokenWord);
            io.to('gameLobby').emit('wordAccepted', { playerNumber: currentPlayer.playerNumber, word: normalizedSpokenWord });
            setTimeout(nextTurn, 700);
        } else {
            handlePlayerElimination(currentPlayer, 'Yanlış veya tekrar edilmiş kelime', normalizedSpokenWord);
        }
    });

    socket.on('hostDecisionOnWord', ({ add, wordInfo }) => {
        if (socket.id !== gameState.hostId) return;

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
        
        // Oyunu devam ettir
        setTimeout(resumeGameAfterDecision, 1000);
    });

    socket.on('continueTestLoop', () => {
        if(socket.id === gameState.hostId) startTestLoop();
    });
    
    socket.on('resetScores', () => {
        if (socket.id === gameState.hostId) {
            Object.keys(gameState.scores).forEach(name => gameState.scores[name] = 0);
            broadcastScoreUpdate();
        }
    });

    socket.on('newGame', () => {
        if (socket.id === gameState.hostId) {
            resetGame(true); // Lobiye dönmek için tam sıfırlama
            broadcastLobbyUpdate();
            broadcastScoreUpdate();
        }
    });

    socket.on('disconnect', () => {
        const disconnectedPlayer = gameState.players.find(p => p.id === socket.id);
        if (!disconnectedPlayer) return;

        const wasHost = disconnectedPlayer.id === gameState.hostId;
        
        gameState.players = gameState.players.filter(p => p.id !== socket.id);
        
        if (wasHost && gameState.players.length > 0) {
            gameState.hostId = gameState.players[0].id;
        } else if (gameState.players.length === 0) {
            gameState.hostId = null;
        }

        if (gameState.roundInProgress) {
            const activePlayerIndex = gameState.activePlayersInRound.findIndex(p => p.id === socket.id);
            if (activePlayerIndex !== -1) {
                const wasCurrentPlayer = activePlayerIndex === gameState.currentPlayerIndex;
                gameState.activePlayersInRound.splice(activePlayerIndex, 1);
                
                if (gameState.activePlayersInRound.length <= 1) {
                    clearInterval(gameState.countdownInterval);
                    handleRoundOver();
                } else if (wasCurrentPlayer) {
                    clearInterval(gameState.countdownInterval);
                    startTurn(); // Sıradaki oyuncuyla devam et
                } else if (gameState.currentPlayerIndex > activePlayerIndex) {
                    gameState.currentPlayerIndex--; // İndeksi ayarla
                }
            }
        }

        if (gameState.players.length === 0) {
            resetGame(false);
        } else {
             broadcastLobbyUpdate();
             broadcastScoreUpdate();
        }
    });

    function broadcastLobbyUpdate() {
        io.to('gameLobby').emit('lobbyUpdate', {
            players: gameState.players,
            gameHostId: gameState.hostId,
            scoreGoal: gameState.scoreGoal
        });
    }

    function broadcastScoreUpdate(isGameOver = false) {
        io.to('gameLobby').emit('scoreUpdate', { scores: gameState.scores, isGameOver });
    }
    
    function resumeGameAfterDecision() {
        if (gameState.activePlayersInRound.length <= 1) {
            handleRoundOver();
        } else {
            startTurn();
        }
    }

    function startTurn() {
        if (gameState.activePlayersInRound.length < 1) return handleRoundOver('Oyuncu kalmadı');
        
        gameState.roundInProgress = true;
        gameState.turnResolved = false;
        
        if (gameState.currentPlayerIndex >= gameState.activePlayersInRound.length) {
            gameState.currentPlayerIndex = 0;
        }

        const currentPlayer = gameState.activePlayersInRound[gameState.currentPlayerIndex];
        if (!currentPlayer) return handleRoundOver('Hata: Oyuncu bulunamadı');

        let timeLeft = 5;
        io.to('gameLobby').emit('turnUpdate', {
            player: currentPlayer,
            timeLeft,
            activePlayersCount: gameState.activePlayersInRound.length
        });

        clearInterval(gameState.countdownInterval);
        gameState.countdownInterval = setInterval(() => {
            timeLeft--;
            io.to('gameLobby').emit('countdown', timeLeft);
            if (timeLeft <= 0) {
                clearInterval(gameState.countdownInterval);
                setTimeout(() => {
                    if (!gameState.turnResolved) {
                        handlePlayerElimination(currentPlayer, 'Süre doldu');
                    }
                }, 500);
            }
        }, 1000);
    }
    
    function startTestLoop() {
        const currentPlayer = gameState.players.find(p => p.isTestMode);
        if (!currentPlayer) return;
        
        gameState.activePlayersInRound = [currentPlayer];
        gameState.roundInProgress = true;
        let timeLeft = 5;
        io.to(currentPlayer.id).emit('testTurnUpdate', { player: currentPlayer, timeLeft });

        clearInterval(gameState.countdownInterval);
        gameState.countdownInterval = setInterval(() => {
            timeLeft--;
            io.to(currentPlayer.id).emit('countdown', timeLeft);
            if (timeLeft <= 0) {
                clearInterval(gameState.countdownInterval);
                io.to(currentPlayer.id).emit('testFeedback', { message: 'Süre doldu! Yeni tur başlıyor...', correct: false, timedOut: true });
                setTimeout(startTestLoop, 1500);
            }
        }, 1000);
    }

    function nextTurn() {
        if (gameState.activePlayersInRound.length <= 1) {
            return handleRoundOver();
        }
        gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.activePlayersInRound.length;
        startTurn();
    }

    function handlePlayerElimination(player, reason, spokenWord = null) {
        const eliminatedPlayerIndex = gameState.activePlayersInRound.findIndex(p => p.id === player.id);
        if (eliminatedPlayerIndex === -1) return;

        gameState.activePlayersInRound.splice(eliminatedPlayerIndex, 1);
        
        io.to('gameLobby').emit('playerEliminated', {
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
            setTimeout(resumeGameAfterDecision, 2500);
        }
    }

    function handleRoundOver(reason = 'Tur bitti') {
        clearInterval(gameState.countdownInterval);
        gameState.roundInProgress = false;

        const winner = gameState.activePlayersInRound.length === 1 ? gameState.activePlayersInRound[0] : null;
        if (winner && gameState.scores[winner.name] !== undefined) {
            gameState.scores[winner.name]++;
        }

        io.to('gameLobby').emit('roundOver', { reason, winner: winner ? winner.name : null });
        broadcastScoreUpdate();

        setTimeout(() => {
            const finalWinner = Object.entries(gameState.scores).find(([, score]) => score >= gameState.scoreGoal);
            if (finalWinner) {
                io.to('gameLobby').emit('finalWinner', { winner: finalWinner[0], scores: gameState.scores });
                broadcastScoreUpdate(true);
                gameState.gameInProgress = false;
            } else {
                broadcastLobbyUpdate();
            }
        }, 3000);
    }

    function resetGame(fullReset = false) {
        clearInterval(gameState.countdownInterval);
        gameState.roundInProgress = false;
        gameState.gameInProgress = fullReset ? false : gameState.gameInProgress;
        
        if (fullReset) {
            gameState.players = [];
            gameState.hostId = null;
            gameState.scores = {};
            gameState.usedLettersThisGame = [];
        }
    }
});

server.listen(PORT, () => console.log(`Sunucu http://localhost:${PORT} adresinde başlatıldı.`));

