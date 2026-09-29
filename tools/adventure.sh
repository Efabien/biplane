#!/bin/sh
# Plays the whole adventure headlessly (tools/adventure.html) and prints the log; exits 1 if a step got stuck.
#   tools/adventure.sh
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[ -x "$CHROME" ] || CHROME="$(command -v google-chrome || command -v chromium || command -v chromium-browser)"
(cd "$ROOT" && exec python3 -m http.server 8767 >/dev/null 2>&1) & PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null || true' EXIT
sleep 1
DOM="$("$CHROME" --headless --timeout="${WAIT:-20000}" --dump-dom "http://localhost:8767/tools/adventure.html" 2>/dev/null)"
echo "$DOM" | sed -n '/<pre id="log">/,/<\/pre>/p' | sed 's/<[^>]*>//g; s/&quot;/"/g; s/&amp;/\&/g; s/&gt;/>/g; s/&lt;/</g'
echo "$DOM" | grep -q '<title>DONE ok</title>'
