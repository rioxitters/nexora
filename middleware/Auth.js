const jwt = require('jsonwebtoken');
const db = require('../database/db');

const auth = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ message: 'Access denied. No token provided.' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        const [rows] = await db.execute(
            'SELECT id, username, email, discord_channel_id, discord_configured FROM users WHERE id = ?',
            [decoded.userId]
        );

        if (rows.length === 0) {
            return res.status(401).json({ message: 'Invalid token. User not found.' });
        }

        req.user = rows[0];
        req.userId = rows[0].id;
        next();
    } catch (error) {
        res.status(401).json({ message: 'Invalid token.' });
    }
};

module.exports = auth;
