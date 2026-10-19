// Avisa con una ventana emergente cuando está por empezar un evento de Google Calendar con link de Meet.
// Lee la API de Google Calendar, la consulta cada 5 min y programa una alarma por evento.
const DEFAULTS = { leadMin: 5 };
let chain = Promise.resolve();
const serial = fn => (chain = chain.then(fn).catch(() => {}));

async function token(interactive = false) {
  const r = await chrome.identity.getAuthToken({ interactive });
  return typeof r === 'string' ? r : r?.token;
}

async function fetchEvents(retry = true) {
  const t = await token(false);
  if (!t) throw new Error('Falta conectar Google Calendar');
  const now = Date.now();
  const q = new URLSearchParams({
    timeMin: new Date(now - 10 * 60e3).toISOString(), timeMax: new Date(now + 24 * 3600e3).toISOString(),
    singleEvents: 'true', orderBy: 'startTime', maxResults: '50',
    fields: 'items(id,summary,status,start,hangoutLink,conferenceData/entryPoints,attendees(self,responseStatus))'
  });
  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?' + q, { headers: { Authorization: 'Bearer ' + t } });
  if (res.status === 401 && retry) { await chrome.identity.removeCachedAuthToken({ token: t }); return fetchEvents(false); }
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const { items = [] } = await res.json();
  return items.flatMap(e => {
    const url = e.hangoutLink || e.conferenceData?.entryPoints?.find(p => p.entryPointType === 'video')?.uri;
    const declined = e.attendees?.some(a => a.self && a.responseStatus === 'declined');
    if (!url || !e.start?.dateTime || e.status === 'cancelled' || declined) return [];
    return [{ id: e.id + '@' + e.start.dateTime, title: e.summary || '(sin título)', url, start: Date.parse(e.start.dateTime) }];
  });
}

async function refresh() {
  try {
    const events = await fetchEvents();
    await chrome.storage.local.set({ events, status: { at: Date.now(), error: null } });
    await schedule(events);
  } catch (e) {
    await chrome.storage.local.set({ status: { at: Date.now(), error: String(e.message || e) } });
  }
  await check();
}

async function schedule(events) {
  const { leadMin } = await chrome.storage.local.get(DEFAULTS);
  const now = Date.now(), want = new Map();
  for (const ev of events) {
    const when = ev.start - leadMin * 60e3;
    if (when > now + 1000) want.set('ev:' + ev.id, when);
  }
  for (const a of await chrome.alarms.getAll()) {
    if (a.name.startsWith('ev:') && !want.has(a.name)) chrome.alarms.clear(a.name);
  }
  for (const [name, when] of want) chrome.alarms.create(name, { when });
}

async function check() {
  const st = await chrome.storage.local.get({ events: [], notified: [], ...DEFAULTS });
  const now = Date.now(), notified = new Set(st.notified);
  for (const ev of st.events) {
    const inWindow = ev.start - now <= st.leadMin * 60e3 && ev.start - now > -10 * 60e3;
    if (inWindow && !notified.has(ev.id)) { notified.add(ev.id); await showAlert(ev); }
  }
  const live = new Set(st.events.map(e => e.id));
  await chrome.storage.local.set({ notified: [...notified].filter(id => live.has(id)) });
}

async function showAlert(ev) {
  const q = new URLSearchParams({ title: ev.title, url: ev.url, start: String(ev.start) });
  await chrome.windows.create({ url: 'alert.html?' + q, type: 'popup', width: 400, height: 230, focused: true });
}

chrome.alarms.get('cal-refresh').then(a => a || chrome.alarms.create('cal-refresh', { periodInMinutes: 5 }));
chrome.alarms.onAlarm.addListener(a => {
  if (a.name === 'cal-refresh') serial(refresh);
  else if (a.name.startsWith('ev:')) serial(check);
});
chrome.runtime.onStartup.addListener(() => serial(refresh));
chrome.runtime.onInstalled.addListener(() => serial(refresh));
chrome.storage.onChanged.addListener((c, area) => {
  if (area === 'local' && (c.leadMin || c.connected)) serial(refresh);
});
self.calendarAlert = { showAlert, token };
