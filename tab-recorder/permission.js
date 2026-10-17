navigator.mediaDevices.getUserMedia({ audio: true })
  .then(s => { s.getTracks().forEach(t => t.stop()); document.getElementById('m').textContent = '✅ Listo. Cerrá esta pestaña y volvé a tocar Rec.'; })
  .catch(() => { document.getElementById('m').textContent = '❌ Permiso denegado. Habilitalo en chrome://settings/content/microphone y reintentá.'; });
