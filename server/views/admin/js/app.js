/* ============================================
   APP - Main Application Controller
   ============================================ */

const App = {
    currentPage: 'dashboard',
    initialized: false,
    
    // Initialize application
    async init() {
        if (this.initialized) return;
        
        // Check authentication
        const isAuth = await Auth.check();
        
        if (isAuth) {
            this.showDashboard();
        } else {
            this.showLogin();
        }
        
        this.bindGlobalEvents();
        this.initialized = true;
    },
    
    // Show login screen
    showLogin() {
        const loginScreen = document.getElementById('loginScreen');
        const dashboardScreen = document.getElementById('dashboardScreen');
        
        if (loginScreen) loginScreen.classList.remove('hidden');
        if (dashboardScreen) dashboardScreen.classList.add('hidden');
        
        // Focus on input
        setTimeout(() => {
            const input = document.getElementById('adminKeyInput');
            if (input) input.focus();
        }, 100);
    },
    
    // Show dashboard
    showDashboard() {
        const loginScreen = document.getElementById('loginScreen');
        const dashboardScreen = document.getElementById('dashboardScreen');
        
        if (loginScreen) loginScreen.classList.add('hidden');
        if (dashboardScreen) dashboardScreen.classList.remove('hidden');
        
        // Navigate to default page
        this.navigate('dashboard');
    },
    
    // Handle login
    async login() {
        const input = document.getElementById('adminKeyInput');
        const btn = document.getElementById('loginBtn');
        const errorEl = document.getElementById('loginError');
        
        if (!input || !btn) return;
        
        const key = input.value.trim();
        
        if (!key) {
            if (errorEl) {
                errorEl.textContent = 'Please enter your admin key';
                errorEl.classList.remove('hidden');
            }
            input.classList.add('error');
            return;
        }
        
        // Loading state
        Utils.setLoading(btn, true);
        btn.innerHTML = '<span class="spinner spinner-sm"></span> Logging in...';
        
        const result = await Auth.login(key);
        
        Utils.setLoading(btn, false);
        btn.innerHTML = '🚀 Login';
        
        if (result.success) {
            input.classList.remove('error');
            if (errorEl) errorEl.classList.add('hidden');
            this.showDashboard();
            Utils.toast('Welcome back!', 'success');
        } else {
            if (errorEl) {
                errorEl.textContent = result.error || 'Invalid admin key';
                errorEl.classList.remove('hidden');
            }
            input.classList.add('error');
            input.classList.add('animate-shake');
            setTimeout(() => input.classList.remove('animate-shake'), 500);
        }
    },
    
    // Navigate to page
    navigate(page) {
        // Cleanup previous page
        if (this.currentPage === 'logs') {
            Logs.destroy();
        }
        
        this.currentPage = page;
        
        // Update sidebar active state
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.page === page) {
                item.classList.add('active');
            }
        });
        
        // Render page content
        const content = document.getElementById('pageContent');
        if (!content) return;
        
        switch (page) {
            case 'dashboard':
                content.innerHTML = Dashboard.render();
                Dashboard.init();
                Dashboard.loadRecentActivity();
                break;
            case 'bans':
                content.innerHTML = Bans.render();
                Bans.init();
                break;
            case 'logs':
                content.innerHTML = Logs.render();
                Logs.init();
                break;
            case 'settings':
                content.innerHTML = this.renderSettings();
                break;
            default:
                content.innerHTML = Dashboard.render();
                Dashboard.init();
        }
        
        // Scroll to top
        content.scrollTop = 0;
    },
    
    // Render settings page
    renderSettings() {
        return `
            <div class="page-header">
                <div>
                    <h1 class="page-title">Settings</h1>
                    <p class="page-subtitle">Configure your admin dashboard</p>
                </div>
            </div>
            
            <div class="content-grid">
                <div class="card animate-fadeInUp">
                    <div class="card-header">
                        <h3 class="card-title">
                            <span class="card-title-icon">🔑</span>
                            Authentication
                        </h3>
                    </div>
                    <div class="card-body">
                        <div class="form-group">
                            <label class="form-label">Current Admin Key</label>
                            <div class="input-with-button">
                                <input type="text" class="form-input" value="${Auth.getMaskedKey()}" readonly>
                                <button class="btn btn-secondary" onclick="Auth.logout()">Logout</button>
                            </div>
                            <p class="form-help">Your admin key is stored locally in browser</p>
                        </div>
                    </div>
                </div>
                
                <div class="card animate-fadeInUp">
                    <div class="card-header">
                        <h3 class="card-title">
                            <span class="card-title-icon">📋</span>
                            Loader Script
                        </h3>
                    </div>
                    <div class="card-body">
                        <div class="form-group">
                            <label class="form-label">Loader Code</label>
                            <div class="code-block">
                                <pre><code>loadstring(game:HttpGet("${CONFIG.API_BASE}/loader"))()</code></pre>
                                <button class="btn btn-primary btn-sm copy-code-btn" onclick="Dashboard.copyLoader()">
                                    📋 Copy
                                </button>
                            </div>
                            <p class="form-help">Use this in your Roblox executor to load your script</p>
                        </div>
                    </div>
                </div>
                
                <div class="card animate-fadeInUp">
                    <div class="card-header">
                        <h3 class="card-title">
                            <span class="card-title-icon">ℹ️</span>
                            System Info
                        </h3>
                    </div>
                    <div class="card-body">
                        <div class="info-list">
                            <div class="info-item">
                                <span class="info-label">Server URL</span>
                                <span class="info-value">${CONFIG.API_BASE}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Version</span>
                                <span class="info-value">v1.0.0</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Status</span>
                                <span class="badge badge-success">Online</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },
    
    // Toggle sidebar (mobile)
    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) {
            sidebar.classList.toggle('open');
        }
    },
    
    // Bind global events
    bindGlobalEvents() {
        // Login form enter key
        const loginInput = document.getElementById('adminKeyInput');
        if (loginInput) {
            loginInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.login();
                }
            });
        }
        
        // Close modals on escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal-overlay.active').forEach(modal => {
                    modal.classList.remove('active');
                });
            }
        });
        
        // Close modals on overlay click
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    overlay.classList.remove('active');
                }
            });
        });
        
        // Navigation items
        document.querySelectorAll('.nav-item[data-page]').forEach(item => {
            item.addEventListener('click', () => {
                const page = item.dataset.page;
                if (page) this.navigate(page);
            });
        });
    },
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
