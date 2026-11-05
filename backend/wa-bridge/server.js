const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Client, LocalAuth } = require('whatsapp-web.js');

// Global error handlers to keep the bridge running 24/7 without crashing
process.on('uncaughtException', (err) => {
    console.error('[Bridge Uncaught Exception]', err);
});
process.on('unhandledRejection', (reason) => {
    console.error('[Bridge Unhandled Rejection]', reason);
});

const app = express();
app.use(cors());
app.use(express.json());

let qrCodeData = null;
let clientReady = false;
let userNumber = null;
let client = null;
const sentBotTexts = new Set();
const knownSelfLids = new Set(['188703733456915@lid']);

// Dynamic browser executable detection for Windows / Linux / macOS
function findBrowserExecutable() {
    const candidates = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    ];

    for (const p of candidates) {
        if (p && fs.existsSync(p)) {
            console.log(`Found browser at: ${p}`);
            return p;
        }
    }
    return undefined; // Let puppeteer resolve default
}

const executablePath = findBrowserExecutable();
console.log("Using browser binary:", executablePath || "Default Puppeteer bundled browser");

const puppeteerOptions = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
};
if (executablePath) {
    puppeteerOptions.executablePath = executablePath;
}

// Forward incoming messages (including self-chat "You" messages) to Python backend webhook
async function handleMessageCreate(msg) {
    try {
        if (!msg || !msg.body || typeof msg.body !== 'string' || !msg.body.trim()) {
            return;
        }

        const trimmedBody = msg.body.trim();
        const remote = (msg.id && msg.id.remote) ? msg.id.remote : (msg.to || msg.from || '');
        const isGroup = remote.includes('@g.us') || msg.from.includes('@g.us') || (msg.to && msg.to.includes('@g.us'));

        // Cache self LIDs dynamically from any outgoing message
        if (msg.fromMe) {
            if (msg.from && msg.from.includes('@lid')) knownSelfLids.add(msg.from);
            if (msg.to && msg.to.includes('@lid')) knownSelfLids.add(msg.to);
            if (remote.includes('@lid')) knownSelfLids.add(remote);
        }

        // Determine if this is a message in self-chat ("You" / Message Yourself)
        const isSelfChat = !isGroup && Boolean(
            (userNumber && remote.includes(userNumber)) ||
            (client && client.info && client.info.wid && remote === client.info.wid._serialized) ||
            (msg.from && msg.to && msg.from === msg.to) ||
            knownSelfLids.has(remote) ||
            (msg.to && knownSelfLids.has(msg.to)) ||
            (msg.from && knownSelfLids.has(msg.from)) ||
            (msg.fromMe && (remote.includes('@lid') || (msg.to && msg.to.includes('@lid'))))
        );

        console.log(`[WhatsApp Event] from: ${msg.from} | to: ${msg.to} | remote: ${remote} | fromMe: ${msg.fromMe} | isSelf: ${isSelfChat} | body: "${trimmedBody.slice(0, 50)}"`);

        // Prevent loop: ignore messages sent by our bot endpoint
        if (sentBotTexts.has(trimmedBody)) {
            console.log(`[WhatsApp Loop Guard] Ignored bot's own response: "${trimmedBody.slice(0, 40)}"`);
            sentBotTexts.delete(trimmedBody);
            return;
        }

        // If message is outgoing to another person (NOT self-chat), do not intercept
        if (msg.fromMe && !isSelfChat) {
            return;
        }

        console.log(`[WhatsApp Incoming Accepted] from: ${msg.from} | isSelf: ${isSelfChat} | body: "${trimmedBody}"`);

        // If it's self-chat, the sender to address is userNumber
        const sender = isSelfChat ? (userNumber || msg.from) : msg.from;

        const payload = JSON.stringify({
            from: sender,
            rawFrom: msg.from,
            to: msg.to,
            remote: remote,
            body: msg.body,
            isSelf: isSelfChat,
            timestamp: msg.timestamp
        });

        const req = http.request({
            hostname: '127.0.0.1',
            port: 8790,
            path: '/api/integrations/whatsapp/incoming',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, (res) => {
            // Delivered
        });

        req.on('error', (e) => {
            console.error("Backend webhook error:", e.message);
        });

        req.write(payload);
        req.end();
    } catch (err) {
        console.error("Error processing message_create event:", err);
    }
}

function initWhatsAppClient() {
    try {
        console.log("[WhatsApp Bridge] Initializing WhatsApp Web client...");
        client = new Client({
            authStrategy: new LocalAuth({ dataPath: path.join(__dirname, '.wwebjs_auth') }),
            puppeteer: puppeteerOptions
        });

        client.on('qr', (qr) => {
            console.log('WhatsApp QR code generated');
            qrCodeData = qr;
            clientReady = false;
        });

        client.on('ready', () => {
            console.log('WhatsApp Web client is READY!');
            clientReady = true;
            qrCodeData = null;
            userNumber = client.info && client.info.wid ? client.info.wid.user : null;
            if (client.info && client.info.lid && client.info.lid._serialized) {
                knownSelfLids.add(client.info.lid._serialized);
            }
            console.log(`Paired with user phone: ${userNumber}`);
        });

        client.on('authenticated', () => {
            console.log('WhatsApp Web authenticated successfully');
        });

        client.on('auth_failure', (msg) => {
            console.error('WhatsApp authentication failed:', msg);
            clientReady = false;
        });

        client.on('disconnected', (reason) => {
            console.log('WhatsApp Web was disconnected:', reason);
            clientReady = false;
            qrCodeData = null;
            setTimeout(() => {
                if (client) {
                    try { client.initialize(); } catch (e) { console.error('Re-init error:', e); }
                }
            }, 2000);
        });

        client.on('message_create', handleMessageCreate);

        client.initialize().catch(err => {
            console.error("Error in client.initialize():", err.message);
        });
    } catch (e) {
        console.error("Fatal error creating WhatsApp client:", e);
    }
}

// Initial launch
initWhatsAppClient();

// API Routes
app.get('/status', (req, res) => {
    res.json({
        ready: clientReady,
        hasQr: !!qrCodeData,
        phone: userNumber,
        status: clientReady ? 'ready' : (qrCodeData ? 'pending' : 'initializing')
    });
});

app.get('/qr', (req, res) => {
    if (clientReady) {
        return res.json({ status: 'ready', qr: null, phone: userNumber });
    }
    if (qrCodeData) {
        return res.json({ status: 'pending', qr: qrCodeData });
    }
    return res.json({ status: 'initializing', qr: null });
});

app.post('/unlink', async (req, res) => {
    try {
        console.log('[WhatsApp Bridge] Received UNLINK request from user. Resetting session...');
        clientReady = false;
        qrCodeData = null;
        userNumber = null;

        if (client) {
            try {
                await client.logout();
                console.log('[WhatsApp Bridge] Logged out from WhatsApp Web servers.');
            } catch (err) {
                console.warn('[WhatsApp Bridge] Logout notice (ignored):', err.message);
            }

            try {
                await client.destroy();
                console.log('[WhatsApp Bridge] Puppeteer client destroyed.');
            } catch (err) {
                console.warn('[WhatsApp Bridge] Destroy notice (ignored):', err.message);
            }
            client = null;
        }

        // Delete auth cache folder to force a completely fresh pairing QR code
        const authDir = path.join(__dirname, '.wwebjs_auth');
        try {
            if (fs.existsSync(authDir)) {
                fs.rmSync(authDir, { recursive: true, force: true });
                console.log('[WhatsApp Bridge] Removed auth directory .wwebjs_auth successfully.');
            }
        } catch (fsErr) {
            console.warn('[WhatsApp Bridge] Auth folder cleanup warning:', fsErr.message);
        }

        // Re-initialize a fresh client to generate a brand new QR code
        setTimeout(() => {
            console.log('[WhatsApp Bridge] Spawning fresh WhatsApp client for new link...');
            initWhatsAppClient();
        }, 1500);

        return res.json({
            success: true,
            message: 'Unlinked successfully. Generating fresh QR code for pairing...'
        });
    } catch (e) {
        console.error('[WhatsApp Bridge] Unlink error:', e);
        return res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/send', async (req, res) => {
    if (!clientReady || !client) {
        return res.status(400).json({ error: 'WhatsApp client is not paired or ready yet. Scan the QR code first.' });
    }
    const { number, text } = req.body;
    if (!number || !text) {
        return res.status(400).json({ error: 'Both "number" and "text" are required.' });
    }

    try {
        let cleanNumber = number.replace(/[^0-9]/g, '');
        let chatId = cleanNumber.includes('@c.us') ? cleanNumber : `${cleanNumber}@c.us`;

        // If sending to user's own number or self, use client.info.wid._serialized
        if (userNumber && (cleanNumber === userNumber || cleanNumber.includes(userNumber))) {
            if (client.info && client.info.wid) {
                chatId = client.info.wid._serialized;
            }
        }

        // Track bot text to avoid responding to own message in message_create
        sentBotTexts.add(text.trim());
        setTimeout(() => sentBotTexts.delete(text.trim()), 45000);

        console.log(`[WhatsApp Sending] To: ${chatId} | Text: ${text.slice(0, 60)}...`);
        await client.sendMessage(chatId, text);
        res.json({ success: true, recipient: chatId });
    } catch (e) {
        console.error("Failed to send message:", e);
        res.status(500).json({ error: e.message });
    }
});

const PORT = 3001;
app.listen(PORT, '127.0.0.1', () => {
    console.log(`WhatsApp Bridge running on http://127.0.0.1:${PORT}`);
});
