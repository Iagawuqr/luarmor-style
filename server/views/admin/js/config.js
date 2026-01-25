const CONFIG = {
    API_BASE: window.location.origin,
    
    ENDPOINTS: {
        STATS: '/api/admin/stats',
        BANS: '/api/admin/bans',
        BAN_CLEAR: '/api/admin/bans/clear',
        LOGS: '/api/admin/logs',
        CACHE_CLEAR: '/api/admin/cache/clear',
        SESSIONS_CLEAR: '/api/admin/sessions/clear',
        WHITELIST: '/api/admin/whitelist',
        SESSIONS: '/api/admin/sessions',
        SUSPENDED: '/api/admin/suspended',
        SUSPEND: '/api/admin/suspend',
        UNSUSPEND: '/api/admin/unsuspend',
        KILL_SESSION: '/api/admin/kill-session'
    },
    
    // REMOVIDO COMPLETAMENTE - NÃO ARMAZENA CHAVES NO FRONTEND
    // STORAGE: {ADMIN_KEY:'luarmor_admin_key', THEME:'luarmor_theme'},
    
    INTERVALS: {
        STATS: 30000,
        LOGS: 15000,
        SESSIONS: 10000
    },
    
    TOAST_DURATION: 4000,
    
    // NOVO: Tema em memória apenas (não persiste)
    THEME: 'dark',
    
    // NOVO: Chave atual em memória (apenas durante a sessão)
    currentKey: null,
    
    // Métodos para gerenciar a chave EM MEMÓRIA (não persiste)
    setKey(key) {
        this.currentKey = key;
    },
    
    getKey() {
        return this.currentKey;
    },
    
    clearKey() {
        this.currentKey = null;
    },
    
    // Métodos para construir URLs
    buildUrl(endpoint, params = {}) {
        const base = endpoint.startsWith('http') ? endpoint : this.API_BASE + endpoint;
        if (Object.keys(params).length === 0) return base;
        
        const query = new URLSearchParams(params).toString();
        return `${base}?${query}`;
    },
    
    // Verifica se há chave configurada
    hasKey() {
        return !!this.currentKey;
    }
};

Object.freeze(CONFIG);
