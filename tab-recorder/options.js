const $ = id => document.getElementById(id);
const fmt = t => new Date(t).toLocaleString('es-AR', { weekday: 'short', hour: '2-digit', minute: '2-digit' });

async function render() {
  const s = await chrome.storage.local.get({ events: [], status: null });
  if (!s.status) return;
  $('msg').textContent = s.status.error
    ? 'Error: ' + s.status.error
    : `Conectado (revisado ${fmt(s.status.at)}). Próximas llamadas con Meet en 24 h: ${s.events.length}`;
  $('next').innerHTML = '';
  for (const e of s.events) {
    const div = document.createElement('div');
    div.textContent = `${fmt(e.start)} · ${e.title}`;
    $('next').append(div);
  }
}

chrome.storage.local.get({ leadMin: 5 }).then(s => { $('lead').value = s.leadMin; });
$('lead').onchange = () => chrome.storage.local.set({ leadMin: Math.max(1, Math.min(30, +$('lead').value || 5)) });
chrome.storage.onChanged.addListener((c, area) => area === 'local' && c.status && render());
render();

$('connect').onclick = async () => {
  try {
    await connect();
    $('msg').textContent = 'Conectado, revisando…';
  } catch (e) {
    $('msg').textContent = 'No se pudo conectar: ' + (e.message || e);
  }
};
$('test').onclick = () => chrome.runtime.sendMessage({ target: 'background', type: 'test-alert' });
