-- Kelime Oyunu Database Schema
-- Professional PostgreSQL structure for Turkish Word Game

-- Users table - stores user accounts and preferences
CREATE TABLE users (
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

-- Player statistics table - detailed game performance
CREATE TABLE player_stats (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    games_played INTEGER DEFAULT 0,
    games_won INTEGER DEFAULT 0,
    win_rate DECIMAL(5,2) DEFAULT 0.00,
    longest_win_streak INTEGER DEFAULT 0,
    current_win_streak INTEGER DEFAULT 0,
    total_correct_words INTEGER DEFAULT 0,
    avg_response_time DECIMAL(5,2) DEFAULT 0.00,
    favorite_category VARCHAR(100) DEFAULT '',
    last_played TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    most_used_words JSONB DEFAULT '[]'::jsonb,
    FOREIGN KEY (username) REFERENCES users(username) ON UPDATE CASCADE
);

-- Game sessions table - track individual games
CREATE TABLE game_sessions (
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

-- Word submissions table - track all submitted words
CREATE TABLE word_submissions (
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

-- Create indexes for better performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_player_stats_username ON player_stats(username);
CREATE INDEX idx_game_sessions_room_id ON game_sessions(room_id);
CREATE INDEX idx_word_submissions_username ON word_submissions(username);
CREATE INDEX idx_word_submissions_game_session ON word_submissions(game_session_id);

-- Insert demo data (optional - you can remove this)
-- This will be replaced with your current users.json data
