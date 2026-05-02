const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: 'sql301.infinityfree.com',
    user: 'if0_41810832',
    password: 'hvKw0yG9LfjkNI',  // XAMPP default is empty
    database: 'if0_41810832_discord_file_sync',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test connection
pool.getConnection()
    .then(connection => {
        console.log('✅ Connected to MySQL database');
        connection.release();
    })
    .catch(err => {
        console.error('❌ Database connection failed:', err.message);
        console.error('Make sure MySQL is running in XAMPP Control Panel');
    });

module.exports = pool;
