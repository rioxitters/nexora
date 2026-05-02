const db = require('../database/db');

exports.getActivities = async (req, res) => {
    try {
        const [activities] = await db.execute(
            'SELECT * FROM activities WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
            [req.userId]
        );

        res.json(activities);
    } catch (error) {
        console.error('Activity error:', error);
        res.status(500).json({ message: 'Error fetching activities' });
    }
};
