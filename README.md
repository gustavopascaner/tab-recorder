# Tab Recorder

Extensión de Chrome (MV3) que graba el video de una pestaña + su audio + tu micrófono, con Rec / Pause / Stop.

- Guarda en `Descargas/TabRecordings` (`.webm` del video + `-voces.webm` con mic y pestaña en canales separados).
- Los archivos se llaman `<título del evento de Calendar> AAAA-MM-DD HH-mm` (si no hay evento, `rec ...`); la transcripción `.txt` toma el mismo nombre.
- La grabación se corta sola al salir de la llamada de Meet, al cerrar la pestaña o a las 2 horas.
- Ícono con círculo rojo titilando al grabar; recordatorio con botones Grabar / No grabar en Google Meet.
- `tab-recorder/transcribir.sh`: transcripción local con whisper.cpp (`Gus:` = micrófono, `Cliente:` = pestaña). Se puede correr con launchd cada 60 s.

## Instalar
`chrome://extensions` → Modo desarrollador → Cargar descomprimida → carpeta `tab-recorder/`.

## Aviso de llamadas (Google Calendar)
Cada 5 minutos la extensión consulta la API de Google Calendar (solo lectura de eventos, `calendar.events.readonly`), programa una alarma por evento con Meet y 5 minutos antes (configurable) abre una ventana emergente con "Unirme", sin importar qué pestaña uses.

Login: ventana de Google propia (`chrome.identity.launchWebAuthFlow`, flujo implícito), así se elige la cuenta sin depender de la del perfil de Chrome. El token dura ~1 h y se renueva en silencio; si falla, reconectar desde "Aviso de llamadas".

Setup (ya hecho en el proyecto de Cloud, app Interna de Workspace): Calendar API activada y un cliente OAuth tipo **Aplicación web** con el URI de redirección `https://mcmgncmjcadedgbfglgpllmkljdklmeb.chromiumapp.org/` (el `manifest.json` trae un `key` fijo para que el ID no cambie). El client_id está en `tab-recorder/auth.js`. Después: recargar la extensión y "Conectar Google Calendar" en "Aviso de llamadas".
