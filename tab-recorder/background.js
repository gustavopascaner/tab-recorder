importScripts('calendar-alert.js');

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Grabar la pestaña con MediaRecorder'
  });
}

// Manda un mensaje al offscreen; justo después de crearlo puede no estar escuchando todavía, así que reintenta
async function sendToOffscreen(msg) {
  await ensureOffscreen();
  for (let i = 0; i < 20; i++) {
    try { await chrome.runtime.sendMessage({ target: 'offscreen', ...msg }); return; }
    catch (e) { await new Promise(r => setTimeout(r, 150)); }
  }
  throw new Error('El grabador no responde');
}
const fail = e => chrome.storage.session.set({ error: String(e?.message || e) });

// Que el content script de Meet pueda leer el estado de grabación
chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });
const pending = new Set();
let curState = 'idle';

// Ícono dinámico: círculo rojo titilando al grabar, barras de pausa en gris, ícono REC en reposo
function drawIcon(state, on) {
  if (state === 'idle') {
    chrome.action.setIcon({ path: { 16: 'icons/icon16.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' } });
    return;
  }
  const imageData = {};
  for (const n of [16, 32]) {
    const c = new OffscreenCanvas(n, n), g = c.getContext('2d');
    if (state === 'recording') {
      g.fillStyle = on ? '#e51c23' : '#5a1013';
      g.beginPath(); g.arc(n / 2, n / 2, n * 0.42, 0, 7); g.fill();
    } else {
      g.fillStyle = '#8a8a8a';
      g.beginPath(); g.arc(n / 2, n / 2, n * 0.46, 0, 7); g.fill();
      g.fillStyle = '#fff';
      g.fillRect(n * 0.3, n * 0.27, n * 0.14, n * 0.46);
      g.fillRect(n * 0.56, n * 0.27, n * 0.14, n * 0.46);
    }
    imageData[n] = g.getImageData(0, 0, n, n);
  }
  chrome.action.setIcon({ imageData });
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.target !== 'background') return;
  if (msg.type === 'test-alert') {
    self.calendarAlert.showAlert({ title: 'Llamada de prueba', url: 'https://meet.google.com/', start: Date.now() + 120000 });
    return;
  }
  if (msg.type === 'meet-start') {
    if (curState !== 'idle') return;
    // Chrome suele exigir un clic en el ícono para capturar; si no deja, abrimos el popup para que toques Rec
    chrome.tabCapture.getMediaStreamId({ targetTabId: sender.tab.id })
      .then(streamId => sendToOffscreen({ type: 'start', streamId }).catch(fail),
        e => { fail(e); chrome.action.openPopup().catch(() => {}); });
    return;
  }
  if (msg.type === 'start') {
    sendToOffscreen({ type: 'start', streamId: msg.streamId }).catch(fail);
  } else if (msg.type === 'error') {
    fail(msg.error);
  } else if (msg.type === 'state') {
    chrome.storage.session.set({ state: msg.state, error: null });
    curState = msg.state;
    drawIcon(msg.state, true);
  } else if (msg.type === 'blink') {
    if (curState === 'recording') drawIcon('recording', msg.on);
  } else if (msg.type === 'save') {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    // El audio de voces (mic/pestaña separados) se baja primero: el .webm del video dispara la transcripción
    const jobs = [[msg.vozUrl, `TabRecordings/rec-${ts}-voces.webm`], [msg.url, `TabRecordings/rec-${ts}.webm`]];
    for (const [url, filename] of jobs) {
      chrome.downloads.download({ url, filename, saveAs: false }, id => pending.add(id));
    }
  }
});

// Cuando terminan de guardarse los dos archivos, limpiar el temporal y cerrar el offscreen.
chrome.downloads.onChanged.addListener(d => {
  if (!pending.has(d.id) || !d.state) return;
  if (d.state.current === 'complete' || d.state.current === 'interrupted') {
    pending.delete(d.id);
    if (pending.size) return;
    chrome.runtime.sendMessage({ target: 'offscreen', type: 'cleanup' }).catch(() => {});
    setTimeout(() => chrome.offscreen.closeDocument().catch(() => {}), 1000);
  }
});
