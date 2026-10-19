importScripts('auth.js', 'calendar-alert.js');

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
const MAX_REC_MS = 2 * 3600e3;
const MEET_CODE = /[a-z]{3}-[a-z]{4}-[a-z]{3}/;
const pad = n => String(n).padStart(2, '0');
const safe = s => s.replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').replace(/^[.\s]+|[.\s]+$/g, '').slice(0, 80);

// Nombre de los archivos: título del evento de Calendar (por el código de Meet de la pestaña) + fecha y hora de inicio
async function recordingName(url) {
  const code = MEET_CODE.exec(url || '')?.[0];
  const { events = [] } = await chrome.storage.local.get('events');
  const now = Date.now();
  const ev = events.filter(e => code && e.url.includes(code)).sort((a, b) => Math.abs(a.start - now) - Math.abs(b.start - now))[0];
  const d = new Date();
  const when = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}`;
  return `${(ev && safe(ev.title)) || 'rec'} ${when}`;
}

// Arranca la grabación de una pestaña y deja anotado qué se graba (para nombrar, y para cortar sola)
async function beginRecording(streamId, tab) {
  await chrome.storage.session.set({
    recTab: tab.id, recMeet: /^https:\/\/meet\.google\.com\//.test(tab.url || ''),
    recMeetPath: new URL(tab.url || 'about:blank').pathname, recName: await recordingName(tab.url)
  });
  chrome.alarms.create('rec-limit', { when: Date.now() + MAX_REC_MS });
  await sendToOffscreen({ type: 'start', streamId });
}

const stopRecording = () => chrome.runtime.sendMessage({ target: 'offscreen', type: 'stop' }).catch(() => {});
async function stopIfRecordingTab(tabId, urlPath) {
  // El estado sale del storage: el service worker puede haberse reiniciado durante una grabación larga
  const { state, recTab, recMeet, recMeetPath } = await chrome.storage.session.get(['state', 'recTab', 'recMeet', 'recMeetPath']);
  if (!state || state === 'idle' || tabId !== recTab) return;
  // Una pestaña de Meet que sale de la sala (o se cierra) termina la grabación; otras pestañas solo si se cierran
  if (urlPath === undefined || (recMeet && urlPath !== recMeetPath)) stopRecording();
}
chrome.tabs.onRemoved.addListener(tabId => stopIfRecordingTab(tabId));
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.url) stopIfRecordingTab(tabId, new URL(info.url).pathname);
});
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'rec-limit') stopRecording(); });

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
      .then(streamId => beginRecording(streamId, sender.tab).catch(fail),
        e => { fail(e); chrome.action.openPopup().catch(() => {}); });
    return;
  }
  if (msg.type === 'start') {
    beginRecording(msg.streamId, { id: msg.tabId, url: msg.url }).catch(fail);
  } else if (msg.type === 'meet-left') {
    stopIfRecordingTab(sender.tab.id, '/');
  } else if (msg.type === 'error') {
    fail(msg.error);
  } else if (msg.type === 'state') {
    chrome.storage.session.set({ state: msg.state, error: null });
    curState = msg.state;
    if (msg.state === 'idle') chrome.alarms.clear('rec-limit');
    drawIcon(msg.state, true);
  } else if (msg.type === 'blink') {
    if (curState === 'recording') drawIcon('recording', msg.on);
  } else if (msg.type === 'save') {
    chrome.storage.session.get('recName').then(({ recName }) => {
      const name = recName || `rec ${new Date().toISOString().replace(/[:.]/g, '-')}`;
      // El audio de voces (mic/pestaña separados) se baja primero: el .webm del video dispara la transcripción
      const jobs = [[msg.vozUrl, `TabRecordings/${name}-voces.webm`], [msg.url, `TabRecordings/${name}.webm`]];
      for (const [url, filename] of jobs) {
        chrome.downloads.download({ url, filename, saveAs: false }, id => pending.add(id));
      }
    });
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
