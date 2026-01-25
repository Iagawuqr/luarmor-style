const API = {
    TIMEOUT: 15000,
    
    // NÃO usa LocalStorage - apenas variável em memória
    currentKey: null,
    
    // Getter/Setter para a chave atual (apenas em memória)
    getKey() { 
        return this.currentKey || ''; 
    },
    
    setKey(key) { 
        this.currentKey = key; 
    },
    
    clearKey() { 
        this.currentKey = null; 
    },
    
    async request(endpoint, options = {}) {
        const url = window.location.origin + endpoint;
        const key = this.getKey();
        
        console.log('[API] Request:', options.method || 'GET', endpoint);
        
        if (!key && !options.skipAuth) {
            console.warn('[API] No key provided for request');
            return { success: false, error: 'No authentication key', code: 'NO_AUTH' };
        }
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT);
        
        try {
            const res = await fetch(url, {
                ...options,
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-key': key,
                    ...(options.headers || {})
                }
            });
            
            clearTimeout(timeoutId);
            console.log('[API] Status:', res.status);
            
            let data;
            const ct = res.headers.get('content-type') || '';
            
            if (ct.includes('application/json')) {
                data = await res.json();
            } else {
                const text = await res.text();
                console.log('[API] Non-JSON response:', text.substring(0, 100));
                data = { success: false, error: 'Server returned non-JSON response' };
            }
            
            console.log('[API] Response:', data);
            
            if (res.status === 403) {
                return { 
                    success: false, 
                    error: data.error || 'Unauthorized', 
                    code: 'AUTH_FAILED' 
                };
            }
            
            if (!res.ok) {
                return { 
                    success: false, 
                    error: data.error || 'Request failed', 
                    code: 'HTTP_ERROR' 
                };
            }
            
            return data;
            
        } catch (err) {
            clearTimeout(timeoutId);
            console.error('[API] Error:', err);
            
            if (err.name === 'AbortError') {
                return { 
                    success: false, 
                    error: 'Request timeout', 
                    code: 'TIMEOUT' 
                };
            }
            
            return { 
                success: false, 
                error: 'Network error: ' + err.message, 
                code: 'NETWORK' 
            };
        }
    },
    
    get(endpoint, params = {}) {
        const query = new URLSearchParams(params).toString();
        const url = query ? `${endpoint}?${query}` : endpoint;
        return this.request(url, { method: 'GET' });
    },
    
    post(endpoint, body = {}) {
        return this.request(endpoint, { 
            method: 'POST', 
            body: JSON.stringify(body) 
        });
    },
    
    delete(endpoint, body = null) {
        return this.request(endpoint, { 
            method: 'DELETE', 
            body: body ? JSON.stringify(body) : null 
        });
    },
    
    put(endpoint, body = {}) {
        return this.request(endpoint, { 
            method: 'PUT', 
            body: JSON.stringify(body) 
        });
    },
    
    patch(endpoint, body = {}) {
        return this.request(endpoint, { 
            method: 'PATCH', 
            body: JSON.stringify(body) 
        });
    }
};

// Sistema de autenticação sem LocalStorage
const AuthManager = {
    async login(key) {
        API.setKey(key);
        const result = await API.get('/api/admin/stats');
        
        if (result.success) {
            return { 
                success: true, 
                keyType: this.detectKeyType(key), // Função para detectar tipo
                message: 'Login successful' 
            };
        } else {
            API.clearKey();
            return { 
                success: false, 
                error: result.error || 'Invalid key' 
            };
        }
    },
    
    logout() {
        API.clearKey();
        return { success: true, message: 'Logged out' };
    },
    
    detectKeyType(key) {
        // Aqui você pode implementar lógica para detectar o tipo de chave
        // Por exemplo, baseado em prefixo ou formato
        if (key.startsWith('owner_')) return 'owner';
        if (key.startsWith('admin_')) return 'admin';
        if (key.startsWith('viewer_')) return 'viewer';
        return 'unknown';
    },
    
    isLoggedIn() {
        return API.getKey() !== null && API.getKey() !== '';
    },
    
    getKeyType() {
        const key = API.getKey();
        if (!key) return null;
        return this.detectKeyType(key);
    },
    
    hasPermission(requiredLevel) {
        const keyType = this.getKeyType();
        const permissions = {
            'owner': 3,  // Acesso total
            'admin': 2,  // Gerenciamento
            'viewer': 1, // Leitura apenas
            'unknown': 0 // Sem acesso
        };
        
        const currentLevel = permissions[keyType] || 0;
        const requiredLevelValue = permissions[requiredLevel] || 0;
        
        return currentLevel >= requiredLevelValue;
    }
};

// Sistema de cache em memória para requests (opcional)
const APICache = {
    cache: new Map(),
    
    async getWithCache(endpoint, params = {}, ttl = 60000) { // 60 segundos por padrão
        const cacheKey = endpoint + JSON.stringify(params);
        const cached = this.cache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < ttl) {
            console.log('[Cache] Hit:', endpoint);
            return cached.data;
        }
        
        console.log('[Cache] Miss:', endpoint);
        const data = await API.get(endpoint, params);
        
        if (data.success) {
            this.cache.set(cacheKey, {
                data,
                timestamp: Date.now()
            });
        }
        
        return data;
    },
    
    clearCache(endpointPattern = null) {
        if (!endpointPattern) {
            this.cache.clear();
            console.log('[Cache] Cleared all');
        } else {
            for (const key of this.cache.keys()) {
                if (key.includes(endpointPattern)) {
                    this.cache.delete(key);
                }
            }
            console.log('[Cache] Cleared pattern:', endpointPattern);
        }
    },
    
    invalidateCache(endpoint) {
        for (const key of this.cache.keys()) {
            if (key.startsWith(endpoint)) {
                this.cache.delete(key);
            }
        }
    }
};

// Sistema de retry para requests falhos
const APIRetry = {
    maxRetries: 3,
    retryDelay: 1000,
    
    async requestWithRetry(endpoint, options = {}, retryCount = 0) {
        try {
            return await API.request(endpoint, options);
        } catch (error) {
            if (retryCount < this.maxRetries && 
                (error.code === 'NETWORK' || error.code === 'TIMEOUT')) {
                
                console.log(`[Retry] Attempt ${retryCount + 1}/${this.maxRetries} for`, endpoint);
                await this.delay(this.retryDelay * Math.pow(2, retryCount));
                
                return this.requestWithRetry(endpoint, options, retryCount + 1);
            }
            
            throw error;
        }
    },
    
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
};

// Exportar para uso global
window.API = API;
window.AuthManager = AuthManager;
window.APICache = APICache;
window.APIRetry = APIRetry;

// Função auxiliar para detectar se está em ambiente de desenvolvimento
window.isDevEnvironment = () => {
    return window.location.hostname === 'localhost' || 
           window.location.hostname === '127.0.0.1' ||
           window.location.hostname.includes('.local');
};

// Log nível de depuração apenas em dev
if (window.isDevEnvironment()) {
    console.log('[API] Development environment detected');
    window.debugAPI = true;
} else {
    console.log('[API] Production environment');
    window.debugAPI = false;
      }
