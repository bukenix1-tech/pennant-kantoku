'use strict';

// 小さな道具（乱数・表示の整形）
const U = {
  rnd(a, b) { return a + Math.random() * (b - a); },
  rint(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); },
  gauss() {
    let u = 0, v = 0;
    while (!u) u = Math.random();
    while (!v) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  },
  clamp(v, a, b) { return Math.max(a, Math.min(b, v)); },
  pick(a) { return a[Math.floor(Math.random() * a.length)]; },
  // [[値, 重み], ...] から重みに応じて 1 つ選ぶ
  pickW(list) { let r = Math.random() * list.reduce((t, x) => t + x[1], 0); for (const [v, w] of list) { if ((r -= w) < 0) return v; } return list[list.length - 1][0]; },
  chance(p) { return Math.random() < p; },
  shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },
  sum(a, f) { return a.reduce((s, x) => s + (f ? f(x) : x), 0); },
  esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },
  // お金は「万円」で持つ
  money(m) {
    const sign = m < 0 ? '-' : '';
    m = Math.abs(Math.round(m));
    if (m >= 10000) return sign + (m / 10000).toFixed(1) + '億円';
    return sign + m.toLocaleString() + '万円';
  },
  grade(v) {
    v = Math.round(v);
    if (v >= 100) return 'SS';
    if (v >= 90) return 'S';
    if (v >= 80) return 'A';
    if (v >= 70) return 'B';
    if (v >= 60) return 'C';
    if (v >= 50) return 'D';
    if (v >= 40) return 'E';
    if (v >= 20) return 'F';
    return 'G';
  },
  avg(h, ab) {
    if (!ab) return '.---';
    const v = h / ab;
    return v >= 1 ? '1.000' : v.toFixed(3).replace(/^0/, '');
  },
  era(er, outs) {
    if (!outs) return er ? '∞' : '-.--';
    return (er * 27 / outs).toFixed(2);
  },
  ip(outs) { return Math.floor(outs / 3) + (outs % 3 ? '.' + (outs % 3) : ''); },
};
