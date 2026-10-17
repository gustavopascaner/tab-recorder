const $ = id => document.getElementById(id);
const labels = { idle: 'Listo', recording: '● Grabando…', paused: '⏸ En pausa' };

function render(s) {
  s = s || 'idle';
  $('st').textContent = labels[s];
  $('rec').disabled = s !== 'idle';
  $('pause').disabled = s === 'idle';
  $('pause').textContent = s === 'paused' ? '▶ Resume' : '⏸ Pause';
  $('stop').disabled = s === 'idle';
}

chrome.storage.session.get('state').then(r => render(r.state));
chrome.storage.onChanged.addListener((c, area) => {
  if (area === 'session' && c.state) render(c.state.newValue);
});

$('rec').onclick = async () => {
  const perm = await navigator.permissions.query({ name: 'microphone' });
  if (perm.state !== 'granted') {
    chrome.tabs.create({ url: chrome.runtime.getURL('permission.html') });
    return;
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
  chrome.runtime.sendMessage({ target: 'background', type: 'start', streamId });
};
$('pause').onclick = () => chrome.runtime.sendMessage({ target: 'offscreen', type: 'togglePause' });
$('stop').onclick = () => chrome.runtime.sendMessage({ target: 'offscreen', type: 'stop' });
