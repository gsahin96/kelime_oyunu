const fs = require('fs');
const path = require('path');
const db = require('./database');

// Migration script to move from JSON files to PostgreSQL
async function migrateData() {
    console.log('🚀 Starting data migration from JSON to PostgreSQL...');
    
    try {
        // 1. Migrate Users
        console.log('👥 Migrating users...');
        const usersPath = path.join(__dirname, 'users.json');
        if (fs.existsSync(usersPath)) {
            const usersData = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
            
            for (const [userId, userData] of Object.entries(usersData)) {
                const { id, email, username, hashedPassword, createdAt, lastLogin } = userData;
                
                // Ensure user has preferences and gameStats
                const preferences = userData.preferences || {
                    avatar: 1,
                    theme: 'dark',
                    soundEnabled: true,
                    backgroundType: 'particles'
                };
                
                const gameStats = userData.gameStats || {
                    totalGames: 0,
                    totalWins: 0,
                    totalCorrectWords: 0,
                    favoriteCategory: '',
                    longestWinStreak: 0,
                    currentWinStreak: 0
                };
                
                try {
                    await db.query(`
                        INSERT INTO users (id, email, username, hashed_password, created_at, last_login, preferences, game_stats)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                        ON CONFLICT (id) DO UPDATE SET
                            preferences = $7,
                            game_stats = $8,
                            last_login = $6
                    `, [id, email, username, hashedPassword, createdAt, lastLogin, JSON.stringify(preferences), JSON.stringify(gameStats)]);
                    
                    console.log(`✅ Migrated user: ${username}`);
                } catch (error) {
                    console.error(`❌ Error migrating user ${username}:`, error.message);
                }
            }
        }
        
        // 2. Migrate Player Statistics
        console.log('📊 Migrating player statistics...');
        const statsPath = path.join(__dirname, 'player_stats.json');
        if (fs.existsSync(statsPath)) {
            const statsData = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
            
            for (const [username, stats] of Object.entries(statsData)) {
                try {
                    await db.query(`
                        INSERT INTO player_stats (
                            username, games_played, games_won, win_rate, longest_win_streak,
                            current_win_streak, total_correct_words, avg_response_time,
                            favorite_category, last_played, most_used_words
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                        ON CONFLICT (username) DO UPDATE SET
                            games_played = $2,
                            games_won = $3,
                            win_rate = $4,
                            longest_win_streak = $5,
                            current_win_streak = $6,
                            total_correct_words = $7,
                            avg_response_time = $8,
                            favorite_category = $9,
                            last_played = $10,
                            most_used_words = $11
                    `, [
                        username,
                        stats.gamesPlayed || 0,
                        stats.gamesWon || 0,
                        parseFloat(stats.winRate) || 0.00,
                        stats.longestWinStreak || 0,
                        stats.currentWinStreak || 0,
                        stats.totalCorrectWords || 0,
                        parseFloat(stats.avgResponseTime) || 0.00,
                        stats.favoriteCategory || '',
                        stats.lastPlayed || new Date().toISOString(),
                        JSON.stringify(stats.mostUsedWords || [])
                    ]);
                    
                    console.log(`✅ Migrated stats for: ${username}`);
                } catch (error) {
                    console.error(`❌ Error migrating stats for ${username}:`, error.message);
                }
            }
        }
        
        console.log('🎉 Data migration completed successfully!');
        console.log('📝 Recommendation: Backup your JSON files and update your server to use PostgreSQL');
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
    }
}

// Run migration if called directly
if (require.main === module) {
    migrateData()
        .then(() => {
            console.log('✅ Migration script completed');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Migration script failed:', error);
            process.exit(1);
        });
}

module.exports = { migrateData };
