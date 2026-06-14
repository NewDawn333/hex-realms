#!/bin/bash
# Hex Realms launcher — double-click to play.
# Starts a local server (if not already running) and opens the game.
cd "$(dirname "$0")"
PORT=8421
if ! lsof -ti tcp:$PORT >/dev/null 2>&1; then
  nohup python3 -m http.server $PORT >/dev/null 2>&1 &
  sleep 0.7
fi
open "http://localhost:$PORT"
