'use strict';

// Player-created scenario maps stored in localStorage.
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

  startCount(id) {
    const map = this.get(id);
    if (!map) return 2;
    let n = 0;
    for (const row of map.rows) {
      for (const ch of row) if (ch >= '1' && ch <= '8') n++;
    }
    return Math.max(2, n || 2);
  },

  build(game, id) {
    const map = this.get(id);
    if (!map) throw new Error('Custom map not found');
    RealMaps.buildFromRows(game, map.rows, map.factions || []);
  },
};
