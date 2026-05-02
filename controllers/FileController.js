const db = require('../database/db');
const discordBot = require('../services/DiscordBot');
const fs = require('fs').promises;
const path = require('path');

exports.uploadFile = async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();

        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const { originalname, filename, path: filePath, size, mimetype } = req.file;
        
        // Get metadata from request body
        const title = req.body.title || originalname;
        const description = req.body.description || '';
        const category = req.body.category || '';
        const tags = req.body.tags || '';
        
        // Get bot message data from request body
        const botData = {
            botTitle: req.body.botTitle || '',
            botSubtitle: req.body.botSubtitle || '',
            botStatus: req.body.botStatus || '',
            botContent: req.body.botContent || '',
            botLinks: req.body.botLinks || '',
            botColor: req.body.botColor || '#5865F2'
        };
        
        console.log('📁 Uploading file...');
        console.log('   File:', originalname);
        console.log('   Title:', title);
        console.log('   Size:', (size / 1024 / 1024).toFixed(2), 'MB');
        console.log('   Bot Title:', botData.botTitle || 'None');
        console.log('   Has Bot Content:', botData.botContent ? 'Yes' : 'No');
        console.log('   Has Bot Links:', botData.botLinks ? 'Yes' : 'No');
        
        // Verify file exists and is readable
        try {
            await fs.access(filePath, fs.constants.R_OK);
        } catch (err) {
            return res.status(400).json({ message: 'Uploaded file not accessible' });
        }
        
        // Insert into files table with metadata
        const [fileResult] = await connection.execute(
            `INSERT INTO files (user_id, original_name, title, description, category, tags, current_version) 
             VALUES (?, ?, ?, ?, ?, ?, 1)`,
            [req.userId, originalname, title, description, category, tags]
        );

        const fileId = fileResult.insertId;

        // Insert file version
        await connection.execute(
            `INSERT INTO file_versions (file_id, version_number, filename, original_name, file_path, file_size, mime_type) 
             VALUES (?, 1, ?, ?, ?, ?, ?)`,
            [fileId, filename, originalname, filePath, size, mimetype]
        );

        // Log activity
        await connection.execute(
            `INSERT INTO activities (user_id, username, file_id, file_name, action, details) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [req.userId, req.user.username, fileId, originalname, 'upload', `File uploaded: ${title}`]
        );

        await connection.commit();
        
        console.log('✅ File saved to database:', title);

        // Try to send to Discord
        let discordSent = false;
        let discordError = null;

        if (req.user.discord_configured === 1 && req.user.discord_channel_id) {
            console.log('📤 Sending to Discord...');
            
            let result;
            
            // 🔥 CHECK: Bot Message Tab e kichu likhse kina
            const hasBotMessage = botData.botTitle || botData.botContent || botData.botLinks || botData.botSubtitle || botData.botStatus;
            
            if (hasBotMessage) {
                // USE PLAIN TEXT - NO EMBED
                console.log('   📝 Sending as PLAIN TEXT (no embed)...');
                result = await discordBot.sendPlainTextMessage(
                    req.user.discord_channel_id,
                    filePath,
                    originalname,
                    botData
                );
            } else {
                // USE EMBED with file details
                console.log('   📦 Sending as EMBED with details...');
                result = await discordBot.sendFileWithDetails(
                    req.user.discord_channel_id,
                    filePath,
                    originalname,
                    title,
                    description,
                    category,
                    tags,
                    1,
                    'new'
                );
            }
            
            if (result.success) {
                await connection.execute(
                    'UPDATE file_versions SET discord_message_id = ? WHERE file_id = ? AND version_number = 1',
                    [result.messageId, fileId]
                );
                
                const syncType = hasBotMessage ? 'plain text' : 'embed';
                await connection.execute(
                    `INSERT INTO activities (user_id, username, file_id, file_name, action, details) 
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [req.userId, req.user.username, fileId, originalname, 'sync', `File sent to Discord as ${syncType}`]
                );
                
                console.log('✅ Sent to Discord successfully');
                discordSent = true;
            } else {
                console.log('⚠️ Discord send failed:', result.error);
                discordError = result.error;
            }
        }

        // Send success response
        res.status(201).json({
            message: 'File uploaded successfully' + (discordSent ? ' and sent to Discord' : (discordError ? ' but Discord sync failed' : '')),
            file: {
                id: fileId,
                name: originalname,
                title: title,
                description: description,
                category: category,
                tags: tags,
                version: 1,
                size: size,
                discordSent: discordSent,
                discordError: discordError
            }
        });

    } catch (error) {
        await connection.rollback();
        console.error('❌ Upload error:', error);
        
        // Clean up uploaded file on error
        if (req.file && req.file.path) {
            try {
                await fs.unlink(req.file.path);
                console.log('🧹 Cleaned up file:', req.file.path);
            } catch (unlinkError) {
                console.error('Error cleaning up file:', unlinkError);
            }
        }
        
        // Check if headers already sent
        if (!res.headersSent) {
            res.status(500).json({ 
                message: 'Error uploading file. Please try again.',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    } finally {
        connection.release();
    }
};

exports.getFiles = async (req, res) => {
    try {
        const [files] = await db.execute(
            `SELECT 
                f.id, f.user_id, f.original_name, f.title, f.description, 
                f.category, f.tags, f.current_version, f.is_deleted,
                f.created_at, f.updated_at,
                fv.file_size, fv.mime_type 
             FROM files f 
             LEFT JOIN file_versions fv ON f.id = fv.file_id AND fv.version_number = f.current_version 
             WHERE f.user_id = ? AND f.is_deleted = FALSE 
             ORDER BY f.updated_at DESC`,
            [req.userId]
        );

        // Get version counts for each file
        const filesWithDetails = await Promise.all(files.map(async (file) => {
            const [versions] = await db.execute(
                'SELECT version_number, uploaded_at, file_size, discord_message_id FROM file_versions WHERE file_id = ? ORDER BY version_number DESC',
                [file.id]
            );

            return {
                id: file.id,
                name: file.original_name,
                title: file.title || file.original_name,
                description: file.description || '',
                category: file.category || '',
                tags: file.tags || '',
                currentVersion: file.current_version,
                versionCount: versions.length,
                size: file.file_size,
                mimetype: file.mime_type,
                createdAt: file.created_at,
                updatedAt: file.updated_at,
                versions: versions.map(v => ({
                    versionNumber: v.version_number,
                    uploadedAt: v.uploaded_at,
                    size: v.file_size,
                    discordMessageId: v.discord_message_id
                }))
            };
        }));

        res.json(filesWithDetails);
    } catch (error) {
        console.error('Get files error:', error);
        res.status(500).json({ message: 'Error fetching files' });
    }
};

exports.getFile = async (req, res) => {
    try {
        const [files] = await db.execute(
            `SELECT * FROM files WHERE id = ? AND user_id = ? AND is_deleted = FALSE`,
            [req.params.fileId, req.userId]
        );

        if (files.length === 0) {
            return res.status(404).json({ message: 'File not found' });
        }

        const file = files[0];

        const [versions] = await db.execute(
            `SELECT * FROM file_versions WHERE file_id = ? ORDER BY version_number DESC`,
            [req.params.fileId]
        );

        res.json({
            id: file.id,
            name: file.original_name,
            title: file.title,
            description: file.description,
            category: file.category,
            tags: file.tags,
            currentVersion: file.current_version,
            versions: versions.map(v => ({
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
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();

        const { fileId } = req.params;
        
        if (!req.file) {
            return res.status(400).json({ message: 'No file provided for update' });
        }

        // Get existing file
        const [files] = await connection.execute(
            'SELECT * FROM files WHERE id = ? AND user_id = ? AND is_deleted = FALSE',
            [fileId, req.userId]
        );

        if (files.length === 0) {
            return res.status(404).json({ message: 'File not found' });
        }

        const file = files[0];
        const newVersion = file.current_version + 1;
        const { originalname, filename, path: filePath, size, mimetype } = req.file;
        
        // Get optional metadata from request
        const title = req.body.title || file.title || originalname;
        const description = req.body.description || file.description || '';
        const category = req.body.category || file.category || '';
        const tags = req.body.tags || file.tags || '';
        
        // Get bot message data
        const botData = {
            botTitle: req.body.botTitle || '',
            botSubtitle: req.body.botSubtitle || '',
            botStatus: req.body.botStatus || '',
            botContent: req.body.botContent || '',
            botLinks: req.body.botLinks || '',
            botColor: req.body.botColor || '#5865F2'
        };

        console.log('🔄 Updating file...');
        console.log('   File ID:', fileId);
        console.log('   New version:', newVersion);
        console.log('   File:', originalname);
        console.log('   Size:', (size / 1024 / 1024).toFixed(2), 'MB');

        // Update file record
        await connection.execute(
            `UPDATE files SET current_version = ?, original_name = ?, title = ?, description = ?, category = ?, tags = ? 
             WHERE id = ?`,
            [newVersion, originalname, title, description, category, tags, fileId]
        );

        // Insert new version
        const [versionResult] = await connection.execute(
            `INSERT INTO file_versions (file_id, version_number, filename, original_name, file_path, file_size, mime_type) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [fileId, newVersion, filename, originalname, filePath, size, mimetype]
        );

        // Log activity
        await connection.execute(
            `INSERT INTO activities (user_id, username, file_id, file_name, action, details) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [req.userId, req.user.username, fileId, originalname, 'update', `Updated to version ${newVersion}: ${title}`]
        );

        await connection.commit();

        // Update in Discord if configured
        if (req.user.discord_configured === 1 && req.user.discord_channel_id) {
            console.log('📤 Updating Discord message...');
            
            // Get last version's Discord message ID
            const [lastVersion] = await connection.execute(
                'SELECT discord_message_id FROM file_versions WHERE file_id = ? AND version_number = ?',
                [fileId, file.current_version]
            );

            const oldMessageId = lastVersion[0]?.discord_message_id;
            
            let result;
            
            // 🔥 CHECK: Bot Message Tab e kichu likhse kina
            const hasBotMessage = botData.botTitle || botData.botContent || botData.botLinks || botData.botSubtitle || botData.botStatus;
            
            if (hasBotMessage) {
                // USE PLAIN TEXT UPDATE
                console.log('   📝 Updating as PLAIN TEXT...');
                result = await discordBot.updatePlainTextMessage(
                    req.user.discord_channel_id,
                    oldMessageId,
                    filePath,
                    originalname,
                    botData
                );
            } else {
                // USE EMBED UPDATE
                console.log('   📦 Updating as EMBED...');
                result = await discordBot.updateMessageWithDetails(
                    req.user.discord_channel_id,
                    oldMessageId,
                    filePath,
                    originalname,
                    title,
                    description,
                    category,
                    tags,
                    newVersion
                );
            }

            if (result.success) {
                await connection.execute(
                    'UPDATE file_versions SET discord_message_id = ? WHERE id = ?',
                    [result.messageId, versionResult.insertId]
                );

                await connection.execute(
                    `INSERT INTO activities (user_id, username, file_id, file_name, action, details) 
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [req.userId, req.user.username, fileId, originalname, 'sync', `Version ${newVersion} synced to Discord`]
                );
                
                console.log('✅ Discord message updated');
            } else {
                console.log('⚠️ Discord update failed:', result.error);
            }
        }

        res.json({
            message: 'File updated successfully',
            file: {
                id: fileId,
                name: originalname,
                title: title,
                version: newVersion,
                updatedAt: new Date()
            }
        });
    } catch (error) {
        await connection.rollback();
        console.error('❌ Update error:', error);
        
        // Clean up uploaded file on error
        if (req.file && req.file.path) {
            try {
                await fs.unlink(req.file.path);
            } catch (e) {}
        }
        
        if (!res.headersSent) {
            res.status(500).json({ message: 'Error updating file' });
        }
    } finally {
        connection.release();
    }
};

exports.downloadFile = async (req, res) => {
    try {
        const { fileId, version } = req.params;

        // Verify file ownership
        const [files] = await db.execute(
            'SELECT id FROM files WHERE id = ? AND user_id = ? AND is_deleted = FALSE',
            [fileId, req.userId]
        );

        if (files.length === 0) {
            return res.status(404).json({ message: 'File not found' });
        }

        let query = 'SELECT * FROM file_versions WHERE file_id = ?';
        let params = [fileId];

        if (version) {
            query += ' AND version_number = ?';
            params.push(version);
        } else {
            query += ' ORDER BY version_number DESC LIMIT 1';
        }

        const [versions] = await db.execute(query, params);

        if (versions.length === 0) {
            return res.status(404).json({ message: 'Version not found' });
        }

        const fileVersion = versions[0];
        
        // Check if file exists physically
        try {
            await fs.access(fileVersion.file_path, fs.constants.R_OK);
        } catch (err) {
            return res.status(404).json({ message: 'File not found on server. It may have been deleted.' });
        }

        // Get file stats
        const stats = await fs.stat(fileVersion.file_path);
        console.log('📥 Downloading:', fileVersion.original_name, `(${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

        // Stream the file for better performance with large files
        const fileStream = require('fs').createReadStream(fileVersion.file_path);
        
        res.setHeader('Content-Type', fileVersion.mime_type || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileVersion.original_name)}"`);
        res.setHeader('Content-Length', stats.size);
        
        fileStream.pipe(res);
        
        fileStream.on('error', (err) => {
            console.error('Stream error:', err);
            if (!res.headersSent) {
                res.status(500).json({ message: 'Error downloading file' });
            }
        });

        fileStream.on('end', () => {
            console.log('✅ Download complete:', fileVersion.original_name);
        });

    } catch (error) {
        console.error('Download error:', error);
        if (!res.headersSent) {
            res.status(500).json({ message: 'Error downloading file' });
        }
    }
};

exports.deleteFile = async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();

        const [files] = await connection.execute(
            'SELECT * FROM files WHERE id = ? AND user_id = ?',
            [req.params.fileId, req.userId]
        );

        if (files.length === 0) {
            return res.status(404).json({ message: 'File not found' });
        }

        const file = files[0];

        // Soft delete
        await connection.execute(
            'UPDATE files SET is_deleted = TRUE WHERE id = ?',
            [req.params.fileId]
        );

        // Delete from Discord if configured
        if (req.user.discord_configured === 1 && req.user.discord_channel_id) {
            const [lastVersion] = await connection.execute(
                'SELECT discord_message_id FROM file_versions WHERE file_id = ? ORDER BY version_number DESC LIMIT 1',
                [req.params.fileId]
            );
            
            if (lastVersion[0]?.discord_message_id) {
                await discordBot.deleteMessage(
                    req.user.discord_channel_id,
                    lastVersion[0].discord_message_id
                );
                console.log('🗑️ Discord message deleted');
            }
        }

        // Delete physical files
        const [versions] = await connection.execute(
            'SELECT file_path FROM file_versions WHERE file_id = ?',
            [req.params.fileId]
        );

        for (const v of versions) {
            try {
                await fs.unlink(v.file_path);
                console.log('🧹 Deleted:', v.file_path);
            } catch (err) {
                console.log('File already deleted or not found:', v.file_path);
            }
        }

        // Log activity
        await connection.execute(
            `INSERT INTO activities (user_id, username, file_id, file_name, action, details) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [req.userId, req.user.username, req.params.fileId, file.original_name, 'delete', `File deleted: ${file.title || file.original_name}`]
        );

        await connection.commit();
        
        console.log('✅ File deleted:', file.original_name);

        res.json({ 
            message: 'File deleted successfully',
            fileName: file.original_name
        });
    } catch (error) {
        await connection.rollback();
        console.error('Delete error:', error);
        res.status(500).json({ message: 'Error deleting file' });
    } finally {
        connection.release();
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
