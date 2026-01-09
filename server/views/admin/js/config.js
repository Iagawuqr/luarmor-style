/* ============================================
   CONFIG - API Endpoints & Constants
   ============================================ */

const CONFIG = {
    // API Base URL (auto-detect)
    API_BASE: window.location.origin,
    
    // API Endpoints
    ENDPOINTS: {
        // Auth
        STATS: '/api/admin/stats',
        
        // Bans
        BANS: '/api/admin/bans',
        BAN_CLEAR: '/api/admin/bans/clear',
        UNBAN: '/api/admin/unban',
        
        // Logs
        LOGS: '/api/admin/logs',
        
        // Cache & Sessions
        CACHE_CLEAR: '/api/admin/cache/clear',
        SESSIONS_CLEAR: '/api/admin/sessions/clear',
    },
    
    // Storage Keys
    STORAGE: {
        ADMIN_KEY: 'luarmor_admin_key',
        THEME: 'luarmor_theme',
        SIDEBAR: 'luarmor_sidebar',
    },
    
    // Refresh Intervals (ms)
    INTERVALS: {
        STATS: 30000,      // 30 seconds
        LOGS: 15000,       // 15 seconds
        BANS: 60000,       // 1 minute
    },
    
    // Pagination
    PAGINATION: {
        DEFAULT_LIMIT: 20,
        OPTIONS: [10, 20, 50, 100],
    },
    
    // Toast Duration (ms)
    TOAST_DURATION: 4000,
};

// Freeze config to prevent modifications
Object.freeze(CONFIG);
Object.freeze(CONFIG.ENDPOINTS);
Object.freeze(CONFIG.STORAGE);
Object.freeze(CONFIG.INTERVALS);
Object.freeze(CONFIG.PAGINATION);
