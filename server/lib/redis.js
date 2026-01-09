const config=require('../config');
const fs=require('fs');
const path=require('path');

let redis=null,useRedis=false;
const DATA_FILE=path.join(__dirname,'..','data','storage.json');
const dataDir=path.join(__dirname,'..','data');

// Ensure data directory exists
if(!fs.existsSync(dataDir))fs.mkdirSync(dataDir,{recursive:true});

// Memory store with file backup
const memoryStore={bans:new Map(),logs:[],challenges:new Map(),cache:new Map(),stats:{success:0,challenges:0,bans:0}};

// Load from file on startup
function loadFromFile(){
try{
if(fs.existsSync(DATA_FILE)){
const data=JSON.parse(fs.readFileSync(DATA_FILE,'utf8'));
if(data.bans)Object.entries(data.bans).forEach(([k,v])=>memoryStore.bans.set(k,v));
if(data.logs)memoryStore.logs=data.logs.slice(0,1000);
if(data.stats)memoryStore.stats=data.stats;
console.log(`✅ Loaded ${memoryStore.bans.size} bans from file`);
}
}catch(e){console.error('Load file error:',e.message)}
}

// Save to file
function saveToFile(){
try{
const data={
bans:Object.fromEntries(memoryStore.bans),
logs:memoryStore.logs.slice(0,500),
stats:memoryStore.stats,
savedAt:new Date().toISOString()
};
fs.writeFileSync(DATA_FILE,JSON.stringify(data,null,2));
}catch(e){console.error('Save file error:',e.message)}
}

// Auto-save every 30 seconds
setInterval(saveToFile,30000);

// Save on process exit
process.on('beforeExit',saveToFile);
process.on('SIGINT',()=>{saveToFile();process.exit()});
process.on('SIGTERM',()=>{saveToFile();process.exit()});

// Load data on startup
loadFromFile();

// Try Redis connection
async function initRedis(){
if(config.REDIS_URL){
try{
const Redis=require('ioredis');
redis=new Redis(config.REDIS_URL,{maxRetriesPerRequest:3,lazyConnect:true,connectTimeout:10000});
await redis.ping();
useRedis=true;
console.log('✅ Redis connected');
// Migrate file data to Redis if exists
if(memoryStore.bans.size>0){
console.log('📤 Migrating file data to Redis...');
for(const[k,v]of memoryStore.bans){await redis.hset('bans',k,JSON.stringify(v))}
console.log(`✅ Migrated ${memoryStore.bans.size} bans to Redis`);
}
}catch(e){console.log('⚠️ Redis failed, using file storage:',e.message);useRedis=false}
}else{console.log('ℹ️ No REDIS_URL, using file storage')}
}
initRedis();

async function addBan(key,data){
memoryStore.stats.bans++;
if(useRedis){try{await redis.hset('bans',key,JSON.stringify(data));await redis.incr('stats:bans');return true}catch(e){}}
memoryStore.bans.set(key,data);
saveToFile();
return true;
}

async function removeBan(key){
if(useRedis){try{await redis.hdel('bans',key);return true}catch(e){}}
memoryStore.bans.delete(key);
saveToFile();
return true;
}

async function removeBanById(banId){
if(useRedis){try{const all=await redis.hgetall('bans');for(const[key,value]of Object.entries(all)){try{const p=JSON.parse(value);if(p.banId===banId){await redis.hdel('bans',key);return true}}catch{}}return false}catch(e){}}
for(const[key,value]of memoryStore.bans){if(value.banId===banId){memoryStore.bans.delete(key);saveToFile();return true}}
return false;
}

async function isBanned(hwid,ip,playerId){
const keys=[hwid,ip,playerId?String(playerId):null].filter(Boolean);
if(keys.length===0)return{blocked:false};
if(useRedis){try{for(const key of keys){const data=await redis.hget('bans',key);if(data){try{const p=JSON.parse(data);return{blocked:true,reason:p.reason||'Banned',banId:p.banId}}catch{}}}return{blocked:false}}catch(e){}}
for(const key of keys){if(memoryStore.bans.has(key)){const d=memoryStore.bans.get(key);return{blocked:true,reason:d.reason||'Banned',banId:d.banId}}}
return{blocked:false};
}

async function getAllBans(){
if(useRedis){try{const all=await redis.hgetall('bans');return Object.values(all).map(v=>{try{return JSON.parse(v)}catch{return null}}).filter(Boolean).sort((a,b)=>new Date(b.ts)-new Date(a.ts))}catch(e){}}
return Array.from(memoryStore.bans.values()).sort((a,b)=>new Date(b.ts)-new Date(a.ts));
}

async function clearBans(){
if(useRedis){try{const all=await redis.hgetall('bans');const count=Object.keys(all).length;if(count>0)await redis.del('bans');return count}catch(e){}}
const count=memoryStore.bans.size;
memoryStore.bans.clear();
saveToFile();
return count;
}

async function setChallenge(id,data,ttl=120){
memoryStore.stats.challenges++;
if(useRedis){try{await redis.setex(`challenge:${id}`,ttl,JSON.stringify(data));await redis.incr('stats:challenges');return true}catch(e){}}
memoryStore.challenges.set(id,{...data,expiresAt:Date.now()+(ttl*1000)});
return true;
}

async function getChallenge(id){
if(useRedis){try{const data=await redis.get(`challenge:${id}`);if(data){try{return JSON.parse(data)}catch{}}return null}catch(e){}}
const data=memoryStore.challenges.get(id);
if(data&&data.expiresAt>Date.now())return data;
memoryStore.challenges.delete(id);
return null;
}

async function deleteChallenge(id){
if(useRedis){try{await redis.del(`challenge:${id}`);return true}catch(e){}}
memoryStore.challenges.delete(id);
return true;
}

async function addLog(log){
if(useRedis){try{await redis.lpush('logs',JSON.stringify(log));await redis.ltrim('logs',0,999);if(log.success)await redis.incr('stats:success');return true}catch(e){}}
memoryStore.logs.unshift(log);
if(memoryStore.logs.length>1000)memoryStore.logs=memoryStore.logs.slice(0,1000);
if(log.success)memoryStore.stats.success++;
return true;
}

async function getLogs(limit=50){
const safeLimit=Math.min(Math.max(1,limit),500);
if(useRedis){try{const logs=await redis.lrange('logs',0,safeLimit-1);return logs.map(l=>{try{return JSON.parse(l)}catch{return null}}).filter(Boolean)}catch(e){}}
return memoryStore.logs.slice(0,safeLimit);
}

async function getCachedScript(){
if(useRedis){try{return await redis.get('cached_script')}catch(e){}}
const cached=memoryStore.cache.get('script');
if(cached&&cached.expiresAt>Date.now())return cached.data;
memoryStore.cache.delete('script');
return null;
}

async function setCachedScript(script,ttl=300){
if(!script){if(useRedis){try{await redis.del('cached_script')}catch{}}memoryStore.cache.delete('script');return true}
if(useRedis){try{await redis.setex('cached_script',ttl,script);return true}catch(e){}}
memoryStore.cache.set('script',{data:script,expiresAt:Date.now()+(ttl*1000)});
return true;
}

async function getStats(){
if(useRedis){try{const[success,challenges,bansCount]=await Promise.all([redis.get('stats:success'),redis.get('stats:challenges'),redis.hlen('bans')]);return{success:parseInt(success)||0,challenges:parseInt(challenges)||0,bans:parseInt(bansCount)||0}}catch(e){}}
return{success:memoryStore.stats.success,challenges:memoryStore.stats.challenges,bans:memoryStore.bans.size};
}

// Cleanup expired challenges
setInterval(()=>{if(!useRedis){const now=Date.now();for(const[id,data]of memoryStore.challenges){if(data.expiresAt&&data.expiresAt<now)memoryStore.challenges.delete(id)}}},60000);

module.exports={addBan,removeBan,removeBanById,isBanned,getAllBans,clearBans,setChallenge,getChallenge,deleteChallenge,addLog,getLogs,getCachedScript,setCachedScript,getStats,isRedisConnected:()=>useRedis};
