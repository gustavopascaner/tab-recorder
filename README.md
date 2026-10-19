# Tab Recorder

Extensión de Chrome (MV3) que graba el video de una pestaña + su audio + tu micrófono, con Rec / Pause / Stop.

- Guarda en `Descargas/TabRecordings` (`.webm` del video + `-voces.webm` con mic y pestaña en canales separados).
- Ícono con círculo rojo titilando al grabar; recordatorio con botones Grabar / No grabar en Google Meet.
- `tab-recorder/transcribir.sh`: transcripción local con whisper.cpp (`Gus:` = micrófono, `Cliente:` = pestaña). Se puede correr con launchd cada 60 s.

## Instalar
`chrome://extensions` → Modo desarrollador → Cargar descomprimida → carpeta `tab-recorder/`.

## Aviso de llamadas (Google Calendar)
Cada 5 minutos la extensión consulta la API de Google Calendar (solo lectura de eventos, `calendar.events.readonly`), programa una alarma por evento con Meet y 5 minutos antes (configurable) abre una ventana emergente con "Unirme", sin importar qué pestaña uses.

Setup único (cuenta Workspace):
1. console.cloud.google.com → proyecto nuevo → activar Google Calendar API.
2. Pantalla de consentimiento OAuth → tipo de usuario **Interno** → agregar el scope `calendar.events.readonly`.
3. Credenciales → ID de cliente OAuth → tipo **Extensión de Chrome** → ID del elemento: `mcmgncmjcadedgbfglgpllmkljdklmeb` (el `manifest.json` trae un `key` fijo, así el ID no cambia).
4. Pegar el client_id en `tab-recorder/manifest.json` (`oauth2.client_id`), recargar la extensión y apretar "Conectar Google Calendar" en el link "Aviso de llamadas" del popup.
