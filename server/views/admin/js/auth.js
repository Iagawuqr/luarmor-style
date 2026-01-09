/* ============================================
   AUTH - Authentication Handler (FIXED)
   ============================================ */

const Auth = {
    isAuthenticated: false,
    isChecking: false,
    
    // Check if user has valid session
    async check() {
        if (this.isChecking) {
            console.log('[Auth] Already checking...');
            return this.isAuthenticated;
        }
        
        const key = API.getKey();
        if (!key) {
            console.log('[Auth] No stored key');
            this.isAuthenticated = false;
            return false;
        }
        
        console.log('[Auth] Checking stored key...');
        this.isChecking = true;
        
        const result = await API.getStats();
        
        this.isChecking = false;
        this.isAuthenticated = result.success === true;
        
        console.log('[Auth] Check result:', this.isAuthenticated);
        
        if (!this.isAuthenticated) {
            // Clear invalid stored key
            API.clearKey();
        }
        
        return this.isAuthenticated;
    },
    
    // Login with admin key
    async login(adminKey) {
        console.log('[Auth] Login attempt...');
        
        // Validate input
        if (!adminKey || typeof adminKey !== 'string') {
            return { 
                success: false, 
                error: 'Masukkan admin key' 
            };
        }
        
        const trimmedKey = adminKey.trim();
        
        if (trimmedKey.length < 8) {
            return { 
                success: false, 
                error: 'Admin key minimal 8 karakter' 
            };
        }
        
        // Verify key with server
        console.log('[Auth] Verifying key with server...');
        const result = await API.verifyKey(trimmedKey);
        
        if (result.success) {
            this.isAuthenticated = true;
            console.log('[Auth] Login successful');
            return { success: true };
        } else {
            this.isAuthenticated = false;
            console.log('[Auth] Login failed:', result.error);
            return { 
                success: false, 
                error: result.error || 'Invalid admin key'
            };
        }
    },
    
    // Logout
    logout() {
        console.log('[Auth] Logging out...');
        API.clearKey();
        this.isAuthenticated = false;
        App.showLogin();
        Utils.toast('Logged out', 'info');
    },
    
    // Get stored key (masked)
    getMaskedKey() {
        const key = API.getKey();
        if (!key) return '';
        if (key.length <= 8) return '••••••••';
        return key.substring(0, 4) + '••••••••' + key.substring(key.length - 4);
    },
};
