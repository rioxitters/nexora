const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

// Middleware now validates JWT only and does not query the database.
const auth = (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({ message: 'Access denied. No token provided.' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        req.userId = decoded.userId || null;
        next();
    } catch (error) {
        res.status(401).json({ message: 'Invalid token.' });
    }
};

module.exports = auth;
