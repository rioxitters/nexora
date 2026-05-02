const storage = require('../storage');
const discordBot = require('../services/DiscordBot');
const fs = require('fs').promises;
const path = require('path');

const uploadsDir = path.join(__dirname, '..', '..', 'uploads');

async function ensureDataFiles() {
    await storage.readJSON('files.json');
    await storage.readJSON('file_versions.json');
    await storage.readJSON('activities.json');
}

function now() { return new Date().toISOString(); }

async function addActivity(entry) {
    const activities = await storage.readJSON('activities.json');
    activities.push(entry);
    await storage.writeJSON('activities.json', activities);
}

exports.uploadFile = async (req, res) => {
    try {
        await ensureDataFiles();

        if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

        const { originalname, filename, path: filePath, size, mimetype } = req.file;
        const title = req.body.title || originalname;
        const description = req.body.description || '';
        const category = req.body.category || '';
        const tags = req.body.tags || '';

        const files = await storage.readJSON('files.json');
        const versions = await storage.readJSON('file_versions.json');

        const fileId = storage.generateId('f_');
        const fileRecord = {
            id: fileId,
            user_id: req.userId,
            original_name: originalname,
            title,
            description,
            category,
            tags,
            current_version: 1,
            is_deleted: false,
            created_at: now(),
            updated_at: now()
        };
        files.push(fileRecord);

        versions.push({
            id: storage.generateId('v_'),
            file_id: fileId,
            version_number: 1,
            filename,
            original_name: originalname,
            file_path: filePath,
            file_size: size,
            mime_type: mimetype,
            discord_message_id: null,
            uploaded_at: now()
        });

        await storage.writeJSON('files.json', files);
        await storage.writeJSON('file_versions.json', versions);

        await addActivity({
            id: storage.generateId('a_'),
            user_id: req.userId,
            username: req.user?.username || 'admin',
            file_id: fileId,
            file_name: originalname,
            action: 'upload',
            details: `File uploaded: ${title}`,
            created_at: now()
        });

        // Try sending to Discord if configured in users.json
        const users = await storage.readJSON('users.json');
        const user = users.find(u => u.id === req.userId) || {};
        let discordSent = false;
        let discordError = null;

        const botData = {
            botTitle: req.body.botTitle || '',
            botSubtitle: req.body.botSubtitle || '',
            botStatus: req.body.botStatus || '',
            botContent: req.body.botContent || '',
            botLinks: req.body.botLinks || '',
            botColor: req.body.botColor || '#5865F2'
        };

        if (user.discord_configured && user.discord_channel_id) {
            try {
                const hasBotMessage = botData.botTitle || botData.botContent || botData.botLinks || botData.botSubtitle || botData.botStatus;
                let result;
                if (hasBotMessage) {
                    result = await discordBot.sendPlainTextMessage(user.discord_channel_id, filePath, originalname, botData);
                } else {
                    result = await discordBot.sendFileWithDetails(user.discord_channel_id, filePath, originalname, title, description, category, tags, 1, 'new');
                }

                if (result.success) {
                    // update version record
                    const v = versions.find(v => v.file_id === fileId && v.version_number === 1);
                    if (v) v.discord_message_id = result.messageId;
                    await storage.writeJSON('file_versions.json', versions);

                    await addActivity({
                        id: storage.generateId('a_'),
                        user_id: req.userId,
                        username: req.user?.username || 'admin',
                        file_id: fileId,
                        file_name: originalname,
                        action: 'sync',
                        details: `File sent to Discord`,
                        created_at: now()
                    });

                    discordSent = true;
                } else {
                    discordError = result.error || 'Discord error';
                }
            } catch (e) {
                discordError = e.message || 'Discord send failed';
            }
        }

        res.status(201).json({
            message: 'File uploaded successfully' + (discordSent ? ' and sent to Discord' : (discordError ? ' but Discord sync failed' : '')),
            file: {
                id: fileId,
                name: originalname,
                title,
                description,
                category,
                tags,
                version: 1,
                size,
                discordSent,
                discordError
            }
        });
    } catch (error) {
        console.error('❌ Upload error:', error);
        // try cleanup
        if (req.file && req.file.path) {
            try { await fs.unlink(req.file.path); } catch (e) {}
        }
        if (!res.headersSent) res.status(500).json({ message: 'Error uploading file' });
    }
};

exports.getFiles = async (req, res) => {
    try {
        await ensureDataFiles();
        const files = await storage.readJSON('files.json');
        const versions = await storage.readJSON('file_versions.json');

        const userFiles = files
            .filter(f => f.user_id === req.userId && !f.is_deleted)
            .sort((a,b) => new Date(b.updated_at) - new Date(a.updated_at))
            .map(f => {
                const v = versions.find(v => v.file_id === f.id && v.version_number === f.current_version) || {};
                const fileVersions = versions.filter(x => x.file_id === f.id).sort((a,b)=>b.version_number-a.version_number);
                return {
                    id: f.id,
                    name: f.original_name,
                    title: f.title || f.original_name,
                    description: f.description || '',
                    category: f.category || '',
                    tags: f.tags || '',
                    currentVersion: f.current_version,
                    versionCount: fileVersions.length,
                    size: v.file_size || 0,
                    mimetype: v.mime_type || '',
                    createdAt: f.created_at,
                    updatedAt: f.updated_at,
                    versions: fileVersions.map(v => ({
                        versionNumber: v.version_number,
                        uploadedAt: v.uploaded_at,
                        size: v.file_size,
                        discordMessageId: v.discord_message_id
                    }))
                };
            });

        res.json(userFiles);
    } catch (error) {
        console.error('Get files error:', error);
        res.status(500).json({ message: 'Error fetching files' });
    }
};

exports.getFile = async (req, res) => {
    try {
        await ensureDataFiles();
        const files = await storage.readJSON('files.json');
        const versions = await storage.readJSON('file_versions.json');

        const file = files.find(f => f.id === req.params.fileId && f.user_id === req.userId && !f.is_deleted);
        if (!file) return res.status(404).json({ message: 'File not found' });

        const fileVersions = versions.filter(v => v.file_id === file.id).sort((a,b) => b.version_number - a.version_number);

        res.json({
            id: file.id,
            name: file.original_name,
            title: file.title,
            description: file.description,
            category: file.category,
            tags: file.tags,
            currentVersion: file.current_version,
            versions: fileVersions.map(v => ({
                id: v.id,
                versionNumber: v.version_number,
                filename: v.filename,
                originalName: v.original_name,
                filePath: v.file_path,
                fileSize: v.file_size,
                mimeType: v.mime_type,
                discordMessageId: v.discord_message_id,
                uploadedAt: v.uploaded_at
            })),
            createdAt: file.created_at,
            updatedAt: file.updated_at
        });
    } catch (error) {
        console.error('Get file error:', error);
        res.status(500).json({ message: 'Error fetching file details' });
    }
};

exports.updateFile = async (req, res) => {
    try {
        await ensureDataFiles();
        if (!req.file) return res.status(400).json({ message: 'No file provided for update' });

        const files = await storage.readJSON('files.json');
        const versions = await storage.readJSON('file_versions.json');

        const file = files.find(f => f.id === req.params.fileId && f.user_id === req.userId && !f.is_deleted);
        if (!file) return res.status(404).json({ message: 'File not found' });

        const newVersion = file.current_version + 1;
        const { originalname, filename, path: filePath, size, mimetype } = req.file;

        const title = req.body.title || file.title || originalname;
        const description = req.body.description || file.description || '';
        const category = req.body.category || file.category || '';
        const tags = req.body.tags || file.tags || '';

        // update file record
        file.current_version = newVersion;
        file.original_name = originalname;
        file.title = title;
        file.description = description;
        file.category = category;
        file.tags = tags;
        file.updated_at = now();

        const versionRecord = {
            id: storage.generateId('v_'),
            file_id: file.id,
            version_number: newVersion,
            filename,
            original_name: originalname,
            file_path: filePath,
            file_size: size,
            mime_type: mimetype,
            discord_message_id: null,
            uploaded_at: now()
        };
        versions.push(versionRecord);

        await storage.writeJSON('files.json', files);
        await storage.writeJSON('file_versions.json', versions);

        await addActivity({
            id: storage.generateId('a_'),
            user_id: req.userId,
            username: req.user?.username || 'admin',
            file_id: file.id,
            file_name: originalname,
            action: 'update',
            details: `Updated to version ${newVersion}: ${title}`,
            created_at: now()
        });

        // Sync to Discord if configured
        const users = await storage.readJSON('users.json');
        const user = users.find(u => u.id === req.userId) || {};
        if (user.discord_configured && user.discord_channel_id) {
            try {
                const lastVersion = versions.find(v => v.file_id === file.id && v.version_number === (newVersion-1));
                const oldMessageId = lastVersion?.discord_message_id;

                const botData = {
                    botTitle: req.body.botTitle || '',
                    botSubtitle: req.body.botSubtitle || '',
                    botStatus: req.body.botStatus || '',
                    botContent: req.body.botContent || '',
                    botLinks: req.body.botLinks || '',
                    botColor: req.body.botColor || '#5865F2'
                };

                const hasBotMessage = botData.botTitle || botData.botContent || botData.botLinks || botData.botSubtitle || botData.botStatus;
                let result;
                if (hasBotMessage) {
                    result = await discordBot.updatePlainTextMessage(user.discord_channel_id, oldMessageId, filePath, originalname, botData);
                } else {
                    result = await discordBot.updateMessageWithDetails(user.discord_channel_id, oldMessageId, filePath, originalname, title, description, category, tags, newVersion);
                }

                if (result.success) {
                    versionRecord.discord_message_id = result.messageId;
                    await storage.writeJSON('file_versions.json', versions);

                    await addActivity({
                        id: storage.generateId('a_'),
                        user_id: req.userId,
                        username: req.user?.username || 'admin',
                        file_id: file.id,
                        file_name: originalname,
                        action: 'sync',
                        details: `Version ${newVersion} synced to Discord`,
                        created_at: now()
                    });
                }
            } catch (e) {
                console.log('Discord update failed', e.message || e);
            }
        }

        res.json({ message: 'File updated successfully', file: { id: file.id, name: originalname, title, version: newVersion, updatedAt: new Date() } });
    } catch (error) {
        console.error('❌ Update error:', error);
        if (!res.headersSent) res.status(500).json({ message: 'Error updating file' });
    }
};

exports.downloadFile = async (req, res) => {
    try {
        await ensureDataFiles();
        const files = await storage.readJSON('files.json');
        const versions = await storage.readJSON('file_versions.json');

        const file = files.find(f => f.id === req.params.fileId && f.user_id === req.userId && !f.is_deleted);
        if (!file) return res.status(404).json({ message: 'File not found' });

        let fileVersion;
        if (req.params.version) {
            fileVersion = versions.find(v => v.file_id === file.id && String(v.version_number) === String(req.params.version));
        } else {
            fileVersion = versions.filter(v => v.file_id === file.id).sort((a,b)=>b.version_number-a.version_number)[0];
        }

        if (!fileVersion) return res.status(404).json({ message: 'Version not found' });

        try {
            await fs.access(fileVersion.file_path, fs.constants.R_OK);
        } catch (err) {
            return res.status(404).json({ message: 'File not found on server. It may have been deleted.' });
        }

        const stats = await fs.stat(fileVersion.file_path);
        const fileStream = require('fs').createReadStream(fileVersion.file_path);
        res.setHeader('Content-Type', fileVersion.mime_type || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileVersion.original_name)}"`);
        res.setHeader('Content-Length', stats.size);
        fileStream.pipe(res);
    } catch (error) {
        console.error('Download error:', error);
        if (!res.headersSent) res.status(500).json({ message: 'Error downloading file' });
    }
};

exports.deleteFile = async (req, res) => {
    try {
        await ensureDataFiles();
        const files = await storage.readJSON('files.json');
        const versions = await storage.readJSON('file_versions.json');

        const idx = files.findIndex(f => f.id === req.params.fileId && f.user_id === req.userId);
        if (idx === -1) return res.status(404).json({ message: 'File not found' });

        const file = files[idx];
        file.is_deleted = true;
        await storage.writeJSON('files.json', files);

        // Delete from Discord if configured
        const users = await storage.readJSON('users.json');
        const user = users.find(u => u.id === req.userId) || {};
        if (user.discord_configured && user.discord_channel_id) {
            const fileVersions = versions.filter(v => v.file_id === file.id).sort((a,b)=>b.version_number-a.version_number);
            const lastVersion = fileVersions[0];
            if (lastVersion?.discord_message_id) {
                try {
                    await discordBot.deleteMessage(user.discord_channel_id, lastVersion.discord_message_id);
                } catch (e) { console.log('Discord delete failed', e.message || e); }
            }
        }

        // Delete physical files
        const fileVersions = versions.filter(v => v.file_id === file.id);
        for (const v of fileVersions) {
            try { await fs.unlink(v.file_path); } catch (e) { }
        }

        await addActivity({
            id: storage.generateId('a_'),
            user_id: req.userId,
            username: req.user?.username || 'admin',
            file_id: file.id,
            file_name: file.original_name,
            action: 'delete',
            details: `File deleted: ${file.title || file.original_name}`,
            created_at: now()
        });

        res.json({ message: 'File deleted successfully', fileName: file.original_name });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ message: 'Error deleting file' });
    }
};

// Helper function
function formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
