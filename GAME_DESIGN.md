# Hex Realms — Game Design & Engineering Handbook

This document is the source of truth for how the game works. It is written
so that any developer (human or AI) can pick up the project and make
changes safely. Read this before touching the rules engine.

---

## 1. Architecture

Pure browser JS, no build step, no dependencies. Script load order matters
(plain `<script>` tags, see `index.html`):

| File | Responsibility |
|---|---|
| `js/constants.js` | All tunable numbers: costs, income, upkeep, map sizes, colors |
| `js/hex.js` | Axial hex math (flat-top), seeded RNG (`makeRng`) |
| `js/sprites.js` | Vector art drawn into cached offscreen canvases (`Sprites.get(name, px)`) |
| `js/audio.js` | `Audio2`: WebAudio procedural music sequencer + one-shot SFX |
| `js/mapgen.js` | Random map generation (arms + thicken + ridges) |
| `js/realmaps.js` | Hand-drawn ASCII scenario maps (UK, California, Europe) |
| `js/game.js` | **Rules engine** — class `Game`. No DOM/canvas access. Pure state. |
| `js/renderer.js` | class `Renderer` — canvas drawing, camera, animation queue |
| `js/ai.js` | `AI.act(game, difficulty)` — performs ONE action per call |
| `js/main.js` | Input handling, HUD, menus, AI turn loop, event→fx routing |

The engine (`game.js`) is deliberately headless: it can be driven without a
DOM, which is how the automated full-game simulations are run. Keep it that
way — never reference `document` from `game.js`/`ai.js`/`mapgen.js`.

### Communication pattern

- UI calls engine methods (`moveUnit`, `buyUnit`, `build`, `endTurn`).
- Engine pushes semantic events into `game.events`
  (`move`, `capture`, `chop`, `merge`, `spawn`, `build`, `starve`,
  `treegrow`, `eliminated`, `gameover`, `turnstart`, `undo`).
- `main.js → drainEvents()` translates events into renderer animations and
  sounds once per frame / after actions. Always drain after engine calls.

---

## 2. Core data model

```js
// one entry per hex in game.tiles: Map<"q,r", tile>
tile = {
  q, r,            // axial coords (flat-top, odd-q in scenario source maps)
  owner,           // 0 = neutral, otherwise player id (1-based)
  kind,            // 'plain' | 'town' | 'city' | 'capital' | 'tower' | 'mountain'
  towerLevel,      // 0 | 1 | 2 (only for kind 'tower')
  tree,            // bool — blocks income, chop for +3 gold
  strait,          // bool — sea-crossing tile: passable/ownable, 0 income,
                   //        no buildings, no trees. Terrain flag, never changes.
  unit,            // null | { level: 1..4, moved: bool }
  money,           // gold — meaningful only on capital tiles
}
```

**Province** = connected component (≥2 tiles) of one player's tiles.
Recomputed from scratch by `recomputeProvinces()` after every ownership
change. Money lives on the capital *tile* so it survives recomputation.
Province objects (`game.provinces`, `game.tileProv`) are derived caches —
**province ids change after every recompute; never store them across
actions** (see `reselectProvince()` in main.js).

Key invariants:

1. After ANY ownership change you must call `recomputeProvinces()`
   (capture paths already do).
2. A single isolated tile is not a province: it loses unit, structures,
   money (`comp.length < 2` branch).
3. Merging provinces pools gold onto the richest capital; the others
   demote to cities.
4. A province with no capital gets one assigned (best empty plain).
5. Mountains: `kind === 'mountain'`, owner always 0, excluded from
   movement, capture, placement, tree growth. Map generators must keep the
   passable graph connected (`MapGen.isPassableConnected`).

---

## 3. Rules (current numbers)

### Economy (per province, applied at that player's turn start)
- Income: plain 1, town 3, city 6, capital 5, tower 0. Tree or strait on a
  tile ⇒ that tile yields 0.
- Upkeep: unit L1/2/3/4 = 2/5/12/25; tower L1/L2 = 5/15.
- If treasury would go negative: ALL units in that province die
  ('starve' events), treasury clamps to 0.

### Units
- Buy cost L1/2/3/4 = 3/8/18/33 (`RULES.UNIT_COST`).
- Move range 4, BFS through own-province tiles only; any adjacent
  non-owned tile is attackable from anywhere on the reachable frontier.
- Capture requirement: `min(4, protection + 1)` where protection of a tile
  is max of: own static defense (town 1, city 2, capital 2, tower 2/3),
  its unit level, and the best of those values among same-province
  neighbors ("defense projection"). Level 4 (Champion) captures anything.
- Merging: move one unit onto another (sum ≤ 4); merged unit inherits the
  *target's* moved flag.
- Fresh-bought units inside own territory may act immediately
  (`moved:false`); units bought onto trees/captures arrive `moved:true`.
- Moving onto an own tree chops it: +3 gold, consumes the move.

### Buildings (build targets must be inside the paying province)
- Town 5g — empty own plain (no tree/strait) adjacent to a town/city/capital.
- City — upgrade of a town, 10g.
- Tower 15g — any empty own plain (no tree/strait); upgrade to L2 bastion 10g.

### Trees
- Spread each full round: 6% per existing tree to an empty neighbor plain;
  0.2% spontaneous on neutral plains; capped at 22% of the map.

### Turn flow
`startTurn` (income/starve, reset moved flags, clear undo) → human/AI
actions → `endTurn` → next alive player; when wrapping to player 1:
`round++` and `growTrees()`.

### Victory
Last player with any province wins. Elimination happens inside
`recomputeProvinces` when a player has no component ≥ 2 tiles.

---

## 4. Maps

### Random (`mapgen.js`)
1. 6–10 "skeleton arms" random-walk outward from existing land → long
   peninsulas and shoots.
2. Thicken with frontier picks weighted **linearly** by adjacent-land count
   (quadratic weighting would round the coast and erase tendrils).
3. Fill single-hex holes (≥5 land neighbors).
4. Capitals: ≥4 land neighbors, max-distance spread, claim 3 neighbors.
5. Mountain ridges: random walks of 3–8 hexes, rejected when they touch
   starting land or would disconnect the passable graph.
6. Trees sprinkled (30% near existing tree, else 9%).

Sizes in `MAP_SIZES`: small 150 / medium 280 / large 450 / huge 650 hexes.

### Scenarios (`realmaps.js`)
ASCII art, one char per hex, **odd-q offset** layout converted via
`q = col; r = row - (col - (col & 1)) / 2`.
Legend: `.` water, `#` plain, `^` mountain, `=` strait, `1`-`6` capitals
(start order = faction order). Factions get display names.

When editing a scenario map, ALWAYS verify in the console:
- every faction's capital is reachable from every other (flood fill over
  non-mountain tiles — straits count as passable);
- digits 1..N appear exactly once each, no gaps.

---

## 5. UI conventions (main.js)

- **Build modes are global**: clicking a buy button highlights legal spots
  across ALL of the player's provinces; `sel.buildMap` maps each candidate
  hex → `{provId, action}` (richest province claims contested hexes). No
  pre-selection required. Mode stays active after placement until nothing
  is placeable or the player taps elsewhere/Escape.
- Selecting an own tile shows that province's treasury; nothing selected
  shows realm totals (Σ).
- Undo: human-only snapshots (`pushUndo`) before each action, cleared at
  turn start.
- AI runs one `AI.act` per timer tick with adaptive pacing (slows for the
  first ~12 actions, then fast-forwards).
- Input: pointer events — tap vs drag threshold 6px, two-pointer pinch
  zoom, wheel zoom. All hit-testing through `renderer.hexAtScreen`.

---

## 6. Known gotchas

- `Renderer.hiddenUnits` hides a unit while its slide animation plays;
  if you add new movement paths, emit `move`/`capture` events or units
  will teleport (cosmetic only).
- `legalMoves` BFS treats the whole reachable frontier as attack origins
  (this matches the "4 owned hexes + 1 step out" rule from the prototypes).
- `JSON.stringify` comparison is used for build-mode button toggling;
  keep mode objects flat.
- Service worker caches aggressively — bump `CACHE` version in `sw.js`
  whenever shipping changes, or users get stale files.
- The launcher (`Hex Realms.command`) serves on port **8421**; the cache
  and any saved state are per-origin (port), so switching ports "resets"
  the PWA.

---

## 7. Roadmap

Ordered roughly by value/effort. Each item is self-contained.

### 7.1 Gameplay depth
- **Naval/ocean mechanics** (prereq for a World map):
  - New tile class `sea` rendered as open water but part of `game.tiles`.
  - Ship unit (e.g. cost 12, upkeep 4) buildable on a coastal town/city
    ("port"); carries one land unit; moves 5 over sea/strait tiles.
  - Landing = normal capture resolution using the carried unit's level.
  - AI: extend `borderDistance` with sea paths; value coastal towns higher.
  - Then add a `world` scenario map (~60×40 ASCII) with 6 starts:
    Europe, North America, South America, Africa, East Asia, Oceania.
- **Farms** (Antiyoy-style economy building): buildable only next to
  capital/another farm, cost 12+2 per farm owned, +4 income. Gives the
  economy a build-order arc.
- **Defensive balance pass**: towers currently die to Champions with no
  counter; consider L3 tower or "fort" upgrade for capitals.
- **Neutral ruins / barbarian camps**: occasional neutral units that
  raid nearby provinces every few rounds; gives early-game PvE pressure.
- **Fog of war** (optional mode): visibility = own tiles + 2 hex radius;
  renderer dims unseen tiles; AI unaffected (cheats honestly).

### 7.2 UX / polish
- Tutorial overlay on first launch (3-step pointer hints).
- Combat preview: long-press an enemy hex → show required level vs yours.
- Turn summary toast ("Red lost 3 provinces", "Trees spread ×4").
- Save/resume: serialize `game` (already has `serialize/restore`) to
  `localStorage` on every turn; "Continue" button in menu.
- Replay system: record action log, play back at speed (the engine is
  deterministic given the seed + action list).
- Settings: animation speed, colorblind palette, left-handed HUD.

### 7.3 Mobile/native
- Capacitor wrap → Play Store APK (game is already touch-first + PWA).
- Haptics on capture/starve via Capacitor Haptics plugin.
- Cloud sync of campaign progress (later).

### 7.4 Multiplayer (big)
- Hot-seat first (trivial: multiple human players in `players[]`,
  pass-device prompt between turns).
- Online: the engine is a deterministic state machine driven by a small
  action vocabulary — lockstep over WebRTC/WebSocket with seed exchange
  is the cheapest correct approach. Server only needs lobby + relay.

### 7.5 AI improvements
- Look-ahead for cutting enemy provinces (current AI never aims for splits
  even though they're devastating).
- Economic planning: save for Knights instead of dribbling Militia when
  blocked (partially present on hard).
- Per-personality AIs (aggressive/turtler/economist) for variety.
