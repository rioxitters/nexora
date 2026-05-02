const jwt = require('jsonwebtoken');

// Hardcoded admin credentials (as requested)
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'nexoracheats';
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

exports.login = async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password are required' });
        }

        // Validate against hardcoded admin account
        if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
            return res.status(401).json({ message: 'Invalid username or password' });
        }

        const token = jwt.sign(
            { username: ADMIN_USERNAME, role: 'admin', userId: 1 },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            token,
            user: {
                id: 1,
                username: ADMIN_USERNAME,
                role: 'admin'
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Error logging in' });
    }
};
