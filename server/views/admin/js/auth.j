/* ============================================
   AUTH - Authentication Handler
   ============================================ */

const Auth = {
    isAuthenticated: false,
    
    // Check if user has valid session
    async check() {
        const key = API.getKey();
        if (!key) {
            this.isAuthenticated = false;
            return false;
        }
        
        const result = await API.getStats();
        this.isAuthenticated = result.success === true;
        return this.isAuthenticated;
    },
    
    // Login with admin key
    async login(adminKey) {
        if (!adminKey || adminKey.trim().length < 10) {
            return { 
                success: false, 
                error: 'Admin key must be at least 10 characters' 
            };
        }
        
        // Store key temporarily
        API.setKey(adminKey.trim());
        
        // Verify key by fetching stats
        const result = await API.getStats();
        
        if (result.success) {
            this.isAuthenticated = true;
            return { success: true };
        } else {
            // Clear invalid key
            API.clearKey();
            this.isAuthenticated = false;
            return { 
                success: false, 
                error: result.error || 'Invalid admin key' 
            };
        }
    },
    
    // Logout
    logout() {
        API.clearKey();
        this.isAuthenticated = false;
        App.showLogin();
        Utils.toast('Logged out successfully', 'info');
    },
    
    // Get stored key (masked)
    getMaskedKey() {
        const key = API.getKey();
        if (!key) return '';
        if (key.length <= 8) return '••••••••';
        return key.substring(0, 4) + '••••' + key.substring(key.length - 4);
    },
};
