const storage = require('../storage');

exports.getActivities = async (req, res) => {
    try {
        const activities = await storage.readJSON('activities.json');
        const userActivities = activities
            .filter(a => a.user_id === req.userId)
            .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0,50);

        res.json(userActivities);
    } catch (error) {
        console.error('Activity error:', error);
        res.status(500).json({ message: 'Error fetching activities' });
    }
};
