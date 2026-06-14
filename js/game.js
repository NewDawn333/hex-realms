'use strict';

// =============================================================
//  Hex Realms — core rules engine
//
//  Tiles:    { q, r, owner (0 = neutral), kind, towerLevel,
//              tree, unit: {level, moved} | null, money (capitals) }
//  Province: connected component of >= 2 tiles of one player.
//            Each has its own capital + treasury (money lives on
//            the capital tile so it survives recomputation).
// =============================================================

class Game {
  constructor(opts) {
    this.opts = opts;
    this.tiles = new Map();
    this.players = [];           // { id, color, isAI, alive }
    this.turnIndex = 0;          // index into players
    this.round = 1;
    this.winner = null;
    this.events = [];            // drained by renderer/UI for fx
    this.undoStack = [];
    this.recording = true;
    this.replaying = false;
    this.tape = [];              // replay frames: { snapshot, events, round, playerId }

    const seed = opts.seed || ((Math.random() * 1e9) | 0);
    this.seed = seed;
    this.rng = makeRng(seed);

    const scenario = opts.map && opts.map !== 'random' && !(opts.map && opts.map.startsWith('custom:'));
    const customId = opts.map && opts.map.startsWith('custom:') ? opts.map.slice(7) : null;
    const total = scenario ? RealMaps.startCount(opts.map) : 1 + opts.aiCount;
    for (let i = 1; i <= total; i++) {
      this.players.push({
        id: i, color: PLAYER_COLORS[i - 1], name: PLAYER_COLORS[i - 1].name,
        isAI: i !== 1, alive: true,
      });
    }

    if (scenario) RealMaps.build(this, opts.map);
    else if (customId) CustomMaps.build(this, customId);
    else MapGen.generate(this, MAP_SIZES[opts.size] || MAP_SIZES.medium);

    this.provinces = new Map();  // id -> province
    this.tileProv = new Map();   // tileKey -> province id
    this._provSeq = 1;
    this.recomputeProvinces();

    const startMoney = RULES.START_MONEY[opts.difficulty] ?? 12;
    for (const p of this.provinces.values()) {
      this.tiles.get(p.capitalKey).money = startMoney;
    }
    this.refreshProvinceStats();
    this.startTurn();
    this.recordStep('Game start');
  }

  // ---------- accessors ----------
  get currentPlayer() { return this.players[this.turnIndex]; }
  tileAt(q, r) { return this.tiles.get(Hex.key(q, r)); }
  provinceOfTile(key) {
    const id = this.tileProv.get(key);
    return id !== undefined ? this.provinces.get(id) : null;
  }
  provincesOf(playerId) {
    return [...this.provinces.values()].filter(p => p.owner === playerId);
  }

  emit(type, data) { this.events.push({ type, ...data }); }

  // ---------- province bookkeeping ----------
  recomputeProvinces() {
    this.provinces.clear();
    this.tileProv.clear();
    const seen = new Set();

    for (const [key, tile] of this.tiles) {
      if (!tile.owner || seen.has(key)) continue;
      // flood fill this component
      const comp = [];
      const stack = [key];
      seen.add(key);
      while (stack.length) {
        const k = stack.pop();
        comp.push(k);
        const t = this.tiles.get(k);
        for (const n of Hex.neighbors(t.q, t.r)) {
          const nk = Hex.key(n.q, n.r);
          const nt = this.tiles.get(nk);
          if (nt && nt.owner === tile.owner && !seen.has(nk)) {
            seen.add(nk);
            stack.push(nk);
          }
        }
      }

      if (comp.length < 2) {
        // single isolated tile: inert — loses capital/unit/structures
        const t = this.tiles.get(comp[0]);
        t.unit = null;
        if (t.kind !== 'plain') { t.kind = 'plain'; t.towerLevel = 0; }
        t.money = 0;
        continue;
      }

      // capitals present in component
      const caps = comp.filter(k => this.tiles.get(k).kind === 'capital');
      let capKey;
      if (caps.length === 0) {
        capKey = this.pickNewCapital(comp);
        const ct = this.tiles.get(capKey);
        ct.unit = null;
        ct.kind = 'capital';
        ct.towerLevel = 0;
        ct.tree = false;
        ct.money = 0;
      } else {
        // merge: richest capital survives, money pools
        caps.sort((a, b) => (this.tiles.get(b).money || 0) - (this.tiles.get(a).money || 0));
        capKey = caps[0];
        let pool = 0;
        for (const k of caps) pool += this.tiles.get(k).money || 0;
        for (let i = 1; i < caps.length; i++) {
          const t = this.tiles.get(caps[i]);
          t.kind = 'city'; // demoted capital becomes a city
          t.money = 0;
        }
        this.tiles.get(capKey).money = pool;
      }

      const id = this._provSeq++;
      const prov = { id, owner: tile.owner, tiles: new Set(comp), capitalKey: capKey, money: 0, income: 0 };
      this.provinces.set(id, prov);
      for (const k of comp) this.tileProv.set(k, id);
    }

    // eliminate players with no provinces
    for (const p of this.players) {
      if (p.alive && !this.provincesOf(p.id).length) {
        p.alive = false;
        this.emit('eliminated', { player: p.id });
      }
    }
    const alive = this.players.filter(p => p.alive);
    if (alive.length === 1 && !this.winner) {
      this.winner = alive[0].id;
      this.emit('gameover', { winner: this.winner });
    }
    this.refreshProvinceStats();
  }

  pickNewCapital(compKeys) {
    // prefer empty plains, then towns, cities; central-ish
    const score = (k) => {
      const t = this.tiles.get(k);
      let s = 0;
      if (t.strait) s = 6;
      else if (t.kind === 'plain' && !t.unit && !t.tree) s = 0;
      else if (t.kind === 'plain' && t.tree) s = 1;
      else if (t.kind === 'plain') s = 2;
      else if (t.kind === 'town') s = 3;
      else if (t.kind === 'tower') s = 4;
      else s = 5;
      return s;
    };
    return [...compKeys].sort((a, b) => score(a) - score(b))[0];
  }

  refreshProvinceStats() {
    for (const prov of this.provinces.values()) {
      let income = 0;
      for (const k of prov.tiles) {
        const t = this.tiles.get(k);
        if (!t.tree && !t.strait) income += RULES.INCOME[t.kind] || 0;
        if (t.unit) income -= RULES.UNIT_UPKEEP[t.unit.level];
        if (t.kind === 'tower') income -= RULES.TOWER_UPKEEP[t.towerLevel];
      }
      prov.income = income;
      prov.money = this.tiles.get(prov.capitalKey).money || 0;
    }
  }

  // ---------- defense / capture ----------
  // Protection level of a tile = best of: its own static defense,
  // its unit, and projection from same-province neighbors.
  protectionOf(tile) {
    let prot = 0;
    const self = (t) => {
      let v = 0;
      if (t.kind === 'tower') v = RULES.TOWER_DEF[t.towerLevel];
      else v = RULES.DEF[t.kind] || 0;
      if (t.unit) v = Math.max(v, t.unit.level);
      return v;
    };
    prot = self(tile);
    if (tile.owner) {
      const myProv = this.tileProv.get(Hex.key(tile.q, tile.r));
      for (const n of Hex.neighbors(tile.q, tile.r)) {
        const nt = this.tiles.get(Hex.key(n.q, n.r));
        if (nt && nt.owner === tile.owner && this.tileProv.get(Hex.key(n.q, n.r)) === myProv) {
          prot = Math.max(prot, self(nt));
        }
      }
    }
    return prot;
  }

  // Minimum unit level needed to capture this tile (cap 4 — Champions break sieges)
  captureRequirement(tile) {
    if (!tile.owner) return 1;
    return Math.min(4, this.protectionOf(tile) + 1);
  }

  // ---------- movement ----------
  // BFS through own province up to MOVE_RANGE; returns
  // { moves:Set<key>, attacks:Map<key, required> }
  legalMoves(fromKey) {
    const res = { moves: new Set(), attacks: new Map() };
    const from = this.tiles.get(fromKey);
    if (!from || !from.unit || from.unit.moved) return res;
    const provId = this.tileProv.get(fromKey);
    if (provId === undefined) return res;
    const lvl = from.unit.level;

    const dist = new Map([[fromKey, 0]]);
    const queue = [fromKey];
    while (queue.length) {
      const k = queue.shift();
      const d = dist.get(k);
      const t = this.tiles.get(k);

      // destination checks (own province tiles)
      if (k !== fromKey) {
        if (t.kind === 'plain') {
          if (!t.unit) res.moves.add(k);                       // step (or chop if tree)
          else if (!t.tree && t.unit.level + lvl <= 4) res.moves.add(k); // merge
        }
      }

      // frontier: adjacent non-owned tiles are attackable from any reachable tile
      for (const n of Hex.neighbors(t.q, t.r)) {
        const nk = Hex.key(n.q, n.r);
        const nt = this.tiles.get(nk);
        if (!nt || nt.kind === 'mountain') continue;
        if (nt.owner === from.owner) {
          if (this.tileProv.get(nk) === provId && d < RULES.MOVE_RANGE && !dist.has(nk)) {
            dist.set(nk, d + 1);
            queue.push(nk);
          }
        } else {
          const req = this.captureRequirement(nt);
          if (lvl >= req && !res.attacks.has(nk)) res.attacks.set(nk, req);
        }
      }
    }
    return res;
  }

  moveUnit(fromKey, toKey, opts = {}) {
    const skipUndo = opts.skipUndo === true;
    const skipRecord = opts.skipRecord === true;
    const legal = this.legalMoves(fromKey);
    const isMove = legal.moves.has(toKey);
    const isAttack = legal.attacks.has(toKey);
    if (!isMove && !isAttack) return false;

    if (!skipUndo) this.pushUndo();
    const from = this.tiles.get(fromKey);
    const to = this.tiles.get(toKey);
    const unit = from.unit;
    from.unit = null;

    if (isMove) {
      if (to.tree) {                        // chop! gold to province
        to.tree = false;
        this.addMoney(this.tileProv.get(toKey), RULES.TREE_CHOP_GOLD);
        to.unit = { level: unit.level, moved: true };
        this.emit('chop', { key: toKey });
      } else if (to.unit) {                 // merge — inherits target's moved state
        to.unit = { level: to.unit.level + unit.level, moved: to.unit.moved };
        this.emit('merge', { key: toKey });
      } else {
        to.unit = { level: unit.level, moved: true };
        this.emit('move', { from: fromKey, to: toKey });
      }
    } else {                                // capture
      const loser = to.owner;
      to.owner = from.owner;
      to.kind = 'plain';
      to.towerLevel = 0;
      to.money = 0;
      if (to.tree) {
        to.tree = false;
        this.addMoney(this.tileProv.get(fromKey), RULES.TREE_CHOP_GOLD);
      }
      to.unit = { level: unit.level, moved: true };
      this.emit('capture', { from: fromKey, to: toKey, loser });
      this.recomputeProvinces();
    }
    this.refreshProvinceStats();
    if (!skipRecord) this.recordStep();
    return true;
  }

  // Move each unmoved unit one full step toward target (best legal move by distance).
  rallyToward(playerId, targetKey) {
    const targetTile = this.tiles.get(targetKey);
    if (!targetTile || targetTile.owner !== playerId || this.winner) return false;
    const target = Hex.fromKey(targetKey);

    const units = [];
    for (const [k, t] of this.tiles) {
      if (t.owner === playerId && t.unit && !t.unit.moved) units.push(k);
    }
    if (!units.length) return false;

    this.pushUndo();
    units.sort((a, b) => {
      const ha = Hex.fromKey(a), hb = Hex.fromKey(b);
      return Hex.dist(hb.q, hb.r, target.q, target.r) - Hex.dist(ha.q, ha.r, target.q, target.r);
    });

    let acted = false;
    for (const fromKey of units) {
      const from = this.tiles.get(fromKey);
      if (!from?.unit || from.unit.moved) continue;
      const dest = this._bestMoveToward(fromKey, targetKey, true);
      if (dest && this.moveUnit(fromKey, dest, { skipUndo: true, skipRecord: true })) acted = true;
    }
    if (acted) {
      this.recordStep('Rally');
      this.emit('rally', { target: targetKey });
    } else {
      this.undoStack.pop();
    }
    return acted;
  }

  _bestMoveToward(fromKey, targetKey, noMerge) {
    const target = Hex.fromKey(targetKey);
    const lm = this.legalMoves(fromKey);
    let best = null, bestD = Infinity;
    const consider = (k) => {
      if (noMerge) {
        const dest = this.tiles.get(k);
        if (dest && dest.unit) return;
      }
      const h = Hex.fromKey(k);
      const d = Hex.dist(h.q, h.r, target.q, target.r);
      if (d < bestD) { bestD = d; best = k; }
    };
    for (const k of lm.moves) consider(k);
    for (const k of lm.attacks.keys()) consider(k);
    return best;
  }

  // ---------- economy / build ----------
  addMoney(provId, amount) {
    const prov = this.provinces.get(provId);
    if (!prov) return;
    const cap = this.tiles.get(prov.capitalKey);
    cap.money = (cap.money || 0) + amount;
    prov.money = cap.money;
  }

  // Valid placement keys for buying a unit of `level` charged to province `prov`
  unitPlacements(prov, level) {
    const out = new Map(); // key -> 'place' | 'merge' | 'chop' | 'capture'
    if (!prov || prov.money < RULES.UNIT_COST[level]) return out;
    for (const k of prov.tiles) {
      const t = this.tiles.get(k);
      if (t.kind === 'plain') {
        if (t.tree && !t.unit) out.set(k, 'chop');
        else if (!t.unit) out.set(k, 'place');
        else if (t.unit.level + level <= 4) out.set(k, 'merge');
      }
      for (const n of Hex.neighbors(t.q, t.r)) {
        const nk = Hex.key(n.q, n.r);
        const nt = this.tiles.get(nk);
        if (nt && nt.kind !== 'mountain' && nt.owner !== prov.owner && !out.has(nk)) {
          if (level >= this.captureRequirement(nt)) out.set(nk, 'capture');
        }
      }
    }
    return out;
  }

  buyUnit(provId, targetKey, level) {
    const prov = this.provinces.get(provId);
    const placements = this.unitPlacements(prov, level);
    const mode = placements.get(targetKey);
    if (!mode) return false;

    this.pushUndo();
    this.addMoney(provId, -RULES.UNIT_COST[level]);
    const t = this.tiles.get(targetKey);

    if (mode === 'place') {
      t.unit = { level, moved: false };       // fresh units inside own land may act
    } else if (mode === 'chop') {
      t.tree = false;
      this.addMoney(provId, RULES.TREE_CHOP_GOLD);
      t.unit = { level, moved: true };
    } else if (mode === 'merge') {
      t.unit = { level: t.unit.level + level, moved: t.unit.moved };
    } else { // capture
      const loser = t.owner;
      t.owner = prov.owner;
      t.kind = 'plain';
      t.towerLevel = 0;
      t.money = 0;
      if (t.tree) { t.tree = false; this.addMoney(provId, RULES.TREE_CHOP_GOLD); }
      t.unit = { level, moved: true };
      this.emit('capture', { to: targetKey, loser });
      this.recomputeProvinces();
    }
    this.emit('spawn', { key: targetKey });
    this.refreshProvinceStats();
    this.recordStep();
    return true;
  }

  // building targets within a province
  buildTargets(prov, what) {
    const out = new Set();
    if (!prov) return out;
    const cost = what === 'town' ? RULES.COST_TOWN
      : what === 'city' ? RULES.COST_CITY_UPGRADE
      : what === 'city_new' ? RULES.COST_CITY_NEW
      : what === 'tower' ? RULES.COST_TOWER
      : what === 'tower2' ? RULES.COST_TOWER_UPGRADE
      : what === 'bastion' ? RULES.COST_BASTION
      : 0;
    if (prov.money < cost) return out;

    for (const k of prov.tiles) {
      const t = this.tiles.get(k);
      if (what === 'town' || what === 'city_new') {
        if (t.kind === 'plain' && !t.unit && !t.tree && !t.strait &&
            this.hasAdjacentSettlement(t, prov)) out.add(k);
      } else if (what === 'tower' || what === 'bastion') {
        if (t.kind === 'plain' && !t.unit && !t.tree && !t.strait) out.add(k);
      } else if (what === 'city') {
        if (t.kind === 'town') out.add(k);
      } else if (what === 'tower2') {
        if (t.kind === 'tower' && t.towerLevel === 1) out.add(k);
      }
    }
    return out;
  }

  hasAdjacentSettlement(tile, prov) {
    return Hex.neighbors(tile.q, tile.r).some(n => {
      const nk = Hex.key(n.q, n.r);
      const nt = this.tiles.get(nk);
      return nt && this.tileProv.get(nk) === prov.id &&
        (nt.kind === 'town' || nt.kind === 'city' || nt.kind === 'capital');
    });
  }

  build(provId, targetKey, what) {
    const prov = this.provinces.get(provId);
    if (!prov || !this.buildTargets(prov, what).has(targetKey)) return false;
    this.pushUndo();
    const t = this.tiles.get(targetKey);
    if (what === 'town') { this.addMoney(provId, -RULES.COST_TOWN); t.kind = 'town'; }
    else if (what === 'city') { this.addMoney(provId, -RULES.COST_CITY_UPGRADE); t.kind = 'city'; }
    else if (what === 'city_new') { this.addMoney(provId, -RULES.COST_CITY_NEW); t.kind = 'city'; }
    else if (what === 'tower') { this.addMoney(provId, -RULES.COST_TOWER); t.kind = 'tower'; t.towerLevel = 1; }
    else if (what === 'tower2') { this.addMoney(provId, -RULES.COST_TOWER_UPGRADE); t.towerLevel = 2; }
    else if (what === 'bastion') {
      this.addMoney(provId, -RULES.COST_BASTION);
      t.kind = 'tower';
      t.towerLevel = 2;
    }
    this.emit('build', { key: targetKey, what });
    this.refreshProvinceStats();
    this.recordStep();
    return true;
  }

  // ---------- turn flow ----------
  startTurn() {
    const p = this.currentPlayer;
    if (!p.alive) { this.advanceTurn(); return; }

    for (const prov of this.provincesOf(p.id)) {
      const cap = this.tiles.get(prov.capitalKey);
      cap.money = (cap.money || 0) + prov.income;
      if (cap.money < 0) {
        // bankruptcy: every unit in the province starves
        for (const k of prov.tiles) {
          const t = this.tiles.get(k);
          if (t.unit) { t.unit = null; this.emit('starve', { key: k }); }
        }
        cap.money = 0;
      }
    }
    // reset movement
    for (const t of this.tiles.values()) {
      if (t.owner === p.id && t.unit) t.unit.moved = false;
    }
    this.refreshProvinceStats();
    this.undoStack.length = 0;
    this.emit('turnstart', { player: p.id });
  }

  endTurn() {
    if (this.winner) return;
    this.advanceTurn();
  }

  advanceTurn() {
    let guard = 0;
    do {
      this.turnIndex = (this.turnIndex + 1) % this.players.length;
      guard++;
    } while (!this.players[this.turnIndex].alive && guard <= this.players.length);

    if (this.turnIndex === 0) {
      this.round++;
      this.growTrees();
    }
    this.startTurn();
    this.recordStep('Turn');
  }

  // Trees slowly spread — the dynamic pressure that keeps maps alive
  growTrees() {
    const land = [...this.tiles.values()];
    const treeCount = land.filter(t => t.tree).length;
    if (treeCount >= land.length * RULES.TREE_MAX_FRACTION) return;

    const newTrees = [];
    for (const t of land) {
      if (t.tree) {
        if (this.rng() < RULES.TREE_SPREAD_CHANCE) {
          const open = Hex.neighbors(t.q, t.r)
            .map(n => this.tiles.get(Hex.key(n.q, n.r)))
            .filter(n => n && !n.tree && !n.unit && n.kind === 'plain' && !n.strait);
          if (open.length) newTrees.push(open[(this.rng() * open.length) | 0]);
        }
      } else if (!t.owner && t.kind === 'plain' && !t.strait && !t.unit && this.rng() < RULES.TREE_SPAWN_CHANCE) {
        newTrees.push(t);
      }
    }
    for (const t of newTrees) {
      if (!t.tree) { t.tree = true; this.emit('treegrow', { key: Hex.key(t.q, t.r) }); }
    }
    if (newTrees.length) this.refreshProvinceStats();
  }

  // ---------- undo & replay tape ----------
  recordStep(label) {
    if (!this.recording || this.replaying) return;
    this.tape.push({
      snapshot: this.serialize(),
      events: this.events.map(e => ({ ...e })),
      label: label || null,
      round: this.round,
      turnIndex: this.turnIndex,
      playerId: this.currentPlayer?.id ?? 0,
    });
  }

  serialize() {
    const tiles = [];
    for (const [k, t] of this.tiles) {
      tiles.push([k, t.owner, t.kind, t.towerLevel, t.tree ? 1 : 0, t.strait ? 1 : 0,
        t.unit ? t.unit.level : 0, t.unit ? (t.unit.moved ? 1 : 0) : 0, t.money || 0]);
    }
    const players = this.players.map(p => [p.id, p.alive ? 1 : 0, p.name]);
    return JSON.stringify({
      tiles, turnIndex: this.turnIndex, round: this.round,
      players, winner: this.winner,
      rngState: this.rng.getState ? this.rng.getState() : null,
    });
  }

  restore(json) {
    const s = JSON.parse(json);
    for (const row of s.tiles) {
      const t = this.tiles.get(row[0]);
      if (!t) continue;
      t.owner = row[1];
      t.kind = row[2];
      t.towerLevel = row[3];
      t.tree = !!row[4];
      if (row.length >= 9) {
        t.strait = !!row[5];
        t.unit = row[6] ? { level: row[6], moved: !!row[7] } : null;
        t.money = row[8] || 0;
      } else {
        t.strait = false;
        t.unit = row[5] ? { level: row[5], moved: !!row[6] } : null;
        t.money = row[7] || 0;
      }
    }
    this.turnIndex = s.turnIndex;
    this.round = s.round;
    if (s.players) {
      for (const [id, alive, name] of s.players) {
        const p = this.players.find(pl => pl.id === id);
        if (p) { p.alive = !!alive; if (name) p.name = name; }
      }
    }
    this.winner = s.winner ?? null;
    if (s.rngState != null && this.rng.setState) this.rng.setState(s.rngState);
    this.recomputeProvinces();
    this.refreshProvinceStats();
  }

  pushUndo() {
    if (this.currentPlayer.isAI) return;
    this.undoStack.push(this.serialize());
    if (this.undoStack.length > 64) this.undoStack.shift();
  }

  undo() {
    const s = this.undoStack.pop();
    if (!s) return false;
    this.restore(s);
    this.emit('undo', {});
    return true;
  }
}
