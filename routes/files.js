const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const auth = require('../middleware/Auth');
const fileController = require('../controllers/FileController');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '..', 'uploads'));
    },
    filename: (req, file, cb) => {
        cb(null, uuidv4() + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { 
        fileSize: 500 * 1024 * 1024  // 500MB limit (change kora hoise)
    }
});

// Error handling middleware for multer
const handleUpload = (req, res, next) => {
    upload.single('file')(req, res, (err) => {
        if (err) {
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({ 
                        message: 'File too large! Maximum size is 500MB' 
                    });
                }
                return res.status(400).json({ message: err.message });
            }
            return res.status(500).json({ message: 'Upload error' });
        }
        next();
    });
};

router.post('/upload', auth, handleUpload, fileController.uploadFile);
router.put('/update/:fileId', auth, handleUpload, fileController.updateFile);
router.get('/', auth, fileController.getFiles);
router.get('/download/:fileId/:version?', auth, fileController.downloadFile);
router.delete('/:fileId', auth, fileController.deleteFile);

module.exports = router;
