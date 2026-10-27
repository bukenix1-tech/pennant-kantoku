'use strict';

// 選手を作る・評価する・育てる

function newStats() {
  return {
    g: 0, pa: 0, ab: 0, h: 0, d: 0, t: 0, hr: 0, rbi: 0, bb: 0, k: 0, sb: 0, r: 0,
    pg: 0, gs: 0, w: 0, l: 0, sv: 0, outs: 0, ph: 0, per: 0, pbb: 0, pk: 0, phr: 0,
  };
}

function makeName(foreign) {
  if (foreign) return U.pick(FOREIGN_NAMES);
  return U.pick(SURNAMES) + ' ' + U.pick(GIVEN);
}

// opts: { isP, pos, q (能力の中心), age, foreign, pot }
function newPlayer(S, opts) {
  const id = S.nextPid++;
  const isP = !!opts.isP;
  const age = opts.age != null ? opts.age : U.rint(19, 35);
  const type = U.chance(SUPER_LATE_CHANCE) ? '超晩成' : U.pick(['早熟', '普通', '普通', '晩成']);
  const pot = opts.pot != null ? opts.pot : U.clamp(1 + U.gauss() * 0.22, 0.55, 1.6);
  const q = opts.q;
  const g = () => U.gauss() * 10;
  const c = v => U.clamp(v, 5, 99);
  let a, pos, role = null, apt = null;
  if (isP) {
    pos = '投';
    const starter = opts.role ? opts.role === '先発' : U.chance(0.5);
    a = {
      velo: c(q + g()),
      control: c(q + g()),
      stamina: c(q + g() + (starter ? 12 : -15)),
      breaking: c(q + g()),
    };
    role = a.stamina >= 50 ? '先発' : '中継';
    apt = rollApt(a.stamina);
  } else {
    pos = opts.pos || U.pick(FPOS);
    const bias = {
      捕: { meet: -3, power: 0, speed: -10, arm: 8, field: 6 },
      一: { meet: 2, power: 8, speed: -8, arm: -5, field: -5 },
      二: { meet: 3, power: -6, speed: 5, arm: -2, field: 5 },
      三: { meet: 0, power: 4, speed: -2, arm: 5, field: 0 },
      遊: { meet: 0, power: -8, speed: 6, arm: 5, field: 8 },
      外: { meet: 1, power: 2, speed: 5, arm: 2, field: -2 },
    }[pos];
    a = {};
    BAT_KEYS.forEach(k => { a[k] = c(q + g() + bias[k]); });
  }
  const traj = isP ? null : rollTraj(a.power);
  const p = {
    id, name: makeName(opts.foreign), age, isP, pos, role, type, traj,
    peak: GROWTH_PEAK[type] + U.rint(-1, 1), pot, a,
    foreign: !!opts.foreign, teamId: null, salary: 0,
    focus: 'バランス', cond: 3, inj: 0, rest: 5, fatigue: 0,
    stats: newStats(), career: [], apt,
    visual: rollVisual(), fame: 0, loyalty: U.rint(30, 80), genius: U.chance(GENIUS_CHANCE), home: opts.foreign ? null : U.pick(PREFS),
  };
  p.salary = calcSalary(p);
  p.fame = initialFame(p);
  S.players[id] = p;
  return p;
}

// ビジュアル（★1〜5、生まれつき）
function rollVisual() {
  let r = Math.random() * 100;
  for (let i = 0; i < VISUAL_WEIGHTS.length; i++) {
    r -= VISUAL_WEIGHTS[i];
    if (r < 0) return i + 1;
  }
  return 3;
}

// 人気度（0〜100）。活躍で上がり、活躍しないと下がる
function initialFame(p) {
  if (p.age <= 22) return U.clamp(p.visual * 4 + U.rnd(0, 8), 0, 100);
  return U.clamp((ovr(p) - 45) * 1.8 + U.gauss() * 8 + p.visual * 3, 0, 100);
}

function addFame(p, v) {
  if (v > 0) p.fame = Math.min(100, p.fame + v * (1 - p.fame / 120));
  else p.fame = Math.max(0, p.fame + v);
}

// 球団への忠誠心（0〜100）。いまは表示とグッズでの上下だけ。契約・移籍に効かせるのはこれから
function addLoyalty(p, v) { p.loyalty = U.clamp(p.loyalty + v, 0, 100); }

function visualStars(v) { return '★'.repeat(v) + '☆'.repeat(5 - v); }

// 先発と中継ぎの適性（0 = △、1 = ○、2 = ◎）。スタミナがある投手ほど先発向き
function rollApt(stamina) {
  const sp = U.clamp(Math.round((stamina - 35) / 15 + U.gauss() * 0.5), 0, 2);
  const rp = U.clamp(Math.round(1.2 + U.gauss() * 0.7 - (sp === 2 ? 0.5 : 0)), 0, 2);
  return { sp, rp };
}
function aptOf(p) { return p.apt || { sp: 1, rp: 1 }; }
// 先発で投げるか中継ぎで投げるかで、力の出方が少し変わる
function aptMul(p, start) { const a = aptOf(p); return APT_MUL[start ? a.sp : a.rp]; }

// 二刀流：投手と野手の両方の能力を持つ。p.isP は「本業」が投手かどうか
function canPitch(p) { return p.isP || !!p.twoWay; }
function canBat(p) { return !p.isP || !!p.twoWay; }
function abilKeys(p) { return p.twoWay ? [...PIT_KEYS, ...BAT_KEYS] : p.isP ? PIT_KEYS : BAT_KEYS; }

// もう片方の能力を足して二刀流にする（q はその能力の中心）
function makeTwoWay(p, q) {
  const c = v => U.clamp(v, 5, 99);
  if (p.isP) {
    BAT_KEYS.forEach(k => { p.a[k] = c(q + U.gauss() * 8); });
    p.traj = rollTraj(p.a.power);
    p.pos2 = U.pick(['外', '外', '一', '三']);
  } else {
    p.a.velo = c(q + U.gauss() * 8); p.a.control = c(q + U.gauss() * 8);
    p.a.stamina = c(q + 5 + U.gauss() * 8); p.a.breaking = c(q + U.gauss() * 8);
    p.apt = rollApt(p.a.stamina);
  }
  p.twoWay = true;
}

// 二刀流をやめる（本業でないほうの能力をなくす）
function dropTwoWay(p) {
  (p.isP ? BAT_KEYS : PIT_KEYS).forEach(k => { delete p.a[k]; });
  p.twoWay = false;
  delete p.pos2;
  if (!p.isP) p.role = null;
}

// 弾道はパワーにだいたい合わせて決まる（パワーがあっても弾道の低い人もいる）
function rollTraj(power) { return U.clamp(Math.round(1.2 + (power - 30) / 18 + U.gauss() * 0.7), 1, 4); }
function trajOf(p) { return p.traj || 2; }
// オフに、パワーが足りていれば弾道が上がることがある
function growTraj(p) {
  const t = trajOf(p);
  if (!canBat(p) || t >= 4) return;
  if (p.a.power >= TRAJ_UP_POWER[t + 1] && U.chance(TRAJ_UP_CHANCE)) p.traj = t + 1;
}

function batOvr(p) { const a = p.a; return a.meet * 0.3 + a.power * 0.3 + a.speed * 0.12 + a.arm * 0.08 + a.field * 0.2; }
function pitOvr(p) { return p.role === '先発' ? starterVal(p) : relVal(p) * 0.95 + p.a.stamina * 0.05; }

function batVal(p) { return p.a.meet * 0.5 + p.a.power * 0.5; }
function starterVal(p) { return p.a.velo * 0.28 + p.a.control * 0.25 + p.a.breaking * 0.3 + p.a.stamina * 0.17; }
function relVal(p) { return p.a.velo * 0.35 + p.a.control * 0.25 + p.a.breaking * 0.4; }

function ovr(p) {
  if (p.twoWay) {
    // 二刀流は、得意なほう ＋ もう片方がそこそこならその分も上乗せ
    const po = pitOvr(p), bo = batOvr(p);
    return Math.max(po, bo) + Math.max(0, Math.min(po, bo) - 40) * 0.5;
  }
  return p.isP ? pitOvr(p) : batOvr(p);
}

function calcSalary(p) {
  const o = ovr(p);
  let s = 500 + Math.pow(Math.max(0, o - 38), 2.5) * 3;
  if (p.foreign) s *= 1.3;
  return Math.round(s / 10) * 10;
}

// 守備位置への向き不向き（1 = 本職）
function posFit(p, pos) {
  if (pos === '指') return 1;
  if (p.isP && !p.twoWay) return 0.3;
  const prim = p.isP ? p.pos2 : p.pos;
  if (prim === pos) return 1;
  if (prim === '外' && (pos === '左' || pos === '中' || pos === '右')) return 1;
  const near = { 遊: ['二', '三'], 二: ['遊', '三', '一'], 三: ['一', '二'], 一: [], 捕: ['一'], 外: ['一'] };
  if (near[prim].includes(pos)) return 0.85;
  if (pos === '捕') return 0.4;
  return 0.6;
}

function potStars(pot) {
  const n = pot < 0.8 ? 1 : pot < 0.95 ? 2 : pot < 1.1 ? 3 : pot < 1.28 ? 4 : 5;
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

function veloKmh(v) { return Math.round(130 + v * 0.3); }

// 1 回の練習（6 日に 1 回とキャンプで呼ぶ）
function trainPlayer(p, mult) {
  const keys = abilKeys(p);
  const age = p.age, peak = p.peak;
  const ageMul = age <= peak - 3 ? 1.0 : age <= peak ? 0.7 : age <= peak + 3 ? 0.3 : 0.08;
  // 天才はよく伸びる。二刀流は両方を練習するので、ひとつひとつの伸びは小さめ
  const special = (p.genius ? 1.6 : 1) * (p.twoWay ? 0.6 : 1);
  const total = 0.7 * p.pot * ageMul * mult * special * U.rnd(0.6, 1.4);
  const focusKey = focusToKey(p);
  // 才能で決まる伸びしろ（★が多いほど高くまで伸びる。天才はさらに上まで）
  const ceil = 38 + p.pot * 32 + (p.genius ? 10 : 0);
  keys.forEach(k => {
    const share = focusKey ? (k === focusKey ? 0.6 : 0.4 / (keys.length - 1)) : 1 / keys.length;
    const cur = p.a[k];
    const gain = total * share * keys.length * 0.5 * U.clamp((ceil - cur) / 40, 0.03, 1);
    p.a[k] = Math.min(99, cur + gain);
  });
}

const FOCUS_BAT = ['バランス', 'ミート', 'パワー', '走力', '肩力', '守備力'];
const FOCUS_PIT = ['バランス', '球速', 'コントロール', 'スタミナ', '変化球'];
function focusToKey(p) {
  if (p.focus === 'バランス') return null;
  return abilKeys(p).find(k => ALL_LABEL[k] === p.focus) || null;
}
function focusOptions(p) {
  if (p.twoWay) return ['バランス', ...FOCUS_PIT.slice(1), ...FOCUS_BAT.slice(1)];
  return p.isP ? FOCUS_PIT : FOCUS_BAT;
}

// 成長の時期。練習の伸び（trainPlayer）と年を取ったときの衰え（agePlayer）に合わせて分ける
//   成長期：ピークの 3 年前まで。練習でよく伸びる
//   ピーク：その次の年からピークの翌年まで。伸びはゆるやかになるが、まだ衰えない
//   衰退期：ピークの 2 年後から。毎年オフに能力が下がる
function growthSpan(p) { return { growEnd: p.peak - 3, peakFrom: p.peak - 2, peakTo: p.peak + 1, declineFrom: p.peak + 2 }; }
function growthPhase(p) {
  const g = growthSpan(p);
  if (p.age <= g.growEnd) return { k: 'grow', name: '成長期', short: '成', left: g.growEnd - p.age };
  if (p.age <= g.peakTo) return { k: 'peak', name: 'ピーク', short: '頂', left: g.peakTo - p.age };
  return { k: 'decline', name: '衰退期', short: '衰', left: null };
}

// 年を取ったときの衰え
function agePlayer(p) {
  p.age++;
  growTraj(p);
  const over = p.age - (p.peak + 1);
  if (over > 0) {
    abilKeys(p).forEach(k => {
      p.a[k] = Math.max(5, p.a[k] - U.rnd(1, 3) * (1 + over * 0.3));
    });
  }
  if (p.isP) p.role = p.role === '抑え' ? '抑え' : (aptOf(p).sp >= aptOf(p).rp ? '先発' : '中継');
}

// 引退・戦力外・トレードの値打ちで見る年齢。超晩成型は花開くのが遅いので、そのぶん若く見る
function careerAge(p) { return p.type === '超晩成' ? p.age - SUPER_LATE_SHIFT : p.age; }

function tradeValue(p) {
  const o = ovr(p);
  const ca = careerAge(p);
  const ageMul = ca <= 24 ? 1.3 : ca <= 28 ? 1.1 : ca <= 31 ? 1.0 : ca <= 34 ? 0.7 : 0.4;
  let v = Math.pow(Math.max(o - 30, 1), 2) * ageMul * (0.8 + p.pot * 0.2);
  if (p.age <= 23) v *= p.pot;
  return Math.round(v);
}
