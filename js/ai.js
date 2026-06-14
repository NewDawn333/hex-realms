'use strict';

// AI: performs one action per call so the UI can animate between steps.
// Returns true if it acted, false when it has nothing left to do.
const AI = {
  // value of capturing a tile
  targetValue(game, tile) {
    let v = 0;
    if (!tile.owner) v = tile.tree ? 5 : 4;
    else {
      v = 10;
      if (tile.kind === 'capital') v = 120;
      else if (tile.kind === 'city') v = 45;
      else if (tile.kind === 'town') v = 28;
      else if (tile.kind === 'tower') v = 18 + tile.towerLevel * 6;
      if (tile.unit) v += 8 + tile.unit.level * 7;
    }
    return v;
  },

  act(game, difficulty) {
    const pid = game.currentPlayer.id;
    const provs = game.provincesOf(pid);
    const lazy = difficulty === 'easy';

    // ---- 1. unit moves: best attack first ----
    let best = null;
    for (const prov of provs) {
      for (const k of prov.tiles) {
        const t = game.tiles.get(k);
        if (!t.unit || t.unit.moved) continue;
        if (lazy && game.rng() < 0.35) continue; // easy AI is sleepy
        const lm = game.legalMoves(k);
        for (const [tk, req] of lm.attacks) {
          const target = game.tiles.get(tk);
          // don't waste champions on empty plains
          const waste = t.unit.level - req;
          const v = this.targetValue(game, target) - waste * 3;
          if (!best || v > best.v) best = { v, from: k, to: tk, kind: 'move' };
        }
      }
    }
    if (best && best.v > 0) {
      game.moveUnit(best.from, best.to);
      return true;
    }

    // ---- 2. spend money ----
    for (const prov of provs) {
      if (this.spend(game, prov, difficulty)) return true;
    }

    // ---- 3. reposition idle units: chop own trees / push to frontier ----
    for (const prov of provs) {
      for (const k of prov.tiles) {
        const t = game.tiles.get(k);
        if (!t.unit || t.unit.moved) continue;
        if (lazy && game.rng() < 0.5) continue;
        const lm = game.legalMoves(k);
        // chop a tree in our land
        let dest = null;
        for (const mk of lm.moves) {
          if (game.tiles.get(mk).tree) { dest = mk; break; }
        }
        // else drift toward the border
        if (!dest) {
          let bestD = this.borderDistance(game, prov, k);
          for (const mk of lm.moves) {
            const d = this.borderDistance(game, prov, mk);
            if (d < bestD) { bestD = d; dest = mk; }
          }
        }
        if (dest) { game.moveUnit(k, dest); return true; }
        t.unit.moved = true; // nothing useful; don't reconsider
      }
    }
    return false;
  },

  borderDistance(game, prov, key) {
    // BFS distance to nearest non-owned neighbor within province
    const start = Hex.fromKey(key);
    const seen = new Set([key]);
    let ring = [start];
    for (let d = 0; d < 12; d++) {
      const next = [];
      for (const h of ring) {
        for (const n of Hex.neighbors(h.q, h.r)) {
          const nk = Hex.key(n.q, n.r);
          const nt = game.tiles.get(nk);
          if (!nt || nt.kind === 'mountain') continue;
          if (nt.owner !== prov.owner) return d;
          if (!seen.has(nk) && game.tileProv.get(nk) === prov.id) {
            seen.add(nk);
            next.push(n);
          }
        }
      }
      ring = next;
      if (!ring.length) break;
    }
    return 99;
  },

  spend(game, prov, difficulty) {
    const lazy = difficulty === 'easy';
    const smart = difficulty === 'hard';
    const minIncome = smart ? 1 : 0;

    // a) capture with a freshly hired unit — pick best value/cost
    let best = null;
    for (let lvl = 1; lvl <= 4; lvl++) {
      if (prov.money < RULES.UNIT_COST[lvl]) break;
      const newIncome = prov.income - RULES.UNIT_UPKEEP[lvl];
      if (newIncome < minIncome && !lazy) continue;
      for (const [k, mode] of game.unitPlacements(prov, lvl)) {
        if (mode !== 'capture') continue;
        const v = this.targetValue(game, game.tiles.get(k)) - RULES.UNIT_COST[lvl] * 0.4;
        if (!best || v > best.v) best = { v, k, lvl };
      }
    }
    if (best && best.v > 2 && !(lazy && game.rng() < 0.4)) {
      return game.buyUnit(prov.id, best.k, best.lvl);
    }

    // b) economy: towns & city upgrades (skip for easy AI half the time)
    if (!lazy || game.rng() < 0.5) {
      const townSpots = game.buildTargets(prov, 'town');
      if (townSpots.size && prov.money >= RULES.COST_TOWN + (smart ? 5 : 0)) {
        const k = [...townSpots][(game.rng() * townSpots.size) | 0];
        return game.build(prov.id, k, 'town');
      }
      const citySpots = game.buildTargets(prov, 'city');
      if (citySpots.size && prov.money >= RULES.COST_CITY_UPGRADE + 8) {
        return game.build(prov.id, [...citySpots][0], 'city');
      }
    }

    // c) hard AI: defensive towers on threatened border tiles
    if (smart && prov.money >= RULES.COST_TOWER + 10) {
      const spots = game.buildTargets(prov, 'tower');
      let bestSpot = null, bestThreat = 0;
      for (const k of spots) {
        const t = game.tiles.get(k);
        let threat = 0;
        for (const n of Hex.neighbors(t.q, t.r)) {
          const nt = game.tiles.get(Hex.key(n.q, n.r));
          if (nt && nt.owner && nt.owner !== prov.owner) threat += 1 + (nt.unit ? nt.unit.level : 0);
        }
        // also protect valuable interior
        if (game.protectionOf(t) === 0 && threat > bestThreat) {
          bestThreat = threat;
          bestSpot = k;
        }
      }
      if (bestSpot && bestThreat >= 3) return game.build(prov.id, bestSpot, 'tower');
    }

    // d) hire a garrison unit inside if rich and safe
    const cheapLvl = 1;
    if (prov.money >= RULES.UNIT_COST[cheapLvl] + 12 &&
        prov.income - RULES.UNIT_UPKEEP[cheapLvl] >= minIncome + 1) {
      for (const [k, mode] of game.unitPlacements(prov, cheapLvl)) {
        if (mode === 'chop') return game.buyUnit(prov.id, k, cheapLvl);
      }
    }
    return false;
  },
};
