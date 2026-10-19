const p = new URLSearchParams(location.search);
const url = p.get('url'), start = Number(p.get('start'));
document.getElementById('t').textContent = p.get('title');
function when() {
  const m = Math.round((start - Date.now()) / 60000);
  document.getElementById('when').textContent = m > 0 ? `Empieza en ${m} min` : m === 0 ? 'Empieza ahora' : `Empezó hace ${-m} min`;
}
when(); setInterval(when, 15000);
document.getElementById('join').onclick = async () => {
  if (new URL(url).hostname === 'meet.google.com') await chrome.tabs.create({ url });
  window.close();
};
document.getElementById('close').onclick = () => window.close();
