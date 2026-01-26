const Keys = {
    keys: [],
    searchQuery: '',
    
    async init() {
        await this.loadKeys();
        this.bindEvents();
        this.updateStats();
    },
    
    async loadKeys() {
        const result = await API.get('/api/admin/keys');
        if (result.success) {
            this.keys = result.keys || [];
            this.renderTable();
        } else {
            Utils.toast('Failed to load keys', 'error');
        }
    },
    
    filterKeys() {
        if (!this.searchQuery) {
            return this.keys;
        }
        
        const query = this.searchQuery.toLowerCase();
        return this.keys.filter(key => 
            (key.key && key.key.toLowerCase().includes(query)) ||
            (key.note && key.note.toLowerCase().includes(query)) ||
            (key.createdBy && key.createdBy.toLowerCase().includes(query))
        );
    },
    
    renderTable() {
        const tbody = document.getElementById('keysTableBody');
        if (!tbody) return;
        
        const filteredKeys = this.filterKeys();
        
        if (filteredKeys.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="10" class="text-center" style="padding: 40px;">
                        <div class="empty-state">
                            <div class="empty-state-icon">🔑</div>
                            <h4 class="empty-state-title">No keys found</h4>
                            <p class="empty-state-text">
                                ${this.searchQuery ? 'Try a different search term' : 'Create your first key'}
                            </p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }
        
        tbody.innerHTML = filteredKeys.map(key => `
            <tr class="animate-fadeIn">
                <td>
                    <code class="text-primary" style="font-weight: bold; font-size: 13px;">${Utils.escapeHtml(key.key)}</code>
                </td>
                <td class="text-secondary">${Utils.escapeHtml(key.note || '-')}</td>
                <td>
                    <span class="badge ${key.enabled ? 'badge-success' : 'badge-danger'}">
                        ${key.enabled ? '✅ Active' : '❌ Disabled'}
                    </span>
                </td>
                <td>
                    <span class="badge ${key.usesLeft > 0 ? 'badge-info' : 'badge-warning'}">
                        ${key.usesLeft}/${key.usesTotal}
                    </span>
                </td>
                <td>
                    ${key.expiryFormatted === 'Never' ? 
                        '<span class="badge badge-secondary">Never</span>' : 
                        `<span class="badge ${key.expiryFormatted.includes('Expired') ? 'badge-danger' : 'badge-warning'}">
                            ${key.expiryFormatted}
                        </span>`
                    }
                </td>
                <td class="text-muted" style="font-size: 12px;">${Utils.formatDate(key.createdAt)}</td>
                <td>
                    <div class="cell-stack">
                        ${key.hwidLock ? '<span class="badge badge-purple" title="HWID Lock">HWID</span>' : ''}
                        ${key.ipLock ? '<span class="badge badge-info" title="IP Lock">IP</span>' : ''}
                        ${key.userIdLock ? '<span class="badge badge-warning" title="User ID Lock">UID</span>' : ''}
                    </div>
                </td>
                <td>
                    <span class="badge ${key.activations.length > 0 ? 'badge-success' : 'badge-secondary'}">
                        ${key.activations.length}
                    </span>
                </td>
                <td class="text-muted" style="font-size: 12px;">
                    ${key.lastUsed ? Utils.formatDate(key.lastUsed) : 'Never'}
                </td>
                <td>
                    <div class="table-actions">
                        <button class="btn btn-ghost btn-sm btn-icon" onclick="Keys.copyKey('${key.key}')" title="Copy Key">
                            📋
                        </button>
                        <button class="btn btn-ghost btn-sm btn-icon" onclick="Keys.showKeyCode('${key.key}')" title="Show Code">
                            &lt;/&gt;
                        </button>
                        <button class="btn btn-${key.enabled ? 'warning' : 'success'} btn-sm btn-icon" 
                                onclick="Keys.toggleKey('${key.key}', ${!key.enabled})" 
                                title="${key.enabled ? 'Disable' : 'Enable'}">
                            ${key.enabled ? '⏸️' : '▶️'}
                        </button>
                        <button class="btn btn-danger btn-sm btn-icon" onclick="Keys.deleteKey('${key.key}')" title="Delete">
                            🗑️
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    },
    
    bindEvents() {
        const searchInput = document.getElementById('keySearch');
        if (searchInput) {
            searchInput.addEventListener('input', Utils.debounce((e) => {
                this.searchQuery = e.target.value;
                this.renderTable();
            }, 300));
        }
        
        const createBtn = document.getElementById('createKeyBtn');
        if (createBtn) {
            createBtn.addEventListener('click', () => this.openCreateModal());
        }
    },
    
    openCreateModal() {
        const modal = document.getElementById('createKeyModal');
        if (modal) {
            modal.classList.add('active');
            document.getElementById('keyNote').value = '';
            document.getElementById('keyDays').value = '7';
            document.getElementById('keyHours').value = '0';
            document.getElementById('keyUses').value = '1';
            document.getElementById('keyHwidLock').checked = true;
            document.getElementById('keyIpLock').checked = false;
            document.getElementById('keyUserIdLock').checked = false;
        }
    },
    
    closeCreateModal() {
        const modal = document.getElementById('createKeyModal');
        if (modal) modal.classList.remove('active');
    },
    
    async createKey() {
        const note = document.getElementById('keyNote').value.trim();
        const days = parseInt(document.getElementById('keyDays').value) || 0;
        const hours = parseInt(document.getElementById('keyHours').value) || 0;
        const uses = parseInt(document.getElementById('keyUses').value) || 1;
        const hwidLock = document.getElementById('keyHwidLock').checked;
        const ipLock = document.getElementById('keyIpLock').checked;
        const userIdLock = document.getElementById('keyUserIdLock').checked;
        
        if (uses < 1) {
            Utils.toast('Uses must be at least 1', 'error');
            return;
        }
        
        if (days === 0 && hours === 0 && document.getElementById('keyNeverExpire').checked) {
            // Never expire option
        } else if (days === 0 && hours === 0) {
            Utils.toast('Please set expiration time or check "Never expire"', 'error');
            return;
        }
        
        const btn = document.getElementById('createKeySubmitBtn');
        Utils.setLoading(btn, true);
        
        try {
            const result = await API.post('/api/admin/keys/create', {
                note,
                days,
                hours,
                uses,
                hwidLock,
                ipLock,
                userIdLock
            });
            
            if (result.success) {
                Utils.toast(`Key created: ${result.key}`, 'success');
                this.closeCreateModal();
                
                // Show new key modal
                const keyDisplay = document.getElementById('newKeyDisplay');
                const keyCode = document.getElementById('newKeyCode');
                
                if (keyDisplay && keyCode) {
                    keyDisplay.textContent = result.key;
                    keyCode.textContent = `_G.key = "${result.key}"`;
                    document.getElementById('newKeyModal').classList.add('active');
                }
                
                await this.loadKeys();
                await this.updateStats();
            } else {
                Utils.toast(result.error || 'Failed to create key', 'error');
            }
        } catch (error) {
            Utils.toast('Error: ' + error.message, 'error');
        } finally {
            Utils.setLoading(btn, false);
        }
    },
    
    async deleteKey(keyString) {
        if (!await Utils.confirm(`Delete key ${keyString}?\nThis action cannot be undone!`, 'Delete Key')) {
            return;
        }
        
        const result = await API.delete(`/api/admin/keys/${encodeURIComponent(keyString)}`);
        
        if (result.success) {
            Utils.toast('Key deleted successfully', 'success');
            await this.loadKeys();
            await this.updateStats();
        } else {
            Utils.toast(result.error || 'Failed to delete key', 'error');
        }
    },
    
    async toggleKey(keyString, enable) {
        const endpoint = enable ? 'enable' : 'disable';
        const result = await API.post(`/api/admin/keys/${encodeURIComponent(keyString)}/${endpoint}`);
        
        if (result.success) {
            Utils.toast(`Key ${enable ? 'enabled' : 'disabled'}`, 'success');
            await this.loadKeys();
        } else {
            Utils.toast(result.error || 'Failed to toggle key', 'error');
        }
    },
    
    copyKey(keyString) {
        navigator.clipboard.writeText(keyString)
            .then(() => {
                Utils.toast('Key copied to clipboard', 'success');
            })
            .catch(() => {
                Utils.toast('Failed to copy key', 'error');
            });
    },
    
    showKeyCode(keyString) {
        const code = `_G.key = "${keyString}"\nloadstring(game:HttpGet("${window.location.origin}/loader"))()`;
        
        const modal = document.getElementById('keyCodeModal');
        const codeElement = document.getElementById('keyCodeDisplay');
        
        if (modal && codeElement) {
            codeElement.textContent = code;
            modal.classList.add('active');
        }
    },
    
    closeKeyCodeModal() {
        const modal = document.getElementById('keyCodeModal');
        if (modal) modal.classList.remove('active');
    },
    
    copyKeyCode() {
        const codeElement = document.getElementById('keyCodeDisplay');
        if (codeElement) {
            navigator.clipboard.writeText(codeElement.textContent)
                .then(() => {
                    Utils.toast('Code copied to clipboard', 'success');
                })
                .catch(() => {
                    Utils.toast('Failed to copy code', 'error');
                });
        }
    },
    
    closeNewKeyModal() {
        const modal = document.getElementById('newKeyModal');
        if (modal) modal.classList.remove('active');
    },
    
    async updateStats() {
        try {
            const result = await API.get('/api/admin/keys/stats/overview');
            if (result.success) {
                const stats = result.stats;
                
                const statsEl = document.getElementById('keysStats');
                if (statsEl) {
                    statsEl.innerHTML = `
                        <div class="stats-grid">
                            <div class="stat-card">
                                <div class="stat-value">${stats.totalKeys}</div>
                                <div class="stat-label">Total Keys</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-value" style="color: var(--success)">${stats.activeKeys}</div>
                                <div class="stat-label">Active Keys</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-value" style="color: var(--danger)">${stats.expiredKeys}</div>
                                <div class="stat-label">Expired Keys</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-value" style="color: var(--primary)">${stats.totalActivations}</div>
                                <div class="stat-label">Total Activations</div>
                            </div>
                        </div>
                    `;
                }
            }
        } catch (error) {
            console.error('Failed to load key stats:', error);
        }
    },
    
    async refresh() {
        const btn = document.querySelector('.refresh-keys-btn');
        if (btn) btn.classList.add('animate-spin');
        
        await this.loadKeys();
        await this.updateStats();
        
        if (btn) {
            setTimeout(() => btn.classList.remove('animate-spin'), 500);
        }
        
        Utils.toast('Keys refreshed', 'success');
    },
    
    render() {
        return `
            <div class="page-header">
                <div>
                    <h1 class="page-title">🔑 Key Management</h1>
                    <p class="page-subtitle">Create and manage activation keys for your script</p>
                </div>
                <div class="page-actions">
                    <button class="btn btn-secondary refresh-keys-btn" onclick="Keys.refresh()">
                        ↻ Refresh
                    </button>
                    <button class="btn btn-primary" onclick="Keys.openCreateModal()" id="createKeyBtn">
                        ➕ Create Key
                    </button>
                </div>
            </div>
            
            <div id="keysStats" style="margin-bottom: 24px;"></div>
            
            <div class="card animate-fadeInUp">
                <div class="card-header">
                    <div class="actions-left">
                        <div class="search-input-wrapper">
                            <span class="search-icon">🔍</span>
                            <input type="text" id="keySearch" class="form-input" placeholder="Search keys..." style="padding-left: 40px; width: 300px;">
                        </div>
                    </div>
                    <div class="actions-right">
                        <button class="btn btn-ghost" onclick="Keys.loadKeys()">
                            Reload
                        </button>
                    </div>
                </div>
                <div class="table-container">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Key</th>
                                <th>Note</th>
                                <th>Status</th>
                                <th>Uses</th>
                                <th>Expires</th>
                                <th>Created</th>
                                <th>Locks</th>
                                <th>Activations</th>
                                <th>Last Used</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="keysTableBody">
                            <tr>
                                <td colspan="10" class="text-center" style="padding: 40px;">
                                    <div class="spinner"></div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
            
            <!-- Create Key Modal -->
            <div class="modal-overlay" id="createKeyModal">
                <div class="modal" style="max-width: 600px;">
                    <div class="modal-header">
                        <h3 class="modal-title">➕ Create New Key</h3>
                        <button class="modal-close" onclick="Keys.closeCreateModal()">✕</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label class="form-label">Note (Optional)</label>
                            <input type="text" id="keyNote" class="form-input" placeholder="e.g., VIP Customer, Beta Tester, etc.">
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">Expiration</label>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 10px;">
                                <div>
                                    <input type="number" id="keyDays" class="form-input" value="7" min="0" placeholder="Days">
                                    <p class="form-help">Days</p>
                                </div>
                                <div>
                                    <input type="number" id="keyHours" class="form-input" value="0" min="0" max="23" placeholder="Hours">
                                    <p class="form-help">Hours</p>
                                </div>
                            </div>
                            <label class="checkbox-label">
                                <input type="checkbox" id="keyNeverExpire">
                                <span class="checkbox-custom"></span>
                                <span class="checkbox-text">Never expire</span>
                            </label>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">Number of Uses</label>
                            <input type="number" id="keyUses" class="form-input" value="1" min="1">
                            <p class="form-help">How many times this key can be used</p>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">Security Locks</label>
                            <div class="checkbox-group">
                                <label class="checkbox-label">
                                    <input type="checkbox" id="keyHwidLock" checked>
                                    <span class="checkbox-custom"></span>
                                    <span class="checkbox-text">Lock to HWID (Device)</span>
                                </label>
                                <label class="checkbox-label">
                                    <input type="checkbox" id="keyIpLock">
                                    <span class="checkbox-custom"></span>
                                    <span class="checkbox-text">Lock to IP Address</span>
                                </label>
                                <label class="checkbox-label">
                                    <input type="checkbox" id="keyUserIdLock">
                                    <span class="checkbox-custom"></span>
                                    <span class="checkbox-text">Lock to User ID</span>
                                </label>
                            </div>
                            <p class="form-help">Prevents key sharing between devices/users</p>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="Keys.closeCreateModal()">Cancel</button>
                        <button class="btn btn-primary" id="createKeySubmitBtn" onclick="Keys.createKey()">
                            Create Key
                        </button>
                    </div>
                </div>
            </div>
            
            <!-- New Key Created Modal -->
            <div class="modal-overlay" id="newKeyModal">
                <div class="modal">
                    <div class="modal-header">
                        <h3 class="modal-title">🎉 Key Created Successfully</h3>
                        <button class="modal-close" onclick="Keys.closeNewKeyModal()">✕</button>
                    </div>
                    <div class="modal-body">
                        <div style="text-align: center; padding: 20px;">
                            <div style="font-size: 48px; margin-bottom: 20px;">🔑</div>
                            <h4 style="margin-bottom: 10px; color: var(--success);">Your New Key:</h4>
                            <code id="newKeyDisplay" style="display: block; padding: 15px; background: rgba(139, 92, 246, 0.1); border-radius: 8px; font-size: 18px; font-weight: bold; margin-bottom: 30px; border: 1px solid var(--primary);"></code>
                            
                            <h4 style="margin-bottom: 10px;">Usage Instructions:</h4>
                            <p style="color: var(--text-muted); margin-bottom: 20px;">User must paste this code in their executor:</p>
                            <pre id="newKeyCode" style="padding: 15px; background: #1a1a2e; border-radius: 8px; overflow-x: auto; text-align: left; font-family: monospace; font-size: 14px; border: 1px solid var(--border);"></pre>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="Keys.closeNewKeyModal()">Close</button>
                        <button class="btn btn-primary" onclick="Keys.copyKeyCode()">
                            📋 Copy Code
                        </button>
                    </div>
                </div>
            </div>
            
            <!-- Key Code Display Modal -->
            <div class="modal-overlay" id="keyCodeModal">
                <div class="modal">
                    <div class="modal-header">
                        <h3 class="modal-title">📋 Executor Code</h3>
                        <button class="modal-close" onclick="Keys.closeKeyCodeModal()">✕</button>
                    </div>
                    <div class="modal-body">
                        <p style="margin-bottom: 15px; color: var(--text-muted);">Copy and give this code to the user:</p>
                        <pre id="keyCodeDisplay" style="padding: 15px; background: #1a1a2e; border-radius: 8px; overflow-x: auto; text-align: left; font-family: monospace; font-size: 14px; border: 1px solid var(--border);"></pre>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="Keys.closeKeyCodeModal()">Close</button>
                        <button class="btn btn-primary" onclick="Keys.copyKeyCode()">
                            📋 Copy Code
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
};