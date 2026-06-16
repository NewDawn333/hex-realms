# ⬡ Hex Realms

A turn-based hex strategy game inspired by Antiyoy. Conquer the island,
province by province. Pure HTML5/JavaScript — no build step, no dependencies.

## Play on your Mac

**Double-click `Hex Realms.command`** (there's a copy on your Desktop and
one in this folder). It starts a local server and opens the game in your
browser automatically.

Manual alternative from this folder:

```bash
python3 -m http.server 8421
```

then open **http://localhost:8421**.

## Play on your Android phone

### Online (recommended for quick tests)

**https://newdawn333.github.io/hex-realms/**

Works in Chrome with optional **Add to Home screen** (offline after first load).

### Offline Android app (no internet)

Install the native APK built with Capacitor — all game files are bundled inside.
See **[ANDROID.md](ANDROID.md)** for setup, USB install, and how to push updates
after you change the game on Mac.

```bash
cd ~/Desktop/Cursor/hex-realms
npm install          # once
npm run cap:sync     # after each round of changes
npm run cap:run      # install on phone via USB
```

### Same Wi-Fi (local dev)

If you're testing changes before they're pushed:

1. Double-click `Hex Realms.command` on your Mac (starts the server)
2. Find your Mac's IP: System Settings → Wi-Fi → Details, or run `ipconfig getifaddr en0`
3. On your phone, open Chrome and visit `http://<your-mac-ip>:8421`
   (e.g. `http://192.168.1.42:8421`)

### Future: Play Store

Release builds use the same Capacitor project with a signed APK/AAB in Android Studio.

## Maps

- **Random Island** (small → huge): organic generation with peninsulas,
  bays and impassable mountain ridges. Pick 1–5 AI opponents.
- **United Kingdom**: English, Scots, Welsh and Irish factions; Highlands,
  Pennines and Cambrian mountains; sea-strait ferry crossings to Ireland.
- **California**: Bay Area, Angelenos, Valley Folk and San Diegans, with
  the Sierra Nevada and coastal ranges.
- **Europe**: six factions from Iberia to Scandinavia; Alps and Pyrenees;
  Dover and Øresund straits.
- **World (Lite)**: six macro-continents (Europe, Americas, Africa, Asia,
  Oceania) linked by ferry straits — cross oceans without ships.

## How to play

- **Build anywhere**: tap a buy button, then tap any highlighted hex —
  no need to select a province first. Each placement is paid by the
  province it belongs to (richest claims contested border hexes).
- **Provinces**: each connected blob of your color is a province with its own
  treasury (shown on its capital). Tap any of your tiles to inspect it.
- **Terrain**: mountains are impassable. Blue strait hexes are sea
  crossings — armies can ferry across but they produce no income.
- **Income**: every tile pays 1 gold/turn, towns 3, cities 6, capitals 5.
  Trees block a tile's income — chop them by moving a soldier onto them (+3 gold).
- **Soldiers** (Militia 3g → Spearman 8g → Knight 18g → Champion 33g): tap a
  soldier, then a highlighted hex. They move up to 4 hexes through your own
  province and capture adjacent enemy/neutral tiles. Move two soldiers together
  to merge them into a stronger one.
- **Combat**: to capture a tile you must beat its protection — towers, capitals,
  towns and nearby enemy soldiers all project defense. Champions break any siege.
- **Upkeep**: soldiers cost 2/5/12/25 gold per turn. If a province's treasury
  goes negative, its whole army starves.
- **Strategy**: cut an enemy province in two and the halves split their gold and
  may lose units. Eliminate every rival realm to win.

Keyboard shortcuts: `Enter` = end turn, `Esc` = cancel, `Cmd+Z` = undo.

## Project layout

```
index.html        shell + menus + HUD
css/style.css     UI styling
js/constants.js   tunable game rules (costs, income, upkeep…)
js/hex.js         hex-grid math, seeded RNG
js/mapgen.js      organic island generation
js/game.js        rules engine (provinces, combat, economy, undo)
js/sprites.js     vector artwork (castles, towns, towers, soldiers…)
js/renderer.js    canvas renderer, camera, animations
js/audio.js       procedural music sequencer + sound effects
js/ai.js          AI opponents (easy / normal / hard)
js/main.js        input, HUD wiring, AI turn loop
manifest.json/sw.js  PWA install + offline support
```
