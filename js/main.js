'use strict';

let game = null;
let renderer = null;
const HUMAN = 1;

const sel = {
  provId: null,
  unitKey: null,
  build: null,     // {type:'unit', level} | {type:'town'|'tower'|'upgrade'}
  buildMap: null,  // key -> {provId, action} computed for the active build mode
};

const $ = (id) => document.getElementById(id);
const canvas = $('game-canvas');

// ============================================================
//  Game lifecycle
// ============================================================
function newGame() {
  const opts = {
    map: $('opt-map').value,
    size: $('opt-size').value,
    aiCount: +$('opt-ai').value,
    difficulty: $('opt-diff').value,
  };
  game = new Game(opts);
  renderer = new Renderer(canvas, game);
  clearSelection();
  $('menu-overlay').classList.add('hidden');
  $('gameover-overlay').classList.add('hidden');
  $('hud-top').classList.remove('hidden');
  $('hud-bottom').classList.remove('hidden');
  Audio2.ensure();
  if (Audio2.musicOn) Audio2.startMusic();
  drainEvents();
  updateHud();
  maybeRunAI();
}

function showMenu() {
  $('menu-overlay').classList.remove('hidden');
}

function gameOver(victory) {
  $('go-title').textContent = victory ? 'Victory!' : 'Defeat';
  $('go-title').className = victory ? 'victory' : 'defeat';
  $('go-text').textContent = victory
    ? 'All rival realms have fallen. The island is yours.'
    : 'Your realm has crumbled. Better luck next conquest.';
  $('gameover-overlay').classList.remove('hidden');
  if (victory) Audio2.victory(); else Audio2.defeat();
}

// ============================================================
//  Selection / actions
// ============================================================
function clearSelection() {
  sel.provId = null;
  sel.unitKey = null;
  sel.build = null;
  sel.buildMap = null;
  if (renderer) {
    renderer.selectedProv = null;
    renderer.selectedUnitKey = null;
    renderer.highlightMoves.clear();
    renderer.highlightAttacks.clear();
    renderer.highlightBuild.clear();
  }
}

// Build modes work across ALL of the player's provinces at once; each
// candidate hex remembers which province pays (richest wins conflicts).
function refreshHighlights() {
  renderer.selectedProv = sel.provId;
  renderer.selectedUnitKey = sel.unitKey;
  renderer.highlightMoves.clear();
  renderer.highlightAttacks.clear();
  renderer.highlightBuild.clear();
  sel.buildMap = null;

  if (sel.build) {
    sel.buildMap = new Map();
    const claim = (k, provId, action) => {
      const prev = sel.buildMap.get(k);
      if (!prev || game.provinces.get(provId).money > game.provinces.get(prev.provId).money) {
        sel.buildMap.set(k, { provId, action });
      }
    };
    for (const prov of game.provincesOf(HUMAN)) {
      if (sel.build.type === 'unit') {
        for (const [k, mode] of game.unitPlacements(prov, sel.build.level)) {
          claim(k, prov.id, 'unit');
          (mode === 'capture' ? renderer.highlightAttacks : renderer.highlightBuild).add(k);
        }
      } else if (sel.build.type === 'town' || sel.build.type === 'tower') {
        for (const k of game.buildTargets(prov, sel.build.type)) {
          claim(k, prov.id, sel.build.type);
          renderer.highlightBuild.add(k);
        }
      } else if (sel.build.type === 'upgrade') {
        for (const k of game.buildTargets(prov, 'city')) {
          claim(k, prov.id, 'city');
          renderer.highlightBuild.add(k);
        }
        for (const k of game.buildTargets(prov, 'tower2')) {
          claim(k, prov.id, 'tower2');
          renderer.highlightBuild.add(k);
        }
      }
    }
  } else if (sel.unitKey) {
    const lm = game.legalMoves(sel.unitKey);
    for (const k of lm.moves) renderer.highlightMoves.add(k);
    for (const k of lm.attacks.keys()) renderer.highlightAttacks.add(k);
  }
}

function humanCanAct() {
  return game && !game.winner && game.currentPlayer.id === HUMAN &&
    game.players[HUMAN - 1].alive;
}

function onTap(key) {
  if (!humanCanAct()) return;
  const t = game.tiles.get(key);

  // build placement (mode stays active for rapid repeat placement)
  if (sel.build && sel.buildMap && sel.buildMap.has(key)) {
    const { provId, action } = sel.buildMap.get(key);
    const acted = action === 'unit'
      ? game.buyUnit(provId, key, sel.build.level)
      : game.build(provId, key, action);
    if (acted) {
      reselectProvince();
      afterAction();
      // drop the mode automatically once nothing else can be placed
      if (sel.build && renderer.highlightBuild.size + renderer.highlightAttacks.size === 0) {
        sel.build = null;
        refreshHighlights();
        updateHud();
      }
      return;
    }
    Audio2.error();
    refreshHighlights();
    updateHud();
    return;
  }
  if (sel.build) {
    // tapped outside the highlights: leave build mode, treat as a normal tap
    sel.build = null;
  }

  // unit move
  if (sel.unitKey && sel.unitKey !== key) {
    const lm = game.legalMoves(sel.unitKey);
    if (lm.moves.has(key) || lm.attacks.has(key)) {
      const fromKey = sel.unitKey;
      game.moveUnit(fromKey, key);
      sel.unitKey = null;
      reselectProvince();
      afterAction();
      return;
    }
  }

  // selection
  if (t && t.owner === HUMAN) {
    const provId = game.tileProv.get(key);
    if (provId !== undefined) {
      sel.provId = provId;
      sel.unitKey = (t.unit && !t.unit.moved) ? key : null;
      sel.build = null;
      Audio2.select();
      refreshHighlights();
      updateHud();
      return;
    }
  }
  clearSelection();
  refreshHighlights();
  updateHud();
}

function reselectProvince() {
  // province ids may change after recompute; re-resolve from any owned tile
  if (sel.provId !== null && !game.provinces.has(sel.provId)) {
    sel.provId = null;
  }
}

function afterAction() {
  drainEvents();
  refreshHighlights();
  updateHud();
  if (game.winner) endCheck();
}

function endCheck() {
  if (game.winner === HUMAN) gameOver(true);
  else if (game.winner) gameOver(false);
  else if (!game.players[HUMAN - 1].alive) gameOver(false);
}

function setBuildMode(mode) {
  if (!humanCanAct()) { Audio2.error(); return; }
  if (sel.build && JSON.stringify(sel.build) === JSON.stringify(mode)) {
    sel.build = null; // toggle off
  } else {
    sel.build = mode;
    sel.unitKey = null;
    Audio2.select();
  }
  refreshHighlights();
  updateHud();
}

function endTurn() {
  if (!humanCanAct()) return;
  clearSelection();
  game.endTurn();
  Audio2.turn();
  drainEvents();
  refreshHighlights();
  updateHud();
  endCheck();
  maybeRunAI();
}

// ============================================================
//  AI loop
// ============================================================
let aiTimer = null;

function maybeRunAI() {
  if (!game || game.winner) return;
  if (!game.currentPlayer.isAI) { updateHud(); return; }
  const diff = game.opts.difficulty;
  const stepDelay = game.tiles.size > 200 ? 90 : 150;
  let actionsThisTurn = 0;

  const step = () => {
    if (!game || game.winner) { endCheck(); return; }
    if (!game.currentPlayer.isAI) { updateHud(); return; }
    const acted = AI.act(game, diff);
    drainEvents();
    updateHud();
    if (game.winner) { endCheck(); return; }
    if (acted) {
      // adaptive pacing: first moves are watchable, long turns fast-forward
      actionsThisTurn++;
      const delay = actionsThisTurn > 40 ? 0 : actionsThisTurn > 12 ? 35 : stepDelay;
      aiTimer = setTimeout(step, delay);
    } else {
      actionsThisTurn = 0;
      game.endTurn();
      drainEvents();
      updateHud();
      if (game.winner || !game.players[HUMAN - 1].alive) { endCheck(); return; }
      if (game.currentPlayer.isAI) {
        aiTimer = setTimeout(step, 320);
      } else {
        Audio2.turn();
        updateHud();
      }
    }
  };
  aiTimer = setTimeout(step, 380);
}

// ============================================================
//  Events -> fx
// ============================================================
function drainEvents() {
  if (!game || !renderer) return;
  let starved = false;
  for (const ev of game.events) {
    switch (ev.type) {
      case 'move': {
        const u = game.tiles.get(ev.to).unit;
        if (u) renderer.addSlide(ev.from, ev.to, u.level, null);
        Audio2.step();
        break;
      }
      case 'capture': {
        const u = game.tiles.get(ev.to)?.unit;
        if (ev.from && u) renderer.addSlide(ev.from, ev.to, u.level, null);
        renderer.addPop(ev.to);
        Audio2.capture();
        break;
      }
      case 'chop':
        renderer.addFloatText(ev.key, '+' + RULES.TREE_CHOP_GOLD);
        renderer.addPop(ev.key);
        Audio2.chop();
        break;
      case 'merge':
      case 'spawn':
        renderer.addPop(ev.key);
        Audio2.spawn();
        break;
      case 'build':
        renderer.addPop(ev.key);
        Audio2.build();
        break;
      case 'starve':
        renderer.addFloatText(ev.key, '✝', '#ccc');
        starved = true;
        break;
      case 'treegrow':
        renderer.addPop(ev.key);
        break;
      case 'gameover':
        break;
    }
  }
  if (starved) Audio2.starve();
  game.events.length = 0;
}

// ============================================================
//  HUD
// ============================================================
function updateHud() {
  if (!game) return;
  const p = game.currentPlayer;
  const scenario = game.opts.map && game.opts.map !== 'random';
  $('hud-round').textContent = 'Round ' + game.round;
  const chip = $('hud-player');
  chip.textContent = p.id === HUMAN
    ? 'Your turn' + (scenario ? ` — ${p.name}` : '')
    : `${p.name} (AI)…`;
  chip.style.background = p.color.main;

  // gold panel: selected province, or totals across the whole realm
  const myProvs = game.provincesOf(HUMAN);
  const prov = sel.provId !== null ? game.provinces.get(sel.provId) : null;
  const panel = $('prov-panel');
  if (prov || myProvs.length) {
    panel.classList.remove('hidden');
    const money = prov ? prov.money : myProvs.reduce((s, pr) => s + pr.money, 0);
    const inc = prov ? prov.income : myProvs.reduce((s, pr) => s + pr.income, 0);
    $('prov-gold').textContent = money + (prov || myProvs.length === 1 ? '' : ' Σ');
    const incEl = $('prov-income');
    incEl.textContent = (inc >= 0 ? '+' : '') + inc + '/turn';
    incEl.className = inc >= 0 ? 'pos' : 'neg';
  } else {
    panel.classList.add('hidden');
  }

  // buttons: enabled when ANY province can afford it
  const buttons = [
    ['btn-u1', { type: 'unit', level: 1 }, RULES.UNIT_COST[1]],
    ['btn-u2', { type: 'unit', level: 2 }, RULES.UNIT_COST[2]],
    ['btn-u3', { type: 'unit', level: 3 }, RULES.UNIT_COST[3]],
    ['btn-u4', { type: 'unit', level: 4 }, RULES.UNIT_COST[4]],
    ['btn-town', { type: 'town' }, RULES.COST_TOWN],
    ['btn-tower', { type: 'tower' }, RULES.COST_TOWER],
    ['btn-upgrade', { type: 'upgrade' }, RULES.COST_CITY_UPGRADE],
  ];
  for (const [id, mode, cost] of buttons) {
    const el = $(id);
    const affordable = humanCanAct() && myProvs.some(pr => pr.money >= cost);
    el.disabled = !affordable;
    el.classList.toggle('active', !!sel.build &&
      JSON.stringify(sel.build) === JSON.stringify(mode));
  }
  $('btn-undo').disabled = !humanCanAct() || game.undoStack.length === 0;
  $('btn-end').disabled = !humanCanAct();
}

// ============================================================
//  Input: pointer pan/zoom/tap
// ============================================================
const pointers = new Map();
let panStart = null;
let pinchStart = null;
let moved = false;

canvas.addEventListener('pointerdown', (e) => {
  try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* synthetic events */ }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  moved = false;
  if (pointers.size === 1) {
    panStart = { x: e.clientX, y: e.clientY, camX: renderer.cam.x, camY: renderer.cam.y };
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinchStart = {
      dist: Math.hypot(a.x - b.x, a.y - b.y),
      scale: renderer.cam.scale,
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      world: renderer.screenToWorld((a.x + b.x) / 2, (a.y + b.y) / 2),
    };
    panStart = null;
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size === 2 && pinchStart) {
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const scale = Math.min(3, Math.max(0.25, pinchStart.scale * dist / pinchStart.dist));
    renderer.cam.scale = scale;
    // keep pinch midpoint anchored
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    renderer.cam.x = pinchStart.world.x - (mid.x - canvas.clientWidth / 2) / scale;
    renderer.cam.y = pinchStart.world.y - (mid.y - canvas.clientHeight / 2) / scale;
    moved = true;
  } else if (panStart) {
    const dx = e.clientX - panStart.x, dy = e.clientY - panStart.y;
    if (Math.hypot(dx, dy) > 6) moved = true;
    if (moved) {
      renderer.cam.x = panStart.camX - dx / renderer.cam.scale;
      renderer.cam.y = panStart.camY - dy / renderer.cam.scale;
    }
  }
});

function pointerEnd(e) {
  if (pointers.has(e.pointerId)) {
    pointers.delete(e.pointerId);
    if (!moved && pointers.size === 0 && game) {
      const rect = canvas.getBoundingClientRect();
      onTap(renderer.hexAtScreen(e.clientX - rect.left, e.clientY - rect.top));
    }
    if (pointers.size < 2) pinchStart = null;
    if (pointers.size === 1) {
      const [a] = [...pointers.values()];
      panStart = { x: a.x, y: a.y, camX: renderer.cam.x, camY: renderer.cam.y };
    } else {
      panStart = null;
    }
  }
}
canvas.addEventListener('pointerup', pointerEnd);
canvas.addEventListener('pointercancel', pointerEnd);

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (!renderer) return;
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  const before = renderer.screenToWorld(mx, my);
  renderer.cam.scale = Math.min(3, Math.max(0.25,
    renderer.cam.scale * (e.deltaY < 0 ? 1.1 : 0.9)));
  const after = renderer.screenToWorld(mx, my);
  renderer.cam.x += before.x - after.x;
  renderer.cam.y += before.y - after.y;
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    sel.build = null;
    sel.unitKey = null;
    refreshHighlights();
    updateHud();
  } else if (e.key === 'Enter') endTurn();
  else if (e.key === 'z' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); doUndo(); }
});

function doUndo() {
  if (!humanCanAct()) return;
  if (game.undo()) {
    clearSelection();
    game.events.length = 0;
    refreshHighlights();
    updateHud();
  }
}

// ============================================================
//  Buttons
// ============================================================
$('btn-u1').onclick = () => setBuildMode({ type: 'unit', level: 1 });
$('btn-u2').onclick = () => setBuildMode({ type: 'unit', level: 2 });
$('btn-u3').onclick = () => setBuildMode({ type: 'unit', level: 3 });
$('btn-u4').onclick = () => setBuildMode({ type: 'unit', level: 4 });
$('btn-town').onclick = () => setBuildMode({ type: 'town' });
$('btn-tower').onclick = () => setBuildMode({ type: 'tower' });
$('btn-upgrade').onclick = () => setBuildMode({ type: 'upgrade' });
$('btn-undo').onclick = doUndo;
$('btn-end').onclick = endTurn;
$('btn-start').onclick = newGame;
$('opt-map').onchange = () => {
  const real = $('opt-map').value !== 'random';
  $('row-size').classList.toggle('hidden', real);
  $('row-ai').classList.toggle('hidden', real);
  $('map-note').classList.toggle('hidden', !real);
};
$('btn-again').onclick = () => { $('gameover-overlay').classList.add('hidden'); showMenu(); };
$('btn-menu').onclick = () => { if (aiTimer) clearTimeout(aiTimer); showMenu(); };

$('btn-music').onclick = () => {
  Audio2.ensure();
  const on = Audio2.toggleMusic();
  $('btn-music').textContent = on ? '♫' : '♪̸';
  $('btn-music').classList.toggle('off', !on);
};
$('btn-sfx').onclick = () => {
  const on = Audio2.toggleSfx();
  $('btn-sfx').textContent = on ? '🔊' : '🔇';
  $('btn-sfx').classList.toggle('off', !on);
};

// populate unit button icons from sprites
function paintButtonIcons() {
  const map = [
    ['btn-u1', 'unit1'], ['btn-u2', 'unit2'], ['btn-u3', 'unit3'], ['btn-u4', 'unit4'],
    ['btn-town', 'town'], ['btn-tower', 'tower1'], ['btn-upgrade', 'city'],
  ];
  for (const [id, sprite] of map) {
    const cnv = $(id).querySelector('canvas');
    const g = cnv.getContext('2d');
    g.drawImage(Sprites.get(sprite, 96), 0, 0, cnv.width, cnv.height);
  }
}

// ============================================================
//  Boot
// ============================================================
function loop(now) {
  if (renderer && game) {
    drainEvents();
    renderer.draw(now);
  }
  requestAnimationFrame(loop);
}

window.addEventListener('resize', () => {
  if (renderer) renderer.resize();
});

paintButtonIcons();
showMenu();
requestAnimationFrame(loop);

// PWA service worker (only when served over http(s), not file://)
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
