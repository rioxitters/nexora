const fs = require('fs').promises;
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');

async function ensureDataDir() {
    try {
        await fs.mkdir(dataDir, { recursive: true });
    } catch (e) {}
}

async function readJSON(filename) {
    await ensureDataDir();
    const file = path.join(dataDir, filename);
    try {
        const txt = await fs.readFile(file, 'utf8');
        return JSON.parse(txt || '[]');
    } catch (e) {
        return [];
    }
}

async function writeJSON(filename, data) {
    await ensureDataDir();
    const file = path.join(dataDir, filename);
    await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
}

function generateId(prefix = '') {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2,8);
}

module.exports = {
    readJSON,
    writeJSON,
    generateId,
    dataDir
};
