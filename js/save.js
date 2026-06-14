'use strict';

// Persist in-progress games to localStorage (works in browser + Capacitor WebView).
window.SaveGame = {
  KEY: 'hex-realms-save',

  save(game, renderer) {
    if (!game || game.winner || game.replaying) return;
    try {
      const opts = game.opts || {};
      localStorage.setItem(this.KEY, JSON.stringify({
        v: 1,
        opts: {
          map: opts.map,
          size: opts.size,
          aiCount: opts.aiCount,
          difficulty: opts.difficulty,
        },
        seed: game.seed,
        snapshot: game.serialize(),
        camera: renderer ? {
          x: renderer.cam.x,
          y: renderer.cam.y,
          scale: renderer.cam.scale,
        } : null,
      }));
    } catch (_) { /* quota or private mode */ }
  },

  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (data.v !== 1 || !data.snapshot || !data.opts) return null;
      return data;
    } catch (_) {
      return null;
    }
  },

  hasSave() {
    return !!this.load();
  },

  clear() {
    try { localStorage.removeItem(this.KEY); } catch (_) {}
  },
};
