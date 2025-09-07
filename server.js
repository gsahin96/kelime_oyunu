const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const dbPath = path.join(__dirname, 'database.json');
const statsPath = path.join(__dirname, 'player_stats.json');
const usersPath = path.join(__dirname, 'users.json');
const JWT_SECRET = process.env.JWT_SECRET || 'yeti-kelime-oyunu-secret-key-2024';

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

let playerStats = {};
try {
    const statsData = fs.readFileSync(statsPath, 'utf8');
    playerStats = JSON.parse(statsData);
    console.log("Oyuncu istatistikleri başarıyla yüklendi.");
} catch (error) {
    console.log("Oyuncu istatistikleri dosyası bulunamadı, yeni dosya oluşturulacak.");
    playerStats = {};
}

let users = {};
try {
    const usersData = fs.readFileSync(usersPath, 'utf8');
    users = JSON.parse(usersData);
    console.log("Kullanıcı hesapları başarıyla yüklendi.");
} catch (error) {
    console.log("Kullanıcı hesapları dosyası bulunamadı, yeni dosya oluşturulacak.");
    users = {};
}

let rooms = {};

// User Authentication Functions
const saveUsers = () => {
    try {
        fs.writeFileSync(usersPath, JSON.stringify(users, null, 2), 'utf8');
    } catch (error) {
        console.error("Kullanıcı kaydetme hatası:", error);
    }
};

const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

const validateUsername = (username) => {
    return username && username.length >= 3 && username.length <= 20 && /^[a-zA-Z0-9_çğıöşüÇĞIİÖŞÜ]+$/.test(username);
};

const validatePassword = (password) => {
    return password && password.length >= 6;
};

const createUser = async (email, username, password) => {
    try {
        // Check if email or username already exists
        const existingUser = Object.values(users).find(user => 
            user.email.toLowerCase() === email.toLowerCase() || 
            user.username.toLowerCase() === username.toLowerCase()
        );
        
        if (existingUser) {
            if (existingUser.email.toLowerCase() === email.toLowerCase()) {
                return { success: false, message: 'Bu e-posta adresi zaten kullanılıyor.' };
            }
            if (existingUser.username.toLowerCase() === username.toLowerCase()) {
                return { success: false, message: 'Bu kullanıcı adı zaten alınmış.' };
            }
        }

        // Hash password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        
        // Create user ID
        const userId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        
        // Create user object
        users[userId] = {
            id: userId,
            email: email.toLowerCase(),
            username: username,
            hashedPassword: hashedPassword,
            createdAt: new Date().toISOString(),
            lastLogin: null
        };
        
        saveUsers();
        
        // Initialize player statistics for new user
        initializePlayerStats(username);
        
        return { success: true, userId: userId, message: 'Hesap başarıyla oluşturuldu!' };
    } catch (error) {
        console.error('Kullanıcı oluşturma hatası:', error);
        return { success: false, message: 'Hesap oluşturulurken bir hata oluştu.' };
    }
};

const authenticateUser = async (email, password) => {
    try {
        const user = Object.values(users).find(user => 
            user.email.toLowerCase() === email.toLowerCase()
        );
        
        if (!user) {
            return { success: false, message: 'E-posta veya şifre hatalı.' };
        }
        
        const passwordMatch = await bcrypt.compare(password, user.hashedPassword);
        
        if (!passwordMatch) {
            return { success: false, message: 'E-posta veya şifre hatalı.' };
        }
        
        // Update last login
        user.lastLogin = new Date().toISOString();
        saveUsers();
        
        // Generate JWT token
        const token = jwt.sign(
            { userId: user.id, username: user.username },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        return { 
            success: true, 
            token: token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                createdAt: user.createdAt,
                lastLogin: user.lastLogin
            },
            message: 'Giriş başarılı!' 
        };
    } catch (error) {
        console.error('Kimlik doğrulama hatası:', error);
        return { success: false, message: 'Giriş yapılırken bir hata oluştu.' };
    }
};

const verifyToken = (token) => {
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = users[decoded.userId];
        if (user) {
            return { 
                success: true, 
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email
                }
            };
        }
        return { success: false, message: 'Kullanıcı bulunamadı.' };
    } catch (error) {
        return { success: false, message: 'Geçersiz token.' };
    }
};

// Player Statistics Functions
const savePlayerStats = () => {
    try {
        fs.writeFileSync(statsPath, JSON.stringify(playerStats, null, 2), 'utf8');
    } catch (error) {
        console.error("İstatistik kaydetme hatası:", error);
    }
};

const initializePlayerStats = (playerName) => {
    if (!playerStats[playerName]) {
        playerStats[playerName] = {
            gamesPlayed: 0,
            gamesWon: 0,
            totalCorrectWords: 0,
            totalResponseTime: 0,
            responseCount: 0,
            longestWinStreak: 0,
            currentWinStreak: 0,
            categoriesPlayed: {},
            wordsUsed: {},
            lastPlayed: new Date().toISOString(),
            achievements: []
        };
    }
    return playerStats[playerName];
};

const updatePlayerWordStat = (playerName, word, category, responseTime) => {
    const stats = initializePlayerStats(playerName);
    stats.totalCorrectWords++;
    stats.totalResponseTime += responseTime;
    stats.responseCount++;
    stats.lastPlayed = new Date().toISOString();
    
    // Track categories
    if (!stats.categoriesPlayed[category]) {
        stats.categoriesPlayed[category] = 0;
    }
    stats.categoriesPlayed[category]++;
    
    // Track words used
    if (!stats.wordsUsed[word]) {
        stats.wordsUsed[word] = 0;
    }
    stats.wordsUsed[word]++;
    
    savePlayerStats();
};

const updatePlayerGameResult = (playerName, won) => {
    const stats = initializePlayerStats(playerName);
    stats.gamesPlayed++;
    stats.lastPlayed = new Date().toISOString();
    
    if (won) {
        stats.gamesWon++;
        stats.currentWinStreak++;
        if (stats.currentWinStreak > stats.longestWinStreak) {
            stats.longestWinStreak = stats.currentWinStreak;
        }
    } else {
        stats.currentWinStreak = 0;
    }
    
    savePlayerStats();
};

const getPlayerStats = (playerName) => {
    const stats = initializePlayerStats(playerName);
    const winRate = stats.gamesPlayed > 0 ? (stats.gamesWon / stats.gamesPlayed * 100).toFixed(1) : 0;
    const avgResponseTime = stats.responseCount > 0 ? (stats.totalResponseTime / stats.responseCount).toFixed(1) : 0;
    
    // Get favorite category
    let favoriteCategory = 'Henüz yok';
    let maxCategoryCount = 0;
    for (const [category, count] of Object.entries(stats.categoriesPlayed)) {
        if (count > maxCategoryCount) {
            maxCategoryCount = count;
            favoriteCategory = category;
        }
    }
    
    // Get most used words (top 5)
    const mostUsedWords = Object.entries(stats.wordsUsed)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([word, count]) => ({ word, count }));
    
    return {
        gamesPlayed: stats.gamesPlayed,
        gamesWon: stats.gamesWon,
        winRate: winRate + '%',
        totalCorrectWords: stats.totalCorrectWords,
        avgResponseTime: avgResponseTime + 's',
        longestWinStreak: stats.longestWinStreak,
        currentWinStreak: stats.currentWinStreak,
        favoriteCategory,
        mostUsedWords,
        lastPlayed: new Date(stats.lastPlayed).toLocaleDateString('tr-TR')
    };
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
    
    // Authentication handlers
    socket.on('register', async ({ email, username, password }) => {
        if (!validateEmail(email)) {
            return socket.emit('authError', 'Geçerli bir e-posta adresi girin.');
        }
        if (!validateUsername(username)) {
            return socket.emit('authError', 'Kullanıcı adı 3-20 karakter olmalı ve sadece harf, rakam ve _ içermelidir.');
        }
        if (!validatePassword(password)) {
            return socket.emit('authError', 'Şifre en az 6 karakter olmalıdır.');
        }
        
        const result = await createUser(email, username, password);
        if (result.success) {
            socket.emit('registerSuccess', result.message);
        } else {
            socket.emit('authError', result.message);
        }
    });
    
    socket.on('login', async ({ email, password }) => {
        if (!email || !password) {
            return socket.emit('authError', 'E-posta ve şifre gereklidir.');
        }
        
        const result = await authenticateUser(email, password);
        if (result.success) {
            socket.emit('loginSuccess', { 
                token: result.token, 
                user: result.user, 
                message: result.message 
            });
        } else {
            socket.emit('authError', result.message);
        }
    });
    
    socket.on('verifyAuth', ({ token }) => {
        const result = verifyToken(token);
        if (result.success) {
            socket.emit('authVerified', { user: result.user });
        } else {
            socket.emit('authError', result.message);
        }
    });
    
    socket.on('createRoom', ({ name }) => {
        let roomId;
        do {
            roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        } while (rooms[roomId]);

        socket.join(roomId);

        rooms[roomId] = createInitialGameState();
        const gameState = rooms[roomId];

        const newPlayer = { id: socket.id, name: name, playerNumber: 1 };
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
        const newPlayer = { id: socket.id, name: name, playerNumber: playerNumber };

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
        const player = { id: socket.id, name, playerNumber: 1 };
        gameState.players.push(player);
        gameState.scores[name] = 0;
        gameState.gameInProgress = true;
        gameState.usedWords = [];
        
        socket.emit('singlePlayerStarted');
        socket.emit('usedWordsUpdate', { usedWords: gameState.usedWords });
        startSinglePlayerTurn(roomId);
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

