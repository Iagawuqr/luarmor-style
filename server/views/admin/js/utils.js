const Utils={
toast(msg,type='info'){
console.log('[Toast]',type,msg);
const container=document.getElementById('toastContainer');
if(!container)return;
const toast=document.createElement('div');
toast.className='toast toast-'+type;
toast.innerHTML=`<div style="display:flex;align-items:center;gap:10px"><span>${type==='success'?'✅':type==='error'?'❌':type==='warning'?'⚠️':'ℹ️'}</span><span>${msg}</span></div>`;
container.appendChild(toast);
setTimeout(()=>toast.classList.add('show'),10);
setTimeout(()=>{toast.classList.remove('show');setTimeout(()=>toast.remove(),300)},4000);
},

formatDate(dateStr){
if(!dateStr)return'N/A';
try{
const d=new Date(dateStr);
const now=new Date();
const diff=now-d;
if(diff<60000)return'Just now';
if(diff<3600000)return Math.floor(diff/60000)+'m ago';
if(diff<86400000)return Math.floor(diff/3600000)+'h ago';
return d.toLocaleDateString();
}catch{return'N/A'}
},

formatTime(dateStr){
if(!dateStr)return'N/A';
try{return new Date(dateStr).toLocaleTimeString()}catch{return'N/A'}
},

formatNumber(num){
if(num===null||num===undefined)return'0';
if(num>=1000000)return(num/1000000).toFixed(1)+'M';
if(num>=1000)return(num/1000).toFixed(1)+'K';
return String(num);
},

truncate(str,len=20){
if(!str)return'';
if(str.length<=len)return str;
return str.substring(0,len)+'...';
},

escapeHtml(str){
if(!str)return'';
const div=document.createElement('div');
div.textContent=str;
return div.innerHTML;
},

debounce(fn,wait=300){
let timeout;
return function(...args){
clearTimeout(timeout);
timeout=setTimeout(()=>fn.apply(this,args),wait);
};
},

async confirm(msg,title='Confirm'){
return window.confirm(title+'\n\n'+msg);
},

setLoading(el,loading){
if(!el)return;
if(loading){el.disabled=true;el.dataset.oldText=el.textContent;el.textContent='Loading...';}
else{el.disabled=false;if(el.dataset.oldText)el.textContent=el.dataset.oldText;}
}
};
