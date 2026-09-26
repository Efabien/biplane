#!/bin/sh
# Double-click to play: serves the game locally (ES modules don't load from file://) and opens the browser.
# Caching is disabled so the browser always loads the latest version of the game files.
cd "$(dirname "$0")"
PORT=8000
(sleep 1; open "http://localhost:$PORT") &
exec python3 -c '
import http.server, sys
class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()
http.server.ThreadingHTTPServer(("", int(sys.argv[1])), NoCache).serve_forever()
' $PORT
