const crypto = require('crypto');
const db = require('./redis'); // Usa o Redis.js existente

// Funções auxiliares
function generateKey() {
    const segments = [];
    for (let i = 0; i < 4; i++) {
        segments.push(crypto.randomBytes(3).toString('hex').toUpperCase().substring(0, 4));
    }
    return segments.join('-');
}

function calculateExpiry(days, hours) {
    const now = Date.now();
    let expiryMs = 0;
    
    if (days && days > 0) expiryMs += days * 24 * 60 * 60 * 1000;
    if (hours && hours > 0) expiryMs += hours * 60 * 60 * 1000;
    
    return expiryMs > 0 ? new Date(now + expiryMs) : null;
}

function formatExpiry(expiryDate) {
    if (!expiryDate) return 'Never';
    const now = new Date();
    const diff = expiryDate - now;
    
    if (diff <= 0) return 'Expired';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h`;
    return 'Expired';
}

// Funções principais de Key Management
const Keys = {
    // Criar nova key
    async createKey(options = {}) {
        const {
            note = '',
            createdBy = 'admin',
            days = 0,
            hours = 0,
            uses = 1,
            hwidLock = false,
            ipLock = false,
            userIdLock = false
        } = options;
        
        const keyString = generateKey();
        const createdAt = new Date().toISOString();
        const expiresAt = calculateExpiry(days, hours);
        
        const keyData = {
            key: keyString,
            note,
            createdBy,
            createdAt,
            expiresAt: expiresAt ? expiresAt.toISOString() : null,
            usesTotal: parseInt(uses) || 1,
            usesLeft: parseInt(uses) || 1,
            hwidLock: !!hwidLock,
            ipLock: !!ipLock,
            userIdLock: !!userIdLock,
            activations: [],
            enabled: true,
            lastUsed: null,
            usage: [] // Histórico de uso
        };
        
        // Salvar no Redis
        await db.addKey(keyString, keyData);
        
        return {
            success: true,
            key: keyString,
            data: keyData
        };
    },
    
    // Verificar key
    async validateKey(keyString, hwid, ip, userId) {
        const keyData = await db.getKey(keyString);
        
        if (!keyData) {
            return {
                valid: false,
                error: 'Invalid key'
            };
        }
        
        if (!keyData.enabled) {
            return {
                valid: false,
                error: 'Key disabled'
            };
        }
        
        if (keyData.expiresAt && new Date(keyData.expiresAt) < new Date()) {
            return {
                valid: false,
                error: 'Key expired'
            };
        }
        
        if (keyData.usesLeft <= 0) {
            return {
                valid: false,
                error: 'No uses left'
            };
        }
        
        // Verificar locks
        const allKeys = await db.getAllKeys();
        
        for (const existingKey of allKeys) {
            if (existingKey.key === keyString) continue;
            
            for (const activation of existingKey.activations || []) {
                if (keyData.hwidLock && activation.hwid === hwid && hwid) {
                    return {
                        valid: false,
                        error: 'Key already used on this device'
                    };
                }
                if (keyData.ipLock && activation.ip === ip && ip) {
                    return {
                        valid: false,
                        error: 'Key already used from this IP'
                    };
                }
                if (keyData.userIdLock && activation.userId === userId && userId) {
                    return {
                        valid: false,
                        error: 'Key already used by this user'
                    };
                }
            }
        }
        
        return {
            valid: true,
            keyData
        };
    },
    
    // Ativar key
    async activateKey(keyString, hwid, ip, userId) {
        const validation = await this.validateKey(keyString, hwid, ip, userId);
        
        if (!validation.valid) {
            return validation;
        }
        
        const keyData = validation.keyData;
        
        // Atualizar contador de usos
        keyData.usesLeft--;
        keyData.lastUsed = new Date().toISOString();
        
        // Registrar ativação
        const activation = {
            hwid: hwid || null,
            ip: ip || null,
            userId: userId || null,
            activatedAt: new Date().toISOString()
        };
        
        keyData.activations = keyData.activations || [];
        keyData.activations.push(activation);
        
        // Adicionar ao histórico de uso
        keyData.usage = keyData.usage || [];
        keyData.usage.push({
            action: 'activate',
            timestamp: new Date().toISOString(),
            hwid,
            ip,
            userId
        });
        
        // Atualizar no Redis
        await db.updateKey(keyString, keyData);
        
        return {
            success: true,
            key: keyString,
            usesLeft: keyData.usesLeft,
            activation
        };
    },
    
    // Obter todas as keys
    async getAllKeys() {
        const keys = await db.getAllKeys();
        return keys.map(key => ({
            ...key,
            expiryFormatted: formatExpiry(key.expiresAt ? new Date(key.expiresAt) : null)
        }));
    },
    
    // Obter key específica
    async getKey(keyString) {
        const keyData = await db.getKey(keyString);
        if (keyData) {
            return {
                ...keyData,
                expiryFormatted: formatExpiry(keyData.expiresAt ? new Date(keyData.expiresAt) : null)
            };
        }
        return null;
    },
    
    // Deletar key
    async deleteKey(keyString) {
        const deleted = await db.deleteKey(keyString);
        return deleted;
    },
    
    // Desabilitar key
    async disableKey(keyString) {
        const keyData = await db.getKey(keyString);
        if (keyData) {
            keyData.enabled = false;
            keyData.usage = keyData.usage || [];
            keyData.usage.push({
                action: 'disable',
                timestamp: new Date().toISOString(),
                by: 'admin'
            });
            
            await db.updateKey(keyString, keyData);
            return true;
        }
        return false;
    },
    
    // Habilitar key
    async enableKey(keyString) {
        const keyData = await db.getKey(keyString);
        if (keyData) {
            keyData.enabled = true;
            keyData.usage = keyData.usage || [];
            keyData.usage.push({
                action: 'enable',
                timestamp: new Date().toISOString(),
                by: 'admin'
            });
            
            await db.updateKey(keyString, keyData);
            return true;
        }
        return false;
    },
    
    // Obter estatísticas
    async getUsageStats() {
        const keys = await db.getAllKeys();
        const now = new Date();
        
        const totalKeys = keys.length;
        const activeKeys = keys.filter(k => k.enabled && new Date(k.expiresAt) > now).length;
        const expiredKeys = keys.filter(k => new Date(k.expiresAt) < now).length;
        
        let totalActivations = 0;
        keys.forEach(key => {
            totalActivations += (key.activations || []).length;
        });
        
        const recentActivations = [];
        keys.forEach(key => {
            (key.activations || []).forEach(act => {
                recentActivations.push({
                    key: key.key,
                    ...act
                });
            });
        });
        
        recentActivations.sort((a, b) => new Date(b.activatedAt) - new Date(a.activatedAt));
        
        return {
            totalKeys,
            activeKeys,
            expiredKeys,
            totalActivations,
            recentActivations: recentActivations.slice(0, 10)
        };
    },
    
    // Obter estatísticas de uma key específica
    async getKeyStats(keyString) {
        const keyData = await db.getKey(keyString);
        if (!keyData) return null;
        
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        const activationsToday = (keyData.activations || []).filter(a => {
            const activationDate = new Date(a.activatedAt);
            return activationDate >= today;
        }).length;
        
        return {
            totalActivations: (keyData.activations || []).length,
            activationsToday,
            lastActivation: keyData.activations?.length > 0 
                ? keyData.activations[keyData.activations.length - 1] 
                : null,
            status: keyData.enabled ? 'active' : 'disabled',
            expiry: formatExpiry(keyData.expiresAt ? new Date(keyData.expiresAt) : null)
        };
    },
    
    // Limpar keys expiradas
    async clearExpiredKeys() {
        const keys = await db.getAllKeys();
        const now = new Date();
        let cleared = 0;
        
        for (const key of keys) {
            if (key.expiresAt && new Date(key.expiresAt) < now) {
                await db.deleteKey(key.key);
                cleared++;
            }
        }
        
        return cleared;
    },
    
    // Verificar se HWID/IP/UserID já está em uso
    async checkExistingUsage(hwid, ip, userId) {
        const keys = await db.getAllKeys();
        const usedKeys = [];
        
        for (const key of keys) {
            for (const activation of key.activations || []) {
                if (hwid && activation.hwid === hwid) {
                    usedKeys.push({
                        key: key.key,
                        type: 'hwid',
                        value: hwid,
                        activatedAt: activation.activatedAt
                    });
                }
                if (ip && activation.ip === ip) {
                    usedKeys.push({
                        key: key.key,
                        type: 'ip',
                        value: ip,
                        activatedAt: activation.activatedAt
                    });
                }
                if (userId && activation.userId === userId) {
                    usedKeys.push({
                        key: key.key,
                        type: 'userId',
                        value: userId,
                        activatedAt: activation.activatedAt
                    });
                }
            }
        }
        
        return usedKeys;
    }
};

// Limpeza automática a cada hora
setInterval(async () => {
    try {
        const cleared = await Keys.clearExpiredKeys();
        if (cleared > 0) {
            console.log(`[Keys] Cleared ${cleared} expired keys`);
        }
    } catch (error) {
        console.error('[Keys] Auto-cleanup error:', error.message);
    }
}, 3600000); // 1 hora

module.exports = Keys;
