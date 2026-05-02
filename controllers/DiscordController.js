const db = require('../database/db');
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

        // Save to database
        await db.execute(
            'UPDATE users SET discord_channel_id = ?, discord_configured = TRUE WHERE id = ?',
            [channelId, req.userId]
        );

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
        const [users] = await db.execute(
            'SELECT discord_configured, discord_channel_id FROM users WHERE id = ?',
            [req.userId]
        );

        res.json({
            configured: users[0].discord_configured === 1,
            channelId: users[0].discord_channel_id,
            botConnected: discordBot.isConnected
        });
    } catch (error) {
        res.status(500).json({ message: 'Error getting status' });
    }
};

exports.disconnectDiscord = async (req, res) => {
    try {
        await discordBot.disconnect();
        
        await db.execute(
            'UPDATE users SET discord_channel_id = NULL, discord_configured = FALSE WHERE id = ?',
            [req.userId]
        );

        res.json({ message: 'Discord disconnected' });
    } catch (error) {
        res.status(500).json({ message: 'Error disconnecting Discord' });
    }
};
