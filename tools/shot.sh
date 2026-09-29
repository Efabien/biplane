#!/bin/sh
# Headless screenshot of the game world via tools/shot.html, with its metrics (build ms, draw calls, triangles).
#   tools/shot.sh OUT.png 'QUERY'            e.g.  tools/shot.sh /tmp/v.png 'at=waterfall&t=twilight&d=300'
#   tools/shot.sh -r REF OUT.png 'QUERY'     also renders git REF (e.g. HEAD) to OUT-REF.png and counts changed pixels
# QUERY is tools/shot.html's query string (cam=… or at=…, t=, w=, h=, lamp=1, frames=N). Needs Chrome and python3;
# the pixel diff needs Pillow (pip install pillow). Serves the repo on port 8765 (and the REF on 8766) while it runs.
# WAIT=ms sets how long Chrome waits for the page (default 15000; raise it for frames=N timing runs).
set -e
REF=""
if [ "$1" = "-r" ]; then REF="$2"; shift 2; fi
OUT="$1"; QUERY="${2:-at=Airfield}"
[ -n "$OUT" ] || { sed -n '2,6p' "$0"; exit 1; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[ -x "$CHROME" ] || CHROME="$(command -v google-chrome || command -v chromium || command -v chromium-browser)"
W=$(echo "$QUERY" | sed -n 's/.*[?&]*w=\([0-9]*\).*/\1/p'); H=$(echo "$QUERY" | sed -n 's/.*[?&]h=\([0-9]*\).*/\1/p')
SIZE="${W:-1280},${H:-800}"

PIDS=""
cleanup() { for p in $PIDS; do kill "$p" 2>/dev/null; wait "$p" 2>/dev/null || true; done; [ -n "$WT" ] && git -C "$ROOT" worktree remove --force "$WT" 2>/dev/null || true; }
trap cleanup EXIT
serve() { (cd "$1" && exec python3 -m http.server "$2" >/dev/null 2>&1) & PIDS="$PIDS $!"; sleep 1; }

render() { # dir port out
  URL="http://localhost:$2/tools/shot.html?$QUERY"
  # real time (not --virtual-time-budget, which freezes performance.now() and zeroes the timings); the page renders
  # once and sets its title when done, so a fixed wait long enough for the CDN, the build and the render is enough
  "$CHROME" --headless --use-angle=metal --hide-scrollbars --window-size="$SIZE" --timeout="${WAIT:-15000}" --dump-dom "$URL" 2>/dev/null \
    | sed -n 's:.*<title>\(.*\)</title>.*:\1:p'
  "$CHROME" --headless --use-angle=metal --hide-scrollbars --window-size="$SIZE" --timeout="${WAIT:-15000}" --screenshot="$3" "$URL" >/dev/null 2>&1
}

serve "$ROOT" 8765
printf 'current: '; render "$ROOT" 8765 "$OUT"
if [ -n "$REF" ]; then
  WT="$(mktemp -d)/ref"; git -C "$ROOT" worktree add --detach -q "$WT" "$REF"
  mkdir -p "$WT/tools"; cp "$ROOT/tools/shot.html" "$WT/tools/" # the harness may be newer than REF
  [ -f "$WT/src/vale.js" ] || echo 'export const buildVale = null;' > "$WT/src/vale.js"         # modules REF predates
  [ -f "$WT/src/harbours.js" ] || echo 'export const buildHarbours = null;' > "$WT/src/harbours.js"
  serve "$WT" 8766
  BEFORE="${OUT%.png}-$(echo "$REF" | tr '/~^' '___').png"
  printf '%s: ' "$REF"; render "$WT" 8766 "$BEFORE"
  python3 - "$BEFORE" "$OUT" <<'EOF' || echo "(install Pillow for the pixel diff)"
import sys
from PIL import Image, ImageChops
a, b = (Image.open(p).convert('RGB') for p in sys.argv[1:3])
d = ImageChops.difference(a, b).convert('L')
n = sum(1 for p in (d.get_flattened_data() if hasattr(d, 'get_flattened_data') else d.getdata()) if p > 30)
print(f'changed pixels (>30/255): {n} of {a.width * a.height} ({100 * n / (a.width * a.height):.2f} %)')
EOF
fi
