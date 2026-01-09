const CONFIG={
API_BASE:window.location.origin,
ENDPOINTS:{
STATS:'/api/admin/stats',
BANS:'/api/admin/bans',
BAN_CLEAR:'/api/admin/bans/clear',
LOGS:'/api/admin/logs',
CACHE_CLEAR:'/api/admin/cache/clear',
SESSIONS_CLEAR:'/api/admin/sessions/clear',
WHITELIST:'/api/admin/whitelist'
},
STORAGE:{ADMIN_KEY:'luarmor_admin_key',THEME:'luarmor_theme'},
INTERVALS:{STATS:30000,LOGS:15000,BANS:60000},
PAGINATION:{DEFAULT_LIMIT:20,OPTIONS:[10,20,50,100]},
TOAST_DURATION:4000
};
Object.freeze(CONFIG);
