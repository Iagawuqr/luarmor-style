// server/lib/redis.js
const config = require('./../config');
const fs = require('fs');
const path = require('path');

// Setup variabel
let redis = null;
let useRedis = false;

// Setup File Storage (Fallback)
const dataDir = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(dataDir, 'storage.json');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// In-Memory Data
const memoryStore = {
    bans: new Map(),
    logs: [],
    challenges: new Map(),
    cache: new Map(),
    suspends: new Map(),
    stats: { success: 0, challenges: 0, bans: 0 }
};

// Fungsi File System
function loadFromFile() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            if (data.bans) Object.entries(data.bans).forEach(([k, v]) => memoryStore.bans.set(k, v));
            if (data.logs) memoryStore.logs = data.logs.slice(0, 1000);
            if (data.stats) memoryStore.stats = data.stats;
            if (data.suspends) Object.entries(data.suspends).forEach(([k, v]) => memoryStore.suspends.set(k, v));
            console.log(`[Storage] Loaded from file: ${memoryStore.bans.size} bans`);
        }
    } catch (e) { console.error('Load Error:', e.message); }
}

function saveToFile() {
    try {
        const data = {
            bans: Object.fromEntries(memoryStore.bans),
            logs: memoryStore.logs.slice(0, 500),
            stats: memoryStore.stats,
            suspends: Object.fromEntries(memoryStore.suspends),
            savedAt: new Date().toISOString()
        };
        fs.writeFileSync(DATA_FILE, JSON.stringify(data));
    } catch (e) { console.error('Save Error:', e.message); }
}

// Auto Save interval
setInterval(saveToFile, 60000);
loadFromFile();

// Init Redis
(async () => {
    if (config.REDIS_URL) {
        console.log('🔄 Connecting to Redis...');
        try {
            const Redis = require('ioredis');
            redis = new Redis(config.REDIS_URL, {
                maxRetriesPerRequest: 3,
                tls: config.REDIS_URL.startsWith('rediss://') ? {} : undefined
            });
            
            redis.on('error', (e) => console.error('Redis Error:', e.message));
            await redis.ping();
            useRedis = true;
            console.log('✅ Redis Connected');
        } catch (e) {
            console.error('❌ Redis Failed:', e.message);
            useRedis = false;
        }
    }
})();

// === EXPORTED FUNCTIONS ===

// 1. Bans
async function addBan(key, data) {
    memoryStore.stats.bans++;
    memoryStore.bans.set(key, data);
    if (useRedis) await redis.hset('bans', key, JSON.stringify(data));
    saveToFile();
    return true;
}

async function removeBan(key) {
    memoryStore.bans.delete(key);
    if (useRedis) await redis.hdel('bans', key);
    saveToFile();
    return true;
}

async function removeBanById(banId) {
    for (const [key, value] of memoryStore.bans) {
        if (value.banId === banId) {
            memoryStore.bans.delete(key);
            if (useRedis) await redis.hdel('bans', key);
            saveToFile();
            return true;
        }
    }
    return false;
}

async function isBanned(hwid, ip, playerId) {
    const keys = [hwid, ip, playerId ? String(playerId) : null].filter(Boolean);
    if (keys.length === 0) return { blocked: false };

    // Cek Redis
    if (useRedis) {
        for (const key of keys) {
            const data = await redis.hget('bans', key);
            if (data) {
                const p = JSON.parse(data);
                return { blocked: true, reason: p.reason || 'Banned', banId: p.banId };
            }
        }
    }

    // Cek Memory
    for (const key of keys) {
        if (memoryStore.bans.has(key)) {
            const d = memoryStore.bans.get(key);
            return { blocked: true, reason: d.reason || 'Banned', banId: d.banId };
        }
    }
    return { blocked: false };
}

async function getAllBans() {
    if (useRedis) {
        try {
            const all = await redis.hgetall('bans');
            return Object.values(all).map(v => JSON.parse(v)).sort((a, b) => new Date(b.ts) - new Date(a.ts));
        } catch (e) {}
    }
    return Array.from(memoryStore.bans.values()).sort((a, b) => new Date(b.ts) - new Date(a.ts));
}

async function getBanCount() {
    if (useRedis) {
        try {
            return await redis.hlen('bans');
        } catch (e) {}
    }
    return memoryStore.bans.size;
}

async function clearBans() {
    const count = memoryStore.bans.size;
    memoryStore.bans.clear();
    if (useRedis) await redis.del('bans');
    saveToFile();
    return count;
}

// 2. Challenges & Auth
async function setChallenge(id, data, ttl = 120) {
    memoryStore.stats.challenges++;
    memoryStore.challenges.set(id, { ...data, expiresAt: Date.now() + (ttl * 1000) });
    if (useRedis) await redis.setex(`challenge:${id}`, ttl, JSON.stringify(data));
    return true;
}

async function getChallenge(id) {
    if (useRedis) {
        const data = await redis.get(`challenge:${id}`);
        if (data) return JSON.parse(data);
    }
    const data = memoryStore.challenges.get(id);
    if (data && data.expiresAt > Date.now()) return data;
    return null;
}

async function deleteChallenge(id) {
    memoryStore.challenges.delete(id);
    if (useRedis) await redis.del(`challenge:${id}`);
    return true;
}

// 3. Logs & Stats
async function addLog(log) {
    memoryStore.logs.unshift(log);
    if (memoryStore.logs.length > 1000) memoryStore.logs.length = 1000;
    if (log.success) memoryStore.stats.success++;
    
    if (useRedis) {
        await redis.lpush('logs', JSON.stringify(log));
        await redis.ltrim('logs', 0, 999);
        if (log.success) await redis.incr('stats:success');
    }
    return true;
}

async function getLogs(limit = 50) {
    if (useRedis) {
        const logs = await redis.lrange('logs', 0, limit - 1);
        return logs.map(l => JSON.parse(l));
    }
    return memoryStore.logs.slice(0, limit);
}

async function clearLogs() {
    memoryStore.logs = [];
    if (useRedis) await redis.del('logs');
    saveToFile();
    return true;
}

async function getStats() {
    if (useRedis) {
        const [suc, chal] = await Promise.all([redis.get('stats:success'), redis.get('stats:challenges')]);
        return { 
            success: parseInt(suc) || 0, 
            challenges: parseInt(chal) || 0, 
            bans: await getBanCount() 
        };
    }
    return { ...memoryStore.stats, bans: memoryStore.bans.size };
}

// 4. Script Caching
async function getCachedScript() {
    if (useRedis) return await redis.get('script_cache');
    
    const cached = memoryStore.cache.get('script');
    if (cached && cached.expiresAt > Date.now()) return cached.data;
    return null;
}

async function setCachedScript(script, ttl = 300) {
    if (!script) {
        memoryStore.cache.delete('script');
        if (useRedis) await redis.del('script_cache');
        return;
    }
    
    memoryStore.cache.set('script', { data: script, expiresAt: Date.now() + (ttl * 1000) });
    if (useRedis) await redis.setex('script_cache', ttl, script);
}

// 5. Suspensions (Temporary Bans / Spy Detection)
async function addSuspend(type, value, data) {
    const key = `${type}:${value}`;
    const entry = { ...data, type, value, createdAt: new Date().toISOString() };
    memoryStore.suspends.set(key, entry);
    
    if (useRedis) {
        const redisKey = `suspend:${key}`;
        await redis.set(redisKey, JSON.stringify(entry));
        if (data.duration) await redis.expire(redisKey, data.duration);
    }
    saveToFile();
}

async function removeSuspend(type, value) {
    const key = `${type}:${value}`;
    memoryStore.suspends.delete(key);
    if (useRedis) await redis.del(`suspend:${key}`);
    saveToFile();
}

async function getAllSuspends() {
    if (useRedis) {
        const keys = await redis.keys('suspend:*');
        if (keys.length > 0) {
            const vals = await redis.mget(keys);
            return vals.map(v => JSON.parse(v));
        }
        return [];
    }
    return Array.from(memoryStore.suspends.values());
}

async function clearSuspends() {
    memoryStore.suspends.clear();
    if (useRedis) {
        const keys = await redis.keys('suspend:*');
        if (keys.length) await redis.del(keys);
    }
    saveToFile();
}

module.exports = {
    // Bans
    addBan,
    removeBan,
    removeBanById,
    isBanned,
    getAllBans,
    getBanCount,
    clearBans,
    
    // Challenges
    setChallenge,
    getChallenge,
    deleteChallenge,
    
    // Logs
    addLog,
    getLogs,
    clearLogs,
    
    // Script Cache
    getCachedScript,
    setCachedScript,
    
    // Stats
    getStats,
    
    // Suspends
    addSuspend,
    removeSuspend,
    getAllSuspends,
    clearSuspends,
    
    // Utility
    isRedisConnected: () => useRedis && redis && redis.status === 'ready'
};
