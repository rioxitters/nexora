const express = require('express');
const router = express.Router();
const authController = require('../controllers/AuthController');

// Signup removed - authentication uses a single hardcoded admin account.
router.post('/login', authController.login);

module.exports = router;
