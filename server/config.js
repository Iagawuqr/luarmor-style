require('dotenv').config();

module.exports = {
    // ==================== WAJIB DIISI ====================
    ADMIN_KEY: process.env.ADMIN_KEY || 'ganti-dengan-key-rahasia-minimal-32-huruf', 
    SECRET_KEY: process.env.SECRET_KEY || 'ganti-dengan-secret-key-enkripsi-32-huruf', 
    SCRIPT_SOURCE_URL: process.env.SCRIPT_SOURCE_URL || '', // Link Raw Script Lua (Pastebin/GitHub)

    // ==================== DATABASE ====================
    REDIS_URL: process.env.REDIS_URL || '', // Wajib untuk fitur persist (agar data tidak hilang saat restart)

    // ==================== KEAMANAN & FITUR ====================
    // Path Admin Panel (Ganti jika ingin menyembunyikan panel admin)
    // Contoh: '/panel-rahasia', '/dashboard-admin'
    // Default: '/admin'
    ADMIN_PATH: process.env.ADMIN_PATH || '/midd',

    // Discord Webhook (Untuk notifikasi eksekusi, ban, spy detect)
    DISCORD_WEBHOOK: process.env.DISCORD_WEBHOOK || '',

    // Kunci enkripsi khusus loader (boleh sama dengan SECRET_KEY, tapi beda lebih bagus)
    LOADER_KEY: process.env.LOADER_KEY || process.env.SECRET_KEY,

    // ==================== WHITELIST & AKSES ====================
    // Whitelist User ID Roblox (Bypass semua proteksi)
    WHITELIST_USER_IDS: process.env.WHITELIST_USER_IDS
        ? process.env.WHITELIST_USER_IDS.split(',').map(Number).filter(Boolean)
        : [],

    // Whitelist HWID (Bypass semua proteksi)
    WHITELIST_HWIDS: process.env.WHITELIST_HWIDS
        ? process.env.WHITELIST_HWIDS.split(',').filter(Boolean)
        : [],

    // Whitelist IP (Untuk Uptime Robot / Cron Job agar server tidak tidur)
    WHITELIST_IPS: process.env.WHITELIST_IPS
        ? process.env.WHITELIST_IPS.split(',').map(ip => ip.trim()).filter(Boolean)
        : [],
    
    // Owner User ID (Script akan mati otomatis jika Owner join server)
    OWNER_USER_IDS: process.env.OWNER_USER_IDS 
        ? process.env.OWNER_USER_IDS.split(',').map(Number).filter(Boolean) 
        : [],

    // Pembatasan Game (Kosongkan = Semua Game Bisa)
    ALLOWED_PLACE_IDS: process.env.ALLOWED_PLACE_IDS
        ? process.env.ALLOWED_PLACE_IDS.split(',').map(Number).filter(Boolean)
        : [],
    
    // Wajib punya HWID di header request (Default: true)
    REQUIRE_HWID: process.env.REQUIRE_HWID !== 'true', 

    // ==================== PROTEKSI LANJUTAN ====================
    // Set 'true' jika script di SCRIPT_SOURCE_URL sudah diobfuscate (Luraph/IronBrew)
    // Server tidak akan mencoba mengacak-acak scriptnya lagi, hanya membungkusnya.
    SCRIPT_ALREADY_OBFUSCATED: process.env.SCRIPT_ALREADY_OBFUSCATED === 'true',

    // Encode Loader agar tidak mudah dibaca manusia (Anti-Dump Loader)
    ENCODE_LOADER: process.env.ENCODE_LOADER !== 'true',

    // Kirim script dalam potongan kecil terenkripsi (Anti-Dump Script)
    // Matikan ini (set ke false) jika script Lua Anda error saat di-load
    CHUNK_DELIVERY: process.env.CHUNK_DELIVERY !== 'true',
    CHUNK_COUNT: parseInt(process.env.CHUNK_COUNT) || 3,

    // Deteksi Spy Tools (SimpleSpy, Dex, dll)
    ANTI_SPY_ENABLED: process.env.ANTI_SPY_ENABLED !== 'true',
    
    // Otomatis Ban user jika terdeteksi Spy Tool (Default: false, hanya kick)
    AUTO_BAN_SPYTOOLS: process.env.AUTO_BAN_SPYTOOLS === 'true',

    // ==================== SYSTEM ====================
    PORT: process.env.PORT || 3000
};
