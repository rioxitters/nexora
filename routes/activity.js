const express = require('express');
const router = express.Router();
const auth = require('../middleware/Auth');
const activityController = require('../controllers/ActivityController');

router.get('/', auth, activityController.getActivities);

module.exports = router;
