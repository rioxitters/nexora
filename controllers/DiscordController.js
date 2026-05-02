const storage = require('../storage');
const discordBot = require('../services/DiscordBot');

exports.configureDiscord = async (req, res) => {
    try {
        const { botToken, channelId } = req.body;

        if (!botToken || !channelId) {
            return res.status(400).json({ message: 'Bot token and channel ID are required' });
        }

        // Try to connect bot
        const result = await discordBot.initialize(botToken);
        
        if (!result.success) {
            return res.status(400).json({ message: result.error });
        }

        // Test channel
        const channelTest = await discordBot.testChannel(channelId);
        
        if (!channelTest.success) {
            return res.status(400).json({ message: channelTest.error });
        }

        // Save to local JSON store
        const users = await storage.readJSON('users.json');
        const idx = users.findIndex(u => u.id === req.userId);
        if (idx === -1) {
            users.push({ id: req.userId, username: req.user?.username || 'admin', discord_configured: true, discord_channel_id: channelId });
        } else {
            users[idx].discord_configured = true;
            users[idx].discord_channel_id = channelId;
        }
        await storage.writeJSON('users.json', users);

        res.json({
            message: 'Discord connected successfully',
            botName: result.botName,
            channelName: channelTest.channelName
        });
    } catch (error) {
        console.error('Discord config error:', error);
        res.status(500).json({ message: 'Error configuring Discord' });
    }
};

exports.testChannel = async (req, res) => {
    try {
        const { channelId } = req.body;

        if (!channelId) {
            return res.status(400).json({ message: 'Channel ID is required' });
        }

        const result = await discordBot.testChannel(channelId);
        
        if (result.success) {
            res.json({ message: 'Test successful', channelName: result.channelName });
        } else {
            res.status(400).json({ message: result.error });
        }
    } catch (error) {
        res.status(500).json({ message: 'Error testing channel' });
    }
};

exports.getDiscordStatus = async (req, res) => {
    try {
        const users = await storage.readJSON('users.json');
        const user = users.find(u => u.id === req.userId) || {};

        res.json({
            configured: !!user.discord_configured,
            channelId: user.discord_channel_id || null,
            botConnected: !!discordBot.isConnected
        });
    } catch (error) {
        res.status(500).json({ message: 'Error getting status' });
    }
};

exports.disconnectDiscord = async (req, res) => {
    try {
        await discordBot.disconnect();
        
        // Remove from local JSON store
        const users = await storage.readJSON('users.json');
        const idx = users.findIndex(u => u.id === req.userId);
        if (idx !== -1) {
            users[idx].discord_configured = false;
            users[idx].discord_channel_id = null;
            await storage.writeJSON('users.json', users);
        }

        res.json({ message: 'Discord disconnected' });
    } catch (error) {
        res.status(500).json({ message: 'Error disconnecting Discord' });
    }
};
