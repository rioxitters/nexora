const express = require('express');
const router = express.Router();
const authController = require('../controllers/AuthController');
const auth = require('../middleware/Auth');

router.post('/signup', authController.signup);
router.post('/login', authController.login);

module.exports = router;
