# Tab Recorder

Extensión de Chrome (MV3) que graba el video de una pestaña + su audio + tu micrófono, con Rec / Pause / Stop.

- Guarda en `Descargas/TabRecordings` (`.webm` del video + `-voces.webm` con mic y pestaña en canales separados).
- Ícono con círculo rojo titilando al grabar; recordatorio con botones Grabar / No grabar en Google Meet.
- `tab-recorder/transcribir.sh`: transcripción local con whisper.cpp (`Gus:` = micrófono, `Cliente:` = pestaña). Se puede correr con launchd cada 60 s.

## Instalar
`chrome://extensions` → Modo desarrollador → Cargar descomprimida → carpeta `tab-recorder/`.
