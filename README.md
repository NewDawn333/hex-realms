# ⬡ Hex Realms

A turn-based hex strategy game — conquer provinces, manage treasuries, and
outmaneuver AI rivals. Original artwork and rules; runs in the browser or as
an offline Android app.

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

- **Random Island** (small → gigantic): organic generation with peninsulas,
  bays and impassable mountain ridges. Pick 1–7 AI opponents.
- **United Kingdom**: English, Scots, Welsh and Irish factions; Highlands,
  Pennines and Cambrian mountains; sea-strait ferry crossings to Ireland.
- **California**: Bay Area, Angelenos, Valley Folk and San Diegans, with
  the Sierra Nevada and coastal ranges.
- **Europe**: six factions from Iberia to Scandinavia; Alps and Pyrenees;
  Dover and Øresund straits.
- **Custom maps**: built in the map editor (land, mountains, forests, straits).

## How to play

- **Build**: tap **Army**, **Town**, or **Tower**, then tap again to cycle
  level (stronger units, city, bastion). Tap a highlighted hex to place.
  Placing on the same type upgrades it (town → city, tower → bastion).
- **Provinces**: each connected blob of your color has its own treasury
  (shown on its capital). Tap any of your tiles to inspect it.
- **Terrain**: mountains are impassable. Blue strait hexes are ferry
  crossings — armies can cross but cannot be owned or built on.
- **Income** (per turn): plain 1, town 2, city 4, capital 3. Trees block
  income — chop them by moving a soldier onto them (+3 gold).
- **Build costs**: town 5g, new city 15g (or upgrade town 10g), tower 15g,
  bastion 25g.
- **Soldiers**: Militia 3g, Spearman 8g, Knight 18g, Champion 33g. Move
  range through your province: 4 / 4 / 3 / 2 hexes. Merge units to promote.
- **Upkeep**: 2 / 5 / 12 / 25 gold per turn by rank. If a province treasury
  goes negative at turn start, its whole army starves.
- **Starting gold**: Easy 10g, Normal 5g, Hard 0g.
- **Combat**: capture strength must beat tile defense (towns, towers,
  capitals, nearby enemies). Champions break any siege.
- **Win**: eliminate every rival capital. Cut enemy provinces in two to
  split their economy.

**Hold** on one of your hexes to rally unmoved units toward it.

Keyboard shortcuts: `Enter` = end turn, `Esc` = cancel, `Cmd+Z` = undo.

## License

MIT — see [LICENSE](LICENSE).

## Project layout

```
index.html        shell + menus + HUD
css/style.css     UI styling
js/constants.js   tunable game rules (costs, income, upkeep…)
js/hex.js         hex-grid math, seeded RNG
js/mapgen.js      organic island generation
js/realmaps.js    UK, California, Europe scenarios
js/custommaps.js  player-made maps (localStorage)
js/mapeditor.js   terrain editor
js/game.js        rules engine (provinces, combat, economy, undo)
js/sprites.js     vector artwork (castles, towns, towers, soldiers…)
js/renderer.js    canvas renderer, camera, animations
js/audio.js       procedural music sequencer + sound effects
js/ai.js          AI opponents (easy / normal / hard)
js/main.js        input, HUD wiring, AI turn loop
manifest.json/sw.js  PWA install + offline support
```
