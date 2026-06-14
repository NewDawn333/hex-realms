'use strict';

// Flat-top axial hex grid math
const Hex = {
  DIRS: [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]],

  key(q, r) { return q + ',' + r; },

  fromKey(k) {
    const i = k.indexOf(',');
    return { q: +k.slice(0, i), r: +k.slice(i + 1) };
  },

  neighbors(q, r) {
    return Hex.DIRS.map(d => ({ q: q + d[0], r: r + d[1] }));
  },

  dist(q1, r1, q2, r2) {
    return (Math.abs(q1 - q2) + Math.abs(r1 - r2) + Math.abs(q1 + r1 - q2 - r2)) / 2;
  },

  // hex center in world pixels (flat-top)
  toPixel(q, r, size) {
    return {
      x: size * 1.5 * q,
      y: size * Math.sqrt(3) * (r + q / 2),
    };
  },

  fromPixel(x, y, size) {
    const q = (2 / 3 * x) / size;
    const r = (-1 / 3 * x + Math.sqrt(3) / 3 * y) / size;
    return Hex.round(q, r);
  },

  round(q, r) {
    const s = -q - r;
    let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
    const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
    if (dq > dr && dq > ds) rq = -rr - rs;
    else if (dr > ds) rr = -rq - rs;
    return { q: rq, r: rr };
  },

  corners(cx, cy, size) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 3 * i;
      pts.push([cx + size * Math.cos(a), cy + size * Math.sin(a)]);
    }
    return pts;
  },
};

// Small seeded RNG (mulberry32) so map gen is reproducible per seed
function makeRng(seed) {
  let a = seed >>> 0;
  const fn = function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  fn.getState = () => a >>> 0;
  fn.setState = (s) => { a = s >>> 0; };
  return fn;
}
