const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execSync } = require('child_process');
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
let isInitializing = false;
let currentSessionId = 'session_default';
const sentBotTexts = new Set();
const knownSelfLids = new Set(['188703733456915@lid']);

// Dynamically kill any lingering headless Chrome instances tied to wa-bridge / wwebjs_auth
function killLingeringChrome() {
    if (process.platform === 'win32') {
        try {
            console.log('[WhatsApp Bridge] Checking for and terminating lingering headless Chrome processes...');
            execSync(
                'powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name = \'chrome.exe\'\\" | Where-Object { $_.CommandLine -like \'*wwebjs_auth*\' -or $_.CommandLine -like \'*wa-bridge*\' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"',
                { stdio: 'ignore', timeout: 5000 }
            );
        } catch (e) {
            // Ignore if no processes found or timeout
        }
    }
}

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
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check'
    ]
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
    if (isInitializing) {
        console.log('[WhatsApp Bridge] Already initializing, skipping redundant call.');
        return;
    }
    isInitializing = true;

    try {
        killLingeringChrome();

        console.log(`[WhatsApp Bridge] Initializing WhatsApp Web client (session: ${currentSessionId})...`);
        const authDataPath = path.join(__dirname, '.wwebjs_auth');
        fs.mkdirSync(authDataPath, { recursive: true });

        client = new Client({
            authStrategy: new LocalAuth({
                clientId: currentSessionId,
                dataPath: authDataPath
            }),
            puppeteer: puppeteerOptions
        });

        client.on('qr', (qr) => {
            console.log(`[WhatsApp Bridge] New QR code generated at ${new Date().toLocaleTimeString()} (length: ${qr.length})`);
            qrCodeData = qr;
            clientReady = false;
            isInitializing = false;
        });

        client.on('ready', () => {
            console.log('[WhatsApp Bridge] WhatsApp Web client is READY!');
            clientReady = true;
            qrCodeData = null;
            isInitializing = false;
            userNumber = client.info && client.info.wid ? client.info.wid.user : null;
            if (client.info && client.info.lid && client.info.lid._serialized) {
                knownSelfLids.add(client.info.lid._serialized);
            }
            console.log(`[WhatsApp Bridge] Paired successfully with phone: ${userNumber}`);
        });

        client.on('authenticated', () => {
            console.log('[WhatsApp Bridge] WhatsApp Web authenticated successfully.');
            qrCodeData = null;
        });

        client.on('auth_failure', (msg) => {
            console.error('[WhatsApp Bridge] Authentication failure:', msg);
            clientReady = false;
            isInitializing = false;
        });

        client.on('loading_screen', (percent, message) => {
            console.log(`[WhatsApp Bridge] Loading: ${percent}% - ${message}`);
        });

        client.on('disconnected', (reason) => {
            console.log('[WhatsApp Bridge] Disconnected:', reason);
            clientReady = false;
            qrCodeData = null;
            isInitializing = false;
            setTimeout(() => {
                if (client) {
                    try { client.initialize(); } catch (e) { console.error('Re-init error:', e); }
                }
            }, 3000);
        });

        client.on('message_create', handleMessageCreate);

        client.initialize().catch(err => {
            console.error("[WhatsApp Bridge] Error in client.initialize():", err.message);
            isInitializing = false;
            console.log("[WhatsApp Bridge] Will retry initialize in 3 seconds...");
            setTimeout(() => {
                if (!clientReady && !qrCodeData) {
                    initWhatsAppClient();
                }
            }, 3000);
        });
    } catch (e) {
        console.error("[WhatsApp Bridge] Fatal error launching WhatsApp client:", e);
        isInitializing = false;
    }
}

// Initial launch on startup
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
        isInitializing = false;

        // Gracefully attempt logout and destroy
        if (client) {
            try {
                await client.logout();
                console.log('[WhatsApp Bridge] Session logged out.');
            } catch (err) {
                console.warn('[WhatsApp Bridge] Logout notice (ignored):', err.message);
            }

            try {
                await client.destroy();
                console.log('[WhatsApp Bridge] Client destroyed.');
            } catch (err) {
                console.warn('[WhatsApp Bridge] Destroy notice (ignored):', err.message);
            }
            client = null;
        }

        // Forcefully kill any remaining chrome processes
        killLingeringChrome();

        // Rotate to a fresh session directory so file locks NEVER collide
        const oldSessionId = currentSessionId;
        currentSessionId = 'session_' + Date.now();
        console.log(`[WhatsApp Bridge] Switched session ID to: ${currentSessionId}`);

        // Clean up old session directories asynchronously
        setTimeout(() => {
            try {
                const oldDir = path.join(__dirname, '.wwebjs_auth', `session-${oldSessionId}`);
                if (fs.existsSync(oldDir)) {
                    fs.rmSync(oldDir, { recursive: true, force: true });
                    console.log(`[WhatsApp Bridge] Cleaned up old session directory: ${oldDir}`);
                }
            } catch (e) {
                // Ignore background cleanup lock
            }
        }, 3000);

        // Spawn brand new client with clean session folder
        setTimeout(() => {
            console.log('[WhatsApp Bridge] Spawning fresh WhatsApp client for new link...');
            initWhatsAppClient();
        }, 1200);

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
app.listen(PORT, '0.0.0.0', () => {
    console.log(`WhatsApp Bridge running on port ${PORT}`);
});
