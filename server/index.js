const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

// Load Modules
const config = require('./config');
const db = require('./lib/redis');
const webhook = require('./lib/webhook');

const app = express();

// In-Memory Storage (Synced with Redis)
const SESSIONS = new Map();
const dynamicWhitelist = { userIds: new Set(), hwids: new Set(), ips: new Set() };
const suspendedUsers = { hwids: new Map(), userIds: new Map(), sessions: new Map() };

// ==================== CONSTANTS & PATTERNS ====================

const BOT_PATTERNS = [
    'python', 'curl', 'wget', 'axios', 'node', 'got', 'undici', 'superagent', 'java', 'okhttp', 'go-http', 
    'postman', 'insomnia', 'paw', 'bot', 'crawler', 'spider', 'scraper', 'discord', 'telegram', 'facebook', 
    'slurp', 'yandex', 'burp', 'fiddler', 'charles', 'mitmproxy', 'nmap', 'nikto', 'sqlmap', 'monitor', 'probe'
];

const BROWSER_HEADERS = [
    'sec-fetch-dest', 'sec-fetch-mode', 'sec-fetch-site', 'sec-ch-ua', 'sec-ch-ua-mobile', 
    'upgrade-insecure-requests', 'accept-language'
];

const EXECUTOR_HEADERS = [
    'x-hwid', 'x-roblox-id', 'x-place-id', 'x-job-id', 'x-session-id'
];

const ALLOWED_EXECUTORS = [
    'synapse', 'script-ware', 'scriptware', 'delta', 'fluxus', 'krnl', 'oxygen', 'evon', 'hydrogen', 
    'vegax', 'trigon', 'comet', 'solara', 'wave', 'zorara', 'codex', 'celery', 'swift', 'sirhurt', 
    'electron', 'sentinel', 'coco', 'temple', 'valyse', 'nihon', 'jjsploit', 'arceus', 'roblox', 'wininet', 'win32'
];

// ==================== UTILITY FUNCTIONS ====================

function hmac(d, k) { return crypto.createHmac('sha256', k).update(d).digest('hex'); }

function secureCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    try { return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)); } catch { return false; }
}

function getIP(req) {
    return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.headers['x-real-ip'] || req.ip || '0.0.0.0';
}

function getHWID(req) {
    return req.headers['x-hwid'] || req.body?.hwid || null;
}

function genSessionKey(userId, hwid, timestamp, secret) {
    return crypto.createHmac('sha256', secret).update(`${userId}:${hwid}:${timestamp}`).digest('hex').substring(0, 32);
}

// ==================== CLIENT DETECTION ====================

function getClientType(req) {
    const ua = (req.headers['user-agent'] || '').toLowerCase();
    const h = req.headers;
    const eS = EXECUTOR_HEADERS.filter(x => h[x]).length;
    
    if (BOT_PATTERNS.some(p => ua.includes(p)) && eS === 0) return 'bot';
    if (h['sec-fetch-mode'] || h['upgrade-insecure-requests']) return 'browser';
    if (eS >= 1 || ALLOWED_EXECUTORS.some(e => ua.includes(e))) return 'executor';
    if (!ua || ua.length < 5) return 'bot';
    return 'unknown';
}

async function isWhitelisted(req) {
    const ip = getIP(req);
    const hwid = getHWID(req);
    const userId = req.headers['x-roblox-id'] || req.body?.userId;

    if (config.WHITELIST_IPS?.includes(ip) || dynamicWhitelist.ips.has(ip)) return true;
    if (userId && (config.WHITELIST_USER_IDS?.includes(parseInt(userId)) || dynamicWhitelist.userIds.has(parseInt(userId)))) return true;
    if (hwid && (config.WHITELIST_HWIDS?.includes(String(hwid)) || dynamicWhitelist.hwids.has(String(hwid)))) return true;
    return false;
}

function shouldBlock(req) {
    if (req.path === '/health') return false;
    const ua = (req.headers['user-agent'] || '').toLowerCase();
    if (['uptimerobot', 'uptime-kuma', 'better uptime'].some(b => ua.includes(b))) return false;
    const ct = getClientType(req);
    return ['bot', 'browser', 'unknown'].includes(ct);
}

// ==================== FAKE SCRIPT GENERATOR ====================

function genFakeScript() {
    const rS = (l) => {
        const c = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_';
        let s = c[Math.floor(Math.random() * 26)];
        for (let i = 1; i < l; i++) s += c[Math.floor(Math.random() * c.length)];
        return s;
    };
    const rH = (l) => crypto.randomBytes(l / 2).toString('hex');
    const v = Array(40).fill(0).map(() => rS(Math.floor(Math.random() * 10) + 8));
    
    let fake = `--[[ Luraph Obfuscator v14.4.7 | Build: ${rH(16)} ]]\n`;
    fake += `local ${v[0]}, ${v[1]}, ${v[2]} = function() end, {}, "${rH(64)}";\n`;
    fake += `local ${v[3]} = { `;
    for (let i = 0; i < 300; i++) { fake += `"${rH(16)}", `; }
    fake += `};\n`;
    fake += `local ${v[4]} = function(${v[5]}) 
        local ${v[6]} = 0;
        for ${v[7]} = 1, #${v[5]} do 
            ${v[6]} = bit32.bxor(${v[6]}, string.byte(${v[5]}, ${v[7]})) 
            ${v[6]} = bit32.lrotate(${v[6]}, ${Math.floor(Math.random()*8)})
        end;
        return ${v[6]};
    end;\n`;
    fake += `local ${v[10]} = {`;
    for(let i=0; i<100; i++) { fake += `[${i}] = "${rH(8)}",`; }
    fake += `};\n`;
    fake += `if ${v[4]}("${rH(32)}") == ${Math.floor(Math.random()*9999)} then ${v[0]}() end;\n`;
    fake += `error("Invalid License or HWID Mismatch (${rH(8)})", 0);\n`;
    fake += `return ${v[3]};`;
    return fake;
}

// ==================== LOGGING ====================

async function logAccess(req, action, success, extra = {}) {
    const logData = {
        ip: getIP(req),
        hwid: getHWID(req) || extra.hwid || 'N/A',
        userId: req.headers['x-roblox-id'] || req.body?.userId || extra.userId || 'N/A',
        ua: (req.headers['user-agent'] || '').substring(0, 150),
        client: extra.clientType || getClientType(req),
        action: action,
        success: success,
        ts: new Date().toISOString(),
        ...extra
    };
    await db.addLog(logData);
    return logData;
}

// ==================== ENCRYPTION & CHUNKING ====================

function encryptChunk(c, k) {
    const e = [];
    for (let i = 0; i < c.length; i++) e.push((c.charCodeAt(i) ^ k.charCodeAt(i % k.length)) & 255);
    return e;
}

async function prepareChunks(s, ch) {
    const n = config.CHUNK_COUNT || 3;
    const z = Math.ceil(s.length / n);
    const chunks = [];
    for (let i = 0; i < s.length; i += z) chunks.push(s.substring(i, i + z));
    
    const base = crypto.createHash('sha256').update((ch.hwid || '') + (ch.userId || '') + config.SECRET_KEY).digest('hex');
    const keys = chunks.map((_, i) => crypto.createHash('md5').update(base + i).digest('hex'));
    
    return {
        chunks: chunks.map((x, i) => ({ index: i, data: encryptChunk(x, keys[i]) })),
        keys,
        totalChunks: chunks.length
    };
}

// ==================== SUSPEND & SCRIPT HANDLERS ====================

function checkSuspended(h, u, sid) {
    const now = Date.now();
    const check = (map, key) => {
        if (map.has(key)) {
            const data = map.get(key);
            if (!data.expiresAt || new Date(data.expiresAt).getTime() > now) return { suspended: true, reason: data.reason || 'Suspended' };
            map.delete(key);
        }
        return null;
    };
    return check(suspendedUsers.sessions, sid) || check(suspendedUsers.hwids, h) || check(suspendedUsers.userIds, String(u));
}

async function getScript() {
    const c = await db.getCachedScript();
    if (c) return c;
    if (!config.SCRIPT_SOURCE_URL) return null;
    try {
        const res = await axios.get(config.SCRIPT_SOURCE_URL, { timeout: 30000 });
        if (res.data) { await db.setCachedScript(res.data); return res.data; }
    } catch (e) { console.error('Script fetch error:', e.message); }
    return null;
}

function isObfuscated(s) {
    if (!s) return false;
    return [/Luraph/i, /Moonsec/i, /IronBrew/i, /Prometheus/i, /PSU/i].some(r => r.test(s.substring(0, 500)));
}

// ==================== SCRIPT WRAPPER (ANTI-SPY V4) ====================

function wrapScript(script, serverUrl) {
    const o = (config.OWNER_USER_IDS || []).join(',');
    const w = (config.WHITELIST_USER_IDS || []).join(',');
    const sid = crypto.randomBytes(16).toString('hex');
    const antiSpy = config.ANTI_SPY_ENABLED !== false;
    const autoBan = config.AUTO_BAN_SPYTOOLS === true;
    const blacklistedTools = `{ "spy", "dex", "remote", "http", "dumper", "explorer", "infinite", "yield", "iy", "console", "decompile", "saveinstance", "scriptdumper", "dark", "turtle" }`;

    return `--[[ Shield Protection Layer v4 ]]
local _CFG = {o = {${o}}, w = {${w}}, bu = "${serverUrl}/api/ban", wu = "${serverUrl}/api/webhook/suspicious", hu = "${serverUrl}/api/heartbeat", sid = "${sid}", as = ${antiSpy}, ab = ${autoBan}, hbi = 45}
local P, L, G, H = game:GetService("Players"), game:GetService("Players").LocalPlayer, game:GetService("CoreGui"), game:GetService("HttpService")
local A, S, BL = true, {}, ${blacklistedTools}
local function hp(u, d) if not request then return end pcall(function() request({Url = u, Method = "POST", Headers = {["Content-Type"]="application/json", ["x-session-id"]=_CFG.sid}, Body = H:JSONEncode(d)}) end) end
local function cl(m) if not A then return end A = false pcall(function() game:GetService("StarterGui"):SetCore("SendNotification", {Title="Shield", Text=m, Duration=5}) end) task.wait(1) L:Kick(m) end
task.spawn(function() pcall(function() for _,g in pairs(G:GetChildren()) do S[g] = true end end) task.wait(2)
while A do pcall(function() for _,g in pairs(G:GetChildren()) do if not S[g] then local n = g.Name:lower() for _,b in ipairs(BL) do if n:find(b) and not n:find("roblox") then hp(_CFG.wu, {userId = L.UserId, tool = g.Name, sessionId = _CFG.sid}) if _CFG.ab then hp(_CFG.bu, {playerId = L.UserId, reason = "Spy Tool: "..g.Name, sessionId = _CFG.sid}) end cl("Security Violation") end end end end end) task.wait(3) end end)
task.spawn(function() while A do local r if request then local ok, res = pcall(function() return request({Url = _CFG.hu, Method = "POST", Headers = {["Content-Type"]="application/json"}, Body = H:JSONEncode({sessionId = _CFG.sid, userId = L.UserId})}) end) if ok and res.StatusCode == 200 then r = H:JSONDecode(res.Body) end end if r and r.action == "TERMINATE" then cl(r.reason or "Terminated by Admin") end task.wait(_CFG.int) end end)
${script}`;
}

function getLoader(url) {
    return `local S="${url}" local H=game:GetService("HttpService") local P=game:GetService("Players") local L=P.LocalPlayer 
local function hp(e,d) local r=(syn and syn.request) or request or http_request if not r then return nil end
local s,v=pcall(function() return r({Url=S..e, Method="POST", Headers={["Content-Type"]="application/json", ["x-hwid"]=(gethwid and gethwid() or "UNK"), ["x-roblox-id"]=tostring(L.UserId)}, Body=H:JSONEncode(d)}) end)
if s and v.StatusCode==200 then return H:JSONDecode(v.Body) end return nil end 
local function xd(d,k) local r={} for i=1,#d do table.insert(r, string.char(bit32.bxor(d[i], string.byte(k, ((i-1)%#k)+1)))) end return table.concat(r) end
local c=hp("/api/auth/challenge", {userId=L.UserId, hwid=(gethwid and gethwid() or "UNK"), placeId=game.PlaceId})
if c and c.success then local sol=0 if c.type=="math" then local p=c.puzzle; sol=(p.a+p.b)*p.c end
local v=hp("/api/auth/verify", {challengeId=c.challengeId, solution=sol, timestamp=os.time()})
if v and v.success then local s; if v.mode=="chunked" then local t={} for _,x in ipairs(v.chunks) do t[x.index+1]=xd(x.data, v.keys[x.index+1]) end s=table.concat(t) else s=v.script end
local f,e=loadstring(s) if f then f() else warn(e) end end end`;
}

// ==================== MIDDLEWARE & SETUP ====================

const viewsPath = path.join(__dirname, 'views');
const TRAP_HTML = fs.existsSync(path.join(viewsPath, 'trap/index.html')) ? fs.readFileSync(path.join(viewsPath, 'trap/index.html'), 'utf8') : '<h1>403 Forbidden</h1>';
const LOADER_HTML_PAGE = fs.existsSync(path.join(viewsPath, 'loader/index.html')) ? fs.readFileSync(path.join(viewsPath, 'loader/index.html'), 'utf8') : '<h1>Loader</h1>';

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

// 1. STRICT GLOBAL BAN CHECK (FIX: Always check IP Ban first)
app.use(async (req, res, next) => {
    const adminPath = config.ADMIN_PATH || '/admin';
    if (req.path.startsWith(adminPath) || req.path === '/health') return next();

    const ip = getIP(req);
    const wl = await isWhitelisted(req);

    if (!wl) {
        const ban = await db.isBanned(null, ip, null);
        if (ban.blocked) {
            await logAccess(req, 'BANNED_IP_BLOCK', false, { reason: ban.reason });
            const ct = getClientType(req);
            return ct === 'browser' ? res.status(403).send(TRAP_HTML) : res.send(genFakeScript());
        }
    }
    next();
});

const adminAuth = (req, res, next) => {
    const k = req.headers['x-admin-key'] || req.query.key;
    if (k && config.ADMIN_KEY && secureCompare(k, config.ADMIN_KEY)) return next();
    res.status(403).json({ success: false, error: 'Unauthorized' });
};

// ==================== ROUTES ====================

app.get(config.ADMIN_PATH || '/admin', (req, res) => {
    const f = path.join(viewsPath, 'admin/index.html');
    fs.existsSync(f) ? res.sendFile(f) : res.status(404).send('Not Found');
});

app.get('/health', (req, res) => res.json({ status: 'ok', redis: db.isRedisConnected?.() ?? false }));

app.get(['/loader', '/l'], async (req, res) => {
    const ct = getClientType(req);
    const url = process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get('host')}`;

    if (ct === 'browser') return res.send(LOADER_HTML_PAGE);
    
    if (shouldBlock(req)) {
        await logAccess(req, 'BOT_BLOCKED', false);
        return res.send(genFakeScript());
    }

    await logAccess(req, 'LOADER_FETCH', true);
    res.send(getLoader(url));
});

app.post('/api/auth/challenge', async (req, res) => {
    if (shouldBlock(req)) return res.send(genFakeScript());

    const { userId, hwid, placeId } = req.body;
    await logAccess(req, 'CHALLENGE_REQ', true, { userId, hwid });

    const wl = await isWhitelisted(req);
    const suspStatus = checkSuspended(hwid, userId, null);
    if (suspStatus) return res.json({ success: false, error: 'Suspended: ' + suspStatus.reason });
    
    if (!wl) {
        const b = await db.isBanned(hwid, getIP(req), userId);
        if (b.blocked) return res.json({ success: false, error: 'Banned: ' + b.reason });
    }

    const id = crypto.randomBytes(16).toString('hex');
    const chal = { type: 'math', puzzle: { a: Math.floor(Math.random() * 20), b: Math.floor(Math.random() * 10), c: Math.floor(Math.random() * 5), op: '+' } };
    chal.answer = (chal.puzzle.a + chal.puzzle.b) * chal.puzzle.c;

    await db.setChallenge(id, { id, userId, hwid, placeId, whitelisted: wl, ...chal }, 120);
    res.json({ success: true, challengeId: id, type: chal.type, puzzle: chal.puzzle });
});

app.post('/api/auth/verify', async (req, res) => {
    const { challengeId, solution, timestamp } = req.body;
    const c = await db.getChallenge(challengeId);

    if (!c) return res.json({ success: false, error: 'Expired' });
    await db.deleteChallenge(challengeId);

    if (parseInt(solution) !== c.answer) {
        await logAccess(req, 'VERIFY_FAIL', false, { userId: c.userId });
        return res.json({ success: false, error: 'Wrong' });
    }

    const src = await getScript();
    if (!src) return res.json({ success: false, error: 'Source Error' });

    const sid = crypto.randomBytes(16).toString('hex');
    const url = process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get('host')}`;
    SESSIONS.set(sid, { hwid: c.hwid, userId: c.userId, created: Date.now(), lastSeen: Date.now() });
    
    webhook.execution({ userId: c.userId, hwid: c.hwid, executor: req.headers['user-agent'] }).catch(() => {});
    await logAccess(req, 'VERIFY_SUCCESS', true, { userId: c.userId, hwid: c.hwid });

    if (config.CHUNK_DELIVERY !== 'false' && !c.whitelisted) {
        const ck = await prepareChunks(wrap(src, url), c);
        return res.json({ success: true, mode: 'chunked', chunks: ck.chunks, keys: ck.keys, sessionId: sid });
    }

    res.json({ success: true, mode: 'raw', script: wrap(src, url), sessionId: sid });
});

app.post('/api/heartbeat', async (req, res) => {
    const { sessionId, hwid, userId } = req.body;
    const s = SESSIONS.get(sessionId);
    if (s) s.lastSeen = Date.now();
    const sp = checkSuspended(hwid, userId, sessionId);
    if (sp) return res.json({ success: false, action: 'TERMINATE', reason: sp.reason });
    res.json({ success: true, action: 'CONTINUE' });
});

// === ADMIN API ===

app.get('/api/admin/stats', adminAuth, async (req, res) => {
    const s = await db.getStats();
    res.json({ success: true, stats: s, sessions: SESSIONS.size });
});

app.get('/api/admin/logs', adminAuth, async (req, res) => {
    res.json({ success: true, logs: await db.getLogs(100) });
});

app.post('/api/admin/logs/clear', adminAuth, async (req, res) => {
    await db.clearLogs();
    res.json({ success: true });
});

app.get('/api/admin/bans', adminAuth, async (req, res) => {
    res.json({ success: true, bans: await db.getAllBans() });
});

app.post('/api/admin/bans', adminAuth, async (req, res) => {
    const { hwid, ip, playerId, reason } = req.body;
    const id = crypto.randomBytes(4).toString('hex').toUpperCase();
    await db.addBan(hwid || playerId || ip, { hwid, playerId, ip, reason, banId: id, ts: new Date().toISOString() });
    res.json({ success: true });
});

app.delete('/api/admin/bans/:id', adminAuth, async (req, res) => {
    res.json({ success: await db.removeBanById(req.params.id) });
});

app.get('/api/admin/sessions', adminAuth, (req, res) => {
    const s = [];
    SESSIONS.forEach((v, k) => s.push({ sessionId: k, ...v, age: Math.floor((Date.now() - v.created) / 1000) }));
    res.json({ success: true, sessions: s });
});

app.post('/api/admin/kill-session', adminAuth, async (req, res) => {
    const data = { reason: 'Killed by Admin', suspendedAt: new Date().toISOString() };
    suspendedUsers.sessions.set(req.body.sessionId, data);
    SESSIONS.delete(req.body.sessionId);
    res.json({ success: true });
});

app.get('/api/admin/suspended', adminAuth, async (req, res) => {
    const a = [];
    suspendedUsers.hwids.forEach((v, k) => a.push({ type: 'hwid', value: k, ...v }));
    suspendedUsers.userIds.forEach((v, k) => a.push({ type: 'userId', value: k, ...v }));
    res.json({ success: true, suspended: a });
});

app.post('/api/admin/suspend', adminAuth, async (req, res) => {
    const { type, value, reason, duration } = req.body;
    const d = { reason, suspendedAt: new Date().toISOString(), expiresAt: duration ? new Date(Date.now() + duration * 1000).toISOString() : null };
    if (type === 'hwid') suspendedUsers.hwids.set(value, d);
    else if (type === 'userId') suspendedUsers.userIds.set(value, d);
    await db.addSuspend(type, value, d);
    res.json({ success: true });
});

app.post('/api/admin/unsuspend', adminAuth, async (req, res) => {
    const { type, value } = req.body;
    if (type === 'hwid') suspendedUsers.hwids.delete(value);
    else if (type === 'userId') suspendedUsers.userIds.delete(value);
    await db.removeSuspend(type, value);
    res.json({ success: true });
});

app.get('/api/admin/whitelist', adminAuth, (req, res) => {
    res.json({ success: true, whitelist: { userIds: [...Array.from(dynamicWhitelist.userIds)], hwids: [...Array.from(dynamicWhitelist.hwids)], ips: [...Array.from(dynamicWhitelist.ips)] } });
});

app.post('/api/admin/whitelist', adminAuth, (req, res) => {
    const { type, value } = req.body;
    if (type == 'userId') dynamicWhitelist.userIds.add(parseInt(value));
    if (type == 'hwid') dynamicWhitelist.hwids.add(value);
    if (type == 'ip') dynamicWhitelist.ips.add(value);
    res.json({ success: true });
});

app.post('/api/admin/whitelist/remove', adminAuth, (req, res) => {
    const { type, value } = req.body;
    if (type == 'userId') dynamicWhitelist.userIds.delete(parseInt(value));
    if (type == 'hwid') dynamicWhitelist.hwids.delete(value);
    if (type == 'ip') dynamicWhitelist.ips.delete(value);
    res.json({ success: true });
});

app.use('*', (req, res) => {
    const ct = getClientType(req);
    if (ct === 'browser') return res.status(404).send(TRAP_HTML);
    res.status(403).send(genFakeScript());
});

// START
const PORT = process.env.PORT || 3000;
loadSuspendedFromDB().then(() => {
    app.listen(PORT, '0.0.0.0', () => console.log('🛡️ Shield v2.0 Live on ' + PORT));
    webhook.serverStart().catch(() => {});
});
