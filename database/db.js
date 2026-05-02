const mysql = require('mysql2/promise');

/**
 * InfinityFree Database Configuration
 * সতর্কতা: InfinityFree সাধারণত বাইরের কোনো সার্ভার বা Localhost থেকে 
 * সরাসরি কানেকশন (Remote MySQL) এলাউ করে না।
 */
const pool = mysql.createPool({
    host: 'sql301.infinityfree.com',
    user: 'if0_41810832',
    password: 'hvKw0yG9LfjkNI',
    database: 'if0_41810832_discord_file_sync',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    // অনেক সময় ফ্রি হোস্টিংয়ে কানেকশন টাইমআউট এড়াতে নিচের অপশনটি লাগে
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000
});

// Test connection
async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Connected to InfinityFree MySQL database successfully!');
        connection.release();
    } catch (err) {
        console.error('❌ Database connection failed!');
        console.error('Reason:', err.message);
        
        if (err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED') {
            console.error('\n--- সমাধান (Solution) ---');
            console.error('InfinityFree সাধারণত লোকালহোস্ট থেকে সরাসরি কানেকশন ব্লক করে দেয়।');
            console.error('এই কোডটি তখনই কাজ করবে যখন আপনি এটি কোনো অনলাইন সার্ভারে (যেমন Heroku, Render বা InfinityFree নিজেই) হোস্ট করবেন।');
        }
    }
}

testConnection();

module.exports = pool;
