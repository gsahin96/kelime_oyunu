const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require("socket.io");
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('./database'); // PostgreSQL database functions (optional)
const dbFunctions = require('./dbFunctions'); // Additional DB helper functions

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'yeti-kelime-oyunu-secret-key-2024';
const USE_POSTGRES = !!process.env.DATABASE_URL;

const dbPath = path.join(__dirname, 'database.json');
const usersPath = path.join(__dirname, 'users.json');
const statsPath = path.join(__dirname, 'player_stats.json');

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/test.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'test.html'));
});

// Helpers for local JSON persistence
function readJSON(file) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        return {};
    }
}
function writeJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

// Users local helpers
function getUsersMap() { return readJSON(usersPath); }
function saveUsersMap(map) { writeJSON(usersPath, map); }
function getUserByEmailLocal(email) {
    const map = getUsersMap();
    const lower = email.toLowerCase();
    return Object.values(map).find(u => (u.email || '').toLowerCase() === lower) || null;
}
function getUserByUsernameLocal(username) {
    const map = getUsersMap();
    return Object.values(map).find(u => (u.username || '').toLowerCase() === username.toLowerCase()) || null;
}
async function createUserLocal(email, username, password) {
    const users = getUsersMap();
    if (getUserByEmailLocal(email)) return { success: false, message: 'Bu e-posta adresi zaten kullanılıyor.' };
    if (getUserByUsernameLocal(username)) return { success: false, message: 'Bu kullanıcı adı zaten alınmış.' };
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const hashed = await bcrypt.hash(password, 10);
    users[id] = { id, email: email.toLowerCase(), username, hashedPassword: hashed, createdAt: new Date().toISOString(), lastLogin: null, preferences: { avatar: 1, theme: 'dark', soundEnabled: true, backgroundType: 'particles' }, gameStats: { totalGames: 0, totalWins: 0, totalCorrectWords: 0, favoriteCategory: '', longestWinStreak: 0, currentWinStreak: 0 } };
    saveUsersMap(users);
    const stats = readJSON(statsPath);
    if (!stats[username]) {
        stats[username] = { gamesPlayed: 0, gamesWon: 0, winRate: 0, longestWinStreak: 0, currentWinStreak: 0, totalCorrectWords: 0, totalResponseTime: 0, responseCount: 0, favoriteCategory: '', lastPlayed: new Date().toISOString(), wordsUsed: {}, categoriesPlayed: {}, achievements: [] };
        writeJSON(statsPath, stats);
    }
    return { success: true, userId: id, message: 'Hesap başarıyla oluşturuldu!' };
}
async function authenticateUserLocal(email, password) {
    const user = getUserByEmailLocal(email);
    if (!user) return { success: false, message: 'E-posta veya şifre hatalı.' };
    const ok = await bcrypt.compare(password, user.hashedPassword);
    if (!ok) return { success: false, message: 'E-posta veya şifre hatalı.' };
    const users = getUsersMap();
    users[user.id].lastLogin = new Date().toISOString();
    saveUsersMap(users);
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
    return { success: true, token, user: { id: user.id, username: user.username, email: user.email, createdAt: user.createdAt, lastLogin: new Date(), preferences: user.preferences || { avatar: 1, theme: 'dark', soundEnabled: true, backgroundType: 'particles' }, gameStats: user.gameStats || {} }, message: 'Giriş başarılı!' };
}
async function verifyTokenLocal(token) {
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const users = getUsersMap();
        const user = users[decoded.userId];
        if (!user) return { success: false, message: 'Kullanıcı bulunamadı.' };
        return { success: true, user: { id: user.id, username: user.username, email: user.email, preferences: user.preferences || { avatar: 1, theme: 'dark', soundEnabled: true, backgroundType: 'particles' }, gameStats: user.gameStats || {} } };
    } catch (e) {
        return { success: false, message: 'Geçersiz token.' };
    }
}
function getPlayerStatsLocal(username) {
    const stats = readJSON(statsPath);
    const s = stats[username];
    if (!s) {
        return { gamesPlayed: 0, gamesWon: 0, winRate: 0, totalCorrectWords: 0, avgResponseTime: 0, longestWinStreak: 0, currentWinStreak: 0, favoriteCategory: 'Henüz yok', lastPlayed: new Date(), mostUsedWords: [] };
    }
    const avg = s.responseCount > 0 ? s.totalResponseTime / s.responseCount : 0;
    return { gamesPlayed: s.gamesPlayed || 0, gamesWon: s.gamesWon || 0, winRate: Number(((s.gamesWon || 0) / Math.max(1, s.gamesPlayed || 0)) * 100), totalCorrectWords: s.totalCorrectWords || 0, avgResponseTime: Number(avg.toFixed(2)), longestWinStreak: s.longestWinStreak || 0, currentWinStreak: s.currentWinStreak || 0, favoriteCategory: s.favoriteCategory || 'Henüz yok', lastPlayed: s.lastPlayed || new Date(), mostUsedWords: Object.entries(s.wordsUsed || {}).map(([w, c]) => ({ word: w, count: c })) };
}
function updatePlayerWordStatLocal(username, word, category, responseTime) {
    const stats = readJSON(statsPath);
    if (!stats[username]) stats[username] = { gamesPlayed: 0, gamesWon: 0, winRate: 0, longestWinStreak: 0, currentWinStreak: 0, totalCorrectWords: 0, totalResponseTime: 0, responseCount: 0, favoriteCategory: '', lastPlayed: new Date().toISOString(), wordsUsed: {}, categoriesPlayed: {}, achievements: [] };
    const s = stats[username];
    s.totalCorrectWords = (s.totalCorrectWords || 0) + 1;
    s.totalResponseTime = (s.totalResponseTime || 0) + (responseTime || 0);
    s.responseCount = (s.responseCount || 0) + 1;
    if (!s.wordsUsed[word]) s.wordsUsed[word] = 0; s.wordsUsed[word]++;
    if (s.favoriteCategory === '' || !s.favoriteCategory) s.favoriteCategory = category;
    s.lastPlayed = new Date().toISOString();
    writeJSON(statsPath, stats);
}
function updatePlayerGameResultLocal(username, won) {
    const stats = readJSON(statsPath);
    if (!stats[username]) stats[username] = { gamesPlayed: 0, gamesWon: 0, winRate: 0, longestWinStreak: 0, currentWinStreak: 0, totalCorrectWords: 0, totalResponseTime: 0, responseCount: 0, favoriteCategory: '', lastPlayed: new Date().toISOString(), wordsUsed: {}, categoriesPlayed: {}, achievements: [] };
    const s = stats[username];
    s.gamesPlayed = (s.gamesPlayed || 0) + 1;
    if (won) {
        s.gamesWon = (s.gamesWon || 0) + 1;
        s.currentWinStreak = (s.currentWinStreak || 0) + 1;
        s.longestWinStreak = Math.max(s.longestWinStreak || 0, s.currentWinStreak);
    } else {
        s.currentWinStreak = 0;
    }
    s.winRate = Number((((s.gamesWon || 0) / (s.gamesPlayed || 1)) * 100).toFixed(2));
    s.lastPlayed = new Date().toISOString();
    writeJSON(statsPath, stats);
}
function updateUserAvatarLocal(username, avatar) {
    const users = getUsersMap();
    const user = getUserByUsernameLocal(username);
    if (!user) return;
    users[user.id].preferences = users[user.id].preferences || {};
    users[user.id].preferences.avatar = avatar;
    saveUsersMap(users);
}
async function getUserAvatar(username) {
    // Try DB first if configured
    if (USE_POSTGRES) {
        try {
            const result = await db.query('SELECT preferences FROM users WHERE username = $1', [username]);
            if (result.rows.length > 0) return result.rows[0].preferences?.avatar || 1;
        } catch (e) { /* fallback below */ }
    }
    const user = getUserByUsernameLocal(username);
    return (user && user.preferences && user.preferences.avatar) ? user.preferences.avatar : 1;
}

// Word database (JSON) for gameplay
let database = {};
try {
    database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    console.log("✅ Kelime veritabanı (JSON) yüklendi");
} catch (error) {
    console.error("❌ database.json dosyası yüklenemedi:", error);
    database = {};
}

let rooms = {};
let pendingRegistrations = new Set();

const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '');
const validateUsername = (username) => username && username.length >= 3 && username.length <= 20 && /^[a-zA-Z0-9_çğıöşüÇĞIİÖŞÜ]+$/.test(username);
const validatePassword = (password) => password && password.length >= 6;

// Unified auth API with Postgres or local fallback
const createUser = async (email, username, password) => {
    try {
        const normalizedEmail = (email || '').toLowerCase();
        const normalizedUsername = (username || '').toLowerCase();
        const registrationKey = `${normalizedEmail}:${normalizedUsername}`;
        if (pendingRegistrations.has(registrationKey)) return { success: false, message: 'Kayıt işlemi devam ediyor, lütfen bekleyin.' };
        pendingRegistrations.add(registrationKey);
        try {
            if (USE_POSTGRES) {
                const existingUserQuery = 'SELECT id, email, username FROM users WHERE LOWER(email) = $1 OR LOWER(username) = $2';
                const existingResult = await db.query(existingUserQuery, [normalizedEmail, normalizedUsername]);
                if (existingResult.rows.length > 0) {
                    const existingUser = existingResult.rows[0];
                    if ((existingUser.email || '').toLowerCase() === normalizedEmail) return { success: false, message: 'Bu e-posta adresi zaten kullanılıyor.' };
                    if ((existingUser.username || '').toLowerCase() === normalizedUsername) return { success: false, message: 'Bu kullanıcı adı zaten alınmış.' };
                }
                const hashedPassword = await bcrypt.hash(password, 10);
                const userId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
                const preferences = { avatar: 1, theme: 'dark', soundEnabled: true, backgroundType: 'particles' };
                const gameStats = { totalGames: 0, totalWins: 0, totalCorrectWords: 0, favoriteCategory: '', longestWinStreak: 0, currentWinStreak: 0 };
                await db.query(`
                    INSERT INTO users (id, email, username, hashed_password, created_at, preferences, game_stats)
                    VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5, $6)
                `, [userId, normalizedEmail, username, hashedPassword, JSON.stringify(preferences), JSON.stringify(gameStats)]);
                // init stats
                await db.query(`
                    INSERT INTO player_stats (username, games_played, games_won, win_rate, longest_win_streak, current_win_streak, total_correct_words, avg_response_time, favorite_category, last_played, most_used_words)
                    VALUES ($1, 0, 0, 0.00, 0, 0, 0, 0.00, '', CURRENT_TIMESTAMP, '[]'::jsonb)
                    ON CONFLICT (username) DO NOTHING
                `, [username]);
                return { success: true, userId, message: 'Hesap başarıyla oluşturuldu!' };
            }
            return await createUserLocal(email, username, password);
        } finally {
            pendingRegistrations.delete(registrationKey);
        }
    } catch (error) {
        console.error('Kullanıcı oluşturma hatası:', error);
        return { success: false, message: 'Hesap oluşturulurken bir hata oluştu.' };
    }
};

const authenticateUser = async (email, password) => {
    try {
        if (USE_POSTGRES) {
            const userResult = await db.query('SELECT * FROM users WHERE LOWER(email) = $1', [email.toLowerCase()]);
            if (userResult.rows.length === 0) return { success: false, message: 'E-posta veya şifre hatalı.' };
            const user = userResult.rows[0];
            const passwordMatch = await bcrypt.compare(password, user.hashed_password);
            if (!passwordMatch) return { success: false, message: 'E-posta veya şifre hatalı.' };
            await db.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
            const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
            return {
                success: true,
                token,
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
        }
        return await authenticateUserLocal(email, password);
    } catch (error) {
        console.error('Authentication hatası:', error);
        return { success: false, message: 'Giriş işleminde hata oluştu.' };
    }
};

const verifyToken = async (token) => {
    if (USE_POSTGRES) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            const userResult = await db.query('SELECT id, username, email, preferences, game_stats FROM users WHERE id = $1', [decoded.userId]);
            if (userResult.rows.length > 0) {
                const user = userResult.rows[0];
                return { success: true, user: { id: user.id, username: user.username, email: user.email, preferences: user.preferences, gameStats: user.game_stats } };
            }
            return { success: false, message: 'Kullanıcı bulunamadı.' };
        } catch (error) {
            return { success: false, message: 'Geçersiz token.' };
        }
    }
    return await verifyTokenLocal(token);
};

const getPlayerStatsPostgres = async (playerName) => {
    if (USE_POSTGRES) {
        try {
            const statsQuery = 'SELECT * FROM player_stats WHERE username = $1';
            const result = await db.query(statsQuery, [playerName]);
            if (result.rows.length === 0) {
                await db.query(`
                    INSERT INTO player_stats (username, games_played, games_won, win_rate, longest_win_streak, current_win_streak, total_correct_words, avg_response_time, favorite_category, last_played, most_used_words)
                    VALUES ($1, 0, 0, 0.00, 0, 0, 0, 0.00, '', CURRENT_TIMESTAMP, '[]'::jsonb)
                    ON CONFLICT (username) DO NOTHING
                `, [playerName]);
                return await getPlayerStatsPostgres(playerName);
            }
            const stats = result.rows[0];
            return { gamesPlayed: stats.games_played, gamesWon: stats.games_won, winRate: parseFloat(stats.win_rate), totalCorrectWords: stats.total_correct_words, avgResponseTime: parseFloat(stats.avg_response_time), longestWinStreak: stats.longest_win_streak, currentWinStreak: stats.current_win_streak, favoriteCategory: stats.favorite_category || 'Henüz yok', lastPlayed: stats.last_played, mostUsedWords: stats.most_used_words || [] };
        } catch (error) {
            console.error('PostgreSQL stats getirme hatası:', error);
        }
    }
    return getPlayerStatsLocal(playerName);
};

const updatePlayerWordStatPostgres = async (playerName, word, category, responseTime) => {
    if (USE_POSTGRES) {
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
            await db.query(updateQuery, [playerName, category, responseTime, word]);
            return;
        } catch (error) {
            console.error('PostgreSQL word stat güncelleme hatası:', error);
        }
    }
    updatePlayerWordStatLocal(playerName, word, category, responseTime);
};

const updatePlayerGameResultPostgres = async (playerName, won) => {
    if (USE_POSTGRES) {
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
                await db.query(updateWinQuery, [playerName]);
            } else {
                const updateLossQuery = `
                    UPDATE player_stats 
                    SET games_played = games_played + 1,
                        win_rate = (games_won::decimal / (games_played + 1)) * 100,
                        current_win_streak = 0,
                        last_played = CURRENT_TIMESTAMP
                    WHERE username = $1
                `;
                await db.query(updateLossQuery, [playerName]);
            }
            return;
        } catch (error) {
            console.error('PostgreSQL game result güncelleme hatası:', error);
        }
    }
    updatePlayerGameResultLocal(playerName, won);
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
    settings: { scoreGoal: 10, turnDuration: 5 },
    countdownInterval: null,
    turnResolved: false,
    usedLettersThisGame: [],
    turnStartTime: null,
    isSinglePlayer: false,
});

const normalizeWord = (word) => {
    if (!word) return '';
    return word.trim().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").toLocaleLowerCase('tr-TR');
};

io.on('connection', (socket) => {
    const getRoomIdFromSocket = () => Array.from(socket.rooms).find(r => r !== socket.id);

    // Authentication handlers
    socket.on('register', async ({ email, username, password }) => {
        if (!validateEmail(email)) return socket.emit('authError', 'Geçerli bir e-posta adresi girin.');
        if (!validateUsername(username)) return socket.emit('authError', 'Kullanıcı adı 3-20 karakter olmalı ve sadece harf, rakam ve _ içermelidir.');
        if (!validatePassword(password)) return socket.emit('authError', 'Şifre en az 6 karakter olmalıdır.');
        const result = await createUser(email, username, password);
        if (result.success) socket.emit('registerSuccess', result.message);
        else socket.emit('authError', result.message);
    });

    socket.on('login', async ({ email, password }) => {
        if (!email || !password) return socket.emit('authError', 'E-posta ve şifre gereklidir.');
        const result = await authenticateUser(email, password);
        if (result.success) {
            const userWithPreferences = { ...result.user, preferences: result.user.preferences || { avatar: 1, theme: 'dark', soundEnabled: true, backgroundType: 'particles' } };
            socket.emit('loginSuccess', { token: result.token, user: userWithPreferences, message: result.message });
        } else {
            socket.emit('authError', result.message);
        }
    });

    socket.on('verifyAuth', async ({ token }) => {
        const result = await verifyToken(token);
        if (result.success) {
            const userWithPreferences = { ...result.user, preferences: result.user.preferences || { avatar: 1, theme: 'dark', soundEnabled: true, backgroundType: 'particles' } };
            socket.emit('authVerified', { user: userWithPreferences });
        } else {
            socket.emit('authError', result.message);
        }
    });

    socket.on('createRoom', async ({ name }) => {
        let roomId;
        do { roomId = Math.random().toString(36).substring(2, 8).toUpperCase(); } while (rooms[roomId]);
        socket.join(roomId);
        rooms[roomId] = createInitialGameState();
        const gameState = rooms[roomId];

        let userAvatar = 1;
        try { userAvatar = await getUserAvatar(name); } catch (e) {}

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
        if (!room) return socket.emit('gameError', 'Oda bulunamadı.');
        if (room.players.length >= 8) return socket.emit('gameError', 'Oda dolu.');
        if (room.gameInProgress) return socket.emit('gameError', 'Oyun çoktan başladı.');

        socket.join(roomId);
        const gameState = room;
        const playerNumber = gameState.players.length + 1;

        let userAvatar = 1;
        try { userAvatar = await getUserAvatar(name); } catch (e) {}

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
            if (USE_POSTGRES) {
                try {
                    await db.query(`UPDATE users SET preferences = jsonb_set(preferences, '{avatar}', to_jsonb($1::int)) WHERE username = $2`, [avatar, player.name]);
                } catch (error) { console.error('❌ PostgreSQL avatar update hatası:', error); }
            } else {
                updateUserAvatarLocal(player.name, avatar);
            }
            io.to(roomId).emit('lobbyUpdate', { players: gameState.players, gameHostId: gameState.hostId, settings: gameState.settings });
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
        if (availableLetters.length === 0) { gameState.usedLettersThisGame = []; availableLetters = [...alphabet]; }
        while (!validCombo) {
            letter = availableLetters[Math.floor(Math.random() * availableLetters.length)];
            category = categories[Math.floor(Math.random() * categories.length)];
            const normalizedLetter = letter.toLocaleLowerCase('tr-TR');
            if (database[category]?.[normalizedLetter] && database[category][normalizedLetter].length > 0) validCombo = true;
        }
        gameState.currentLetter = letter;
        gameState.currentCategory = category;
        gameState.usedLettersThisGame.push(letter);
        io.to(roomId).emit('diceRolling', { finalLetterIndex: alphabet.indexOf(letter), finalCategoryIndex: categories.indexOf(category), letter, category });
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
        if (gameState.isSinglePlayer) handleSinglePlayerWord(roomId, word);
        else handleMultiplayerWord(roomId, word);
    });

    function handleMultiplayerWord(roomId, word) {
        const gameState = rooms[roomId];
        const currentPlayer = gameState.activePlayersInRound[gameState.currentPlayerIndex];
        if (!currentPlayer || socket.id !== currentPlayer.id) return;
        clearInterval(gameState.countdownInterval);
        gameState.turnResolved = true;
        const responseTime = gameState.turnStartTime ? (Date.now() - gameState.turnStartTime) / 1000 : 0;
        const normalizedSubmittedWord = normalizeWord(word);
        const normalizedLetter = normalizeWord(gameState.currentLetter);
        const dbWords = database[gameState.currentCategory]?.[normalizedLetter] || [];
        const isCorrect = normalizedSubmittedWord.startsWith(normalizedLetter) && dbWords.includes(normalizedSubmittedWord) && !gameState.usedWords.includes(normalizedSubmittedWord);
        if (isCorrect) {
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
        const responseTime = gameState.turnStartTime ? (Date.now() - gameState.turnStartTime) / 1000 : 0;
        const normalizedSubmittedWord = normalizeWord(word);
        const normalizedLetter = normalizeWord(gameState.currentLetter);
        const dbWords = database[gameState.currentCategory]?.[normalizedLetter] || [];
        const isCorrect = normalizedSubmittedWord.startsWith(normalizedLetter) && dbWords.includes(normalizedSubmittedWord) && !gameState.usedWords.includes(normalizedSubmittedWord);
        if (isCorrect) {
            const playerName = gameState.players[0].name;
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
            rooms[roomId] = { ...createInitialGameState(), players: gameState.players, hostId: gameState.hostId, scores: Object.fromEntries(gameState.players.map(p => [p.name, 0])), settings: gameState.settings };
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
        if (gameState.countdownInterval) clearInterval(gameState.countdownInterval);
        if (gameState.isSinglePlayer) { delete rooms[roomId]; return; }
        const leavingPlayer = gameState.players.find(p => p.id === socket.id);
        if (!leavingPlayer) return;
        const wasHost = leavingPlayer.id === gameState.hostId;
        gameState.players = gameState.players.filter(p => p.id !== socket.id);
        if (gameState.players.length === 0) { delete rooms[roomId]; return; }
        if (wasHost) gameState.hostId = gameState.players[0].id;
        if (gameState.roundInProgress) {
            const activePlayerIndex = gameState.activePlayersInRound.findIndex(p => p.id === socket.id);
            if (activePlayerIndex !== -1) {
                const wasCurrentPlayer = activePlayerIndex === gameState.currentPlayerIndex;
                gameState.activePlayersInRound.splice(activePlayerIndex, 1);
                if (gameState.activePlayersInRound.length <= 1) { handleRoundOver(roomId); }
                else if (wasCurrentPlayer) { startTurn(roomId); }
                else if (gameState.currentPlayerIndex > activePlayerIndex) { gameState.currentPlayerIndex--; }
            }
        } else {
            broadcastLobbyUpdate(roomId);
        }
        socket.leave(roomId);
    });

    socket.on('disconnect', () => {
        const roomId = getRoomIdFromSocket();
        if (!roomId || !rooms[roomId]) return;
        const gameState = rooms[roomId];
        if (gameState.countdownInterval) clearInterval(gameState.countdownInterval);
        if (gameState.isSinglePlayer) { delete rooms[roomId]; return; }
        const disconnectedPlayer = gameState.players.find(p => p.id === socket.id);
        if (!disconnectedPlayer) return;
        const wasHost = disconnectedPlayer.id === gameState.hostId;
        gameState.players = gameState.players.filter(p => p.id !== socket.id);
        if (gameState.players.length === 0) { delete rooms[roomId]; return; }
        if (wasHost) gameState.hostId = gameState.players[0].id;
        if (gameState.roundInProgress) {
            const activePlayerIndex = gameState.activePlayersInRound.findIndex(p => p.id === socket.id);
            if (activePlayerIndex !== -1) {
                const wasCurrentPlayer = activePlayerIndex === gameState.currentPlayerIndex;
                gameState.activePlayersInRound.splice(activePlayerIndex, 1);
                if (gameState.activePlayersInRound.length <= 1) handleRoundOver(roomId);
                else if (wasCurrentPlayer) startTurn(roomId);
                else if (gameState.currentPlayerIndex > activePlayerIndex) gameState.currentPlayerIndex--;
            }
        }
        broadcastLobbyUpdate(roomId);
        broadcastScoreUpdate(roomId);
    });

    function broadcastLobbyUpdate(roomId) {
        const gameState = rooms[roomId];
        if (!gameState) return;
        io.to(roomId).emit('lobbyUpdate', { players: gameState.players, gameHostId: gameState.hostId, settings: gameState.settings, gameInProgress: gameState.gameInProgress });
    }

    function broadcastScoreUpdate(roomId, isGameOver = false) {
        const gameState = rooms[roomId];
        if (!gameState) return;
        io.to(roomId).emit('scoreUpdate', { scores: gameState.scores, isGameOver });
    }

    function resumeGameAfterDecision(roomId) {
        const gameState = rooms[roomId];
        if (!gameState) return;
        if (gameState.activePlayersInRound.length <= 1) handleRoundOver(roomId);
        else nextTurn(roomId);
    }

    function startTurn(roomId) {
        const gameState = rooms[roomId];
        if (!gameState) return;
        if (gameState.activePlayersInRound.length < 1) return handleRoundOver(roomId, 'Oyuncu kalmadı');
        gameState.roundInProgress = true;
        gameState.turnResolved = false;
        gameState.turnStartTime = Date.now();
        if (gameState.currentPlayerIndex >= gameState.activePlayersInRound.length) gameState.currentPlayerIndex = 0;
        const currentPlayer = gameState.activePlayersInRound[gameState.currentPlayerIndex];
        if (!currentPlayer) return handleRoundOver(roomId, 'Hata: Oyuncu bulunamadı');
        let timeLeft = gameState.settings.turnDuration;
        io.to(roomId).emit('turnUpdate', { player: currentPlayer, timeLeft, activePlayersCount: gameState.activePlayersInRound.length, letter: gameState.currentLetter, category: gameState.currentCategory });
        clearInterval(gameState.countdownInterval);
        gameState.countdownInterval = setInterval(() => {
            timeLeft--;
            io.to(roomId).emit('countdown', timeLeft);
            if (timeLeft <= 0) {
                clearInterval(gameState.countdownInterval);
                setTimeout(() => { if (!gameState.turnResolved) handlePlayerElimination(roomId, currentPlayer, 'Süre doldu'); }, 500);
            }
        }, 1000);
    }

    function startSinglePlayerTurn(roomId) {
        const gameState = rooms[roomId];
        if (!gameState || !gameState.gameInProgress) return;
        gameState.roundInProgress = true;
        gameState.turnStartTime = Date.now();
        const alphabet = 'ABCÇDEFHIİJKLMNOÖPRSŞTUÜVYZ'.split('');
        const categories = ['İsim', 'Hayvan', 'Bitki/Meyve/Sebze', 'Ülke/Şehir/İlçe', 'Eşya', 'Meslek'];
        let letter, category, validCombo = false;
        while (!validCombo) {
            letter = alphabet[Math.floor(Math.random() * alphabet.length)];
            category = categories[Math.floor(Math.random() * categories.length)];
            const normalizedLetter = letter.toLocaleLowerCase('tr-TR');
            if (database[category]?.[normalizedLetter] && database[category][normalizedLetter].length > 0) validCombo = true;
        }
        gameState.currentLetter = letter;
        gameState.currentCategory = category;
        const playerName = gameState.players[0].name;
        let timeLeft = 5;
        io.to(roomId).emit('singlePlayerTurnUpdate', { letter, category, score: gameState.scores[playerName], timeLeft });
        clearInterval(gameState.countdownInterval);
        gameState.countdownInterval = setInterval(() => {
            timeLeft--;
            io.to(roomId).emit('singlePlayerCountdown', timeLeft);
            if (timeLeft <= 0) { clearInterval(gameState.countdownInterval); handleSinglePlayerGameOver(roomId); }
        }, 1000);
    }

    function handleSinglePlayerGameOver(roomId) {
        const gameState = rooms[roomId];
        if (!gameState) return;
        clearInterval(gameState.countdownInterval);
        gameState.gameInProgress = false;
        const score = gameState.scores[gameState.players[0].name];
        const playerName = gameState.players[0].name;
        updatePlayerGameResultPostgres(playerName, score > 0);
        io.to(roomId).emit('singlePlayerGameOver', { score });
    }

    function nextTurn(roomId) {
        const gameState = rooms[roomId];
        if (!gameState) return;
        if (gameState.activePlayersInRound.length <= 1) return handleRoundOver(roomId);
        gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.activePlayersInRound.length;
        startTurn(roomId);
    }

    function handlePlayerElimination(roomId, player, reason, spokenWord = null) {
        const gameState = rooms[roomId];
        if (!gameState) return;
        const eliminatedPlayerIndex = gameState.activePlayersInRound.findIndex(p => p.id === player.id);
        if (eliminatedPlayerIndex === -1) return;
        gameState.activePlayersInRound.splice(eliminatedPlayerIndex, 1);
        io.to(roomId).emit('playerEliminated', { loserId: player.id, loserName: player.name, reason, word: spokenWord });
        if (reason === 'Yanlış veya tekrar edilmiş kelime' && spokenWord && gameState.hostId) {
            io.to(gameState.hostId).emit('askHostAboutWord', { word: spokenWord, category: gameState.currentCategory, letter: gameState.currentLetter });
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
        if (winner && gameState.scores[winner.name] !== undefined) gameState.scores[winner.name]++;
        io.to(roomId).emit('roundOver', { reason, winner: winner ? winner.name : null });
        broadcastScoreUpdate(roomId);
        setTimeout(() => {
            const finalWinner = Object.entries(gameState.scores).find(([, score]) => score >= gameState.settings.scoreGoal);
            if (finalWinner) {
                gameState.players.forEach(player => { const won = player.name === finalWinner[0]; updatePlayerGameResultPostgres(player.name, won); });
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
