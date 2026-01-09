require('dotenv').config();

module.exports = {
    // ==================== REQUIRED ====================
    ADMIN_KEY: process.env.ADMIN_KEY || 'change-this-to-secure-key-min-32-chars', // Ganti ini!
    SECRET_KEY: process.env.SECRET_KEY || 'another-secret-key-for-encryption-32', // Ganti ini!
    SCRIPT_SOURCE_URL: process.env.SCRIPT_SOURCE_URL || '', // URL raw script Lua kamu

    // ==================== SECURITY & FEATURES ====================
    LOADER_KEY: process.env.LOADER_KEY || process.env.SECRET_KEY || 'loader-encryption-key-here', // Key untuk enkripsi loader
    DISCORD_WEBHOOK: process.env.DISCORD_WEBHOOK || '', // URL Discord Webhook

    // Whitelist: User/HWID/IP yang diizinkan bypass sebagian atau semua proteksi
    WHITELIST_USER_IDS: process.env.WHITELIST_USER_IDS
        ? process.env.WHITELIST_USER_IDS.split(',').map(Number).filter(Boolean)
        : [],
    WHITELIST_HWIDS: process.env.WHITELIST_HWIDS
        ? process.env.WHITELIST_HWIDS.split(',').filter(Boolean)
        : [],
    WHITELIST_IPS: process.env.WHITELIST_IPS // Baru ditambahkan
        ? process.env.WHITELIST_IPS.split(',').map(ip => ip.trim()).filter(Boolean)
        : [],
    
    // Owner: User ID pemilik yang jika join server akan membuat script mati
    OWNER_USER_IDS: process.env.OWNER_USER_IDS
        ? process.env.OWNER_USER_IDS.split(',').map(Number).filter(Boolean)
        : [],

    // Restrictions: Pembatasan tambahan
    ALLOWED_PLACE_IDS: process.env.ALLOWED_PLACE_IDS
        ? process.env.ALLOWED_PLACE_IDS.split(',').map(Number).filter(Boolean)
        : [],
    REQUIRE_HWID: process.env.REQUIRE_HWID === 'true', // Wajib ada HWID untuk akses

    // Anti-Exploit Settings
    ANTI_SPY_ENABLED: process.env.ANTI_SPY_ENABLED !== 'false', // Aktifkan anti-spy tool detection
    AUTO_BAN_SPYTOOLS: process.env.AUTO_BAN_SPYTOOLS === 'true', // Auto-ban jika terdeteksi spy tool

    // Loader & Script Delivery
    SCRIPT_ALREADY_OBFUSCATED: process.env.SCRIPT_ALREADY_OBFUSCATED === 'true', // Set true jika script sudah diobfuscate
    ENCODE_LOADER: process.env.ENCODE_LOADER !== 'false', // Encode loader untuk menyulitkan dump
    CHUNK_DELIVERY: process.env.CHUNK_DELIVERY !== 'false', // Pengiriman script per chunk (anti-dump)
    CHUNK_COUNT: parseInt(process.env.CHUNK_COUNT) || 3, // Jumlah chunk script

    // Server Settings
    PORT: process.env.PORT || 3000
};
