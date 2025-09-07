// Fixed database schema setup
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function setupSchema() {
    const client = await pool.connect();
    
    try {
        console.log('🏗️  Setting up database schema...');
        
        // 1. Create users table first
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(50) PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                username VARCHAR(100) UNIQUE NOT NULL,
                hashed_password TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP,
                preferences JSONB DEFAULT '{
                    "avatar": 1,
                    "theme": "dark",
                    "soundEnabled": true,
                    "backgroundType": "particles"
                }'::jsonb,
                game_stats JSONB DEFAULT '{
                    "totalGames": 0,
                    "totalWins": 0,
                    "totalCorrectWords": 0,
                    "favoriteCategory": "",
                    "longestWinStreak": 0,
                    "currentWinStreak": 0
                }'::jsonb
            );
        `);
        console.log('✅ Created users table');
        
        // 2. Create player_stats table
        await client.query(`
            CREATE TABLE IF NOT EXISTS player_stats (
                id SERIAL PRIMARY KEY,
                username VARCHAR(100) UNIQUE NOT NULL,
                games_played INTEGER DEFAULT 0,
                games_won INTEGER DEFAULT 0,
                win_rate DECIMAL(5,2) DEFAULT 0.00,
                longest_win_streak INTEGER DEFAULT 0,
                current_win_streak INTEGER DEFAULT 0,
                total_correct_words INTEGER DEFAULT 0,
                avg_response_time DECIMAL(5,2) DEFAULT 0.00,
                favorite_category VARCHAR(100) DEFAULT '',
                last_played TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                most_used_words JSONB DEFAULT '[]'::jsonb
            );
        `);
        console.log('✅ Created player_stats table');
        
        // 3. Create game_sessions table
        await client.query(`
            CREATE TABLE IF NOT EXISTS game_sessions (
                id SERIAL PRIMARY KEY,
                room_id VARCHAR(20) NOT NULL,
                host_username VARCHAR(100) NOT NULL,
                players JSONB NOT NULL,
                start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                end_time TIMESTAMP,
                winner VARCHAR(100),
                total_rounds INTEGER DEFAULT 0,
                game_settings JSONB DEFAULT '{}'::jsonb,
                words_used JSONB DEFAULT '[]'::jsonb
            );
        `);
        console.log('✅ Created game_sessions table');
        
        // 4. Create word_submissions table
        await client.query(`
            CREATE TABLE IF NOT EXISTS word_submissions (
                id SERIAL PRIMARY KEY,
                game_session_id INTEGER REFERENCES game_sessions(id),
                username VARCHAR(100) NOT NULL,
                word VARCHAR(100) NOT NULL,
                category VARCHAR(100) NOT NULL,
                letter VARCHAR(1) NOT NULL,
                is_correct BOOLEAN NOT NULL,
                submission_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                round_number INTEGER NOT NULL
            );
        `);
        console.log('✅ Created word_submissions table');
        
        // 5. Create indexes
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
            'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)',
            'CREATE INDEX IF NOT EXISTS idx_player_stats_username ON player_stats(username)',
            'CREATE INDEX IF NOT EXISTS idx_game_sessions_room_id ON game_sessions(room_id)',
            'CREATE INDEX IF NOT EXISTS idx_word_submissions_username ON word_submissions(username)',
            'CREATE INDEX IF NOT EXISTS idx_word_submissions_game_session ON word_submissions(game_session_id)'
        ];
        
        for (const indexSQL of indexes) {
            await client.query(indexSQL);
        }
        console.log('✅ Created indexes');
        
        console.log('🎉 Database schema setup completed successfully!');
        
    } catch (error) {
        console.error('❌ Schema setup failed:', error.message);
    } finally {
        client.release();
        await pool.end();
    }
}

setupSchema();
