const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const authRoutes = require('./routes/auth');
const fileRoutes = require('./routes/files');
const discordRoutes = require('./routes/discord');
const activityRoutes = require('./routes/activity');

const app = express();

// Create uploads directory
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log('✅ Uploads directory created');
}

// ===== CORS Configuration =====
const allowedOrigins = [
    'https://nexoracheats.infinityfree.me', // আপনার ফ্রন্টএন্ড ডোমেইন
    'http://localhost:3000',               // লোকাল ডেভেলপমেন্টের জন্য
    'http://127.0.0.1:3000'
];

app.use(cors({
    origin: function (origin, callback) {
        // allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    credentials: true
}));

// ===== IMPORTANT: INCREASE TIMEOUT FOR LARGE FILES =====
app.use((req, res, next) => {
    req.setTimeout(600000); // 10 minutes
    res.setTimeout(600000); // 10 minutes
    next();
});

// Middleware with increased limits
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true, parameterLimit: 50000 }));

// Serve uploaded files
app.use('/uploads', express.static(uploadDir));

// Serve frontend files
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/discord', discordRoutes);
app.use('/api/activity', activityRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date(),
        uploadDir: uploadDir,
        maxFileSize: '500MB'
    });
});

// Serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Error:', err.message);
    if (err.code === 'ECONNRESET') {
        return res.status(499).json({ message: 'Connection closed by client' });
    }
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ message: 'File too large! Maximum 500MB' });
    }
    res.status(500).json({ message: 'Server error', error: err.message });
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, '0.0.0.0', () => { // Render-এর জন্য '0.0.0.0' জরুরি
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📁 Upload directory: ${uploadDir}`);
    console.log(`📦 Max file size: 500MB`);
    console.log(`⏱️  Timeout: 10 minutes`);
});

// Increase server timeout
server.timeout = 600000; 
server.keepAliveTimeout = 650000; 
server.headersTimeout = 660000;
