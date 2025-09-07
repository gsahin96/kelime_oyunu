// Database schema setup script
require('dotenv').config();
const fs = require('fs');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function setupSchema() {
    try {
        console.log('🏗️  Setting up database schema...');
        
        const schemaSQL = fs.readFileSync('./database_schema.sql', 'utf8');
        const client = await pool.connect();
        
        // Split the schema into individual statements
        const statements = schemaSQL
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
        
        for (const statement of statements) {
            if (statement.length > 0) {
                try {
                    await client.query(statement);
                    console.log('✅ Executed:', statement.substring(0, 50) + '...');
                } catch (error) {
                    if (error.message.includes('already exists')) {
                        console.log('⚠️  Table already exists, skipping...');
                    } else {
                        console.error('❌ Error executing statement:', error.message);
                    }
                }
            }
        }
        
        client.release();
        console.log('🎉 Database schema setup completed!');
        
    } catch (error) {
        console.error('❌ Schema setup failed:', error.message);
    } finally {
        await pool.end();
    }
}

setupSchema();
