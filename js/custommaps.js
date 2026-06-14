'use strict';

// Player-created terrain maps stored in localStorage.
// Start positions are assigned randomly when a game begins.
const CustomMaps = {
  STORAGE: 'hex-realms-custom-maps',

  _read() {
    try {
      const raw = localStorage.getItem(this.STORAGE);
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
  },

  _write(maps) {
    try { localStorage.setItem(this.STORAGE, JSON.stringify(maps)); } catch (_) {}
  },

  list() {
    return this._read().map(m => ({ id: m.id, name: m.name }));
  },

  get(id) {
    return this._read().find(m => m.id === id) || null;
  },

  save(name, rows) {
    const maps = this._read();
    const id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    maps.push({ id, name: name.trim() || 'Custom Map', rows, createdAt: Date.now() });
    this._write(maps);
    return id;
  },

  update(id, name, rows) {
    const maps = this._read();
    const idx = maps.findIndex(m => m.id === id);
    if (idx < 0) return false;
    maps[idx] = Object.assign({}, maps[idx], {
      name: name.trim() || maps[idx].name,
      rows,
      updatedAt: Date.now(),
    });
    this._write(maps);
    return true;
  },

  delete(id) {
    this._write(this._read().filter(m => m.id !== id));
  },

  // Editor terrain chars only; legacy saves may contain player/tower markers.
  _normalizeChar(ch) {
    if (ch === '^') return '^';
    if (ch === 'T' || ch === 't') return 'T';
    if (ch === '=') return '=';
    if (ch === '#' || ch === '.') return '#';
    return null; // strip 1-8, w, b, etc.
  },

  loadTerrain(game, rows) {
    game.tiles.clear();
    rows.forEach((row, rowIdx) => {
      for (let col = 0; col < row.length; col++) {
        const norm = this._normalizeChar(row[col]);
        if (!norm) continue;
        const q = col;
        const r = rowIdx - (col - (col & 1)) / 2;
        const tile = {
          q, r, owner: 0, kind: 'plain', towerLevel: 0,
          tree: false, strait: false, unit: null, money: 0,
        };
        if (norm === '^') tile.kind = 'mountain';
        else if (norm === '=') tile.strait = true;
        else if (norm === 'T') tile.tree = true;
        game.tiles.set(Hex.key(q, r), tile);
      }
    });
    if (!rows.some(r => /[Tt]/.test(r))) {
      MapGen.sprinkleTrees(game, game.rng);
    }
  },

  placePlayers(game) {
    const land = new Set();
    for (const [k, t] of game.tiles) {
      if (t.kind !== 'mountain') land.add(k);
    }
    const n = game.players.length;
    if (land.size < n * 2) {
      throw new Error('Custom map is too small for ' + n + ' players.');
    }

    if (!MapGen.placePlayers(game, land, game.rng)) {
      const keys = [...land].sort(() => game.rng() - 0.5);
      const starts = [];
      for (const k of keys) {
        const { q, r } = Hex.fromKey(k);
        if (starts.every(s => Hex.dist(s.q, s.r, q, r) >= 2)) {
          starts.push({ q, r });
          if (starts.length === n) break;
        }
      }
      if (starts.length < n) {
        throw new Error('Could not place ' + n + ' players on this map. Try fewer opponents.');
      }
      game._starts = starts;
    }
    MapGen.applyStart(game);
  },

  build(game, id) {
    const map = this.get(id);
    if (!map) throw new Error('Custom map not found');
    this.loadTerrain(game, map.rows);
    this.placePlayers(game);
  },
};
