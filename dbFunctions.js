const db = require('./database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Professional Database Functions for User Management

// User Management Functions
const userDB = {
    // Create a new user
    createUser: async (email, username, password) => {
        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            
            const normalizedEmail = email.toLowerCase();
            const normalizedUsername = username.toLowerCase();
            
            // Check if user already exists
            const existingUser = await client.query(
                'SELECT id FROM users WHERE LOWER(email) = $1 OR LOWER(username) = $2',
                [normalizedEmail, normalizedUsername]
            );
            
            if (existingUser.rows.length > 0) {
                throw new Error('Bu email veya kullanıcı adı zaten kullanılıyor.');
            }
            
            // Hash password
            const saltRounds = 10;
            const hashedPassword = await bcrypt.hash(password, saltRounds);
            
            // Generate user ID
            const userId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
            
            // Insert user
            const result = await client.query(`
                INSERT INTO users (id, email, username, hashed_password, created_at, last_login, preferences, game_stats)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING id, email, username, preferences, game_stats
            `, [
                userId,
                normalizedEmail,
                username,
                hashedPassword,
                new Date().toISOString(),
                null,
                JSON.stringify({
                    avatar: 1,
                    theme: 'dark',
                    soundEnabled: true,
                    backgroundType: 'particles'
                }),
                JSON.stringify({
                    totalGames: 0,
                    totalWins: 0,
                    totalCorrectWords: 0,
                    favoriteCategory: '',
                    longestWinStreak: 0,
                    currentWinStreak: 0
                })
            ]);
            
            // Initialize player stats
            await client.query(`
                INSERT INTO player_stats (username, games_played, games_won, win_rate, most_used_words)
                VALUES ($1, 0, 0, 0.00, '[]'::jsonb)
            `, [username]);
            
            await client.query('COMMIT');
            
            const user = result.rows[0];
            return { 
                success: true, 
                userId: user.id, 
                user: user,
                message: 'Hesap başarıyla oluşturuldu!' 
            };
            
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Create user error:', error);
            return { 
                success: false, 
                message: error.message.includes('kullanılıyor') ? error.message : 'Hesap oluşturulurken bir hata oluştu.' 
            };
        } finally {
            client.release();
        }
    },

    // Authenticate user
    authenticateUser: async (email, password) => {
        try {
            const result = await db.query(
                'SELECT * FROM users WHERE LOWER(email) = $1',
                [email.toLowerCase()]
            );
            
            if (result.rows.length === 0) {
                return { success: false, message: 'Email veya şifre hatalı.' };
            }
            
            const user = result.rows[0];
            const isValidPassword = await bcrypt.compare(password, user.hashed_password);
            
            if (!isValidPassword) {
                return { success: false, message: 'Email veya şifre hatalı.' };
            }
            
            // Update last login
            await db.query(
                'UPDATE users SET last_login = $1 WHERE id = $2',
                [new Date().toISOString(), user.id]
            );
            
            // Generate JWT token
            const token = jwt.sign(
                { userId: user.id, username: user.username },
                process.env.JWT_SECRET || 'yeti-kelime-oyunu-secret-key-2024',
                { expiresIn: '7d' }
            );
            
            return { 
                success: true, 
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    username: user.username,
                    preferences: user.preferences,
                    gameStats: user.game_stats
                },
                message: 'Başarıyla giriş yapıldı!' 
            };
            
        } catch (error) {
            console.error('Authenticate user error:', error);
            return { success: false, message: 'Giriş yapılırken bir hata oluştu.' };
        }
    },

    // Update user preferences (avatar, theme, etc.)
    updateUserPreferences: async (username, preferences) => {
        try {
            await db.query(
                'UPDATE users SET preferences = $1 WHERE username = $2',
                [JSON.stringify(preferences), username]
            );
            return { success: true };
        } catch (error) {
            console.error('Update preferences error:', error);
            return { success: false, message: 'Tercihler güncellenirken hata oluştu.' };
        }
    },

    // Get user by username
    getUserByUsername: async (username) => {
        try {
            const result = await db.query(
                'SELECT * FROM users WHERE username = $1',
                [username]
            );
            return result.rows[0] || null;
        } catch (error) {
            console.error('Get user error:', error);
            return null;
        }
    },

    // Verify JWT token
    verifyToken: (token) => {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'yeti-kelime-oyunu-secret-key-2024');
            return { success: true, userId: decoded.userId, username: decoded.username };
        } catch (error) {
            return { success: false, message: 'Geçersiz token.' };
        }
    }
};

// Player Statistics Functions
const statsDB = {
    // Get player statistics
    getPlayerStats: async (username) => {
        try {
            const result = await db.query(
                'SELECT * FROM player_stats WHERE username = $1',
                [username]
            );
            
            if (result.rows.length === 0) {
                // Initialize stats if they don't exist
                await db.query(`
                    INSERT INTO player_stats (username, games_played, games_won, win_rate, most_used_words)
                    VALUES ($1, 0, 0, 0.00, '[]'::jsonb)
                `, [username]);
                
                return {
                    gamesPlayed: 0,
                    gamesWon: 0,
                    winRate: '0.00%',
                    longestWinStreak: 0,
                    currentWinStreak: 0,
                    totalCorrectWords: 0,
                    avgResponseTime: '0.00s',
                    favoriteCategory: 'Henüz oyun oynamamış',
                    lastPlayed: 'Hiç',
                    mostUsedWords: []
                };
            }
            
            const stats = result.rows[0];
            return {
                gamesPlayed: stats.games_played,
                gamesWon: stats.games_won,
                winRate: `${stats.win_rate}%`,
                longestWinStreak: stats.longest_win_streak,
                currentWinStreak: stats.current_win_streak,
                totalCorrectWords: stats.total_correct_words,
                avgResponseTime: `${stats.avg_response_time}s`,
                favoriteCategory: stats.favorite_category || 'Henüz belirlenemedi',
                lastPlayed: stats.last_played ? new Date(stats.last_played).toLocaleDateString('tr-TR') : 'Hiç',
                mostUsedWords: stats.most_used_words || []
            };
            
        } catch (error) {
            console.error('Get player stats error:', error);
            return null;
        }
    },

    // Update player statistics
    updatePlayerStats: async (username, gameData) => {
        try {
            const client = await db.getClient();
            await client.query('BEGIN');
            
            // Get current stats
            const currentStats = await client.query(
                'SELECT * FROM player_stats WHERE username = $1',
                [username]
            );
            
            if (currentStats.rows.length === 0) {
                // Create new stats record
                await client.query(`
                    INSERT INTO player_stats (username, games_played, games_won, win_rate, most_used_words)
                    VALUES ($1, 1, $2, $3, '[]'::jsonb)
                `, [username, gameData.won ? 1 : 0, gameData.won ? 100.00 : 0.00]);
            } else {
                const stats = currentStats.rows[0];
                const newGamesPlayed = stats.games_played + 1;
                const newGamesWon = stats.games_won + (gameData.won ? 1 : 0);
                const newWinRate = ((newGamesWon / newGamesPlayed) * 100).toFixed(2);
                
                await client.query(`
                    UPDATE player_stats SET
                        games_played = $1,
                        games_won = $2,
                        win_rate = $3,
                        last_played = $4
                    WHERE username = $5
                `, [newGamesPlayed, newGamesWon, parseFloat(newWinRate), new Date().toISOString(), username]);
            }
            
            await client.query('COMMIT');
            return { success: true };
            
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Update player stats error:', error);
            return { success: false };
        } finally {
            client.release();
        }
    }
};

module.exports = { userDB, statsDB };
