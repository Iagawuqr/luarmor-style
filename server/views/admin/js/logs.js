/* ============================================
   LOGS - Activity Logs Viewer
   ============================================ */

const Logs = {
    logs: [],
    limit: 50,
    autoRefresh: false,
    refreshInterval: null,
    
    // Initialize
    async init() {
        await this.loadLogs();
        this.bindEvents();
    },
    
    // Load logs from API
    async loadLogs() {
        const result = await API.getLogs(this.limit);
        
        if (result.success) {
            this.logs = (result.logs || []).reverse();
            this.renderTable();
        } else {
            Utils.toast('Failed to load logs', 'error');
        }
    },
    
    // Render logs table
    renderTable() {
        const tbody = document.getElementById('logsTableBody');
        if (!tbody) return;
        
        if (this.logs.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center" style="padding: 40px;">
                        <div class="empty-state">
                            <div class="empty-state-icon">📭</div>
                            <h4 class="empty-state-title">No logs yet</h4>
                            <p class="empty-state-text">Activity will appear here when users interact with your script</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }
        
        tbody.innerHTML = this.logs.map(log => `
            <tr class="animate-fadeIn">
                <td class="text-muted font-mono text-sm">${Utils.formatTime(log.ts)}</td>
                <td>
                    <span class="table-cell-primary">${Utils.escapeHtml(log.action || 'Unknown')}</span>
                </td>
                <td>
                    <span class="badge ${this.getClientBadgeClass(log.client)}">
                        ${Utils.escapeHtml(log.client || 'unknown')}
                    </span>
                </td>
                <td>
                    <code class="text-sm">${Utils.escapeHtml(Utils.truncate(log.ip || 'N/A', 15))}</code>
                </td>
                <td>
                    ${log.hwid ? `<code class="text-sm text-muted">${Utils.truncate(log.hwid, 12)}</code>` : '<span class="text-muted">-</span>'}
                </td>
                <td>
                    <span class="badge ${log.success ? 'badge-success' : 'badge-danger'}">
                        ${log.success ? '✓ OK' : '✕ FAIL'}
                    </span>
                </td>
            </tr>
        `).join('');
    },
    
    // Get badge class based on client type
    getClientBadgeClass(client) {
        switch (client) {
            case 'executor': return 'badge-success';
            case 'browser': return 'badge-warning';
            case 'bot': return 'badge-danger';
            case 'blocked_executor': return 'badge-danger';
            default: return 'badge-info';
        }
    },
    
    // Bind events
    bindEvents() {
        const limitSelect = document.getElementById('logLimit');
        if (limitSelect) {
            limitSelect.addEventListener('change', (e) => {
                this.limit = parseInt(e.target.value);
                this.loadLogs();
            });
        }
        
        const autoRefreshToggle = document.getElementById('autoRefreshToggle');
        if (autoRefreshToggle) {
            autoRefreshToggle.addEventListener('change', (e) => {
                this.toggleAutoRefresh(e.target.checked);
            });
        }
    },
    
    // Toggle auto refresh
    toggleAutoRefresh(enabled) {
        this.autoRefresh = enabled;
        
        if (enabled) {
            this.refreshInterval = setInterval(() => {
                this.loadLogs();
            }, CONFIG.INTERVALS.LOGS);
            Utils.toast('Auto-refresh enabled', 'info');
        } else {
            if (this.refreshInterval) {
                clearInterval(this.refreshInterval);
                this.refreshInterval = null;
            }
            Utils.toast('Auto-refresh disabled', 'info');
        }
    },
    
    // Manual refresh
    async refresh() {
        const btn = document.querySelector('.refresh-logs-btn');
        if (btn) btn.classList.add('animate-spin');
        
        await this.loadLogs();
        
        if (btn) {
            setTimeout(() => btn.classList.remove('animate-spin'), 500);
        }
        
        Utils.toast('Logs refreshed', 'success');
    },
    
    // Cleanup on page leave
    destroy() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    },
    
    // Render page
    render() {
        return `
            <div class="page-header">
                <div>
                    <h1 class="page-title">Activity Logs</h1>
                    <p class="page-subtitle">Monitor all script activity and requests</p>
                </div>
            </div>
            
            <div class="card animate-fadeInUp">
                <div class="card-header">
                    <div class="actions-left">
                        <select id="logLimit" class="form-input form-select" style="width: 150px;">
                            <option value="20">Last 20</option>
                            <option value="50" selected>Last 50</option>
                            <option value="100">Last 100</option>
                            <option value="200">Last 200</option>
                        </select>
                        
                        <label class="toggle-label">
                            <input type="checkbox" id="autoRefreshToggle" class="toggle-input">
                            <span class="toggle-switch"></span>
                            <span class="text-sm text-secondary">Auto-refresh</span>
                        </label>
                    </div>
                    <div class="actions-right">
                        <button class="btn btn-secondary refresh-logs-btn" onclick="Logs.refresh()">
                            ↻ Refresh
                        </button>
                    </div>
                </div>
                <div class="table-container">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Time</th>
                                <th>Action</th>
                                <th>Client</th>
                                <th>IP</th>
                                <th>HWID</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody id="logsTableBody">
                            <tr>
                                <td colspan="6" class="text-center" style="padding: 40px;">
                                    <div class="spinner"></div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },
};
