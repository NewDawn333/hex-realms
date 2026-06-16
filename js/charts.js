'use strict';

// Bar chart (live) and line chart (replay) for per-player net income / turn.
const IncomeCharts = {
  _ctx(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  },

  _players(game) {
    return game.players.filter(p => p.id > 0);
  },

  _incomesForFrame(game, frameIncomes) {
    const out = {};
    for (const p of this._players(game)) {
      out[p.id] = frameIncomes && frameIncomes[p.id] != null
        ? frameIncomes[p.id]
        : 0;
    }
    return out;
  },

  drawBar(canvas, game) {
    if (!canvas || !game) return;
    const { ctx, w, h } = this._ctx(canvas);
    ctx.clearRect(0, 0, w, h);

    const players = this._players(game);
    const incomes = game.playerIncomes();
    const vals = players.map(p => incomes[p.id] || 0);
    const maxPos = Math.max(1, ...vals.filter(v => v > 0));
    const minNeg = Math.min(0, ...vals);

    const pad = { l: 44, r: 16, t: 36, b: 52 };
    const chartW = w - pad.l - pad.r;
    const chartH = h - pad.t - pad.b;
    const zeroY = pad.t + chartH * (maxPos / (maxPos - minNeg || 1));

    this._drawTitle(ctx, w, 'Income per turn');
    this._axis(ctx, pad.l, pad.t, chartW, chartH, zeroY, maxPos, minNeg);

    const barW = Math.min(48, (chartW / players.length) * 0.62);
    const gap = chartW / players.length;

    players.forEach((p, i) => {
      const v = vals[i];
      const x = pad.l + gap * i + (gap - barW) / 2;
      const color = p.alive ? p.color.main : '#666';
      if (v >= 0) {
        const bh = maxPos > 0 ? (v / maxPos) * (zeroY - pad.t) : 0;
        ctx.fillStyle = color;
        ctx.fillRect(x, zeroY - bh, barW, bh);
      } else {
        const bh = minNeg < 0 ? (-v / -minNeg) * (pad.t + chartH - zeroY) : 0;
        ctx.fillStyle = p.alive ? '#c45a5a' : '#555';
        ctx.fillRect(x, zeroY, barW, bh);
      }
      ctx.fillStyle = p.alive ? '#e8e8f0' : '#888';
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(v >= 0 ? '+' + v : String(v), x + barW / 2, v >= 0 ? zeroY - 6 : zeroY + bh + 14);
      ctx.fillStyle = p.alive ? '#aebdd0' : '#666';
      ctx.font = '10px system-ui, sans-serif';
      const label = p.id === 1 ? 'You' : (p.name || p.color.name);
      ctx.fillText(label, x + barW / 2, h - 12);
    });
  },

  drawLine(canvas, game, history, highlightIndex) {
    if (!canvas || !game || !history.length) return;
    const { ctx, w, h } = this._ctx(canvas);
    ctx.clearRect(0, 0, w, h);

    const players = this._players(game);
    const pad = { l: 44, r: 16, t: 36, b: 44 };
    const chartW = w - pad.l - pad.r;
    const chartH = h - pad.t - pad.b;

    let maxPos = 1;
    let minNeg = 0;
    for (const pt of history) {
      for (const p of players) {
        const v = (pt.incomes && pt.incomes[p.id]) || 0;
        if (v > maxPos) maxPos = v;
        if (v < minNeg) minNeg = v;
      }
    }

    const zeroY = pad.t + chartH * (maxPos / (maxPos - minNeg || 1));
    this._drawTitle(ctx, w, 'Income over time');
    this._axis(ctx, pad.l, pad.t, chartW, chartH, zeroY, maxPos, minNeg);

    const n = history.length;
    const xAt = (i) => pad.l + (n <= 1 ? chartW / 2 : (i / (n - 1)) * chartW);
    const yAt = (v) => {
      if (v >= 0) return zeroY - (v / maxPos) * (zeroY - pad.t);
      return zeroY + (-v / -minNeg) * (pad.t + chartH - zeroY);
    };

    if (highlightIndex >= 0 && highlightIndex < n) {
      const hx = xAt(highlightIndex);
      ctx.strokeStyle = 'rgba(255, 226, 122, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hx, pad.t);
      ctx.lineTo(hx, pad.t + chartH);
      ctx.stroke();
    }

    for (const p of players) {
      if (!p.alive && !history.some(pt => (pt.incomes[p.id] || 0) !== 0)) continue;
      ctx.strokeStyle = p.color.main;
      ctx.lineWidth = p.id === 1 ? 2.5 : 1.8;
      ctx.globalAlpha = p.alive ? 1 : 0.45;
      ctx.beginPath();
      history.forEach((pt, i) => {
        const v = (pt.incomes && pt.incomes[p.id]) || 0;
        const x = xAt(i);
        const y = yAt(v);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.globalAlpha = 1;

      const last = history[Math.min(highlightIndex, n - 1)] || history[n - 1];
      const lv = (last.incomes && last.incomes[p.id]) || 0;
      ctx.fillStyle = p.color.main;
      ctx.beginPath();
      ctx.arc(xAt(Math.min(highlightIndex, n - 1)), yAt(lv), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#8ea4bc';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const tickEvery = n <= 8 ? 1 : Math.ceil(n / 6);
    history.forEach((pt, i) => {
      if (i % tickEvery !== 0 && i !== n - 1) return;
      ctx.fillText('R' + (pt.round || i + 1), xAt(i), h - 10);
    });

    ctx.textAlign = 'left';
    ctx.fillStyle = '#aebdd0';
    ctx.font = '11px system-ui, sans-serif';
    let ly = pad.t + 4;
    for (const p of players) {
      if (!p.alive && !history.some(pt => (pt.incomes[p.id] || 0) !== 0)) continue;
      ctx.fillStyle = p.color.main;
      ctx.fillRect(pad.l + 4, ly - 8, 10, 10);
      ctx.fillStyle = '#aebdd0';
      ctx.fillText(p.id === 1 ? 'You' : (p.name || p.color.name), pad.l + 18, ly);
      ly += 14;
    }
  },

  _drawTitle(ctx, w, text) {
    ctx.fillStyle = '#e8e8f0';
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, w / 2, 22);
  },

  _axis(ctx, x, y, w, h, zeroY, maxPos, minNeg) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.beginPath();
    ctx.moveTo(x, zeroY);
    ctx.lineTo(x + w, zeroY);
    ctx.stroke();

    ctx.fillStyle = '#8ea4bc';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('+' + maxPos, x - 6, y + 10);
    if (minNeg < 0) ctx.fillText(String(minNeg), x - 6, y + h);
    else ctx.fillText('0', x - 6, zeroY + 4);
  },
};
