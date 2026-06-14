'use strict';

let game = null;
let renderer = null;
let completedTape = null;
const HUMAN = 1;

const replay = {
  active: false,
  playing: false,
  tape: [],
  index: 0,
  speed: 1,
  timer: null,
};

const sel = {
  provId: null,
  unitKey: null,
  build: null,     // {type:'unit', level} | {type:'town'|'tower'|'upgrade'}
  buildMap: null,  // key -> {provId, action} computed for the active build mode
};

const $ = (id) => document.getElementById(id);
const canvas = $('game-canvas');
const SaveGame = window.SaveGame || {
  KEY: 'hex-realms-save',
  save() {},
  load() { return null; },
  hasSave() { return false; },
  clear() {},
};
let appReady = false;

function getHexNative() {
  return window.HexNative || {
    isNative() {
      return !!(window.Capacitor && window.Capacitor.isNativePlatform &&
        window.Capacitor.isNativePlatform());
    },
    onBackButton() {},
    onPause() {},
    onResume() {},
    exitApp() {
      const App = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
      if (App && App.exitApp) App.exitApp();
    },
  };
}

function bindClick(id, fn) {
  const el = $(id);
  if (el) el.addEventListener('click', fn);
}

function hideEl(id) {
  const el = $(id);
  if (el) el.classList.add('hidden');
}

function showEl(id) {
  const el = $(id);
  if (el) el.classList.remove('hidden');
}

function isHidden(id) {
  const el = $(id);
  return !el || el.classList.contains('hidden');
}

function isMainMenuVisible() {
  return !isHidden('menu-overlay');
}

function isPauseVisible() {
  return !isHidden('pause-overlay');
}

function isGameOverVisible() {
  return !isHidden('gameover-overlay');
}

function isInActiveGame() {
  return game && !game.winner && !replay.active && !isMainMenuVisible() && !isGameOverVisible();
}

function updateMainMenu() {
  const btn = $('btn-resume');
  if (btn) btn.classList.toggle('hidden', !SaveGame.hasSave());
}

function autosave() {
  if (game && !game.winner && !replay.active && !isMainMenuVisible() && !isGameOverVisible()) {
    SaveGame.save(game, renderer);
  }
}

// ============================================================
//  Game lifecycle
// ============================================================
function newGame() {
  try {
    stopAITimer();
    stopReplay();
    SaveGame.clear();
    hidePauseMenu();
    const opts = {
      map: $('opt-map').value,
      size: $('opt-size').value,
      aiCount: +$('opt-ai').value,
      difficulty: $('opt-diff').value,
    };
    game = new Game(opts);
    renderer = new Renderer(canvas, game);
    clearSelection();
    hideEl('menu-overlay');
    hideEl('gameover-overlay');
    showEl('hud-top');
    showEl('hud-bottom');
    Audio2.ensure();
    if (Audio2.musicOn) Audio2.startMusic();
    drainEvents();
    updateHud();
    autosave();
    maybeRunAI();
  } catch (err) {
    console.error('newGame failed', err);
  }
}

function resumeGame() {
  const data = SaveGame.load();
  if (!data) return;
  stopAITimer();
  stopReplay();
  hidePauseMenu();
  $('opt-map').value = data.opts.map || 'random';
  if (data.opts.size) $('opt-size').value = data.opts.size;
  if (data.opts.aiCount != null) $('opt-ai').value = String(data.opts.aiCount);
  if (data.opts.difficulty) $('opt-diff').value = data.opts.difficulty;
  $('opt-map').dispatchEvent(new Event('change'));

  game = new Game(Object.assign({}, data.opts, { seed: data.seed }));
  game.restore(data.snapshot);
  game.tape = [];
  game.undoStack = [];
  game.recording = true;
  renderer = new Renderer(canvas, game);
  if (data.camera) Object.assign(renderer.cam, data.camera);
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

function restartGame() {
  if (!game) return;
  stopAITimer();
  const opts = Object.assign({}, game.opts);
  const seed = game.seed;
  hidePauseMenu();
  game = new Game(Object.assign({}, opts, { seed }));
  renderer = new Renderer(canvas, game);
  clearSelection();
  $('hud-top').classList.remove('hidden');
  $('hud-bottom').classList.remove('hidden');
  drainEvents();
  updateHud();
  autosave();
  maybeRunAI();
}

function showPauseMenu() {
  if (!isInActiveGame()) return;
  stopAITimer();
  showEl('pause-overlay');
  autosave();
}

function hidePauseMenu() {
  hideEl('pause-overlay');
}

function endGameFromPause() {
  SaveGame.clear();
  stopAITimer();
  hidePauseMenu();
  game = null;
  renderer = null;
  clearSelection();
  updateMainMenu();
  showMenu();
}

function saveAndExit() {
  autosave();
  stopAITimer();
  hidePauseMenu();
  Audio2.stopAll();
  getHexNative().exitApp();
}

function handleBackButton() {
  if (replay.active) {
    exitReplay();
    return;
  }
  if (isGameOverVisible()) {
    SaveGame.clear();
    showMenu();
    return;
  }
  if (isPauseVisible()) {
    saveAndExit();
    return;
  }
  if (isInActiveGame()) {
    showPauseMenu();
    return;
  }
  if (isMainMenuVisible()) {
    Audio2.stopAll();
    getHexNative().exitApp();
  }
}

function onAppBackground() {
  if (!appReady) return;
  if (isInActiveGame() || isPauseVisible()) autosave();
  stopAITimer();
  Audio2.stopAll();
}

function onAppForeground() {
  Audio2.resumeAll();
  if (isInActiveGame() && !isPauseVisible()) maybeRunAI();
}

function showMenu() {
  stopAITimer();
  stopReplay();
  hidePauseMenu();
  showEl('menu-overlay');
  hideEl('gameover-overlay');
  hideEl('hud-top');
  hideEl('hud-bottom');
  updateMainMenu();
  Audio2.ensure();
  if (Audio2.musicOn) Audio2.startMusic();
}

function finalizeTape() {
  if (!game) return;
  const last = game.tape[game.tape.length - 1];
  const lastWinner = last ? JSON.parse(last.snapshot).winner : null;
  if (!lastWinner && game.winner) game.recordStep('Game over');
  completedTape = game.tape.slice();
}

function gameOver(victory) {
  stopAITimer();
  SaveGame.clear();
  finalizeTape();
  $('go-title').textContent = victory ? 'Victory!' : 'Defeat';
  $('go-title').className = victory ? 'victory' : 'defeat';
  $('go-text').textContent = victory
    ? 'All rival realms have fallen. The island is yours.'
    : 'Your realm has crumbled. Better luck next conquest.';
  $('btn-replay').classList.toggle('hidden', !completedTape || completedTape.length < 2);
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
  return game && !replay.active && !isPauseVisible() && !game.winner &&
    game.currentPlayer.id === HUMAN && game.players[HUMAN - 1].alive;
}

function onTap(key) {
  if (replay.active || !humanCanAct()) return;
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
  autosave();
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
  HapticsUtil.turn();
  drainEvents();
  refreshHighlights();
  updateHud();
  autosave();
  endCheck();
  maybeRunAI();
}

// ============================================================
//  AI loop
// ============================================================
let aiTimer = null;

function stopAITimer() {
  if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
}

function maybeRunAI() {
  if (!game || game.winner || replay.active || isPauseVisible()) return;
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
//  Replay
// ============================================================
function clearReplayTimer() {
  if (replay.timer) { clearTimeout(replay.timer); replay.timer = null; }
}

function stopReplay() {
  replay.active = false;
  replay.playing = false;
  clearReplayTimer();
  if (game) game.replaying = false;
  $('replay-bar').classList.add('hidden');
  if (game && !game.winner) $('hud-bottom').classList.remove('hidden');
  $('btn-menu').classList.remove('hidden');
  $('replay-play').textContent = '▶';
}

function showReplayFrame(index) {
  const frame = replay.tape[index];
  if (!frame || !game) return;
  replay.index = Math.max(0, Math.min(index, replay.tape.length - 1));
  game.replaying = true;
  game.recording = false;
  game.restore(replay.tape[replay.index].snapshot);
  game.events = replay.tape[replay.index].events.map(e => ({ ...e }));
  clearSelection();
  drainEvents();
  updateHud();
}

function scheduleReplayAdvance() {
  clearReplayTimer();
  if (!replay.active || !replay.playing) return;
  if (replay.index >= replay.tape.length - 1) {
    replay.playing = false;
    $('replay-play').textContent = '▶';
    return;
  }
  const delay = Math.max(20, 450 / replay.speed);
  replay.timer = setTimeout(() => {
    showReplayFrame(replay.index + 1);
    scheduleReplayAdvance();
  }, delay);
}

function startReplay() {
  if (!completedTape || completedTape.length < 2) return;
  stopAITimer();
  $('gameover-overlay').classList.add('hidden');
  replay.active = true;
  replay.tape = completedTape;
  replay.index = 0;
  replay.playing = true;
  replay.speed = +$('replay-speed').value || 1;
  $('hud-bottom').classList.add('hidden');
  $('replay-bar').classList.remove('hidden');
  $('btn-menu').classList.add('hidden');
  $('replay-play').textContent = '⏸';
  $('replay-speed-val').textContent = replay.speed + '×';
  showReplayFrame(0);
  scheduleReplayAdvance();
}

function toggleReplayPlay() {
  if (!replay.active) return;
  replay.playing = !replay.playing;
  $('replay-play').textContent = replay.playing ? '⏸' : '▶';
  if (replay.playing) scheduleReplayAdvance();
  else clearReplayTimer();
}

function exitReplay() {
  stopReplay();
  $('gameover-overlay').classList.remove('hidden');
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
        HapticsUtil.capture();
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
        HapticsUtil.build();
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
  if (starved) {
    Audio2.starve();
    HapticsUtil.starve();
  }
  game.events.length = 0;
}

// ============================================================
//  HUD
// ============================================================
function updateHud() {
  if (!game) return;
  if (replay.active) {
    const frame = replay.tape[replay.index];
    const p = game.currentPlayer;
    $('hud-round').textContent = 'Replay · Round ' + (frame?.round ?? game.round);
    const chip = $('hud-player');
    const pname = p ? (p.name || p.color.name) : '';
    chip.textContent = frame?.label ? frame.label : pname;
    chip.style.background = p?.color.main ?? '#555';
    $('prov-panel').classList.add('hidden');
    $('replay-progress').textContent = `${replay.index + 1} / ${replay.tape.length}`;
    return;
  }
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
bindClick('btn-u1', () => setBuildMode({ type: 'unit', level: 1 }));
bindClick('btn-u2', () => setBuildMode({ type: 'unit', level: 2 }));
bindClick('btn-u3', () => setBuildMode({ type: 'unit', level: 3 }));
bindClick('btn-u4', () => setBuildMode({ type: 'unit', level: 4 }));
bindClick('btn-town', () => setBuildMode({ type: 'town' }));
bindClick('btn-tower', () => setBuildMode({ type: 'tower' }));
bindClick('btn-upgrade', () => setBuildMode({ type: 'upgrade' }));
bindClick('btn-undo', doUndo);
bindClick('btn-end', endTurn);
bindClick('btn-start', newGame);
bindClick('btn-resume', resumeGame);
bindClick('btn-replay', startReplay);
bindClick('btn-again', () => { SaveGame.clear(); hideEl('gameover-overlay'); showMenu(); });
bindClick('btn-menu', () => showPauseMenu());
bindClick('btn-pause-continue', () => { hidePauseMenu(); maybeRunAI(); });
bindClick('btn-pause-restart', restartGame);
bindClick('btn-pause-end', endGameFromPause);
bindClick('replay-play', toggleReplayPlay);
bindClick('replay-rewind', () => {
  if (!replay.active) return;
  replay.playing = false;
  const playBtn = $('replay-play');
  if (playBtn) playBtn.textContent = '▶';
  clearReplayTimer();
  showReplayFrame(0);
});
bindClick('replay-step-back', () => {
  if (!replay.active) return;
  replay.playing = false;
  const playBtn = $('replay-play');
  if (playBtn) playBtn.textContent = '▶';
  clearReplayTimer();
  showReplayFrame(replay.index - 1);
});
bindClick('replay-step-fwd', () => {
  if (!replay.active) return;
  showReplayFrame(replay.index + 1);
});
bindClick('replay-exit', exitReplay);
const replaySpeed = $('replay-speed');
if (replaySpeed) {
  replaySpeed.oninput = (e) => {
    replay.speed = +e.target.value;
    const val = $('replay-speed-val');
    if (val) val.textContent = replay.speed + '×';
    if (replay.playing) {
      clearReplayTimer();
      scheduleReplayAdvance();
    }
  };
}

const optMap = $('opt-map');
if (optMap) {
  optMap.onchange = () => {
    const real = optMap.value !== 'random';
    const rowSize = $('row-size');
    const rowAi = $('row-ai');
    const mapNote = $('map-note');
    if (rowSize) rowSize.classList.toggle('hidden', real);
    if (rowAi) rowAi.classList.toggle('hidden', real);
    if (mapNote) mapNote.classList.toggle('hidden', !real);
  };
}

bindClick('btn-music', () => {
  Audio2.ensure();
  const on = Audio2.toggleMusic();
  const btn = $('btn-music');
  if (btn) {
    btn.textContent = on ? '♫' : '♪̸';
    btn.classList.toggle('off', !on);
  }
});
bindClick('btn-sfx', () => {
  const on = Audio2.toggleSfx();
  const btn = $('btn-sfx');
  if (btn) {
    btn.textContent = on ? '🔊' : '🔇';
    btn.classList.toggle('off', !on);
  }
});

// populate unit button icons from sprites
function paintButtonIcons() {
  const map = [
    ['btn-u1', 'unit1'], ['btn-u2', 'unit2'], ['btn-u3', 'unit3'], ['btn-u4', 'unit4'],
    ['btn-town', 'town'], ['btn-tower', 'tower1'], ['btn-upgrade', 'city'],
  ];
  for (const [id, sprite] of map) {
    const btn = $(id);
    if (!btn) continue;
    const cnv = btn.querySelector('canvas');
    if (!cnv) continue;
    const g = cnv.getContext('2d');
    if (!g) continue;
    g.drawImage(Sprites.get(sprite, 96), 0, 0, cnv.width, cnv.height);
  }
}

function setupNativeLifecycle() {
  const native = getHexNative();
  native.onBackButton(handleBackButton);
  native.onPause(onAppBackground);
  native.onResume(onAppForeground);
  document.addEventListener('backbutton', (e) => {
    if (e && e.preventDefault) e.preventDefault();
    handleBackButton();
  }, false);
  if (!native.isNative()) {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) onAppBackground();
      else onAppForeground();
    });
  }
}

function boot() {
  try { paintButtonIcons(); } catch (err) { console.error('paintButtonIcons failed', err); }
  updateMainMenu();
  showMenu();
  requestAnimationFrame(loop);
  setupNativeLifecycle();
  appReady = true;
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

let resizeTimer = null;
function scheduleResize() {
  if (!renderer) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => renderer.resize(), 120);
}

window.addEventListener('resize', scheduleResize);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', scheduleResize);
}

boot();

// PWA service worker (browser only — Capacitor APK bundles assets locally)
if ('serviceWorker' in navigator && location.protocol.startsWith('http') &&
    !window.Capacitor?.isNativePlatform?.()) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
