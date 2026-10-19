// Recordatorio para grabar al entrar a una videollamada de Google Meet.
const MEET_CODE = /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}(\/|$)/;
let host = null, dismissedFor = null, recording = false;

function show() {
  if (host || recording || dismissedFor === location.pathname) return;
  host = document.createElement('div');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      .box{position:fixed;top:16px;right:16px;z-index:2147483647;width:290px;padding:14px 16px;
        background:#202124;color:#fff;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.45);
        font:14px/1.4 system-ui,sans-serif;border-left:5px solid #e51c23}
      b{display:block;margin-bottom:10px;font-size:15px}
      .dot{display:inline-block;width:10px;height:10px;border-radius:50%;background:#e51c23;margin-right:6px}
      .row{display:flex;gap:8px}
      button{flex:1;padding:8px 0;border-radius:8px;border:0;font:600 14px system-ui,sans-serif;cursor:pointer}
      #yes{background:#e51c23;color:#fff} #no{background:#3c4043;color:#e8eaed}
    </style>
    <div class="box">
      <b><span class="dot"></span>¿Grabar esta llamada?</b>
      <div class="row"><button id="yes">● Grabar</button><button id="no">No grabar</button></div>
    </div>`;
  root.getElementById('yes').onclick = () => { dismissedFor = location.pathname; hide(); chrome.runtime.sendMessage({ target: 'background', type: 'meet-start' }); };
  root.getElementById('no').onclick = () => { dismissedFor = location.pathname; hide(); };
  document.documentElement.appendChild(host);
}
function hide() { host?.remove(); host = null; }

// Si grabando se sale de la llamada (o termina), avisar al fondo para que corte la grabación
const LEAVE = /salir de la llamada|leave call|abandonar|sair da chamada|quitter l.appel/i;
const inCall = () => [...document.querySelectorAll('button[aria-label]')].some(b => LEAVE.test(b.getAttribute('aria-label')));
let sawCall = false, missing = 0;
function watchCall() {
  if (!recording) { sawCall = false; missing = 0; return; }
  if (inCall()) { sawCall = true; missing = 0; }
  else if (sawCall && ++missing >= 4) { // ~8 s sin el botón de colgar: la llamada terminó
    sawCall = false; missing = 0;
    chrome.runtime.sendMessage({ target: 'background', type: 'meet-left' });
  }
}

function check() {
  watchCall();
  if (MEET_CODE.test(location.pathname)) show(); else { hide(); dismissedFor = null; }
}

const apply = s => { recording = s === 'recording' || s === 'paused'; if (recording) hide(); else check(); };
try {
  chrome.storage.session.get('state').then(r => apply(r.state));
  chrome.storage.onChanged.addListener((c, area) => area === 'session' && c.state && apply(c.state.newValue));
} catch (e) {}
setInterval(check, 2000); // Meet es una SPA: la URL cambia sin recargar
check();
