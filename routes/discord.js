const express = require('express');
const router = express.Router();
const auth = require('../middleware/Auth');
const discordController = require('../controllers/DiscordController');

router.post('/configure', auth, discordController.configureDiscord);
router.post('/test-channel', auth, discordController.testChannel);
router.get('/status', auth, discordController.getDiscordStatus);
router.post('/disconnect', auth, discordController.disconnectDiscord);

module.exports = router;
