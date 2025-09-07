// Quick test script to verify PostgreSQL connection
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function testConnection() {
    try {
        console.log('🔄 Testing PostgreSQL connection...');
        const client = await pool.connect();
        console.log('✅ Successfully connected to PostgreSQL!');
        
        // Test a simple query
        const result = await client.query('SELECT NOW()');
        console.log('🕐 Database time:', result.rows[0].now);
        
        client.release();
        console.log('🎉 Connection test successful!');
    } catch (error) {
        console.error('❌ Connection failed:', error.message);
    } finally {
        await pool.end();
    }
}

testConnection();
