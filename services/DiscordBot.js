const { Client, GatewayIntentBits, AttachmentBuilder, EmbedBuilder, Partials } = require('discord.js');
const fs = require('fs');

class DiscordBotService {
    constructor() {
        this.client = null;
        this.isConnected = false;
        this.botName = null;
    }

    async initialize(token) {
        try {
            if (this.client) {
                try { await this.client.destroy(); } catch (e) {}
            }

            this.client = new Client({
                intents: [
                    GatewayIntentBits.Guilds,
                    GatewayIntentBits.GuildMessages,
                    GatewayIntentBits.MessageContent,
                ],
                partials: [Partials.Channel, Partials.Message]
            });

            this.setupEventHandlers();

            const loginPromise = this.client.login(token);
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Login timeout')), 15000);
            });

            await Promise.race([loginPromise, timeoutPromise]);
            await this.waitForReady();

            this.isConnected = true;
            console.log(`✅ Discord bot ready: ${this.botName}`);
            return { success: true, botName: this.botName };
        } catch (error) {
            this.isConnected = false;
            console.error('Discord connection error:', error.message);
            
            let errorMessage = error.message;
            if (error.message.includes('TOKEN_INVALID')) {
                errorMessage = 'Invalid bot token. Check Discord Developer Portal.';
            } else if (error.message.includes('DISALLOWED_INTENTS')) {
                errorMessage = 'Enable MESSAGE CONTENT INTENT in Discord Developer Portal > Bot.';
            }
            return { success: false, error: errorMessage };
        }
    }

    setupEventHandlers() {
        this.client.once('ready', () => {
            this.botName = this.client.user.tag;
            console.log(`🤖 Logged in as ${this.botName}`);
        });

        this.client.on('error', (error) => {
            console.error('Discord error:', error.message);
        });
    }

    waitForReady() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Bot ready timeout'));
            }, 10000);
            this.client.once('ready', () => {
                clearTimeout(timeout);
                resolve();
            });
        });
    }

    // ==================== 🔥 PLAIN TEXT MESSAGE (NO EMBED) ====================
    async sendPlainTextMessage(channelId, filePath, fileName, botData) {
        try {
            if (!this.isConnected || !this.client) {
                throw new Error('Discord bot is not connected');
            }

            const channel = await this.client.channels.fetch(channelId);
            if (!channel || !channel.isTextBased()) {
                throw new Error('Channel not found');
            }

            const permissions = channel.permissionsFor(this.client.user);
            if (!permissions.has('SendMessages')) throw new Error('Missing: Send Messages');
            if (!permissions.has('AttachFiles')) throw new Error('Missing: Attach Files');

            // Get file size
            let fileSizeMB = 'Unknown';
            try { 
                const stats = fs.statSync(filePath); 
                fileSizeMB = (stats.size / 1024 / 1024).toFixed(2); 
            } catch (e) {}

            // Create file attachment
            const fileAttachment = new AttachmentBuilder(filePath, { name: fileName });

            // Build message content
            let content = '';

            // Title
            if (botData.botTitle && botData.botTitle.trim()) {
                content += `**${botData.botTitle.trim()}**\n`;
            }

            // Subtitle
            if (botData.botSubtitle && botData.botSubtitle.trim()) {
                content += `${botData.botSubtitle.trim()}\n`;
            }

            // Status
            if (botData.botStatus && botData.botStatus.trim()) {
                content += `${botData.botStatus.trim()}\n`;
            }

            // Main content (PRESERVE ALL FORMATTING)
            if (botData.botContent && botData.botContent.trim()) {
                content += `\n${botData.botContent.trim()}\n`;
            }

            // Links
            if (botData.botLinks && botData.botLinks.trim()) {
                content += '\n';
                const linkLines = botData.botLinks.split('\n').filter(l => l.trim());
                linkLines.forEach(line => {
                    const parts = line.split('|');
                    if (parts.length >= 2) {
                        content += `**${parts[0].trim()} :** ${parts.slice(1).join('|').trim()}\n`;
                    } else {
                        content += `${line.trim()}\n`;
                    }
                });
            }

            // File info
            content += `\n📎 **File:** \`${fileName}\` | 📦 **Size:** ${fileSizeMB} MB`;

            // 🔥 SEND AS PLAIN TEXT - NO EMBED
            const message = await channel.send({
                content: content,
                files: [fileAttachment]
            });

            console.log(`✅ Plain text message sent!`);
            console.log(`   Content length: ${content.length} chars`);
            return { success: true, messageId: message.id };
        } catch (error) {
            console.error('❌ Error sending plain text:', error.message);
            return { success: false, error: error.message };
        }
    }

    // ==================== UPDATE PLAIN TEXT MESSAGE ====================
    async updatePlainTextMessage(channelId, oldMessageId, filePath, fileName, botData) {
        try {
            if (!this.isConnected || !this.client) throw new Error('Discord bot is not connected');

            const channel = await this.client.channels.fetch(channelId);
            if (!channel || !channel.isTextBased()) throw new Error('Channel not found');

            let fileSizeMB = 'Unknown';
            try { 
                const stats = fs.statSync(filePath); 
                fileSizeMB = (stats.size / 1024 / 1024).toFixed(2); 
            } catch (e) {}

            const fileAttachment = new AttachmentBuilder(filePath, { name: fileName });

            let content = '';

            if (botData.botTitle && botData.botTitle.trim()) {
                content += `**${botData.botTitle.trim()}**\n`;
            }

            if (botData.botSubtitle && botData.botSubtitle.trim()) {
                content += `${botData.botSubtitle.trim()}\n`;
            }

            if (botData.botStatus && botData.botStatus.trim()) {
                content += `${botData.botStatus.trim()}\n`;
            }

            if (botData.botContent && botData.botContent.trim()) {
                content += `\n${botData.botContent.trim()}\n`;
            }

            if (botData.botLinks && botData.botLinks.trim()) {
                content += '\n';
                const linkLines = botData.botLinks.split('\n').filter(l => l.trim());
                linkLines.forEach(line => {
                    const parts = line.split('|');
                    if (parts.length >= 2) {
                        content += `**${parts[0].trim()} :** ${parts.slice(1).join('|').trim()}\n`;
                    } else {
                        content += `${line.trim()}\n`;
                    }
                });
            }

            content += `\n📎 **File:** \`${fileName}\` | 📦 **Size:** ${fileSizeMB} MB | 🔄 **Updated**`;

            // Try to update existing message
            if (oldMessageId) {
                try {
                    const oldMessage = await channel.messages.fetch(oldMessageId);
                    if (oldMessage && oldMessage.author.id === this.client.user.id) {
                        await oldMessage.edit({
                            content: content,
                            files: [fileAttachment]
                        });
                        console.log(`✅ Plain text message updated`);
                        return { success: true, messageId: oldMessage.id };
                    }
                } catch (e) {
                    console.log('Old message not found, sending new one');
                }
            }

            // Send new message
            const newMessage = await channel.send({
                content: content,
                files: [fileAttachment]
            });
            
            console.log(`✅ New plain text message sent`);
            return { success: true, messageId: newMessage.id };
        } catch (error) {
            console.error('Error updating plain text:', error.message);
            return { success: false, error: error.message };
        }
    }

    // ==================== SEND FILE WITH DETAILS (EMBED) ====================
    async sendFileWithDetails(channelId, filePath, fileName, title, description, category, tags, version, uploadType) {
        try {
            if (!this.isConnected || !this.client) throw new Error('Discord bot is not connected');

            const channel = await this.client.channels.fetch(channelId);
            if (!channel || !channel.isTextBased()) throw new Error('Channel not found');

            let fileSizeMB = 'Unknown';
            try { const stats = fs.statSync(filePath); fileSizeMB = (stats.size / 1024 / 1024).toFixed(2); } catch (e) {}

            const fileAttachment = new AttachmentBuilder(filePath, { name: fileName });
            
            const embed = new EmbedBuilder()
                .setColor(uploadType === 'new' ? '#57F287' : '#5865F2')
                .setTitle(uploadType === 'new' ? '📁 New File Uploaded' : '🔄 File Updated');
            
            embed.addFields({ name: '📄 Title', value: title || fileName, inline: false });

            if (description && description.trim()) {
                embed.addFields({ name: '📝 Description', value: description.length > 1024 ? description.substring(0, 1020) + '...' : description, inline: false });
            }

            embed.addFields(
                { name: '📌 Version', value: `v${version}`, inline: true },
                { name: '📅 Date', value: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }), inline: true }
            );

            if (category && category.trim()) {
                embed.addFields({ name: '📂 Category', value: category, inline: true });
            }

            embed.addFields({ name: '💾 File Size', value: `${fileSizeMB} MB`, inline: true });

            if (tags && tags.trim()) {
                const tagList = tags.split(',').map(t => t.trim()).filter(t => t).map(t => `\`#${t}\``).join(' ');
                if (tagList) embed.addFields({ name: '🏷️ Tags', value: tagList, inline: false });
            }

            embed.addFields({ name: '📎 File Name', value: `\`${fileName}\``, inline: false })
                 .setTimestamp()
                 .setFooter({ text: 'FileSync Pro' });

            const message = await channel.send({ embeds: [embed], files: [fileAttachment] });
            console.log(`✅ File sent to Discord with embed`);
            return { success: true, messageId: message.id };
        } catch (error) {
            console.error('Error sending file:', error.message);
            return { success: false, error: error.message };
        }
    }

    // ==================== UPDATE MESSAGE WITH DETAILS ====================
    async updateMessageWithDetails(channelId, oldMessageId, filePath, fileName, title, description, category, tags, version) {
        try {
            if (!this.isConnected || !this.client) throw new Error('Discord bot is not connected');

            const channel = await this.client.channels.fetch(channelId);
            if (!channel || !channel.isTextBased()) throw new Error('Channel not found');

            let fileSizeMB = 'Unknown';
            try { const stats = fs.statSync(filePath); fileSizeMB = (stats.size / 1024 / 1024).toFixed(2); } catch (e) {}

            const fileAttachment = new AttachmentBuilder(filePath, { name: fileName });
            
            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('🔄 File Updated');
            
            embed.addFields({ name: '📄 Title', value: title || fileName, inline: false });

            if (description && description.trim()) {
                embed.addFields({ name: '📝 Description', value: description.length > 1024 ? description.substring(0, 1020) + '...' : description, inline: false });
            }

            embed.addFields(
                { name: '📌 Version', value: `v${version}`, inline: true },
                { name: '📅 Updated', value: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }), inline: true }
            );

            if (category && category.trim()) embed.addFields({ name: '📂 Category', value: category, inline: true });
            embed.addFields({ name: '💾 File Size', value: `${fileSizeMB} MB`, inline: true });

            if (tags && tags.trim()) {
                const tagList = tags.split(',').map(t => t.trim()).filter(t => t).map(t => `\`#${t}\``).join(' ');
                if (tagList) embed.addFields({ name: '🏷️ Tags', value: tagList, inline: false });
            }

            embed.addFields({ name: '📎 File Name', value: `\`${fileName}\``, inline: false })
                 .setTimestamp()
                 .setFooter({ text: 'FileSync Pro • Updated' });

            if (oldMessageId) {
                try {
                    const oldMessage = await channel.messages.fetch(oldMessageId);
                    if (oldMessage && oldMessage.author.id === this.client.user.id) {
                        await oldMessage.edit({ embeds: [embed], files: [fileAttachment] });
                        return { success: true, messageId: oldMessage.id };
                    }
                } catch (e) {}
            }

            const newMessage = await channel.send({ embeds: [embed], files: [fileAttachment] });
            return { success: true, messageId: newMessage.id };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // ==================== DELETE MESSAGE ====================
    async deleteMessage(channelId, messageId) {
        try {
            if (!this.isConnected || !this.client || !messageId) return;
            const channel = await this.client.channels.fetch(channelId);
            if (!channel) return;
            const message = await channel.messages.fetch(messageId);
            if (message && message.author.id === this.client.user.id) {
                await message.delete();
                console.log('✅ Discord message deleted');
            }
        } catch (error) {
            console.error('Error deleting message:', error.message);
        }
    }

    // ==================== TEST CHANNEL ====================
    async testChannel(channelId) {
        try {
            if (!this.isConnected || !this.client) {
                return { success: false, error: 'Bot is not connected.' };
            }

            if (!/^\d{17,19}$/.test(channelId)) {
                return { success: false, error: 'Invalid channel ID format.' };
            }

            let channel;
            try {
                channel = await this.client.channels.fetch(channelId);
            } catch (error) {
                return { success: false, error: 'Channel not found. Invite bot to server first.' };
            }

            if (!channel || !channel.isTextBased()) {
                return { success: false, error: 'Not a text channel.' };
            }

            const permissions = channel.permissionsFor(this.client.user);
            const missing = [];
            if (!permissions.has('ViewChannel')) missing.push('View Channel');
            if (!permissions.has('SendMessages')) missing.push('Send Messages');
            if (!permissions.has('AttachFiles')) missing.push('Attach Files');
            if (!permissions.has('ReadMessageHistory')) missing.push('Read History');

            if (missing.length > 0) {
                return { success: false, error: `Missing permissions: ${missing.join(', ')}` };
            }

            // Send plain text test
            const testMsg = await channel.send({
                content: '✅ **Connection Test Successful!**\nBot is working properly.\n*This message will be deleted in 3 seconds.*'
            });
            setTimeout(() => testMsg.delete().catch(() => {}), 3000);

            return { success: true, channelName: channel.name };
        } catch (error) {
            return { success: false, error: 'Cannot access channel.' };
        }
    }

    // ==================== DISCONNECT ====================
    async disconnect() {
        if (this.client) {
            try {
                await this.client.destroy();
                this.isConnected = false;
                this.botName = null;
                console.log('🔌 Discord bot disconnected');
            } catch (error) {
                console.error('Error disconnecting:', error.message);
            }
        }
    }
}

module.exports = new DiscordBotService();
