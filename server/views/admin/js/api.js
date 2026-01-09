const API={
TIMEOUT:15000,
getKey(){return localStorage.getItem('luarmor_admin_key')||''},
setKey(key){localStorage.setItem('luarmor_admin_key',key)},
clearKey(){localStorage.removeItem('luarmor_admin_key')},

async request(endpoint,options={}){
const url=window.location.origin+endpoint;
const key=this.getKey();
console.log('[API] Request:',options.method||'GET',endpoint);

const controller=new AbortController();
const timeoutId=setTimeout(()=>controller.abort(),this.TIMEOUT);

try{
const res=await fetch(url,{
...options,
signal:controller.signal,
headers:{
'Content-Type':'application/json',
'x-admin-key':key,
...(options.headers||{})
}
});
clearTimeout(timeoutId);
console.log('[API] Status:',res.status);

let data;
const ct=res.headers.get('content-type')||'';
if(ct.includes('application/json')){
data=await res.json();
}else{
const text=await res.text();
console.log('[API] Non-JSON response:',text.substring(0,100));
data={success:false,error:'Server returned non-JSON response'};
}
console.log('[API] Response:',data);

if(res.status===403){
return{success:false,error:data.error||'Unauthorized',code:'AUTH_FAILED'};
}
if(!res.ok){
return{success:false,error:data.error||'Request failed',code:'HTTP_ERROR'};
}
return data;
}catch(err){
clearTimeout(timeoutId);
console.error('[API] Error:',err);
if(err.name==='AbortError'){
return{success:false,error:'Request timeout',code:'TIMEOUT'};
}
return{success:false,error:'Network error: '+err.message,code:'NETWORK'};
}
},

get(endpoint,params={}){
const query=new URLSearchParams(params).toString();
const url=query?`${endpoint}?${query}`:endpoint;
return this.request(url,{method:'GET'});
},

post(endpoint,body={}){
return this.request(endpoint,{method:'POST',body:JSON.stringify(body)});
},

delete(endpoint,body=null){
return this.request(endpoint,{method:'DELETE',body:body?JSON.stringify(body):null});
}
};
