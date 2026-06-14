'use strict';

// Organic map generation. Shape strategy:
//   1. several wandering "skeleton arms" walk out from existing land,
//      creating long shoots and peninsulas;
//   2. the landmass is thickened with LINEAR frontier weights (heavier
//      clumping would erase the tendrils);
//   3. single-hex holes are filled;
//   4. mountain ridges are carved in afterwards (with a connectivity
//      check so they never split the world).
const MapGen = {
  generate(game, sizeCfg) {
    const rng = game.rng;
    const target = sizeCfg.land;
    const R = sizeCfg.radius;

    let attempt = 0;
    while (attempt++ < 40) {
      const land = MapGen.growLand(rng, target, R);
      if (land.size < target * 0.8) continue;
      if (!MapGen.placePlayers(game, land, rng)) continue;

      game.tiles.clear();
      for (const k of land) {
        const { q, r } = Hex.fromKey(k);
        game.tiles.set(k, {
          q, r, owner: 0, kind: 'plain', towerLevel: 0,
          tree: false, strait: false, unit: null, money: 0,
        });
      }
      MapGen.applyStart(game);
      MapGen.addRidges(game, rng, sizeCfg.mountains || 110);
      MapGen.sprinkleTrees(game, rng);
      return;
    }
    throw new Error('Map generation failed');
  },

  growLand(rng, target, R) {
    const land = new Set([Hex.key(0, 0)]);
    const inBounds = (q, r) => Hex.dist(0, 0, q, r) <= R;

    // --- skeleton arms ---
    const armCount = 6 + ((rng() * 5) | 0);
    for (let a = 0; a < armCount; a++) {
      const keys = [...land];
      let pos = Hex.fromKey(keys[(rng() * keys.length) | 0]);
      let dir = (rng() * 6) | 0;
      const len = Math.round(R * (0.6 + rng() * 0.9));
      for (let s = 0; s < len; s++) {
        if (rng() < 0.3) dir = (dir + (rng() < 0.5 ? 1 : 5)) % 6;
        const d = Hex.DIRS[dir];
        const nq = pos.q + d[0], nr = pos.r + d[1];
        if (!inBounds(nq, nr)) break;
        pos = { q: nq, r: nr };
        land.add(Hex.key(nq, nr));
        // occasional 1-hex side nub for ruggedness
        if (rng() < 0.25) {
          const sd = Hex.DIRS[(dir + (rng() < 0.5 ? 1 : 5)) % 6];
          if (inBounds(nq + sd[0], nr + sd[1])) land.add(Hex.key(nq + sd[0], nr + sd[1]));
        }
      }
    }

    // --- thicken with linear weights (keeps tendrils) ---
    const frontier = new Map();
    const bump = (q, r) => {
      for (const n of Hex.neighbors(q, r)) {
        if (!inBounds(n.q, n.r)) continue;
        const k = Hex.key(n.q, n.r);
        if (!land.has(k)) frontier.set(k, (frontier.get(k) || 0) + 1);
      }
    };
    for (const k of land) {
      const { q, r } = Hex.fromKey(k);
      bump(q, r);
    }

    while (land.size < target && frontier.size) {
      const entries = [...frontier.entries()];
      let total = 0;
      for (const [, w] of entries) total += w + 0.4;
      let roll = rng() * total;
      let picked = entries[0][0];
      for (const [k, w] of entries) {
        roll -= w + 0.4;
        if (roll <= 0) { picked = k; break; }
      }
      frontier.delete(picked);
      land.add(picked);
      const { q, r } = Hex.fromKey(picked);
      bump(q, r);
    }

    // --- fill single-hex holes ---
    const holes = [];
    for (const k of land) {
      const { q, r } = Hex.fromKey(k);
      for (const n of Hex.neighbors(q, r)) {
        const nk = Hex.key(n.q, n.r);
        if (land.has(nk)) continue;
        const landN = Hex.neighbors(n.q, n.r).filter(m => land.has(Hex.key(m.q, m.r))).length;
        if (landN >= 5) holes.push(nk);
      }
    }
    for (const k of holes) land.add(k);
    return land;
  },

  placePlayers(game, land, rng) {
    const keys = [...land];
    const n = game.players.length;
    const starts = [];
    // capitals need a reasonably solid footing (>= 4 land neighbors)
    const candidates = keys.filter(k => {
      const { q, r } = Hex.fromKey(k);
      return Hex.neighbors(q, r).filter(m => land.has(Hex.key(m.q, m.r))).length >= 4;
    });
    if (candidates.length < n) return false;

    let minDist = Math.max(5, Math.floor(Math.sqrt(land.size) * 0.95));
    while (minDist >= 3) {
      starts.length = 0;
      const shuffled = [...candidates].sort(() => rng() - 0.5);
      for (const k of shuffled) {
        const { q, r } = Hex.fromKey(k);
        if (starts.every(s => Hex.dist(s.q, s.r, q, r) >= minDist)) {
          starts.push({ q, r });
          if (starts.length === n) break;
        }
      }
      if (starts.length === n) break;
      minDist--;
    }
    if (starts.length < n) return false;
    game._starts = starts;
    return true;
  },

  applyStart(game) {
    game._starts.forEach((s, i) => {
      const pid = game.players[i].id;
      const cap = game.tiles.get(Hex.key(s.q, s.r));
      cap.owner = pid;
      cap.kind = 'capital';
      const ns = Hex.neighbors(s.q, s.r)
        .map(n => game.tiles.get(Hex.key(n.q, n.r)))
        .filter(Boolean);
      for (let j = 0; j < Math.min(3, ns.length); j++) {
        ns[j].owner = pid;
      }
    });
    delete game._starts;
  },

  // mountain ridges: impassable walls that create chokepoints,
  // rejected if they would split the passable map in two
  addRidges(game, rng, mountainDivisor = 110) {
    const tiles = [...game.tiles.values()];
    const ridgeCount = Math.max(2, Math.round(tiles.length / mountainDivisor));
    for (let i = 0; i < ridgeCount; i++) {
      for (let attempt = 0; attempt < 10; attempt++) {
        const t0 = tiles[(rng() * tiles.length) | 0];
        if (t0.owner || t0.kind !== 'plain') continue;
        let dir = (rng() * 6) | 0;
        let cur = t0;
        const ridge = [t0];
        const len = 3 + ((rng() * 5) | 0);
        for (let s = 0; s < len; s++) {
          if (rng() < 0.3) dir = (dir + (rng() < 0.5 ? 1 : 5)) % 6;
          const d = Hex.DIRS[dir];
          const nt = game.tiles.get(Hex.key(cur.q + d[0], cur.r + d[1]));
          if (!nt || nt.owner || nt.kind !== 'plain') break;
          ridge.push(nt);
          cur = nt;
        }
        if (ridge.length < 3) continue;
        // keep clear of starting territory
        const nearOwned = ridge.some(rt =>
          Hex.neighbors(rt.q, rt.r).some(nn => game.tiles.get(Hex.key(nn.q, nn.r))?.owner));
        if (nearOwned) continue;

        for (const rt of ridge) rt.kind = 'mountain';
        if (!MapGen.isPassableConnected(game)) {
          for (const rt of ridge) rt.kind = 'plain';
          continue;
        }
        break;
      }
    }
  },

  isPassableConnected(game) {
    let start = null, total = 0;
    for (const t of game.tiles.values()) {
      if (t.kind !== 'mountain') { total++; if (!start) start = t; }
    }
    if (!start) return false;
    const seen = new Set([Hex.key(start.q, start.r)]);
    const stack = [start];
    while (stack.length) {
      const t = stack.pop();
      for (const n of Hex.neighbors(t.q, t.r)) {
        const nk = Hex.key(n.q, n.r);
        const nt = game.tiles.get(nk);
        if (nt && nt.kind !== 'mountain' && !seen.has(nk)) {
          seen.add(nk);
          stack.push(nt);
        }
      }
    }
    return seen.size === total;
  },

  sprinkleTrees(game, rng) {
    for (const t of game.tiles.values()) {
      if (t.owner || t.kind !== 'plain' || t.strait) continue;
      const nearTree = Hex.neighbors(t.q, t.r)
        .some(n => game.tiles.get(Hex.key(n.q, n.r))?.tree);
      const p = nearTree ? 0.30 : 0.09;
      if (rng() < p) t.tree = true;
    }
  },
};
