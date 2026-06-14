'use strict';

// Hex map editor — paint terrain, forests, mountains, and start points.
const MapEditor = {
  active: false,
  cells: new Map(),   // key -> { q, r, ch }
  ghost: new Set(),   // editable hex positions (blank grid)
  tool: 'land',
  radius: 18,
  editId: null,
  cam: { x: 0, y: 0, scale: 1 },
  previewGame: null,
  previewRenderer: null,

  TOOLS: [
    ['land', 'Land'],
    ['erase', 'Erase'],
    ['mountain', 'Mountain'],
    ['forest', 'Forest'],
    ['start1', 'Start 1'],
    ['start2', 'Start 2'],
    ['start3', 'Start 3'],
    ['start4', 'Start 4'],
    ['start5', 'Start 5'],
    ['start6', 'Start 6'],
    ['start7', 'Start 7'],
    ['start8', 'Start 8'],
  ],

  open(mode, existingId) {
    this.active = true;
    this.tool = 'land';
    this.editId = existingId || null;
    this.cells.clear();
    this.ghost.clear();
    this.previewGame = null;
    this.previewRenderer = null;

    if (existingId) {
      const map = CustomMaps.get(existingId);
      if (map) this.importRows(map.rows);
      this.radius = 20;
    } else if (mode === 'full') {
      this._initGrid(this.radius);
      for (const k of this.ghost) {
        const h = Hex.fromKey(k);
        this.cells.set(k, { q: h.q, r: h.r, ch: '#' });
      }
    } else {
      this._initGrid(this.radius);
    }

    hideEl('menu-overlay');
    hideEl('hud-top');
    hideEl('hud-bottom');
    showEl('editor-bar');
    this._syncPreview();
    this._fitCamera();
    this._updateToolUi();
  },

  close() {
    this.active = false;
    this.previewGame = null;
    this.previewRenderer = null;
    hideEl('editor-bar');
    hideEl('editor-save-panel');
    showMenu();
  },

  _initGrid(radius) {
    this.radius = radius;
    this.ghost.clear();
    for (let q = -radius; q <= radius; q++) {
      for (let r = -radius; r <= radius; r++) {
        if (Hex.dist(0, 0, q, r) <= radius) this.ghost.add(Hex.key(q, r));
      }
    }
  },

  importRows(rows) {
    this.cells.clear();
    this.ghost.clear();
    rows.forEach((row, rowIdx) => {
      for (let col = 0; col < row.length; col++) {
        const ch = row[col];
        if (ch === '.' || ch === ' ' || ch === '~') continue;
        const q = col;
        const r = rowIdx - (col - (col & 1)) / 2;
        const k = Hex.key(q, r);
        this.cells.set(k, { q, r, ch });
        this.ghost.add(k);
      }
    });
    let maxD = 0;
    for (const c of this.cells.values()) maxD = Math.max(maxD, Hex.dist(0, 0, c.q, c.r));
    this._initGrid(Math.max(this.radius, maxD + 4));
  },

  exportRows() {
    if (!this.cells.size) return ['#'];
    let minQ = Infinity, maxQ = -Infinity, minRow = Infinity, maxRow = -Infinity;
    for (const c of this.cells.values()) {
      const row = c.r + (c.q - (c.q & 1)) / 2;
      minQ = Math.min(minQ, c.q); maxQ = Math.max(maxQ, c.q);
      minRow = Math.min(minRow, row); maxRow = Math.max(maxRow, row);
    }
    const rows = [];
    for (let row = minRow; row <= maxRow; row++) {
      let line = '';
      for (let q = minQ; q <= maxQ; q++) {
        const r = row - (q - (q & 1)) / 2;
        const c = this.cells.get(Hex.key(q, r));
        line += c ? c.ch : '.';
      }
      rows.push(line);
    }
    return rows;
  },

  applyTool(key) {
    if (!this.ghost.has(key) && !this.cells.has(key)) return;
    const h = Hex.fromKey(key);

    if (this.tool === 'erase') {
      this.cells.delete(key);
      this._syncPreview();
      return;
    }

    if (this.tool === 'land') {
      this.cells.set(key, { q: h.q, r: h.r, ch: '#' });
      this._syncPreview();
      return;
    }

    if (!this.cells.has(key)) this.cells.set(key, { q: h.q, r: h.r, ch: '#' });
    const cell = this.cells.get(key);

    if (this.tool === 'mountain') {
      cell.ch = '^';
    } else if (this.tool === 'forest') {
      cell.ch = 'T';
    } else if (this.tool.startsWith('start')) {
      const n = this.tool.slice(5);
      for (const c of this.cells.values()) if (c.ch === n) c.ch = '#';
      cell.ch = n;
    }
    this._syncPreview();
  },

  _syncPreview() {
    const tiles = new Map();
    for (const k of this.ghost) {
      if (this.cells.has(k)) continue;
      const h = Hex.fromKey(k);
      tiles.set(k, {
        q: h.q, r: h.r, owner: 0, kind: 'plain', towerLevel: 0,
        tree: false, strait: false, unit: null, money: 0,
      });
    }
    for (const [k, c] of this.cells) {
      const tile = {
        q: c.q, r: c.r, owner: 0, kind: 'plain', towerLevel: 0,
        tree: false, strait: false, unit: null, money: 0,
      };
      if (c.ch === '^') tile.kind = 'mountain';
      else if (c.ch === 'T' || c.ch === 't') tile.tree = true;
      else if (c.ch >= '1' && c.ch <= '8') {
        tile.kind = 'capital';
        tile.owner = +c.ch;
      }
      tiles.set(k, tile);
    }
    if (!this.previewGame) {
      this.previewGame = {
        tiles,
        round: 0,
        currentPlayer: { id: 0, color: NEUTRAL_COLOR, isAI: true },
        players: [{ id: 0, color: NEUTRAL_COLOR, isAI: true }],
        provinces: new Map(),
        tileProv: new Map(),
        winner: null,
        events: [],
      };
    } else {
      this.previewGame.tiles = tiles;
    }
    if (!this.previewRenderer && canvas) {
      this.previewRenderer = new Renderer(canvas, this.previewGame);
      Object.assign(this.previewRenderer.cam, this.cam);
    } else if (this.previewRenderer) {
      this.previewRenderer.game = this.previewGame;
    }
  },

  _fitCamera() {
    if (!this.previewRenderer) return;
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    const S = this.previewRenderer.hexSize;
    for (const k of this.ghost) {
      const h = Hex.fromKey(k);
      const p = Hex.toPixel(h.q, h.r, S);
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const mapW = maxX - minX + S * 3;
    const mapH = maxY - minY + S * 3;
    this.previewRenderer.cam.scale = Math.min(w / mapW, h / mapH, 1.4);
    this.previewRenderer.cam.x = (minX + maxX) / 2;
    this.previewRenderer.cam.y = (minY + maxY) / 2;
    Object.assign(this.cam, this.previewRenderer.cam);
  },

  draw(now) {
    if (!this.active || !this.previewRenderer) return;
    Object.assign(this.previewRenderer.cam, this.cam);
    this.previewRenderer.draw(now);
    this._drawGhostOverlay(this.previewRenderer);
  },

  _drawGhostOverlay(r) {
    const ctx = r.ctx;
    const S = r.hexSize;
    ctx.save();
    ctx.scale(r.dpr, r.dpr);
    const W = r.canvas.clientWidth, H = r.canvas.clientHeight;
    ctx.translate(W / 2, H / 2);
    ctx.scale(r.cam.scale, r.cam.scale);
    ctx.translate(-r.cam.x, -r.cam.y);
    for (const k of this.ghost) {
      if (this.cells.has(k)) continue;
      const h = Hex.fromKey(k);
      const p = Hex.toPixel(h.q, h.r, S);
      r.hexPath(ctx, p.x, p.y, S * 0.82);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  },

  _updateToolUi() {
    for (const [tool] of MapEditor.TOOLS) {
      const el = document.getElementById('ed-' + tool);
      if (el) el.classList.toggle('active', this.tool === tool);
    }
  },

  setTool(tool) {
    this.tool = tool;
    this._updateToolUi();
  },

  promptSave() {
    showEl('editor-save-panel');
    const input = $('editor-map-name');
    const del = $('editor-delete-map');
    if (del) del.classList.toggle('hidden', !this.editId);
    if (input) {
      input.value = this.editId && CustomMaps.get(this.editId)
        ? CustomMaps.get(this.editId).name : '';
      input.focus();
    }
  },

  saveCurrent() {
    const input = $('editor-map-name');
    const name = (input && input.value ? input.value : '').trim() || 'Custom Map';
    let starts = 0;
    for (const c of this.cells.values()) if (c.ch >= '1' && c.ch <= '8') starts++;
    if (starts < 2) {
      alert('Place at least 2 start points (S1–S8) before saving.');
      return;
    }
    if (!this.cells.size) {
      alert('Paint some land before saving.');
      return;
    }
    const rows = this.exportRows();
    if (this.editId) CustomMaps.update(this.editId, name, rows);
    else this.editId = CustomMaps.save(name, rows);
    hideEl('editor-save-panel');
    populateCustomMaps();
    this.close();
  },

  deleteCurrent() {
    if (this.editId && confirm('Delete this custom map permanently?')) {
      CustomMaps.delete(this.editId);
      populateCustomMaps();
    }
    this.close();
  },
};

function populateCustomMaps() {
  const sel = $('opt-map');
  if (!sel) return;
  for (const opt of [...sel.querySelectorAll('option[data-custom]')]) opt.remove();
  for (const m of CustomMaps.list()) {
    const opt = document.createElement('option');
    opt.value = 'custom:' + m.id;
    opt.textContent = m.name;
    opt.dataset.custom = '1';
    sel.appendChild(opt);
  }
  refreshMapOptions();
}

function refreshMapOptions() {
  const sel = $('opt-map');
  if (!sel) return;
  const val = sel.value;
  const custom = val.startsWith('custom:');
  const real = val !== 'random' && !custom;
  const rowSize = $('row-size');
  const rowAi = $('row-ai');
  const mapNote = $('map-note');
  if (rowSize) rowSize.classList.toggle('hidden', real || custom);
  if (rowAi) rowAi.classList.toggle('hidden', real || custom);
  if (mapNote) {
    mapNote.textContent = custom
      ? 'Player count follows start points on the custom map.'
      : 'Factions and start positions are set by the map.';
    mapNote.classList.toggle('hidden', !real && !custom);
  }
}
