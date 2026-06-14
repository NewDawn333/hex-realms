'use strict';

// Canvas renderer: sea background, beveled land tiles, cached vector
// sprites, pulsing highlights, sliding unit animations.
class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    this.hexSize = 36;            // world units per hex
    this.cam = { x: 0, y: 0, scale: 1 };
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    // visual state fed by UI
    this.selectedProv = null;     // province id
    this.selectedUnitKey = null;
    this.highlightMoves = new Set();
    this.highlightAttacks = new Set();
    this.highlightBuild = new Set();

    this.anims = [];              // {type:'slide'|'pop'|'flash'|'float', ...}
    this.hiddenUnits = new Set(); // unit hidden while its slide anim runs
    this.t = 0;

    this.resize();
    this.fitToMap();
  }

  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.canvas.width = w * this.dpr;
    this.canvas.height = h * this.dpr;
  }

  fitToMap() {
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const t of this.game.tiles.values()) {
      const p = Hex.toPixel(t.q, t.r, this.hexSize);
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const mapW = maxX - minX + this.hexSize * 3;
    const mapH = maxY - minY + this.hexSize * 3;
    this.cam.scale = Math.min(w / mapW, h / mapH, 1.6);
    this.cam.x = (minX + maxX) / 2;
    this.cam.y = (minY + maxY) / 2;
  }

  worldToScreen(x, y) {
    return {
      x: (x - this.cam.x) * this.cam.scale + this.canvas.clientWidth / 2,
      y: (y - this.cam.y) * this.cam.scale + this.canvas.clientHeight / 2,
    };
  }

  screenToWorld(x, y) {
    return {
      x: (x - this.canvas.clientWidth / 2) / this.cam.scale + this.cam.x,
      y: (y - this.canvas.clientHeight / 2) / this.cam.scale + this.cam.y,
    };
  }

  hexAtScreen(x, y) {
    const w = this.screenToWorld(x, y);
    const h = Hex.round((2 / 3 * w.x) / this.hexSize,
      (-1 / 3 * w.x + Math.sqrt(3) / 3 * w.y) / this.hexSize);
    return Hex.key(h.q, h.r);
  }

  // ---------- animations ----------
  addSlide(fromKey, toKey, unitLevel, owner, dur = 220) {
    const a = Hex.fromKey(fromKey), b = Hex.fromKey(toKey);
    this.anims.push({
      type: 'slide', t0: performance.now(), dur,
      from: Hex.toPixel(a.q, a.r, this.hexSize),
      to: Hex.toPixel(b.q, b.r, this.hexSize),
      unitLevel, owner, key: toKey,
    });
    this.hiddenUnits.add(toKey);
  }

  addPop(key) {
    this.anims.push({ type: 'pop', t0: performance.now(), dur: 320, key });
  }

  addFloatText(key, text, color = '#ffe27a') {
    const h = Hex.fromKey(key);
    this.anims.push({
      type: 'float', t0: performance.now(), dur: 900,
      pos: Hex.toPixel(h.q, h.r, this.hexSize), text, color,
    });
  }

  // ---------- drawing ----------
  draw(now) {
    this.t = now / 1000;
    const ctx = this.ctx;
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    // sea
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#1d3a52');
    grad.addColorStop(1, '#14283a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    this.drawWaves(ctx, W, H);

    ctx.translate(W / 2, H / 2);
    ctx.scale(this.cam.scale, this.cam.scale);
    ctx.translate(-this.cam.x, -this.cam.y);

    const S = this.hexSize;
    const tiles = [...this.game.tiles.values()];

    // pass 1: tile bases (+ coast shadow)
    for (const t of tiles) {
      const p = Hex.toPixel(t.q, t.r, S);
      this.drawTileBase(ctx, t, p.x, p.y, S);
    }
    // pass 2: highlights
    this.drawHighlights(ctx, S);
    // pass 3: contents sorted by y so sprites overlap nicely
    const sorted = tiles.slice().sort((a, b) =>
      Hex.toPixel(a.q, a.r, S).y - Hex.toPixel(b.q, b.r, S).y);
    for (const t of sorted) {
      const p = Hex.toPixel(t.q, t.r, S);
      this.drawTileContents(ctx, t, p.x, p.y, S);
    }
    // pass 4: animations
    this.drawAnims(ctx, S);

    ctx.restore();
  }

  drawWaves(ctx, W, H) {
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.strokeStyle = '#bfe3ff';
    ctx.lineWidth = 1.5;
    const t = this.t * 0.4;
    for (let i = 0; i < 7; i++) {
      const y = ((i * 0.15 + (t * 0.02 % 0.15)) % 1.05) * H;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 14) {
        const yy = y + Math.sin(x * 0.02 + t + i * 1.7) * 5;
        if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  tileColors(t) {
    if (t.kind === 'mountain') return MOUNTAIN_COLOR;
    if (t.strait && !t.owner) return STRAIT_COLOR;
    if (!t.owner) return NEUTRAL_COLOR;
    return this.game.players[t.owner - 1].color;
  }

  hexPath(ctx, x, y, s) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 3 * i;
      const px = x + s * Math.cos(a), py = y + s * Math.sin(a);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  drawTileBase(ctx, t, x, y, S) {
    const c = this.tileColors(t);
    // coast shadow
    ctx.save();
    this.hexPath(ctx, x, y + 4, S * 0.98);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();
    ctx.restore();

    // body with subtle vertical bevel
    const g = ctx.createLinearGradient(x, y - S, x, y + S);
    g.addColorStop(0, c.light);
    g.addColorStop(0.25, c.main);
    g.addColorStop(1, c.dark);
    this.hexPath(ctx, x, y, S * 0.98);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // strait: watery overlay + wave marks so it reads as a ferry crossing
    if (t.strait) {
      this.hexPath(ctx, x, y, S * 0.98);
      ctx.fillStyle = 'rgba(36, 92, 138, 0.55)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(200, 230, 255, 0.45)';
      ctx.lineWidth = 1.6;
      for (const dy of [-S * 0.25, S * 0.15]) {
        ctx.beginPath();
        for (let i = -2; i <= 2; i++) {
          const px = x + i * S * 0.18;
          const py = y + dy + (i % 2 === 0 ? 1.6 : -1.6);
          if (i === -2) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    }

    // selected province glow
    if (this.selectedProv !== null &&
        this.game.tileProv.get(Hex.key(t.q, t.r)) === this.selectedProv) {
      const pulse = 0.5 + 0.22 * Math.sin(this.t * 4);
      this.hexPath(ctx, x, y, S * 0.9);
      ctx.strokeStyle = `rgba(255,255,255,${pulse * 0.65})`;
      ctx.lineWidth = 2.2;
      ctx.stroke();
    }
  }

  drawHighlights(ctx, S) {
    const pulse = 0.45 + 0.25 * Math.sin(this.t * 5);
    const paint = (keys, fill, stroke) => {
      for (const k of keys) {
        const h = Hex.fromKey(k);
        const p = Hex.toPixel(h.q, h.r, S);
        this.hexPath(ctx, p.x, p.y, S * 0.82);
        ctx.fillStyle = fill(pulse);
        ctx.fill();
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    };
    paint(this.highlightMoves, a => `rgba(255,255,255,${a * 0.45})`, 'rgba(255,255,255,0.85)');
    paint(this.highlightAttacks, a => `rgba(255,80,60,${a * 0.55})`, 'rgba(255,120,90,0.95)');
    paint(this.highlightBuild, a => `rgba(120,220,255,${a * 0.5})`, 'rgba(150,225,255,0.9)');

    if (this.selectedUnitKey) {
      const h = Hex.fromKey(this.selectedUnitKey);
      const p = Hex.toPixel(h.q, h.r, S);
      this.hexPath(ctx, p.x, p.y, S * 0.9);
      ctx.strokeStyle = '#ffe27a';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  drawTileContents(ctx, t, x, y, S) {
    const key = Hex.key(t.q, t.r);
    const px = Math.round(S * 1.9 * this.cam.scale * this.dpr) || 1;
    const drawSprite = (name, scale = 1, dy = 0, dx = 0, alpha = 1) => {
      const img = Sprites.get(name, 128);
      const sz = S * 1.9 * scale;
      ctx.globalAlpha = alpha;
      ctx.drawImage(img, x - sz / 2 + dx, y - sz / 2 + dy - sz * 0.08, sz, sz);
      ctx.globalAlpha = 1;
    };

    if (t.kind === 'mountain') {
      drawSprite('mountain', 0.95);
      return;
    }

    if (t.tree) {
      const sway = Math.sin(this.t * 1.3 + t.q * 2.1 + t.r) * 1.2;
      drawSprite('tree', 0.78, 0, sway);
    }

    if (t.kind === 'capital') {
      drawSprite('capital', 0.95);
      // treasury badge
      const prov = this.game.provinceOfTile(key);
      if (prov) this.drawMoneyBadge(ctx, x, y + S * 0.62, prov, S);
    } else if (t.kind === 'town') {
      drawSprite('town', 0.8);
    } else if (t.kind === 'city') {
      drawSprite('city', 0.92);
    } else if (t.kind === 'tower') {
      drawSprite(t.towerLevel === 2 ? 'tower2' : 'tower1', 0.85);
    }

    if (t.unit && !this.hiddenUnits.has(key)) {
      const isMine = t.owner === this.game.currentPlayer.id && !this.game.currentPlayer.isAI;
      const ready = isMine && !t.unit.moved && !this.game.winner;
      const bob = ready ? Math.sin(this.t * 5 + t.q * 3 + t.r * 5) * 2.2 : 0;
      drawSprite('unit' + t.unit.level, 0.8, bob, 0, t.unit.moved && isMine ? 0.62 : 1);
    }
  }

  drawMoneyBadge(ctx, x, y, prov, S) {
    const text = String(prov.money);
    const inc = prov.income;
    const incText = (inc >= 0 ? '+' : '') + inc;
    ctx.save();
    ctx.font = `bold ${S * 0.42}px "Trebuchet MS", sans-serif`;
    const w = ctx.measureText(text + ' ' + incText).width + S * 0.65;
    const h = S * 0.56;
    ctx.fillStyle = 'rgba(20,22,28,0.82)';
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    roundRect(ctx, x - w / 2, y - h / 2, w, h, h / 2);
    ctx.fill(); ctx.stroke();
    // coin dot
    ctx.fillStyle = '#e8c247';
    ctx.beginPath();
    ctx.arc(x - w / 2 + h * 0.5, y, h * 0.27, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x - w / 2 + h * 0.92, y + 1);
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = inc >= 0 ? '#9be89b' : '#ff9a8a';
    ctx.fillText(incText, x - w / 2 + h * 0.92 + tw + S * 0.14, y + 1);
    ctx.restore();
  }

  drawAnims(ctx, S) {
    const now = performance.now();
    this.anims = this.anims.filter(a => {
      const k = Math.min(1, (now - a.t0) / a.dur);
      if (a.type === 'slide') {
        const e = 1 - Math.pow(1 - k, 3); // easeOutCubic
        const x = a.from.x + (a.to.x - a.from.x) * e;
        const y = a.from.y + (a.to.y - a.from.y) * e - Math.sin(e * Math.PI) * 10;
        const img = Sprites.get('unit' + a.unitLevel, 128);
        const sz = S * 1.9 * 0.8;
        ctx.drawImage(img, x - sz / 2, y - sz / 2 - sz * 0.08, sz, sz);
        if (k >= 1) { this.hiddenUnits.delete(a.key); return false; }
        return true;
      }
      if (a.type === 'pop') {
        const h = Hex.fromKey(a.key);
        const p = Hex.toPixel(h.q, h.r, S);
        this.hexPath(ctx, p.x, p.y, S * (0.4 + k * 0.75));
        ctx.strokeStyle = `rgba(255,255,255,${1 - k})`;
        ctx.lineWidth = 3 * (1 - k) + 0.5;
        ctx.stroke();
        return k < 1;
      }
      if (a.type === 'float') {
        ctx.save();
        ctx.font = `bold ${S * 0.5}px "Trebuchet MS", sans-serif`;
        ctx.textAlign = 'center';
        ctx.globalAlpha = 1 - k * k;
        ctx.fillStyle = a.color;
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 3;
        const y = a.pos.y - S * 0.6 - k * S * 0.9;
        ctx.strokeText(a.text, a.pos.x, y);
        ctx.fillText(a.text, a.pos.x, y);
        ctx.restore();
        return k < 1;
      }
      return false;
    });
  }
}
