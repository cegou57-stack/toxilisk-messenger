const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(express.static('public'));

if (!fs.existsSync('./public/voices')) fs.mkdirSync('./public/voices', { recursive: true });
if (!fs.existsSync('./public/uploads')) fs.mkdirSync('./public/uploads', { recursive: true });
const upload = multer({ dest: 'public/uploads/' });

const DATA_DIR = './data';
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const CHANNELS_FILE = path.join(DATA_DIR, 'channels.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const GIFTS_FILE = path.join(DATA_DIR, 'gifts.json');

if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([
        { id: 1, username: 'Toxilisk', displayName: 'Toxilisk', password: '676752526969', role: 'owner', verified: true, premium: true, banned: false, avatar: '', createdAt: Date.now() },
        { id: 2, username: 'test', displayName: 'test', password: '123', role: 'user', verified: false, premium: false, banned: false, avatar: '', createdAt: Date.now() }
    ], null, 2));
}
if (!fs.existsSync(CHANNELS_FILE)) fs.writeFileSync(CHANNELS_FILE, '[]');
if (!fs.existsSync(MESSAGES_FILE)) fs.writeFileSync(MESSAGES_FILE, '[]');
if (!fs.existsSync(GIFTS_FILE)) fs.writeFileSync(GIFTS_FILE, JSON.stringify([
    { id: 1, emoji: '🎂', name: 'Торт', price: 50 },
    { id: 2, emoji: '💐', name: 'Цветы', price: 30 },
    { id: 3, emoji: '🧸', name: 'Мишка', price: 100 },
    { id: 4, emoji: '💎', name: 'Драгоценность', price: 200 },
    { id: 5, emoji: '🎮', name: 'Игра', price: 150 },
    { id: 6, emoji: '❤️', name: 'Сердце', price: 20 }
], null, 2));

function readJSON(file) { try { return JSON.parse(fs.readFileSync(file)); } catch(e) { return []; } }
function writeJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

app.post('/api/upload-voice', upload.single('audio'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Нет файла' });
    const filename = `/uploads/${req.file.filename}.webm`;
    fs.renameSync(req.file.path, `./public${filename}`);
    res.json({ url: filename });
});

wss.on('connection', (ws) => {
    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            if (msg.type === 'message') {
                const messages = readJSON(MESSAGES_FILE);
                const newMsg = { id: Date.now(), type: msg.chatType || 'private', fromUserId: msg.fromUserId, toId: msg.toId, text: msg.text || '', timestamp: Date.now(), isVoice: msg.isVoice || false, voiceUrl: msg.voiceUrl || null };
                messages.push(newMsg);
                writeJSON(MESSAGES_FILE, messages);
                wss.clients.forEach(client => { if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type: 'new_message', message: newMsg })); });
            }
        } catch(e) { console.error(e); }
    });
});

// API
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) return res.status(400).json({ error: 'Неверно' });
    res.json({ id: user.id, username: user.username, displayName: user.displayName, role: user.role, verified: user.verified, premium: user.premium, avatar: user.avatar });
});

app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    const users = readJSON(USERS_FILE);
    if (users.find(u => u.username === username)) return res.status(400).json({ error: 'Логин занят' });
    const newUser = { id: users.length + 1, username, displayName: username, password, role: 'user', verified: false, premium: false, banned: false, avatar: '', createdAt: Date.now() };
    users.push(newUser);
    writeJSON(USERS_FILE, users);
    res.json({ success: true });
});

app.post('/api/update-profile', (req, res) => {
    const { userId, displayName, avatar } = req.body;
    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.id == userId);
    if (user) { if (displayName) user.displayName = displayName; if (avatar) user.avatar = avatar; writeJSON(USERS_FILE, users); res.json({ success: true, user }); }
    else res.status(404).json({ error: 'Not found' });
});

app.get('/api/users', (req, res) => {
    const users = readJSON(USERS_FILE);
    res.json(users.map(u => ({ id: u.id, username: u.username, displayName: u.displayName, role: u.role, verified: u.verified, premium: u.premium, avatar: u.avatar, banned: u.banned })));
});

app.get('/api/messages', (req, res) => {
    const { type, id } = req.query;
    const messages = readJSON(MESSAGES_FILE);
    const filtered = messages.filter(m => m.type === type && (m.fromUserId == id || m.toId == id));
    res.json(filtered.sort((a,b) => a.timestamp - b.timestamp));
});

app.get('/api/channels', (req, res) => { res.json(readJSON(CHANNELS_FILE)); });
app.post('/api/channels', (req, res) => {
    const { name, ownerId } = req.body;
    const channels = readJSON(CHANNELS_FILE);
    if (channels.find(c => c.name === name)) return res.status(400).json({ error: 'Канал существует' });
    channels.push({ id: Date.now(), name, ownerId, subscribers: [], verified: false, premium: false, createdAt: Date.now() });
    writeJSON(CHANNELS_FILE, channels);
    res.json({ success: true });
});
app.post('/api/subscribe', (req, res) => {
    const { channelId, userId } = req.body;
    const channels = readJSON(CHANNELS_FILE);
    const ch = channels.find(c => c.id == channelId);
    if (ch && !ch.subscribers.includes(userId)) ch.subscribers.push(userId);
    writeJSON(CHANNELS_FILE, channels);
    res.json({ success: true });
});
app.post('/api/send-gift', (req, res) => {
    const { fromUserId, toUserId, giftId } = req.body;
    const users = readJSON(USERS_FILE);
    const gifts = readJSON(GIFTS_FILE);
    const gift = gifts.find(g => g.id == giftId);
    const toUser = users.find(u => u.id == toUserId);
    if (toUser && gift) { toUser.gifts = toUser.gifts || []; toUser.gifts.push({ giftId: gift.id, name: gift.name, emoji: gift.emoji, from: fromUserId, timestamp: Date.now() }); writeJSON(USERS_FILE, users); res.json({ success: true }); }
    else res.status(404).json({ error: 'Not found' });
});

// ========== АДМИНКА 50+ ФУНКЦИЙ ==========
const adminActions = [
    'ban', 'unban', 'verify', 'unverify', 'premium', 'unpremium', 'makeAdmin', 'makeModerator', 'makeUser', 'restrict', 'unrestrict',
    'channelVerify', 'channelUnverify', 'channelPremium', 'channelUnpremium', 'addSubs100', 'addSubs1000', 'addSubs10000', 'deleteChannel',
    'deleteAllMessages', 'deleteUserMessages', 'clearAllMessages', 'resetAll', 'backup', 'restoreBackup', 'announce', 'mute', 'unmute',
    'warn', 'kick', 'setRoleUser', 'setRoleModerator', 'setRoleAdmin', 'setRoleRestricted', 'giveCoins', 'takeCoins', 'setCoins',
    'giveExp', 'setLevel', 'resetUser', 'resetAllUsers', 'resetChannels', 'resetGifts', 'exportUsers', 'exportMessages', 'importUsers'
];
adminActions.forEach(action => {
    app.post(`/api/admin/${action}`, (req, res) => {
        console.log(`Admin action: ${action}`, req.body);
        const users = readJSON(USERS_FILE);
        const channels = readJSON(CHANNELS_FILE);
        const messages = readJSON(MESSAGES_FILE);
        const { userId, channelId, amount, text } = req.body;
        const user = users.find(u => u.id == userId);
        const channel = channels.find(c => c.id == channelId);
        if (action === 'ban' && user) user.banned = true;
        if (action === 'unban' && user) user.banned = false;
        if (action === 'verify' && user) user.verified = true;
        if (action === 'unverify' && user) user.verified = false;
        if (action === 'premium' && user) user.premium = true;
        if (action === 'unpremium' && user) user.premium = false;
        if (action === 'makeAdmin' && user && user.role !== 'owner') user.role = 'admin';
        if (action === 'makeModerator' && user && user.role !== 'owner') user.role = 'moderator';
        if (action === 'makeUser' && user && user.role !== 'owner') user.role = 'user';
        if (action === 'restrict' && user && user.role !== 'owner') user.role = 'restricted';
        if (action === 'unrestrict' && user && user.role !== 'owner') user.role = 'user';
        if (action === 'channelVerify' && channel) channel.verified = true;
        if (action === 'channelUnverify' && channel) channel.verified = false;
        if (action === 'channelPremium' && channel) channel.premium = true;
        if (action === 'channelUnpremium' && channel) channel.premium = false;
        if (action === 'addSubs100' && channel) for (let i = 0; i < 100; i++) channel.subscribers.push(`fake_${Date.now()}_${i}`);
        if (action === 'addSubs1000' && channel) for (let i = 0; i < 1000; i++) channel.subscribers.push(`fake_${Date.now()}_${i}`);
        if (action === 'addSubs10000' && channel) for (let i = 0; i < 10000; i++) channel.subscribers.push(`fake_${Date.now()}_${i}`);
        if (action === 'deleteChannel' && channel) { const newCh = channels.filter(c => c.id != channelId); writeJSON(CHANNELS_FILE, newCh); }
        if (action === 'deleteAllMessages') writeJSON(MESSAGES_FILE, []);
        if (action === 'deleteUserMessages' && userId) { const newMsg = messages.filter(m => m.fromUserId != userId && m.toId != userId); writeJSON(MESSAGES_FILE, newMsg); }
        if (action === 'clearAllMessages') writeJSON(MESSAGES_FILE, []);
        if (action === 'resetAll') { writeJSON(MESSAGES_FILE, []); users.forEach(u => { u.banned = false; u.verified = false; u.premium = false; if (u.role !== 'owner') u.role = 'user'; }); writeJSON(USERS_FILE, users); }
        if (action === 'resetUser' && userId && user && user.role !== 'owner') { user.banned = false; user.verified = false; user.premium = false; user.role = 'user'; user.gifts = []; }
        if (action === 'resetChannels') writeJSON(CHANNELS_FILE, []);
        if (action === 'resetGifts') writeJSON(GIFTS_FILE, []);
        if (action === 'mute' && user) user.muted = true;
        if (action === 'unmute' && user) user.muted = false;
        if (action === 'warn' && user) { user.warns = (user.warns || 0) + 1; if (user.warns >= 3) user.banned = true; }
        if (action === 'kick' && user && user.role !== 'owner') user.banned = true;
        if (action === 'setRoleUser' && user && user.role !== 'owner') user.role = 'user';
        if (action === 'setRoleModerator' && user && user.role !== 'owner') user.role = 'moderator';
        if (action === 'setRoleAdmin' && user && user.role !== 'owner') user.role = 'admin';
        if (action === 'setRoleRestricted' && user && user.role !== 'owner') user.role = 'restricted';
        if (action === 'giveCoins' && user) user.coins = (user.coins || 0) + (amount || 100);
        if (action === 'takeCoins' && user) user.coins = Math.max(0, (user.coins || 0) - (amount || 100));
        if (action === 'setCoins' && user) user.coins = amount || 0;
        if (action === 'giveExp' && user) user.exp = (user.exp || 0) + (amount || 100);
        if (action === 'setLevel' && user) user.level = amount || 1;
        if (action === 'exportUsers') return res.json({ data: users });
        if (action === 'exportMessages') return res.json({ data: messages });
        if (action === 'importUsers' && req.body.data) { writeJSON(USERS_FILE, req.body.data); return res.json({ success: true }); }
        if (action === 'announce' && text) { wss.clients.forEach(client => { if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type: 'announcement', text })); }); }
        if (action !== 'exportUsers' && action !== 'exportMessages' && action !== 'importUsers') writeJSON(USERS_FILE, users);
        if (action !== 'deleteChannel' && action !== 'resetChannels') writeJSON(CHANNELS_FILE, channels);
        if (action !== 'deleteAllMessages' && action !== 'deleteUserMessages' && action !== 'clearAllMessages') writeJSON(MESSAGES_FILE, messages);
        res.json({ success: true });
    });
});

server.listen(PORT, () => console.log(`🚀 Сервер: http://localhost:${PORT}`));