/* ==========================================================================
   SCRIPT SHIELD - MAIN SERVER
   Fully Integrated: Anti-Spy, Kill Switch, Webhook, Whitelist, Web Loader
   ========================================================================== */

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
const dynamicWhitelist = { 
    userIds: new Set(), 
    hwids: new Set(), 
    ips: new Set() 
};
const suspendedUsers = { 
    hwids: new Map(), 
    userIds: new Map(), 
    sessions: new Map() 
};

// ==================== CONSTANTS & PATTERNS ====================

// Bot & Crawler Patterns (User-Agents)
const BOT_PATTERNS = [
    'python', 'http', 'curl', 'wget', 'bot', 'crawler', 'spider', 'scraper',
    'axios', 'node-fetch', 'got', 'undici', 'aiohttp', 'httpx', 'requests',
    'postman', 'insomnia', 'discord', 'telegram', 'whatsapp', 'facebook',
    'googlebot', 'bingbot', 'yandex', 'slurp', 'duckduckgo',
    'nmap', 'nikto', 'sqlmap', 'burp', 'fiddler', 'charles', 'wireshark',
    'go-http', 'java/', 'ruby', 'perl', 'php'
];

// Browser Indicators
const BROWSER_HEADERS = [
    'sec-fetch-dest', 
    'sec-fetch-mode', 
    'sec-ch-ua', 
    'upgrade-insecure-requests',
    'accept-language'
];

// Executor Indicators
const EXECUTOR_HEADERS = [
    'x-hwid', 
    'x-roblox-id', 
    'x-place-id', 
    'x-job-id', 
    'x-session-id'
];

// Whitelisted Executors (User-Agent partial match)
const ALLOWED_EXECUTORS = [
    'synapse', 'script-ware', 'scriptware', 'delta', 'fluxus', 'krnl',
    'oxygen', 'evon', 'hydrogen', 'vegax', 'trigon', 'comet', 'solara',
    'wave', 'zorara', 'codex', 'celery', 'swift', 'sirhurt', 'electron',
    'sentinel', 'coco', 'temple', 'valyse', 'nihon', 'jjsploit', 'arceus',
    'roblox', 'wininet', 'win32'
];

// ==================== UTILITY FUNCTIONS ====================

function getIP(req) {
    return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 
           req.headers['x-real-ip'] || 
           req.ip || 
           '0.0.0.0';
}

function getHWID(req) {
    return req.headers['x-hwid'] || req.body?.hwid || null;
}

function secureCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    try {
        return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
    } catch {
        return false;
    }
}

function genSessionKey(userId, hwid, timestamp, secret) {
    return crypto.createHmac('sha256', secret)
        .update(`${userId}:${hwid}:${timestamp}`)
        .digest('hex')
        .substring(0, 32);
}

// ==================== CLIENT DETECTION LOGIC ====================

function getClientType(req) {
    const ua = (req.headers['user-agent'] || '').toLowerCase();
    const headers = req.headers;
    
    // Check specific headers
    const executorScore = EXECUTOR_HEADERS.filter(h => headers[h]).length;
    const browserScore = BROWSER_HEADERS.filter(h => headers[h]).length;
    
    // 1. Detect Bots
    if (BOT_PATTERNS.some(p => ua.includes(p)) && executorScore === 0) {
        return 'bot';
    }
    
    // 2. Detect Browsers
    if (browserScore >= 2 || (headers['accept'] || '').includes('text/html')) {
        return 'browser';
    }
    
    // 3. Detect Executors
    if (executorScore >= 1 || ALLOWED_EXECUTORS.some(e => ua.includes(e))) {
        return 'executor';
    }
    
    // 4. Default / Suspicious
    if (!ua || ua.length < 5) return 'bot';
    
    return 'unknown';
}

// ==================== FAKE SCRIPT GENERATOR ====================
// Menghasilkan script sampah yang terlihat seperti obfuscated code asli
function genFakeScript() {
    const randStr = (len) => {
        const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let s = '';
        for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
        return s;
    };
    
    const vars = Array(15).fill(0).map(() => randStr(6 + Math.floor(Math.random() * 6)));
    const hex = crypto.randomBytes(32).toString('hex');
    
    return `--[[ Luraph Obfuscator v14.4.7 | Script Shield Protection ]]
local ${vars[0]}, ${vars[1]}, ${vars[2]};
local ${vars[3]} = "${hex}";
local ${vars[4]} = {
    "${randStr(32)}", "${randStr(32)}", "${randStr(32)}", "${randStr(32)}",
    "${randStr(32)}", "${randStr(32)}", "${randStr(32)}", "${randStr(32)}"
};
local ${vars[5]} = function(${vars[6]})
    local ${vars[7]} = 0;
    for ${vars[8]} = 1, #${vars[6]} do
        ${vars[7]} = ${vars[7]} + string.byte(${vars[6]}, ${vars[8]});
        ${vars[7]} = bit32.bxor(${vars[7]}, ${Math.floor(Math.random() * 255)});
    end
    return ${vars[7]};
end;
--[[ 
    Checking Whitelist...
    HWID: ${crypto.randomBytes(16).toString('hex')}
    User: ${Math.floor(Math.random() * 10000000)}
]]
if ${vars[5]}(${vars[3]}) ~= ${Math.floor(Math.random() * 9999)} then
    while true do end -- Crash
end
error("Script verification failed: Invalid License", 0);
${vars[0]} = function() return "${randStr(500)}" end;
`;
}

// ==================== WHITELIST & SUSPEND SYSTEM ====================

async function checkWhitelist(hwid, userId, req) {
    const ip = getIP(req);
    
    // IP Whitelist (Prioritas Tinggi)
    if (config.WHITELIST_IPS?.includes(ip) || dynamicWhitelist.ips.has(ip)) return true;
    
    // User ID Whitelist
    if (userId) {
        const uid = parseInt(userId);
        if (config.WHITELIST_USER_IDS?.includes(uid) || dynamicWhitelist.userIds.has(uid)) return true;
    }
    
    // HWID Whitelist
    if (hwid) {
        if (config.WHITELIST_HWIDS?.includes(String(hwid)) || dynamicWhitelist.hwids.has(String(hwid))) return true;
    }
    
    return false;
}

function checkSuspended(hwid, userId, sessionId) {
    const now = Date.now();
    
    const check = (map, key) => {
        if (map.has(key)) {
            const data = map.get(key);
            // Cek apakah suspend sudah expired
            if (!data.expiresAt || new Date(data.expiresAt).getTime() > now) {
                return { suspended: true, reason: data.reason || 'Suspended by admin' };
            } else {
                map.delete(key); // Hapus jika expired
            }
        }
        return null;
    };
    
    return check(suspendedUsers.sessions, sessionId) ||
           check(suspendedUsers.hwids, hwid) ||
           check(suspendedUsers.userIds, String(userId));
}

// Load suspend data from Redis/File on start
async function loadSuspendedFromDB() {
    const all = await db.getAllSuspends();
    if (all && all.length > 0) {
        all.forEach(s => {
            if (s.type === 'hwid') suspendedUsers.hwids.set(s.value, s);
            else if (s.type === 'userId') suspendedUsers.userIds.set(s.value, s);
            else if (s.type === 'session') suspendedUsers.sessions.set(s.value, s);
        });
        console.log(`✅ Loaded ${all.length} suspended entries from database`);
    }
}

// ==================== LOGGING ====================

async function logAccess(req, action, success, extraData = {}) {
    const log = {
        ip: getIP(req),
        hwid: req.headers['x-hwid'] || req.body?.hwid || extraData.hwid,
        userId: req.headers['x-roblox-id'] || req.body?.userId || extraData.userId,
        ua: (req.headers['user-agent'] || '').substring(0, 150),
        client: extraData.clientType || getClientType(req),
        action: action,
        success: success,
        ts: new Date().toISOString(),
        ...extraData
    };
    
    await db.addLog(log);
    return log;
}

// ==================== SCRIPT WRAPPER (ANTI-SPY V4) ====================

function wrapScript(script, serverUrl) {
    const o = (config.OWNER_USER_IDS || []).join(',');
    const w = (config.WHITELIST_USER_IDS || []).join(',');
    const sid = crypto.randomBytes(16).toString('hex');
    
    const antiSpy = config.ANTI_SPY_ENABLED !== false;
    const autoBan = config.AUTO_BAN_SPYTOOLS === true;
    
    // Daftar kata kunci tools yang dilarang
    const blacklistedTools = `{ "spy", "dex", "remote", "http", "dumper", "explorer", "infinite", "yield", "iy", "console", "decompile", "saveinstance", "scriptdumper", "dark", "turtle" }`;

    return `--[[ Shield Protection Layer v4 ]]
local _CFG = {
    o = {${o}}, 
    w = {${w}}, 
    banUrl = "${serverUrl}/api/ban", 
    webhookUrl = "${serverUrl}/api/webhook/suspicious", 
    hbUrl = "${serverUrl}/api/heartbeat", 
    sid = "${sid}", 
    as = ${antiSpy}, 
    ab = ${autoBan}, 
    hbi = 45
}

local _P = game:GetService("Players")
local _L = _P.LocalPlayer
local _CG = game:GetService("CoreGui")
local _SG = game:GetService("StarterGui")
local _H = game:GetService("HttpService")
local _A = true -- Active flag
local _CON = {} -- Connections
local _SAFE_GUIS = {} -- Snapshot
local _BL = ${blacklistedTools}

-- 1. Helper Functions
local function _n(t, x, d)
    pcall(function() _SG:SetCore("SendNotification", {Title = t, Text = x, Duration = d or 3}) end)
end

local function _hw()
    local s, r = pcall(function()
        if gethwid then return gethwid() end
        if getexecutorname then return getexecutorname() .. tostring(_L.UserId) end
        return "NK_" .. tostring(_L.UserId)
    end)
    return s and r or "UNK"
end

local function _hp(u, d)
    if not request then return end
    pcall(function()
        request({
            Url = u,
            Method = "POST",
            Headers = {
                ["Content-Type"] = "application/json",
                ["User-Agent"] = "Roblox/WinInet",
                ["x-hwid"] = _hw(),
                ["x-roblox-id"] = tostring(_L.UserId),
                ["x-session-id"] = _CFG.sid
            },
            Body = _H:JSONEncode(d)
        })
    end)
end

-- 2. Cleanup / Kill
local function _cl(msg)
    if not _A then return end
    _A = false
    _n("⚠️", msg or "Script terminated", 5)
    
    -- Disconnect all events
    for i = #_CON, 1, -1 do pcall(function() _CON[i]:Disconnect() end) end
    
    task.wait(1)
    if msg then _L:Kick(msg) end
end

-- 3. Owner Detection
local function _checkOwner()
    for _, p in pairs(_P:GetPlayers()) do
        for _, id in ipairs(_CFG.o) do
            if p.UserId == id and p ~= _L then return false end
        end
    end
    return true
end

local function _startOwnerMonitor()
    table.insert(_CON, _P.PlayerAdded:Connect(function(p)
        task.wait(1)
        for _, id in ipairs(_CFG.o) do
            if p.UserId == id then _cl("Owner joined the server") end
        end
    end))
end

-- 4. Smart Anti-Spy (Snapshot Method)
local function _takeSnapshot()
    pcall(function()
        for _, g in pairs(_CG:GetChildren()) do _SAFE_GUIS[g] = true end
    end)
end

local function _scan()
    if not _CFG.as then return end
    -- Check Whitelist Bypass
    for _, id in ipairs(_CFG.w) do if _L.UserId == id then return end end

    pcall(function()
        for _, g in pairs(_CG:GetChildren()) do
            if not _SAFE_GUIS[g] then -- Jika GUI ini BARU (tidak ada di snapshot)
                local n = g.Name:lower()
                for _, b in ipairs(_BL) do
                    -- Cek nama mencurigakan, tapi abaikan internal Roblox
                    if n:find(b) and not n:find("roblox") and not n:find("app") and not n:find("prompt") then
                        -- Lapor ke server
                        _hp(_CFG.webhookUrl, {userId = _L.UserId, tool = g.Name, sessionId = _CFG.sid})
                        
                        -- Auto Ban jika diaktifkan
                        if _CFG.ab then 
                            _hp(_CFG.banUrl, {playerId = _L.UserId, reason = "Spy Tool: " .. g.Name, sessionId = _CFG.sid})
                        end
                        
                        -- Kick User
                        _cl("Security Violation: " .. g.Name)
                        while true do end -- Freeze
                    end
                end
            end
        end
    end)
end

local function _startAntiSpy()
    if not _CFG.as then return end
    task.spawn(function()
        _takeSnapshot() -- Ambil daftar GUI yang aman saat load
        task.wait(1)
        while _A do
            _scan() -- Cek GUI baru setiap 3 detik
            task.wait(3)
        end
    end)
end

-- 5. Heartbeat (Kill Switch)
local function _startHeartbeat()
    task.spawn(function()
        task.wait(10)
        local failCount = 0
        while _A do
            local res
            if request then
                local s, r = pcall(function()
                    return request({
                        Url = _CFG.hbUrl,
                        Method = "POST",
                        Headers = {["Content-Type"] = "application/json", ["x-session-id"] = _CFG.sid},
                        Body = _H:JSONEncode({sessionId = _CFG.sid, hwid = _hw(), userId = _L.UserId})
                    })
                end)
                if s and r and r.StatusCode == 200 then
                    res = _H:JSONDecode(r.Body)
                end
            end

            if res then
                failCount = 0
                if res.action == "TERMINATE" then
                    _cl(res.reason or "Session terminated by admin")
                    break
                elseif res.action == "MESSAGE" and res.message then
                    _n("📢", res.message, 5)
                end
            else
                failCount = failCount + 1
                if failCount >= 5 then
                    -- Opsional: Kick jika koneksi putus total
                    -- _cl("Connection lost to server") 
                end
            end
            task.wait(_CFG.hbi)
        end
    end)
end

-- MAIN EXECUTION
if not _checkOwner() then
    _n("⚠️", "Owner is in this server!", 5)
    return
end

_startOwnerMonitor()
_startAntiSpy()
_startHeartbeat()

-- Real Script
${script}`;
}

// === LOADERS (LUA) ===
function getLoader(url) {
    return `local S="${url}" local H=game:GetService("HttpService") local P=game:GetService("Players") local L=P.LocalPlayer 
local function n(t,x,d)pcall(function()game:GetService("StarterGui"):SetCore("SendNotification",{Title=t,Text=x,Duration=d or 3})end)end 
local function hp(u,d)local r=(syn and syn.request)or request or http_request or(http and http.request)if not r then return nil end;local s,res=pcall(function()return r({Url=u,Method="POST",Headers={["Content-Type"]="application/json",["User-Agent"]="Roblox/WinInet",["x-hwid"]=(gethwid and gethwid() or "UNK"),["x-roblox-id"]=tostring(L.UserId),["x-place-id"]=tostring(game.PlaceId)},Body=H:JSONEncode(d)})end)
if s and res and res.StatusCode==200 then local ok,body=pcall(function()return H:JSONDecode(res.Body)end) if ok then return body end end return nil end 
local function xd(data,key)local r={} for i=1,#data do local b=data[i] local k=string.byte(key,((i-1)%#key)+1) table.insert(r, string.char(bit32.bxor(b,k))) end return table.concat(r) end
local function sv(p)if not p or not p.type then return 0 end;if p.type=="math"then local a,b,c,op=p.puzzle.a,p.puzzle.b,p.puzzle.c,p.puzzle.op;if op=="+"then return(a+b)*c elseif op=="-"then return(a-b)*c else return(a*b)+c end elseif p.type=="bitwise"then local x,y,op=p.puzzle.x,p.puzzle.y,p.puzzle.op;if op=="xor"then return bit32.bxor(x,y)elseif op=="and"then return bit32.band(x,y)else return bit32.bor(x,y)end elseif p.type=="sequence"then local s=p.puzzle.seq;return s[4]+(s[2]-s[1])elseif p.puzzle and p.puzzle.numbers then local sum=0;for _,x in ipairs(p.puzzle.numbers)do sum=sum+x end;return sum end;return 0 end 
local function asm(v)if not v then return nil end;if v.mode=="raw" then return v.script end;if v.mode=="chunked" then local p={} for _,c in ipairs(v.chunks) do local k=v.keys[c.index+1] if k and c.data then p[c.index+1]=xd(c.data,k) end end return table.concat(p) end return nil end
n("🔄","Connecting...",2) local c=hp(S.."/api/auth/challenge",{userId=L.UserId,hwid=(gethwid and gethwid() or "UNK"),placeId=game.PlaceId})
if c and c.success then n("🔐","Verifying...",2) local v=hp(S.."/api/auth/verify",{challengeId=c.challengeId,solution=sv(c),timestamp=os.time()})
if v and v.success then n("📦","Loading...",2) local fs=asm(v) if fs then local f,e=loadstring(fs) if f then pcall(f) n("✅","Success!",2) else n("❌","Syntax: "..(e or "?"),5) end else n("❌","Assembly Failed",5) end else n("❌","Verify Failed",5) end else n("❌","Conn Failed",5) end`;
}

function getEncodedLoader(url, req) {
    const key = genLoaderKey(req);
    const enc = encryptLoader(getLoader(url), key);
    // Simple bootstrap decoder for Lua
    return `local k="${key}"local d="${enc}"local function x(s,k)local r={}local b={}for i=1,#s do b[i]=s:byte(i)end;for i=1,#b do r[i]=string.char(bit32.bxor(b[i],k:byte((i-1)%#k+1)))end;return table.concat(r)end;local function b(s)local t={}local c="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"for i=1,64 do t[c:sub(i,i)]=i-1 end;s=s:gsub("[^"..c.."=]","")local r={}local n=1;for i=1,#s,4 do local a,b,c,d=t[s:sub(i,i)]or 0,t[s:sub(i+1,i+1)]or 0,t[s:sub(i+2,i+2)]or 0,t[s:sub(i+3,i+3)]or 0;local v=a*262144+b*4096+c*64+d;r[n]=string.char(bit32.rshift(v,16)%256)n=n+1;if s:sub(i+2,i+2)~="="then r[n]=string.char(bit32.rshift(v,8)%256)n=n+1 end;if s:sub(i+3,i+3)~="="then r[n]=string.char(v%256)n=n+1 end end;return table.concat(r)end;loadstring(x(b(d),k))()`;
}

// === ENCRYPTION & CHUNKING ===
function encryptLoader(script, key) {
    const kB = Buffer.from(key);
    const sB = Buffer.from(script);
    const enc = [];
    for (let i = 0; i < sB.length; i++) enc.push(sB[i] ^ kB[i % kB.length]);
    return Buffer.from(enc).toString('base64');
}

function genLoaderKey(req) {
    const c = [req.headers['x-hwid'] || '', req.headers['x-roblox-id'] || '', req.headers['x-place-id'] || '', config.LOADER_KEY || config.SECRET_KEY];
    return crypto.createHash('md5').update(c.join(':')).digest('hex').substring(0, 16);
}

function chunkString(str, size) {
    const chunks = [];
    for (let i = 0; i < str.length; i += size) chunks.push(str.substring(i, i + size));
    return chunks;
}

function encryptChunk(c, k) {
    const e = [];
    for (let i = 0; i < c.length; i++) {
        const cc = c.charCodeAt(i);
        const kc = k.charCodeAt(i % k.length);
        e.push((cc ^ kc) & 255);
    }
    return e;
}

function generateChunkKeys(baseKey, count) {
    const keys = [];
    for (let i = 0; i < count; i++) keys.push(crypto.createHash('md5').update(baseKey + ':' + i).digest('hex'));
    return keys;
}

async function prepareChunks(s, ch) {
    const count = config.CHUNK_COUNT || 3;
    const size = Math.ceil(s.length / count);
    const chunks = chunkString(s, size);
    const base = crypto.createHash('sha256').update((ch.hwid || '') + (ch.userId || '') + config.SECRET_KEY).digest('hex');
    const keys = generateChunkKeys(base, chunks.length);
    return {
        chunks: chunks.map((c, i) => ({ index: i, data: encryptChunk(c, keys[i]) })),
        keys,
        totalChunks: chunks.length
    };
}

async function getScript() {
    const c = await db.getCachedScript();
    if (c) return c;
    if (!config.SCRIPT_SOURCE_URL) return null;
    try {
        const res = await axios.get(config.SCRIPT_SOURCE_URL, { timeout: 30000 });
        if (res.data) {
            await db.setCachedScript(res.data);
            return res.data;
        }
    } catch (e) { console.error('Script fetch error:', e.message); }
    return null;
}

// === SETUP & MIDDLEWARE ===
const viewsPath = path.join(__dirname, 'views');
const LOADER_HTML = fs.existsSync(path.join(viewsPath, 'loader/index.html')) ? fs.readFileSync(path.join(viewsPath, 'loader/index.html'), 'utf8') : `<h1>Loader</h1>`;
const TRAP_HTML = fs.existsSync(path.join(viewsPath, 'trap/index.html')) ? fs.readFileSync(path.join(viewsPath, 'trap/index.html'), 'utf8') : `<!DOCTYPE html><html><body><h1>Access Denied</h1></body></html>`;

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false, crossOriginResourcePolicy: false }));
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'x-admin-key', 'x-hwid', 'x-roblox-id', 'x-place-id', 'x-job-id', 'x-session-id'] }));
app.use(express.json({ limit: '10mb' }));
app.set('trust proxy', 1);
app.use(rateLimit({ windowMs: 60000, max: 100, keyGenerator: r => getIP(r) }));
app.use('/admin/css', express.static(path.join(viewsPath, 'admin/css')));
app.use('/admin/js', express.static(path.join(viewsPath, 'admin/js')));

// GLOBAL BAN CHECK MIDDLEWARE
app.use(async (req, res, next) => {
    // Bypass important paths
    const adminPath = config.ADMIN_PATH || '/admin';
    if (req.path.startsWith(adminPath) || req.path === '/health' || req.path === '/loader' || req.path === '/l') return next();
    
    const ip = getIP(req);
    const ban = await db.isBanned(null, ip, null);
    
    if (ban.blocked) {
        // Log blokir
        await logAccess(req, 'BLOCKED_IP', false, { reason: ban.reason });
        
        // Response sesuai tipe client
        const ct = getClientType(req);
        if (ct === 'browser') return res.status(403).type('html').send(TRAP_HTML);
        return res.status(200).type('text/plain').send(genFakeScript()); // Bot/Executor banned dapat fake script
    }
    next();
});

const adminAuth = (req, res, next) => {
    const k = req.headers['x-admin-key'] || req.query.key;
    if (!k) return res.status(403).json({ success: false, error: 'Unauthorized' });
    if (!config.ADMIN_KEY) return res.status(500).json({ success: false, error: 'Server misconfigured' });
    if (!secureCompare(k, config.ADMIN_KEY)) return res.status(403).json({ success: false, error: 'Unauthorized' });
    next();
};

// === ROUTES ===
const adminPath = config.ADMIN_PATH || '/admin';
app.get(adminPath, (req, res) => { const f = path.join(viewsPath, 'admin/index.html'); if (fs.existsSync(f)) res.sendFile(f); else res.status(404).send('Not found'); });
app.get('/health', (req, res) => res.json({ status: 'ok', redis: db.isRedisConnected?.() ?? false }));

// 1. LOADER ENDPOINT
app.get(['/loader', '/api/loader.lua', '/api/loader', '/l'], async (req, res) => {
    const ct = getClientType(req);
    const ip = getIP(req);
    const hwid = getHWID(req);
    
    // BROWSER -> HTML Loadstring Page
    if (ct === 'browser') {
        return res.status(200).type('html').send(LOADER_HTML);
    }

    // BOT -> Fake Script (But LOG IT FIRST)
    if (shouldBlock(req)) {
        await logAccess(req, 'BLOCKED_BOT', false, { clientType: ct });
        return res.status(200).type('text/plain').send(genFakeScript());
    }
    
    // EXECUTOR -> Real Loader
    await logAccess(req, 'LOADER_FETCH', true, { clientType: ct, userId: req.headers['x-roblox-id'] });
    
    const userId = req.headers['x-roblox-id'];
    const isWL = await checkWhitelist(hwid, userId, req);
    const url = process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get('host')}`;
    
    if (config.ENCODE_LOADER !== false && !isWL) {
        res.type('text/plain').send(getEncodedLoader(url, req));
    } else {
        res.type('text/plain').send(getLoader(url));
    }
});

// 2. CHALLENGE ENDPOINT
app.post('/api/auth/challenge', async (req, res) => {
    const ct = getClientType(req);
    
    // 1. Cek Bot
    if (shouldBlock(req)) { 
        await logAccess(req, 'CHALLENGE_BOT', false, { clientType: ct }); 
        return res.status(403).json({ success: false, error: 'Access denied' }); 
    }
    
    const { userId, hwid, placeId } = req.body;
    
    // 2. Log Attempt (UserId/HWID captured here)
    await logAccess(req, 'CHALLENGE_INIT', true, { userId, hwid, clientType: ct });

    if (!userId || !placeId) return res.status(400).json({ success: false, error: 'Missing fields' });
    if (config.REQUIRE_HWID && !hwid) return res.status(400).json({ success: false, error: 'HWID required' });
    
    const uid = parseInt(userId), pid = parseInt(placeId);
    if (isNaN(uid) || isNaN(pid)) return res.status(400).json({ success: false, error: 'Invalid format' });
    
    // 3. Cek Status
    const ip = getIP(req);
    const isWL = await checkWhitelist(hwid, uid, req);
    const susp = checkSuspended(hwid, uid, null);
    
    if (susp) {
        await logAccess(req, 'LOGIN_SUSPENDED', false, { userId, hwid, reason: susp.reason });
        return res.json({ success: false, error: 'Suspended: ' + susp.reason });
    }
    
    if (!isWL) { 
        const ban = await db.isBanned(hwid, ip, uid); 
        if (ban.blocked) {
            await logAccess(req, 'LOGIN_BANNED', false, { userId, hwid, reason: ban.reason });
            return res.json({ success: false, error: 'Banned: ' + ban.reason }); 
        }
    }
    
    if (config.ALLOWED_PLACE_IDS?.length > 0 && !config.ALLOWED_PLACE_IDS.includes(pid) && !isWL) {
        return res.status(403).json({ success: false, error: 'Game not authorized' });
    }
    
    // 4. Generate Challenge
    const id = crypto.randomBytes(16).toString('hex');
    const chal = genChallenge();
    await db.setChallenge(id, { id, userId: uid, hwid: hwid || 'none', placeId: pid, ip, whitelisted: isWL, ...chal }, 120);
    
    res.json({ success: true, challengeId: id, type: chal.type, puzzle: chal.puzzle, expiresIn: 120 });
});

// 3. VERIFY ENDPOINT
app.post('/api/auth/verify', async (req, res) => {
    const ct = getClientType(req);
    if (shouldBlock(req)) return res.status(403).json({ success: false, error: 'Access denied' });
    
    const { challengeId, solution, timestamp } = req.body;
    if (!challengeId || solution === undefined || !timestamp) return res.status(400).json({ success: false, error: 'Missing fields' });
    
    const challenge = await db.getChallenge(challengeId);
    if (!challenge) return res.status(403).json({ success: false, error: 'Challenge expired' });
    
    if (challenge.ip !== getIP(req)) return res.status(403).json({ success: false, error: 'IP mismatch' });
    
    // Check Answer
    if (parseInt(solution) !== challenge.answer) {
        await logAccess(req, 'VERIFY_FAIL', false, { userId: challenge.userId, reason: 'Wrong math' });
        return res.status(403).json({ success: false, error: 'Wrong solution' }); 
    }
    
    await db.deleteChallenge(challengeId);
    
    const script = await getScript();
    if (!script) return res.status(500).json({ success: false, error: 'Script not configured' });
    
    // Wrap Script
    const url = process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get('host')}`;
    const wrapped = wrapScript(script, url);
    const sessionId = crypto.randomBytes(16).toString('hex');
    
    // Session Active
    SESSIONS.set(sessionId, { hwid: challenge.hwid, ip: challenge.ip, userId: challenge.userId, placeId: challenge.placeId, created: Date.now(), lastSeen: Date.now() });
    
    // Notify Webhook
    webhook.execution({ userId: challenge.userId, hwid: challenge.hwid, placeId: challenge.placeId, ip: challenge.ip, executor: req.headers['user-agent'] }).catch(() => {});
    
    // Log Success
    await logAccess(req, 'VERIFY_SUCCESS', true, { userId: challenge.userId, hwid: challenge.hwid });
    
    // Return Script
    if (config.CHUNK_DELIVERY !== false || challenge.whitelisted) { 
        const ckd = await prepareChunks(wrapped, challenge); 
        return res.json({ success: true, mode: 'chunked', chunks: ckd.chunks, keys: ckd.keys, sessionId: sessionId }); 
    }
    
    const isObf = config.SCRIPT_ALREADY_OBFUSCATED === true || isObfuscated(script);
    if (isObf) return res.json({ success: true, mode: 'raw', script: wrapped, sessionId });
    
    const key = genSessionKey(challenge.userId, challenge.hwid, timestamp, config.SECRET_KEY);
    const chunks = [];
    for (let i = 0; i < wrapped.length; i += 1500) { 
        const chunk = wrapped.substring(i, i + 1500); 
        const enc = []; 
        for (let j = 0; j < chunk.length; j++) enc.push(chunk.charCodeAt(j) ^ key.charCodeAt(j % key.length)); 
        chunks.push(enc); 
    }
    res.json({ success: true, mode: 'encrypted', key, chunks, sessionId });
});

app.post('/api/heartbeat', async (req, res) => {
    const { sessionId, hwid, userId } = req.body;
    if (!sessionId) return res.json({ success: true, action: 'CONTINUE' });
    const session = SESSIONS.get(sessionId);
    if (session) session.lastSeen = Date.now();
    const sp = checkSuspended(hwid, userId, sessionId);
    if (sp) return res.json({ success: false, action: 'TERMINATE', reason: sp.reason });
    const ban = await db.isBanned(hwid, getIP(req), userId);
    if (ban.blocked) return res.json({ success: false, action: 'TERMINATE', reason: 'Banned: ' + ban.reason });
    res.json({ success: true, action: 'CONTINUE' });
});

app.post('/api/webhook/suspicious', async (req, res) => {
    const { userId, hwid, tool } = req.body;
    await logAccess(req, 'SUSPICIOUS', false, { userId, hwid, tool });
    webhook.suspicious({ userId, hwid, ip: getIP(req), reason: 'Spy tool detected', tool, action: config.AUTO_BAN_SPYTOOLS ? 'Auto-banned' : 'Kicked' }).catch(() => {});
    res.json({ success: true });
});

app.post('/api/ban', async (req, res) => {
    const { hwid, playerId, reason, sessionId } = req.body;
    if (!hwid && !playerId) return res.status(400).json({ error: 'Missing id' });
    const banId = crypto.randomBytes(8).toString('hex').toUpperCase();
    const banData = { ip: getIP(req), reason: reason || 'Auto', banId, ts: new Date().toISOString() };
    if (hwid) await db.addBan(hwid, { hwid, ...banData });
    if (playerId) await db.addBan(String(playerId), { playerId, ...banData });
    if (sessionId) SESSIONS.delete(sessionId);
    await logAccess(req, 'BAN_ADDED', true, { hwid, playerId, reason });
    webhook.ban({ userId: playerId, hwid, ip: getIP(req), reason, bannedBy: 'System', banId }).catch(() => {});
    res.json({ success: true, banId });
});

// === ADMIN ROUTES ===
app.get('/api/admin/stats', adminAuth, async (req, res) => { try { const s = await db.getStats(); res.json({ success: true, stats: s, sessions: SESSIONS.size, ts: new Date().toISOString() }); } catch (e) { res.status(500).json({ success: false, error: 'Failed' }); } });
app.get('/api/admin/logs', adminAuth, async (req, res) => { const l = await db.getLogs(50); res.json({ success: true, logs: l }); });
app.post('/api/admin/logs/clear', adminAuth, async (req, res) => { await db.clearLogs(); res.json({ success: true }); });
app.get('/api/admin/bans', adminAuth, async (req, res) => { const b = await db.getAllBans(); res.json({ success: true, bans: b }); });
app.post('/api/admin/bans', adminAuth, async (req, res) => { const { hwid, ip, playerId, reason } = req.body; if (!hwid && !ip && !playerId) return res.status(400).json({ success: false, error: 'Required' }); const banId = crypto.randomBytes(8).toString('hex').toUpperCase(); const data = { reason: reason || 'Manual', banId, ts: new Date().toISOString() }; if (hwid) await db.addBan(hwid, { hwid, ...data }); if (playerId) await db.addBan(String(playerId), { playerId, ...data }); if (ip) await db.addBan(ip, { ip, ...data }); webhook.ban({ userId: playerId, hwid, ip, reason, bannedBy: 'Admin', banId }).catch(() => {}); res.json({ success: true, banId }); });
app.delete('/api/admin/bans/:id', adminAuth, async (req, res) => { const r = await db.removeBanById(req.params.id); res.json({ success: r }); });
app.post('/api/admin/bans/clear', adminAuth, async (req, res) => { const count = await db.clearBans(); res.json({ success: true, cleared: count }); });
app.post('/api/admin/cache/clear', adminAuth, async (req, res) => { await db.setCachedScript(null); res.json({ success: true }); });
app.post('/api/admin/sessions/clear', adminAuth, async (req, res) => { const count = SESSIONS.size; SESSIONS.clear(); res.json({ success: true, cleared: count }); });
app.get('/api/admin/whitelist', adminAuth, async (req, res) => { res.json({ success: true, whitelist: { userIds: [...(config.WHITELIST_USER_IDS || []), ...Array.from(dynamicWhitelist.userIds)], hwids: [...(config.WHITELIST_HWIDS || []), ...Array.from(dynamicWhitelist.hwids)], ips: [...(config.WHITELIST_IPS || []), ...Array.from(dynamicWhitelist.ips)], owners: config.OWNER_USER_IDS || [] } }); });
app.post('/api/admin/whitelist', adminAuth, async (req, res) => { const { type, value } = req.body; if (!type || !value) return res.status(400).json({ success: false, error: 'Missing fields' }); if (type === 'userId') dynamicWhitelist.userIds.add(parseInt(value)); else if (type === 'hwid') dynamicWhitelist.hwids.add(String(value)); else if (type === 'ip') dynamicWhitelist.ips.add(String(value)); else return res.status(400).json({ success: false, error: 'Invalid type' }); res.json({ success: true, msg: `Added ${type}: ${value}` }); });
app.post('/api/admin/whitelist/remove', adminAuth, async (req, res) => { const { type, value } = req.body; if (!type || !value) return res.status(400).json({ success: false, error: 'Missing fields' }); if (type === 'userId') dynamicWhitelist.userIds.delete(parseInt(value)); else if (type === 'hwid') dynamicWhitelist.hwids.delete(String(value)); else if (type === 'ip') dynamicWhitelist.ips.delete(String(value)); res.json({ success: true, msg: `Removed ${type}: ${value}` }); });
app.get('/api/admin/suspended', adminAuth, async (req, res) => { const a = []; suspendedUsers.hwids.forEach((v, k) => a.push({ type: 'hwid', value: k, ...v })); suspendedUsers.userIds.forEach((v, k) => a.push({ type: 'userId', value: k, ...v })); suspendedUsers.sessions.forEach((v, k) => a.push({ type: 'session', value: k, ...v })); res.json({ success: true, suspended: a }); });
app.post('/api/admin/suspend', adminAuth, async (req, res) => { const { type, value, reason, duration } = req.body; if (!type || !value) return res.status(400).json({ success: false, error: 'Missing type or value' }); if (!['hwid', 'userId', 'session'].includes(type)) return res.status(400).json({ success: false, error: 'Invalid type' }); const d = { reason: reason || 'Suspended by admin', suspendedAt: new Date().toISOString(), expiresAt: duration ? new Date(Date.now() + parseInt(duration) * 1000).toISOString() : null }; if (type === 'hwid') suspendedUsers.hwids.set(String(value), d); else if (type === 'userId') suspendedUsers.userIds.set(String(value), d); else if (type === 'session') suspendedUsers.sessions.set(String(value), d); await db.addSuspend(type, String(value), d); res.json({ success: true, msg: `Suspended ${type}: ${value}${duration ? ' for ' + duration + 's' : ' permanently'}` }); });
app.post('/api/admin/unsuspend', adminAuth, async (req, res) => { const { type, value } = req.body; if (!type || !value) return res.status(400).json({ success: false, error: 'Missing fields' }); if (type === 'hwid') suspendedUsers.hwids.delete(String(value)); else if (type === 'userId') suspendedUsers.userIds.delete(String(value)); else if (type === 'session') suspendedUsers.sessions.delete(String(value)); await db.removeSuspend(type, String(value)); res.json({ success: true, msg: `Unsuspended ${type}: ${value}` }); });
app.post('/api/admin/kill-session', adminAuth, async (req, res) => { const { sessionId, reason } = req.body; if (!sessionId) return res.status(400).json({ success: false, error: 'Missing sessionId' }); const session = SESSIONS.get(sessionId); if (!session) return res.status(404).json({ success: false, error: 'Session not found' }); await suspendUser('session', sessionId, { reason: reason || 'Killed by admin', userId: session.userId, hwid: session.hwid, ip: session.ip }); res.json({ success: true, msg: 'Session will be terminated on next heartbeat' }); });
app.get('/api/admin/sessions', adminAuth, async (req, res) => { const arr = []; SESSIONS.forEach((v, k) => arr.push({ sessionId: k, ...v, age: Math.floor((Date.now() - v.created) / 1000) })); res.json({ success: true, sessions: arr.sort((a, b) => b.created - a.created) }); });

const PORT = process.env.PORT || config.PORT || 3000;
loadSuspendedFromDB().then(() => { webhook.serverStart().catch(() => {}); app.listen(PORT, '0.0.0.0', () => { console.log(`\n🛡️ Script Shield v2.0 running on port ${PORT}\n📍 Admin: http://localhost:${PORT}${adminPath}\n📦 Loader: http://localhost:${PORT}/loader\n`); }); });
