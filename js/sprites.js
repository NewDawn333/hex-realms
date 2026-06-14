'use strict';

// Vector sprite artwork, drawn once per (name, size) into offscreen
// canvases and cached. All sprites are drawn in a 100x100 box centered
// at (50,58) on an implied ground line, then scaled.
const Sprites = {
  _cache: new Map(),

  get(name, px) {
    const key = name + '@' + px;
    let c = this._cache.get(key);
    if (!c) {
      c = document.createElement('canvas');
      c.width = c.height = px;
      const g = c.getContext('2d');
      g.scale(px / 100, px / 100);
      g.lineJoin = 'round';
      g.lineCap = 'round';
      this._draw[name](g);
      this._cache.set(key, c);
    }
    return c;
  },

  _draw: {
    // ---------- structures ----------
    capital(g) {
      // stone keep with two towers and a banner
      g.fillStyle = '#8d8d99';
      g.strokeStyle = '#4a4a55';
      g.lineWidth = 4;
      // side towers
      roundRect(g, 14, 38, 18, 46, 3); g.fill(); g.stroke();
      roundRect(g, 68, 38, 18, 46, 3); g.fill(); g.stroke();
      // main keep
      g.fillStyle = '#a3a3b0';
      roundRect(g, 28, 48, 44, 36, 3); g.fill(); g.stroke();
      // battlements
      g.fillStyle = '#8d8d99';
      for (const x of [12, 20, 28]) { g.fillRect(x, 32, 7, 8); g.strokeRect(x, 32, 7, 8); }
      for (const x of [66, 74, 82]) { g.fillRect(x, 32, 7, 8); g.strokeRect(x, 32, 7, 8); }
      for (const x of [30, 42, 54, 66]) { g.fillRect(x, 42, 8, 8); g.strokeRect(x, 42, 8, 8); }
      // gate
      g.fillStyle = '#5a4632';
      g.beginPath();
      g.moveTo(42, 84); g.lineTo(42, 66);
      g.arc(50, 66, 8, Math.PI, 0);
      g.lineTo(58, 84); g.closePath();
      g.fill(); g.stroke();
      // windows
      g.fillStyle = '#3d3d47';
      g.fillRect(20, 50, 6, 9); g.fillRect(74, 50, 6, 9);
      // flag
      g.strokeStyle = '#4a4a55'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(50, 42); g.lineTo(50, 16); g.stroke();
      g.fillStyle = '#e8c247';
      g.beginPath(); g.moveTo(50, 16); g.lineTo(72, 22); g.lineTo(50, 29); g.closePath();
      g.fill();
      g.strokeStyle = '#a8862a'; g.lineWidth = 2.5; g.stroke();
    },

    town(g) {
      // cozy cottage: timber walls, red roof, chimney
      g.lineWidth = 4;
      g.strokeStyle = '#5a4632';
      g.fillStyle = '#e8d9b8';
      roundRect(g, 26, 52, 48, 32, 3); g.fill(); g.stroke();
      // chimney
      g.fillStyle = '#8d8d99';
      g.fillRect(62, 26, 10, 18); g.strokeRect(62, 26, 10, 18);
      // roof
      g.fillStyle = '#c0563f';
      g.beginPath();
      g.moveTo(18, 54); g.lineTo(50, 26); g.lineTo(82, 54); g.closePath();
      g.fill(); g.stroke();
      // door + window
      g.fillStyle = '#5a4632';
      roundRect(g, 43, 64, 14, 20, 4); g.fill();
      g.fillStyle = '#7fb2d8';
      g.fillRect(30, 60, 10, 10); g.strokeRect(30, 60, 10, 10);
      g.fillRect(60, 60, 10, 10); g.strokeRect(60, 60, 10, 10);
    },

    city(g) {
      // three buildings, one tall — bustling skyline
      g.lineWidth = 3.5;
      g.strokeStyle = '#4a4a55';
      // back-left house
      g.fillStyle = '#d9c9a3';
      g.fillRect(12, 56, 26, 28); g.strokeRect(12, 56, 26, 28);
      g.fillStyle = '#a06a4f';
      g.beginPath(); g.moveTo(8, 58); g.lineTo(25, 42); g.lineTo(42, 58); g.closePath();
      g.fill(); g.stroke();
      // back-right house
      g.fillStyle = '#d9c9a3';
      g.fillRect(62, 56, 26, 28); g.strokeRect(62, 56, 26, 28);
      g.fillStyle = '#c0563f';
      g.beginPath(); g.moveTo(58, 58); g.lineTo(75, 42); g.lineTo(92, 58); g.closePath();
      g.fill(); g.stroke();
      // center hall (tall)
      g.fillStyle = '#e8d9b8';
      g.fillRect(36, 38, 28, 46); g.strokeRect(36, 38, 28, 46);
      g.fillStyle = '#7a8e5a';
      g.beginPath(); g.moveTo(32, 40); g.lineTo(50, 20); g.lineTo(68, 40); g.closePath();
      g.fill(); g.stroke();
      // windows & doors
      g.fillStyle = '#7fb2d8';
      g.fillRect(42, 46, 7, 8); g.fillRect(52, 46, 7, 8);
      g.fillRect(18, 62, 7, 8); g.fillRect(70, 62, 7, 8);
      g.fillStyle = '#5a4632';
      roundRect(g, 45, 66, 11, 18, 3); g.fill();
    },

    tower1(g) {
      // slim watchtower
      g.lineWidth = 4;
      g.strokeStyle = '#4a4a55';
      g.fillStyle = '#9a9aa8';
      g.beginPath();
      g.moveTo(38, 84); g.lineTo(41, 36); g.lineTo(59, 36); g.lineTo(62, 84);
      g.closePath(); g.fill(); g.stroke();
      // battlements
      g.fillStyle = '#8d8d99';
      for (const x of [37, 47, 57]) { g.fillRect(x, 26, 7, 11); g.strokeRect(x, 26, 7, 11); }
      // arrow slit
      g.fillStyle = '#3d3d47';
      g.fillRect(47, 48, 6, 14);
      // base stones
      g.fillStyle = '#8d8d99';
      g.fillRect(34, 78, 32, 7); g.strokeRect(34, 78, 32, 7);
    },

    tower2(g) {
      // great bastion: wide tower with wall ring
      g.lineWidth = 4;
      g.strokeStyle = '#4a4a55';
      // wall ring
      g.fillStyle = '#8d8d99';
      roundRect(g, 16, 66, 68, 18, 3); g.fill(); g.stroke();
      for (const x of [18, 32, 46, 60, 74]) { g.fillRect(x, 60, 8, 8); g.strokeRect(x, 60, 8, 8); }
      // main tower
      g.fillStyle = '#a3a3b0';
      g.beginPath();
      g.moveTo(34, 70); g.lineTo(37, 26); g.lineTo(63, 26); g.lineTo(66, 70);
      g.closePath(); g.fill(); g.stroke();
      // battlements
      g.fillStyle = '#8d8d99';
      for (const x of [33, 44, 55] ) { g.fillRect(x, 16, 8, 12); g.strokeRect(x, 16, 8, 12); }
      g.fillRect(63, 16, 8, 12); g.strokeRect(63, 16, 8, 12);
      // slits
      g.fillStyle = '#3d3d47';
      g.fillRect(46, 36, 7, 14); g.fillRect(46, 54, 7, 10);
    },

    tree(g) {
      // pine
      g.lineWidth = 3.5;
      g.strokeStyle = '#3f5a35';
      g.fillStyle = '#7a5230';
      g.fillRect(45, 70, 10, 16);
      g.strokeRect(45, 70, 10, 16);
      g.fillStyle = '#53803f';
      const layer = (y, w) => {
        g.beginPath();
        g.moveTo(50 - w, y); g.lineTo(50, y - 24); g.lineTo(50 + w, y);
        g.closePath(); g.fill(); g.stroke();
      };
      layer(74, 26);
      layer(58, 21);
      layer(44, 15);
    },

    mountain(g) {
      // twin rocky peaks with snow caps
      g.lineWidth = 4;
      g.strokeStyle = '#4a443e';
      // back peak
      g.fillStyle = '#6e675f';
      g.beginPath();
      g.moveTo(38, 82); g.lineTo(64, 30); g.lineTo(90, 82);
      g.closePath(); g.fill(); g.stroke();
      // snow on back peak
      g.fillStyle = '#e8ecf2';
      g.beginPath();
      g.moveTo(56, 46); g.lineTo(64, 30); g.lineTo(72, 46);
      g.lineTo(68, 43); g.lineTo(64, 47); g.lineTo(60, 43);
      g.closePath(); g.fill();
      // front peak
      g.fillStyle = '#857d74';
      g.beginPath();
      g.moveTo(10, 82); g.lineTo(38, 38); g.lineTo(66, 82);
      g.closePath(); g.fill(); g.stroke();
      // snow on front peak
      g.fillStyle = '#f4f7fb';
      g.beginPath();
      g.moveTo(30, 51); g.lineTo(38, 38); g.lineTo(46, 51);
      g.lineTo(42, 48); g.lineTo(38, 52); g.lineTo(34, 48);
      g.closePath(); g.fill();
      // crag line
      g.strokeStyle = '#5d564f'; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(38, 52); g.lineTo(34, 66); g.lineTo(38, 78); g.stroke();
    },

    grave(g) {
      g.lineWidth = 3.5;
      g.strokeStyle = '#4a4a55';
      g.fillStyle = '#b0b0bc';
      g.beginPath();
      g.moveTo(36, 84); g.lineTo(36, 50);
      g.arc(50, 50, 14, Math.PI, 0);
      g.lineTo(64, 84); g.closePath();
      g.fill(); g.stroke();
      g.strokeStyle = '#6a6a78'; g.lineWidth = 4;
      g.beginPath();
      g.moveTo(50, 48); g.lineTo(50, 70);
      g.moveTo(42, 56); g.lineTo(58, 56);
      g.stroke();
    },

    coin(g) {
      g.lineWidth = 5;
      g.fillStyle = '#e8c247';
      g.strokeStyle = '#a8862a';
      g.beginPath(); g.arc(50, 50, 34, 0, Math.PI * 2); g.fill(); g.stroke();
      g.strokeStyle = '#c9a232'; g.lineWidth = 4;
      g.beginPath(); g.arc(50, 50, 24, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#a8862a';
      g.font = 'bold 34px sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('$', 50, 52);
    },

    // ---------- units (escalating menace) ----------
    unit1(g) { drawSoldier(g, { weapon: 'club', armor: 0 }); },     // Militia
    unit2(g) { drawSoldier(g, { weapon: 'spear', armor: 1 }); },    // Spearman
    unit3(g) { drawSoldier(g, { weapon: 'sword', armor: 2 }); },    // Knight
    unit4(g) { drawSoldier(g, { weapon: 'sword', armor: 3 }); },    // Champion
  },
};

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// Little fellow with increasing armor & weaponry.
// armor: 0 tunic, 1 leather + cap, 2 chainmail + helm, 3 full plate + crowned greathelm
function drawSoldier(g, { weapon, armor }) {
  const skin = '#e8b88f';
  const tunics = ['#b08d57', '#8a6f4d', '#7f8a99', '#6f7a8a'];
  const metal = '#c9ccd4';
  const dark = '#3d3d47';
  g.lineWidth = 3.5;
  g.strokeStyle = dark;

  // shadow
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.beginPath(); g.ellipse(50, 86, 22, 6, 0, 0, Math.PI * 2); g.fill();

  // legs
  g.fillStyle = armor >= 3 ? metal : '#5a4632';
  roundRect(g, 39, 66, 9, 20, 3); g.fill(); g.stroke();
  roundRect(g, 52, 66, 9, 20, 3); g.fill(); g.stroke();

  // body
  g.fillStyle = armor >= 2 ? metal : tunics[armor];
  roundRect(g, 34, 42, 32, 30, 8); g.fill(); g.stroke();
  if (armor >= 2) { // chest plate seam
    g.strokeStyle = '#8a8d96'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(50, 44); g.lineTo(50, 70); g.stroke();
    g.strokeStyle = dark; g.lineWidth = 3.5;
  }
  if (armor === 1) { // leather straps
    g.strokeStyle = '#5a4632'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(36, 48); g.lineTo(64, 60); g.stroke();
    g.strokeStyle = dark; g.lineWidth = 3.5;
  }

  // head
  if (armor >= 2) {
    g.fillStyle = metal;
    g.beginPath(); g.arc(50, 30, 13, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = dark;
    g.fillRect(40, 27, 20, 5); // visor slit
    if (armor >= 3) { // crown
      g.fillStyle = '#e8c247'; g.strokeStyle = '#a8862a'; g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(39, 18); g.lineTo(39, 10); g.lineTo(45, 15); g.lineTo(50, 8);
      g.lineTo(55, 15); g.lineTo(61, 10); g.lineTo(61, 18); g.closePath();
      g.fill(); g.stroke();
      g.strokeStyle = dark; g.lineWidth = 3.5;
    }
  } else {
    g.fillStyle = skin;
    g.beginPath(); g.arc(50, 30, 12, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = dark;
    g.beginPath(); g.arc(46, 29, 1.8, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(54, 29, 1.8, 0, Math.PI * 2); g.fill();
    if (armor === 1) { // leather cap
      g.fillStyle = '#8a6f4d';
      g.beginPath(); g.arc(50, 27, 12.5, Math.PI, 0); g.fill(); g.stroke();
    } else { // hair tuft
      g.fillStyle = '#6b4a2f';
      g.beginPath(); g.arc(50, 24, 9, Math.PI, 0); g.fill();
    }
  }

  // weapon (right side)
  g.strokeStyle = dark;
  if (weapon === 'club') {
    g.strokeStyle = '#5a4632'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(70, 66); g.lineTo(78, 38); g.stroke();
    g.fillStyle = '#7a5230';
    g.beginPath(); g.arc(79, 34, 7, 0, Math.PI * 2); g.fill();
    g.strokeStyle = dark; g.lineWidth = 3; g.stroke();
  } else if (weapon === 'spear') {
    g.strokeStyle = '#7a5230'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(73, 80); g.lineTo(73, 22); g.stroke();
    g.fillStyle = metal; g.strokeStyle = dark; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(67, 24); g.lineTo(73, 8); g.lineTo(79, 24); g.closePath();
    g.fill(); g.stroke();
  } else if (weapon === 'sword') {
    g.fillStyle = metal; g.strokeStyle = dark; g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(70, 60); g.lineTo(67, 24); g.lineTo(73, 14) ; g.lineTo(79, 24); g.lineTo(76, 60);
    g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = '#7a5230'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(64, 62); g.lineTo(82, 62); g.stroke();
  }

  // shield (left side) for armor >= 1
  if (armor >= 1) {
    g.fillStyle = armor >= 3 ? '#e8c247' : '#a85b4b';
    g.strokeStyle = dark; g.lineWidth = 3;
    g.beginPath();
    g.moveTo(20, 44); g.lineTo(36, 44); g.lineTo(36, 62);
    g.quadraticCurveTo(36, 74, 28, 78);
    g.quadraticCurveTo(20, 74, 20, 62);
    g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = armor >= 3 ? '#a8862a' : '#7a3d30'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(28, 47) ; g.lineTo(28, 74); g.stroke();
  }
}
