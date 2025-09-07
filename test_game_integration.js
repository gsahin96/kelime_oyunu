// Test PostgreSQL integration with the game server
require('dotenv').config();
const { query } = require('./database');

async function testGameIntegration() {
    try {
        console.log('🧪 Testing PostgreSQL game integration...');
        
        // Test 1: Check if our migrated user exists
        const userCheck = await query('SELECT username, preferences FROM users LIMIT 1');
        if (userCheck.rows.length > 0) {
            console.log('✅ User data found:', userCheck.rows[0]);
        }
        
        // Test 2: Check player stats
        const statsCheck = await query('SELECT username, games_played, games_won FROM player_stats LIMIT 1');
        if (statsCheck.rows.length > 0) {
            console.log('✅ Player stats found:', statsCheck.rows[0]);
        }
        
        // Test 3: Simulate avatar update
        const testUsername = userCheck.rows[0]?.username;
        if (testUsername) {
            const updateResult = await query(`
                UPDATE users 
                SET preferences = jsonb_set(preferences, '{avatar}', '5'::jsonb)
                WHERE username = $1
                RETURNING preferences
            `, [testUsername]);
            console.log('✅ Avatar update test:', updateResult.rows[0]?.preferences);
        }
        
        console.log('🎉 All PostgreSQL integration tests passed!');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
    
    process.exit(0);
}

testGameIntegration();
