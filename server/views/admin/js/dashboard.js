const Dashboard={
stats:{sessions:0,success:0,challenges:0,bans:0},
refreshInterval:null,

async init(){
console.log('[Dashboard] Init');
await this.loadStats();
this.startAutoRefresh();
},

async loadStats(){
console.log('[Dashboard] Loading stats...');
try{
const result=await API.get('/api/admin/stats');
console.log('[Dashboard] Stats result:',result);
if(result.success){
this.stats={
sessions:result.sessions||0,
success:result.stats?.success||0,
challenges:result.stats?.challenges||0,
bans:result.stats?.bans||0
};
this.renderStats();
}else{
console.error('[Dashboard] Stats failed:',result.error);
}
}catch(err){
console.error('[Dashboard] Stats error:',err);
}
},

renderStats(){
console.log('[Dashboard] Rendering stats:',this.stats);
const els={
sessions:document.getElementById('statSessions'),
success:document.getElementById('statSuccess'),
challenges:document.getElementById('statChallenges'),
bans:document.getElementById('statBans')
};
if(els.sessions)els.sessions.textContent=Utils.formatNumber(this.stats.sessions);
if(els.success)els.success.textContent=Utils.formatNumber(this.stats.success);
if(els.challenges)els.challenges.textContent=Utils.formatNumber(this.stats.challenges);
if(els.bans)els.bans.textContent=Utils.formatNumber(this.stats.bans);
},

startAutoRefresh(){
this.stopAutoRefresh();
this.refreshInterval=setInterval(()=>this.loadStats(),30000);
},

stopAutoRefresh(){
if(this.refreshInterval){
clearInterval(this.refreshInterval);
this.refreshInterval=null;
}
},

async refresh(){
const btn=document.getElementById('refreshStatsBtn');
if(btn){btn.disabled=true;btn.textContent='⏳';}
await this.loadStats();
await this.loadRecentActivity();
if(btn){btn.disabled=false;btn.textContent='↻';}
Utils.toast('Refreshed','success');
},

async loadRecentActivity(){
console.log('[Dashboard] Loading recent activity...');
const container=document.getElementById('recentActivity');
if(!container)return;

try{
const result=await API.get('/api/admin/logs',{limit:5});
console.log('[Dashboard] Logs result:',result);

if(result.success&&result.logs&&result.logs.length>0){
container.innerHTML=result.logs.map(log=>`
<div style="display:flex;align-items:center;gap:12px;padding:12px;border-bottom:1px solid rgba(255,255,255,0.1)">
<div style="width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:${log.success?'rgba(34,197,94,0.2)':'rgba(239,68,68,0.2)'}">
${log.success?'✅':'❌'}
</div>
<div style="flex:1;min-width:0">
<div style="font-size:14px;color:#fff">${Utils.escapeHtml(log.action||'Unknown')}</div>
<div style="font-size:12px;color:#888">${Utils.escapeHtml(log.ip||'N/A')} • ${Utils.formatDate(log.ts)}</div>
</div>
<span style="padding:4px 8px;border-radius:12px;font-size:11px;background:${log.client==='executor'?'rgba(34,197,94,0.2)':'rgba(245,158,11,0.2)'};color:${log.client==='executor'?'#22c55e':'#f59e0b'}">
${Utils.escapeHtml(log.client||'unknown')}
</span>
</div>
`).join('');
}else{
container.innerHTML=`<div style="text-align:center;padding:40px;color:#888"><div style="font-size:40px;margin-bottom:10px">📭</div><div>No recent activity</div></div>`;
}
}catch(err){
console.error('[Dashboard] Activity error:',err);
container.innerHTML=`<div style="text-align:center;padding:40px;color:#ef4444">Error loading activity</div>`;
}
},

copyLoader(){
const url=window.location.origin;
const script=`loadstring(game:HttpGet("${url}/loader"))()`;
navigator.clipboard.writeText(script).then(()=>{
Utils.toast('Loader copied!','success');
}).catch(()=>{
prompt('Copy this:',script);
});
},

async clearCache(){
if(!confirm('Clear script cache?'))return;
const r=await API.post('/api/admin/cache/clear');
if(r.success)Utils.toast('Cache cleared','success');
else Utils.toast(r.error||'Failed','error');
},

async clearSessions(){
if(!confirm('Clear all sessions?'))return;
const r=await API.post('/api/admin/sessions/clear');
if(r.success)Utils.toast('Cleared '+r.cleared+' sessions','success');
else Utils.toast(r.error||'Failed','error');
await this.loadStats();
},

render(){
return`
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
<div>
<h1 style="font-size:28px;margin:0">Dashboard</h1>
<p style="color:#888;margin:4px 0 0 0">Overview of your protection system</p>
</div>
<button class="btn btn-secondary" id="refreshStatsBtn" onclick="Dashboard.refresh()">↻ Refresh</button>
</div>

<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px;margin-bottom:24px">
<div class="card" style="padding:24px">
<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:12px">
<div style="width:48px;height:48px;border-radius:12px;background:rgba(59,130,246,0.2);display:flex;align-items:center;justify-content:center;font-size:24px">👥</div>
</div>
<div style="font-size:32px;font-weight:700;color:#fff" id="statSessions">0</div>
<div style="font-size:14px;color:#888">Active Sessions</div>
</div>

<div class="card" style="padding:24px">
<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:12px">
<div style="width:48px;height:48px;border-radius:12px;background:rgba(34,197,94,0.2);display:flex;align-items:center;justify-content:center;font-size:24px">✅</div>
</div>
<div style="font-size:32px;font-weight:700;color:#fff" id="statSuccess">0</div>
<div style="font-size:14px;color:#888">Successful Loads</div>
</div>

<div class="card" style="padding:24px">
<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:12px">
<div style="width:48px;height:48px;border-radius:12px;background:rgba(245,158,11,0.2);display:flex;align-items:center;justify-content:center;font-size:24px">🔐</div>
</div>
<div style="font-size:32px;font-weight:700;color:#fff" id="statChallenges">0</div>
<div style="font-size:14px;color:#888">Challenges</div>
</div>

<div class="card" style="padding:24px">
<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:12px">
<div style="width:48px;height:48px;border-radius:12px;background:rgba(239,68,68,0.2);display:flex;align-items:center;justify-content:center;font-size:24px">🚫</div>
</div>
<div style="font-size:32px;font-weight:700;color:#fff" id="statBans">0</div>
<div style="font-size:14px;color:#888">Total Bans</div>
</div>
</div>

<div style="display:grid;grid-template-columns:2fr 1fr;gap:20px">
<div class="card">
<div style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.1);display:flex;justify-content:space-between;align-items:center">
<h3 style="margin:0;font-size:16px">📋 Recent Activity</h3>
<a href="#" onclick="App.navigate('logs');return false" style="color:#8b5cf6;font-size:14px">View All →</a>
</div>
<div id="recentActivity" style="min-height:200px;display:flex;align-items:center;justify-content:center">
<div class="spinner"></div>
</div>
</div>

<div class="card">
<div style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.1)">
<h3 style="margin:0;font-size:16px">⚡ Quick Actions</h3>
</div>
<div style="padding:16px;display:flex;flex-direction:column;gap:10px">
<button class="btn btn-secondary" style="width:100%;justify-content:flex-start" onclick="App.navigate('bans')">🚫 Manage Bans</button>
<button class="btn btn-secondary" style="width:100%;justify-content:flex-start" onclick="App.navigate('sessions')">👥 View Sessions</button>
<button class="btn btn-secondary" style="width:100%;justify-content:flex-start" onclick="Dashboard.clearCache()">🗑️ Clear Cache</button>
<button class="btn btn-secondary" style="width:100%;justify-content:flex-start" onclick="Dashboard.copyLoader()">📋 Copy Loader</button>
</div>
</div>
</div>
`;
}
};
