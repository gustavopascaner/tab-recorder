// Login de Google con ventana propia (launchWebAuthFlow): deja elegir cualquier cuenta, sin depender de la del perfil de Chrome.
// Flujo implícito: el token dura ~1 h y se renueva en silencio (prompt=none) con la cuenta ya conectada.
const CLIENT_ID = '742859116230-ehc7cvahb6hajh222a6lg2cgt0rosp8d.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly';

async function authFlow(interactive, hint) {
  const q = new URLSearchParams({
    client_id: CLIENT_ID, response_type: 'token', scope: SCOPE,
    redirect_uri: chrome.identity.getRedirectURL(),
    prompt: interactive ? 'select_account' : 'none'
  });
  if (!interactive && hint) q.set('login_hint', hint);
  const url = await chrome.identity.launchWebAuthFlow({ url: 'https://accounts.google.com/o/oauth2/v2/auth?' + q, interactive });
  const p = new URLSearchParams(new URL(url).hash.slice(1));
  if (p.get('error')) throw new Error(p.get('error'));
  return { token: p.get('access_token'), expiresAt: Date.now() + (+p.get('expires_in') || 3600) * 1000 - 60e3 };
}

async function connect() {
  const auth = await authFlow(true);
  // El id del calendario principal es el mail de la cuenta: sirve de login_hint para renovar en silencio
  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary?fields=id', { headers: { Authorization: 'Bearer ' + auth.token } });
  if (res.ok) auth.hint = (await res.json()).id;
  await chrome.storage.local.set({ auth });
}

async function getToken(force = false) {
  const { auth } = await chrome.storage.local.get('auth');
  if (!auth) throw new Error('Falta conectar Google Calendar');
  if (!force && auth.expiresAt > Date.now()) return auth.token;
  try {
    const fresh = { ...(await authFlow(false, auth.hint)), hint: auth.hint };
    await chrome.storage.local.set({ auth: fresh });
    return fresh.token;
  } catch (e) {
    throw new Error('Hay que reconectar Google Calendar desde "Aviso de llamadas"');
  }
}
