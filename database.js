const { Pool } = require('pg');
require('dotenv').config();

// Professional PostgreSQL connection with error handling
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false, require: true },
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close clients after 30 seconds of inactivity
    connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
});

// Test database connection
pool.on('connect', () => {
    console.log('✅ PostgreSQL veritabanına bağlanıldı');
});

pool.on('error', (err) => {
    console.error('❌ PostgreSQL bağlantı hatası:', err);
});

// Database utility functions
const db = {
    // Execute a query with parameters
    query: async (text, params) => {
        const start = Date.now();
        try {
            const res = await pool.query(text, params);
            const duration = Date.now() - start;
            console.log('🔍 Executed query', { text: text.substring(0, 50), duration, rows: res.rowCount });
            return res;
        } catch (error) {
            console.error('❌ Database query error:', error);
            throw error;
        }
    },

    // Get a client from the pool for transactions
    getClient: async () => {
        return await pool.connect();
    },

    // Initialize database tables
    initializeTables: async () => {
        try {
            console.log('🔄 Veritabanı tabloları kontrol ediliyor...');
            
            // Check if users table exists
            const tableCheck = await pool.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'users'
                );
            `);
            
            if (!tableCheck.rows[0].exists) {
                console.log('📝 Tablolar bulunamadı, oluşturuluyor...');
                
                // Create tables (you'll need to run the schema manually first time)
                console.log('⚠️  Lütfen database_schema.sql dosyasını PostgreSQL\'e manuel olarak yükleyin');
                console.log('📍 Render Dashboard > PostgreSQL > Query tab\'ından schema\'yı çalıştırın');
            } else {
                console.log('✅ Veritabanı tabloları mevcut');
            }
        } catch (error) {
            console.error('❌ Database initialization error:', error);
        }
    }
};

module.exports = db;
