const $ = id => document.getElementById(id);
const send = msg => new Promise(resolve => chrome.runtime.sendMessage(msg, r => {
  if (chrome.runtime.lastError) resolve({ok:false,error:chrome.runtime.lastError.message});
  else resolve(r || {ok:false,error:"No response from background worker."});
}));
function show(s){$("status").textContent=s;}
async function refresh(){
  const d=await send({type:"GET_DATA"});
  if(d.error && !d.activityLog){show(d.error);return;}
  $("interval").value=String(d.intervalHours); $("enabled").checked=d.enabled; $("autoClickSave").checked=d.autoClickSave;
  $("log").replaceChildren();
  (d.activityLog||[]).forEach(e=>{const li=document.createElement("li");li.textContent=`${e.at}: ${e.message}`;$("log").appendChild(li);});
}
$("run").addEventListener("click",async()=>{
  show("Opening Naukri profile…");
  const r=await send({type:"RUN_NOW"});
  show(r.ok?`Profile tab opened (ID ${r.tabId}).`:`Failed: ${r.error}`);
  await refresh();
});
$("save").addEventListener("click",async()=>{
  const r=await send({type:"SAVE_SETTINGS",intervalHours:Number($("interval").value),enabled:$("enabled").checked,autoClickSave:$("autoClickSave").checked});
  show(r.ok?"Settings saved.":`Failed: ${r.error}`);await refresh();
});
(async()=>{const p=await send({type:"PING"});show(p.ok?"Connected to background service worker.":`Connection failed: ${p.error}`);await refresh();})();
