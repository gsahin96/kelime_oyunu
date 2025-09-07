const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query } = require('./database'); // PostgreSQL database functions
const dbFunctions = require('./dbFunctions'); // Additional DB helper functions

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'yeti-kelime-oyunu-secret-key-2024';

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/test.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'test.html'));
});

// PostgreSQL database - no more JSON files!
let database = {};
console.log("✅ PostgreSQL veritabanı kullanılıyor - JSON dosyaları artık gerekmiyor!");

let rooms = {};
let pendingRegistrations = new Set(); // Track pending registrations to prevent duplicates

// PostgreSQL User Authentication Functions - No more JSON saving!

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
        const normalizedEmail = email.toLowerCase();
        const normalizedUsername = username.toLowerCase();
        const registrationKey = `${normalizedEmail}:${normalizedUsername}`;
        
        // Check if registration is already in progress
        if (pendingRegistrations.has(registrationKey)) {
            return { success: false, message: 'Kayıt işlemi devam ediyor, lütfen bekleyin.' };
        }
        
        // Mark this registration as pending
        pendingRegistrations.add(registrationKey);
        
        try {
            // Check if email or username already exists in PostgreSQL
            const existingUserQuery = 'SELECT id, email, username FROM users WHERE LOWER(email) = $1 OR LOWER(username) = $2';
            const existingResult = await query(existingUserQuery, [normalizedEmail, normalizedUsername]);
            
            if (existingResult.rows.length > 0) {
                const existingUser = existingResult.rows[0];
                if (existingUser.email.toLowerCase() === normalizedEmail) {
                    return { success: false, message: 'Bu e-posta adresi zaten kullanılıyor.' };
                }
                if (existingUser.username.toLowerCase() === normalizedUsername) {
                    return { success: false, message: 'Bu kullanıcı adı zaten alınmış.' };
                }
            }

            // Hash password
            const saltRounds = 10;
            const hashedPassword = await bcrypt.hash(password, saltRounds);
            
            // Create user ID
            const userId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
            
            // Insert user into PostgreSQL
            const insertUserQuery = `
                INSERT INTO users (id, email, username, hashed_password, created_at, preferences, game_stats)
                VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5, $6)
                RETURNING id
            `;
            
            const preferences = {
                avatar: 1,
                theme: 'dark',
                soundEnabled: true,
                backgroundType: 'particles'
            };
            
            const gameStats = {
                totalGames: 0,
                totalWins: 0,
                totalCorrectWords: 0,
                favoriteCategory: '',
                longestWinStreak: 0,
                currentWinStreak: 0
            };
            
            await query(insertUserQuery, [userId, normalizedEmail, username, hashedPassword, JSON.stringify(preferences), JSON.stringify(gameStats)]);
            
            // Initialize player statistics in PostgreSQL
            await initializePlayerStatsPostgres(username);
            
            return { success: true, userId: userId, message: 'Hesap başarıyla oluşturuldu!' };
        } finally {
            // Always remove from pending registrations
            pendingRegistrations.delete(registrationKey);
        }
    } catch (error) {
        console.error('PostgreSQL kullanıcı oluşturma hatası:', error);
        return { success: false, message: 'Hesap oluşturulurken bir hata oluştu.' };
    }
};

// PostgreSQL helper function for player stats initialization
const initializePlayerStatsPostgres = async (username) => {
    try {
        const insertStatsQuery = `
            INSERT INTO player_stats (username, games_played, games_won, win_rate, longest_win_streak, current_win_streak, total_correct_words, avg_response_time, favorite_category, last_played, most_used_words)
            VALUES ($1, 0, 0, 0.00, 0, 0, 0, 0.00, '', CURRENT_TIMESTAMP, '[]'::jsonb)
            ON CONFLICT (username) DO NOTHING
        `;
        await query(insertStatsQuery, [username]);
    } catch (error) {
        console.error('Player stats PostgreSQL hatası:', error);
    }
};

const authenticateUser = async (email, password) => {
    try {
        // Find user in PostgreSQL
        const userQuery = 'SELECT * FROM users WHERE LOWER(email) = $1';
        const userResult = await query(userQuery, [email.toLowerCase()]);
        
        if (userResult.rows.length === 0) {
            return { success: false, message: 'E-posta veya şifre hatalı.' };
        }
        
        const user = userResult.rows[0];
        const passwordMatch = await bcrypt.compare(password, user.hashed_password);
        
        if (!passwordMatch) {
            return { success: false, message: 'E-posta veya şifre hatalı.' };
        }
        
        // Update last login in PostgreSQL
        const updateLoginQuery = 'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1';
        await query(updateLoginQuery, [user.id]);
        
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
                createdAt: user.created_at,
                lastLogin: new Date(),
                preferences: user.preferences,
                gameStats: user.game_stats
            },
            message: 'Giriş başarılı!' 
        };
    } catch (error) {
        console.error('PostgreSQL authentication hatası:', error);
        return { success: false, message: 'Giriş işleminde hata oluştu.' };
    }
};

const verifyToken = async (token) => {
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Get user from PostgreSQL
        const userQuery = 'SELECT id, username, email, preferences, game_stats FROM users WHERE id = $1';
        const userResult = await query(userQuery, [decoded.userId]);
        
        if (userResult.rows.length > 0) {
            const user = userResult.rows[0];
            return { 
                success: true, 
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    preferences: user.preferences,
                    gameStats: user.game_stats
                }
            };
        }
        return { success: false, message: 'Kullanıcı bulunamadı.' };
    } catch (error) {
        return { success: false, message: 'Geçersiz token.' };
    }
};

// PostgreSQL Player Statistics Functions - No more JSON saving!

const getPlayerStatsPostgres = async (playerName) => {
    try {
        const statsQuery = 'SELECT * FROM player_stats WHERE username = $1';
        const result = await query(statsQuery, [playerName]);
        
        if (result.rows.length === 0) {
            // Initialize if doesn't exist
            await initializePlayerStatsPostgres(playerName);
            return await getPlayerStatsPostgres(playerName);
        }
        
        const stats = result.rows[0];
        return {
            gamesPlayed: stats.games_played,
            gamesWon: stats.games_won,
            winRate: parseFloat(stats.win_rate),
            totalCorrectWords: stats.total_correct_words,
            avgResponseTime: parseFloat(stats.avg_response_time),
            longestWinStreak: stats.longest_win_streak,
            currentWinStreak: stats.current_win_streak,
            favoriteCategory: stats.favorite_category || 'Henüz yok',
            lastPlayed: stats.last_played,
            mostUsedWords: stats.most_used_words || []
        };
    } catch (error) {
        console.error('PostgreSQL stats getirme hatası:', error);
        return {
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
};

const updatePlayerWordStatPostgres = async (playerName, word, category, responseTime) => {
    try {
        const updateQuery = `
            UPDATE player_stats 
            SET total_correct_words = total_correct_words + 1,
                avg_response_time = (avg_response_time * total_correct_words + $3) / (total_correct_words + 1),
                favorite_category = CASE 
                    WHEN favorite_category = '' OR favorite_category IS NULL THEN $2
                    ELSE favorite_category
                END,
                last_played = CURRENT_TIMESTAMP,
                most_used_words = CASE 
                    WHEN most_used_words ? $4 THEN 
                        jsonb_set(most_used_words, ARRAY[$4], to_jsonb((most_used_words->>$4)::int + 1))
                    ELSE 
                        jsonb_set(most_used_words, ARRAY[$4], '1')
                END
            WHERE username = $1
        `;
        await query(updateQuery, [playerName, category, responseTime, word]);
    } catch (error) {
        console.error('PostgreSQL word stat güncelleme hatası:', error);
    }
};

const updatePlayerGameResultPostgres = async (playerName, won) => {
    try {
        if (won) {
            const updateWinQuery = `
                UPDATE player_stats 
                SET games_played = games_played + 1,
                    games_won = games_won + 1,
                    win_rate = ((games_won + 1)::decimal / (games_played + 1)) * 100,
                    current_win_streak = current_win_streak + 1,
                    longest_win_streak = CASE 
                        WHEN current_win_streak + 1 > longest_win_streak THEN current_win_streak + 1
                        ELSE longest_win_streak
                    END,
                    last_played = CURRENT_TIMESTAMP
                WHERE username = $1
            `;
            await query(updateWinQuery, [playerName]);
        } else {
            const updateLossQuery = `
                UPDATE player_stats 
                SET games_played = games_played + 1,
                    win_rate = (games_won::decimal / (games_played + 1)) * 100,
                    current_win_streak = 0,
                    last_played = CURRENT_TIMESTAMP
                WHERE username = $1
            `;
            await query(updateLossQuery, [playerName]);
        }
    } catch (error) {
        console.error('PostgreSQL game result güncelleme hatası:', error);
    }
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
            // PROFESSIONAL ENHANCEMENT: Include user preferences in login response
            const userWithPreferences = {
                ...result.user,
                preferences: result.user.preferences || { 
                    avatar: 1, 
                    theme: 'dark', 
                    soundEnabled: true, 
                    backgroundType: 'particles' 
                }
            };
            
            socket.emit('loginSuccess', { 
                token: result.token, 
                user: userWithPreferences, 
                message: result.message 
            });
        } else {
            socket.emit('authError', result.message);
        }
    });
    
    socket.on('verifyAuth', ({ token }) => {
        const result = verifyToken(token);
        if (result.success) {
            // PROFESSIONAL ENHANCEMENT: Include user preferences in auth verification
            const userWithPreferences = {
                ...result.user,
                preferences: result.user.preferences || { 
                    avatar: 1, 
                    theme: 'dark', 
                    soundEnabled: true, 
                    backgroundType: 'particles' 
                }
            };
            socket.emit('authVerified', { user: userWithPreferences });
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

        // PROFESSIONAL ENHANCEMENT: Load user's saved avatar
        const user = Object.values(users).find(u => u.username === name);
        const userAvatar = user?.preferences?.avatar || 1;

        const newPlayer = { id: socket.id, name: name, playerNumber: 1, avatar: userAvatar };
        gameState.hostId = socket.id;
        gameState.players.push(newPlayer);
        gameState.scores[newPlayer.name] = 0;
        
        socket.emit('roomCreated', { roomId, playerDetails: newPlayer });
        broadcastLobbyUpdate(roomId);
        broadcastScoreUpdate(roomId);
    });

    socket.on('joinRoom', async ({ name, roomId }) => {
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
        
        // PROFESSIONAL ENHANCEMENT: Load user's saved avatar from PostgreSQL
        let userAvatar = 1; // Default avatar
        try {
            const userQuery = 'SELECT preferences FROM users WHERE username = $1';
            const userResult = await query(userQuery, [name]);
            if (userResult.rows.length > 0) {
                userAvatar = userResult.rows[0].preferences?.avatar || 1;
            }
        } catch (error) {
            console.error('PostgreSQL avatar yükleme hatası:', error);
        }
        
        const newPlayer = { id: socket.id, name: name, playerNumber: playerNumber, avatar: userAvatar };

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

    socket.on('changeAvatar', async ({ avatar }) => {
        const roomId = getRoomIdFromSocket();
        if (!rooms[roomId]) return;
        
        const gameState = rooms[roomId];
        const player = gameState.players.find(p => p.id === socket.id);
        
        if (player && avatar >= 1 && avatar <= 16) {
            player.avatar = avatar;
            
            // PROFESSIONAL ENHANCEMENT: Save avatar to PostgreSQL user preferences
            try {
                const updateAvatarQuery = `
                    UPDATE users 
                    SET preferences = jsonb_set(preferences, '{avatar}', $1::jsonb)
                    WHERE username = $2
                `;
                await query(updateAvatarQuery, [avatar, player.name]);
                console.log(`✅ Avatar updated in PostgreSQL for ${player.name}: ${avatar}`);
            } catch (error) {
                console.error('❌ PostgreSQL avatar update hatası:', error);
            }
            
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
            updatePlayerWordStatPostgres(currentPlayer.name, normalizedSubmittedWord, gameState.currentCategory, responseTime);
            
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
            updatePlayerWordStatPostgres(playerName, normalizedSubmittedWord, gameState.currentCategory, responseTime);
            
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
    
    socket.on('requestPlayerStats', async ({ playerName }) => {
        const stats = await getPlayerStatsPostgres(playerName);
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
        updatePlayerGameResultPostgres(playerName, score > 0);
        
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
                    updatePlayerGameResultPostgres(player.name, won);
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

