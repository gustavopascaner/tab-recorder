#!/bin/zsh
# Transcribe las grabaciones de Descargas/TabRecordings que todavía no tienen .txt.
# Usa el archivo *-voces.webm (canal izq = mic -> "Gus:", canal der = pestaña -> "Cliente:").
# Uso: ./transcribir.sh            -> procesa todas las pendientes
#      ./transcribir.sh archivo-voces.webm
export PATH="/opt/homebrew/bin:/usr/bin:/bin:$PATH"
DIR="$HOME/Downloads/TabRecordings"
MODEL="$HOME/.cache/whisper-cpp/ggml-large-v3-turbo.bin"
LANG_CODE="${LANG_CODE:-es}"

transcribe() {
  local V="$1" BASE="${1%-voces.webm}" T; T="$(mktemp -d)"
  ffmpeg -loglevel error -y -i "$V" -af "pan=mono|c0=c0,aresample=16000" "$T/gus.wav" || return 1
  ffmpeg -loglevel error -y -i "$V" -af "pan=mono|c0=c1,aresample=16000" "$T/cliente.wav" || return 1
  for s in gus cliente; do
    whisper-cli -m "$MODEL" -l "$LANG_CODE" -f "$T/$s.wav" -osrt -of "$T/$s" -nth 0.7 >/dev/null 2>&1
  done
  /usr/bin/python3 - "$T" "$BASE.txt" <<'PY'
import re, sys
d, out = sys.argv[1], sys.argv[2]
def ts(x):
    h, m, s = x.replace(',', '.').split(':'); return int(h)*3600+int(m)*60+float(s)
# frases que Whisper inventa sobre silencio
ALUCINA = re.compile(r"gracias por ver|suscr[ií]b|subt[ií]tulos|amara\.org|hasta la pr[oó]xima", re.I)
segs = []
for name, label in (("gus", "Gus"), ("cliente", "Cliente")):
    try: txt = open(f"{d}/{name}.srt", encoding="utf-8").read()
    except FileNotFoundError: continue
    for blk in re.split(r"\n\s*\n", txt.strip()):
        l = blk.split("\n")
        if len(l) < 3: continue
        a, _ = l[1].split(" --> ")
        t = " ".join(l[2:]).strip()
        if t and not ALUCINA.search(t) and not re.fullmatch(r"[\[\(].*[\]\)]", t): segs.append((ts(a), label, t))
segs.sort()
lines, last = [], None
for t, who, text in segs:
    if who == last: lines[-1][2] += " " + text
    else: lines.append([t, who, text]); last = who
with open(out, "w", encoding="utf-8") as f:
    for t, who, text in lines:
        f.write(f"[{int(t//60):02d}:{int(t%60):02d}] {who}: {text}\n\n")
PY
  rm -rf "$T"
  echo "Listo: $BASE.txt"
}

if [[ -n "$1" ]]; then transcribe "$1"; exit; fi
ls "$DIR" >/dev/null 2>&1 || echo "$(date) SIN ACCESO a $DIR (permiso de macOS)"
for V in "$DIR"/*-voces.webm(N); do
  BASE="${V%-voces.webm}"
  [[ -f "$BASE.txt" ]] && continue
  [[ -f "$BASE.webm" ]] || continue                       # el video termina de bajarse último
  (( $(date +%s) - $(stat -f %m "$V") < 20 )) && continue  # todavía escribiéndose
  transcribe "$V"
done
