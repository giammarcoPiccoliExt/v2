const startBtn = document.getElementById('start');
const stopBtn = document.getElementById('stop');
const openBtn = document.getElementById('open');
const status = document.getElementById('status');
const logsEl = document.getElementById('logs');
const led = document.getElementById('led');

startBtn.addEventListener('click', async () => {
  status.textContent = 'Avvio in corso...';
  const r = await window.api.startServer();
  status.textContent = r.ok ? 'Server avviato' : 'Errore: ' + (r.msg||JSON.stringify(r));
});

stopBtn.addEventListener('click', async () => {
  status.textContent = 'Chiusura in corso...';
  const r = await window.api.stopServer();
  status.textContent = r.ok ? 'Server fermato' : 'Errore: ' + (r.msg||JSON.stringify(r));
});

openBtn.addEventListener('click', async () => {
  await window.api.openBrowser();
});

createBtn.addEventListener('click', async () => {
  // create shortcut removed from UI
});

// append logs
function appendLog(line){
  const now = new Date().toISOString();
  logsEl.value = logsEl.value + [`[${now}]`, line].join(' ') + '\n';
  logsEl.scrollTop = logsEl.scrollHeight;
}

window.api.onLog((msg)=>{ appendLog(msg); });
window.api.onStatus((obj)=>{
  // example obj: { type: 'duc', ok: true }
  if(obj && obj.type === 'duc'){
    if(obj.ok) { led.style.background = '#2ecc71'; led.style.borderColor='#179b39'; }
    else { led.style.background = '#c44'; led.style.borderColor='#900'; }
  }
  if(obj && obj.type === 'server'){
    appendLog('server: ' + (obj.msg|| (obj.ok? 'ok':'fail')));
  }
});
