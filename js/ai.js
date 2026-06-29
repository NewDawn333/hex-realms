'use strict';

// AI: one action per call; the UI batches a full turn before updating the map.
const AI = {
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
        if (lazy && game.rng() < 0.35) continue;
        const lm = game.legalMoves(k);
        for (const [tk, req] of lm.attacks) {
          const target = game.tiles.get(tk);
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

    // ---- 2. spend money (best action across all provinces) ----
    let bestSpend = null;
    for (const prov of provs) {
      const plan = this.planSpend(game, prov, difficulty);
      if (plan && (!bestSpend || plan.v > bestSpend.v)) bestSpend = plan;
    }
    if (bestSpend && this.executeSpend(game, bestSpend)) return true;

    // ---- 3. reposition idle units: chop own trees / push to frontier ----
    for (const prov of provs) {
      for (const k of prov.tiles) {
        const t = game.tiles.get(k);
        if (!t.unit || t.unit.moved) continue;
        if (lazy && game.rng() < 0.5) continue;
        const lm = game.legalMoves(k);
        let dest = null;
        for (const mk of lm.moves) {
          if (game.tiles.get(mk).tree) { dest = mk; break; }
        }
        if (!dest) {
          let bestD = this.borderDistance(game, prov, k);
          for (const mk of lm.moves) {
            const d = this.borderDistance(game, prov, mk);
            if (d < bestD) { bestD = d; dest = mk; }
          }
        }
        if (dest) { game.moveUnit(k, dest); return true; }
        t.unit.moved = true;
      }
    }
    return false;
  },

  executeSpend(game, plan) {
    if (plan.kind === 'capture' || plan.kind === 'chop') {
      return game.buyUnit(plan.provId, plan.key, plan.lvl);
    }
    return game.build(plan.provId, plan.key, plan.kind);
  },

  buildCost(what) {
    if (what === 'town') return RULES.COST_TOWN;
    if (what === 'city') return RULES.COST_CITY_UPGRADE;
    if (what === 'city_new') return RULES.COST_CITY_NEW;
    if (what === 'tower') return RULES.COST_TOWER;
    return 0;
  },

  // Steps from key to the nearest enemy-owned tile.
  enemyDistance(game, pid, key) {
    const start = Hex.fromKey(key);
    const seen = new Set([key]);
    let ring = [start];
    for (let d = 1; d <= 16; d++) {
      const next = [];
      for (const h of ring) {
        for (const n of Hex.neighbors(h.q, h.r)) {
          const nk = Hex.key(n.q, n.r);
          if (seen.has(nk)) continue;
          seen.add(nk);
          const nt = game.tiles.get(nk);
          if (!nt || nt.kind === 'mountain') continue;
          if (nt.owner && nt.owner !== pid) return d;
          next.push(n);
        }
      }
      ring = next;
      if (!ring.length) break;
    }
    return 99;
  },

  borderDistance(game, prov, key) {
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

  interiorScore(game, prov, key) {
    const enemyD = this.enemyDistance(game, prov.owner, key);
    const borderD = this.borderDistance(game, prov, key);
    return Math.min(enemyD, 12) * 2.2 + Math.min(borderD, 9);
  },

  provinceThreat(game, prov) {
    let threat = 0;
    for (const k of prov.tiles) {
      if (this.borderDistance(game, prov, k) > 2) continue;
      const t = game.tiles.get(k);
      for (const n of Hex.neighbors(t.q, t.r)) {
        const nt = game.tiles.get(Hex.key(n.q, n.r));
        if (nt && nt.owner && nt.owner !== prov.owner) {
          threat += 2 + (nt.unit ? nt.unit.level * 2 : 0);
        }
      }
    }
    return threat;
  },

  economyValue(game, prov, key, what, difficulty) {
    const smart = difficulty === 'hard';
    const safety = this.interiorScore(game, prov, key);
    const incomeGain = what === 'town' ? 1 : what === 'city' ? 2 : what === 'city_new' ? 3 : 0;
    const cost = this.buildCost(what);
    let v = incomeGain * 11 + safety * (smart ? 4.5 : 2.5) - cost * 0.25;

    if (game.round <= 8 && what === 'town') v += smart ? 10 : 5;
    if (game.round > 12 && (what === 'city' || what === 'city_new')) v += smart ? 8 : 4;
    if (prov.income < prov.tiles.size * 0.75) v += 6;

    const enemyD = this.enemyDistance(game, prov.owner, key);
    if (enemyD >= 6) v += smart ? 12 : 6;
    else if (enemyD <= 2) v -= smart ? 15 : 8;

    return v;
  },

  planEconomy(game, prov, difficulty) {
    const lazy = difficulty === 'easy';
    const smart = difficulty === 'hard';
    const normal = difficulty === 'normal';
    const reserve = smart ? 6 : normal ? 4 : 2;
    let best = null;

    const consider = (what, minSafety) => {
      const cost = this.buildCost(what);
      if (prov.money < cost + reserve) return;
      for (const k of game.buildTargets(prov, what)) {
        const safety = this.interiorScore(game, prov, k);
        if (safety < minSafety) continue;
        const v = this.economyValue(game, prov, k, what, difficulty);
        if (!best || v > best.v) {
          best = { v, provId: prov.id, key: k, kind: what };
        }
      }
    };

    if (smart || normal) {
      consider('city', 2);
      consider('city_new', smart ? 4 : 3);
      consider('town', smart ? 3 : 2);
    } else if (!lazy || game.rng() < 0.55) {
      consider('city', 0);
      consider('town', 1);
    }

    return best;
  },

  planCaptureBuy(game, prov, difficulty) {
    const lazy = difficulty === 'easy';
    const smart = difficulty === 'hard';
    const minIncome = smart ? 1 : 0;
    let best = null;

    for (let lvl = 1; lvl <= 4; lvl++) {
      if (prov.money < RULES.UNIT_COST[lvl]) break;
      const newIncome = prov.income - RULES.UNIT_UPKEEP[lvl];
      if (newIncome < minIncome && !lazy) continue;
      for (const [k, mode] of game.unitPlacements(prov, lvl)) {
        if (mode !== 'capture') continue;
        const v = this.targetValue(game, game.tiles.get(k)) - RULES.UNIT_COST[lvl] * 0.4;
        if (!best || v > best.v) {
          best = { v, provId: prov.id, key: k, lvl, kind: 'capture' };
        }
      }
    }
    return best;
  },

  planTower(game, prov, difficulty) {
    if (difficulty !== 'hard' || prov.money < RULES.COST_TOWER + 10) return null;
    const spots = game.buildTargets(prov, 'tower');
    let best = null;
    for (const k of spots) {
      const t = game.tiles.get(k);
      let threat = 0;
      for (const n of Hex.neighbors(t.q, t.r)) {
        const nt = game.tiles.get(Hex.key(n.q, n.r));
        if (nt && nt.owner && nt.owner !== prov.owner) {
          threat += 1 + (nt.unit ? nt.unit.level : 0);
        }
      }
      if (game.protectionOf(t) === 0 && threat > 0) {
        const v = threat * 3.5;
        if (!best || v > best.v) best = { v, provId: prov.id, key: k, kind: 'tower' };
      }
    }
    if (best && best.v >= 10) return best;
    return null;
  },

  planChop(game, prov, difficulty) {
    const smart = difficulty === 'hard';
    const minIncome = smart ? 1 : 0;
    if (prov.money < RULES.UNIT_COST[1] + 12) return null;
    if (prov.income - RULES.UNIT_UPKEEP[1] < minIncome + 1) return null;
    for (const [k, mode] of game.unitPlacements(prov, 1)) {
      if (mode === 'chop') {
        return { v: 6, provId: prov.id, key: k, lvl: 1, kind: 'chop' };
      }
    }
    return null;
  },

  pickSpend(game, prov, difficulty, cap, eco, tower, chop) {
    const lazy = difficulty === 'easy';
    const smart = difficulty === 'hard';
    const normal = difficulty === 'normal';
    const threat = this.provinceThreat(game, prov);

    if (tower && tower.v >= 14) return tower;

    if (cap && eco) {
      if (smart) {
        if (cap.v >= 40) return cap;
        if (eco.v >= 13 && threat < 10) {
          if (cap.v < 22 || eco.v >= cap.v * 0.68) return eco;
        }
        if (cap.v < 11 && eco.v > cap.v) return eco;
      } else if (normal) {
        if (cap.v >= 30) return cap;
        if (eco.v >= 12 && cap.v < 16) return eco;
      }
      if (cap.v > 2 && !(lazy && game.rng() < 0.4)) return cap;
      if (eco && (!lazy || game.rng() < 0.55)) return eco;
      return cap;
    }

    if (cap && cap.v > 2 && !(lazy && game.rng() < 0.4)) return cap;
    if (eco && (!lazy || game.rng() < 0.55)) return eco;
    if (tower) return tower;
    return chop;
  },

  planSpend(game, prov, difficulty) {
    const cap = this.planCaptureBuy(game, prov, difficulty);
    const eco = this.planEconomy(game, prov, difficulty);
    const tower = this.planTower(game, prov, difficulty);
    const chop = this.planChop(game, prov, difficulty);
    return this.pickSpend(game, prov, difficulty, cap, eco, tower, chop);
  },
};
