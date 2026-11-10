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
  const c = v => U.clamp(v, 5, ABIL_MAX);
  let a, pos, role = null, apt = null;
  if (isP) {
    pos = '投';
    const starter = opts.role ? opts.role === '先発' : U.chance(0.5);
    a = {
      velo: c(q + g()),
      control: c(q + g()),
      stamina: c(q + g() + (starter ? 12 : -15)),
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
  const subs = isP ? undefined : rollSubs(pos, a.field);
  const steal = isP ? undefined : rollSteal();
  const eye = isP ? undefined : U.pickW(EYE_W);
  const p = {
    id, name: makeName(opts.foreign), age, isP, pos, subs, steal, eye, role, type, traj,
    peak: GROWTH_PEAK[type] + U.rint(-1, 1), pot, a,
    foreign: !!opts.foreign, teamId: null, salary: 0,
    focus: 'バランス', cond: 3, inj: 0, rest: 5, fatigue: 0,
    stats: newStats(), career: [], apt,
    visual: rollVisual(), fame: 0, loyalty: U.rint(30, 80), genius: U.chance(GENIUS_CHANCE), home: opts.foreign ? null : U.pick(PREFS),
  };
  if (isP) initPitches(p, c(q + g()));
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

// 持ち球。p.pitches（よく投げる順）と、球種ごとのキレ p.pv（裏の値）、伸びしろのずれ p.pc を持つ。球種ごとに伸びる
function pitchTarget(b) { return U.clamp(2 + (b >= 45 ? 1 : 0) + (b >= 65 ? 1 : 0) + (b >= 85 ? 1 : 0), 2, PITCH_MAX); }
function rollPitch(have) {
  const c = Object.keys(PITCHES).filter(t => !have.includes(t));
  return U.pickW(c.map(t => [t, PITCHES[t].w]));
}
function rollPitches(b) {
  const list = [], n = U.clamp(pitchTarget(b) + (U.chance(0.2) ? 1 : 0), 2, PITCH_MAX);
  while (list.length < n) list.push(rollPitch(list));
  return list;
}
// 持ち球を作る。b はいちばんの球のキレ
function initPitches(p, b) {
  p.pitches = rollPitches(b); p.pv = {}; p.pc = {};
  if (p.lefty == null) p.lefty = U.chance(LEFTY_CHANCE);
  p.pitches.forEach((t, i) => {
    const off = PITCH_OFFSET[i] * PITCH_STEP;
    p.pv[t] = U.clamp(b + off + U.gauss() * 4, 5, ABIL_MAX);
    p.pc[t] = off + Math.round(U.gauss() * 5);
  });
  p.pitches.forEach(t => pitchFitCeil(p, t));
}
// 球種のキレが伸びしろの上限を超えて生まれたら、上限を少し上に置き直す。
// 持ち球の数はキレで、上限は素質で決まるので、直さないと球種の多い投手ほど最初から停滞になる
function pitchFitCeil(p, t) {
  if (p.reborn || !p.pc) return;
  const v = p.pv[t], c = abilCeil(p, t);
  if (c < v) p.pc[t] += Math.round(v + U.rnd(0, 8) - c);
}
// 転生選手は、編集画面で決めた持ち球を使う（あとから直しても、もう現れた選手に効く）
function rebornPitches(p) {
  const R = p.reborn ? rebornOf(p) : null;
  return R && R.pitches && R.pitches.length ? R : null;
}
function pitchesOf(p) {
  const R = rebornPitches(p);
  if (R) return R.pitches;
  if (!p.pitches && canPitch(p)) initPitches(p, 40);
  return p.pitches || [];
}
// 利き腕。転生選手は編集画面で決めた腕。前の版の選手は、はじめて見たときに決める
function isLefty(p) {
  const R = p.reborn ? rebornOf(p) : null;
  if (R && R.hand) return R.hand === '左';
  if (p.lefty == null) p.lefty = canPitch(p) ? U.chance(LEFTY_CHANCE) : !RIGHT_ONLY_POS.includes(p.pos) && U.chance(LEFTY_FIELD_CHANCE);
  return p.lefty;
}
// 打席（'右' '左' '両'）。左投げはほとんど左打ちで、右投げにも左打ちがいる（右投げ左打ち）
function batSide(p) {
  const R = p.reborn ? rebornOf(p) : null;
  if (R && R.bats) return R.bats;
  if (!p.bats) {
    const r = Math.random();
    p.bats = isLefty(p) ? (r < BAT_L_IF_LEFTY ? '左' : '右') : r < BAT_S_CHANCE ? '両' : r < BAT_S_CHANCE + BAT_L_IF_RIGHTY ? '左' : '右';
  }
  return p.bats;
}
// 「右投左打」のような書き方。打たない投手は「右投げ」
function handText(p) { return canBat(p) ? `${isLefty(p) ? '左' : '右'}投${batSide(p)}打` : `${isLefty(p) ? '左' : '右'}投げ`; }
// 球の曲がる向き（度。右が 0、下が 90。捕手から見た向き）。左投げは左右が逆
function pitchDir(p, t) { const d = PITCHES[t].dir; return isLefty(p) ? 180 - d : d; }
function pitchOff(p, t) {
  if (p.pc && p.pc[t] != null) return p.pc[t];
  return PITCH_OFFSET[Math.max(0, pitchesOf(p).indexOf(t))] * PITCH_STEP;
}
// 球種の伸びしろの上限（広がった分は abilCeil で足す）。転生選手は決めた変化量がピーク
function pitchCeilBase(p, t) {
  if (!p.reborn) return CEIL_BASE + p.pot * CEIL_PER_POT + (p.genius ? 10 : 0) + pitchOff(p, t);
  const R = rebornPitches(p), i = R ? R.pitches.indexOf(t) : -1, set = i >= 0 && R.pitchLv && R.pitchLv[i];
  return (set ? set * PITCH_STEP : ((p.ceilA && p.ceilA.breaking) || PITCH_AUTO_CEIL) + pitchOff(p, t)) + (p.genius ? 5 : 0);
}
// 今の力がピーク時の何割か（編集画面であとから足した球種のキレを決めるのに使う）
function pitchProgress(p) {
  const keys = PIT_KEYS.filter(k => p.ceilA && p.ceilA[k] > 0);
  return keys.length ? U.clamp(U.sum(keys, k => p.a[k] / p.ceilA[k]) / keys.length, 0.3, 1) : 0.8;
}
function pitchVal(p, t) {
  const v = p.pv && p.pv[t];
  if (v != null) return v;
  p.pv = p.pv || {};
  p.pv[t] = U.clamp(pitchCeilBase(p, t) * pitchProgress(p), 5, ABIL_MAX);
  return p.pv[t];
}
// 球種の変化量（1〜7）。キレの値を丸めたもの
function pitchLevel(p, t) { return U.clamp(Math.round(pitchVal(p, t) / PITCH_STEP), 1, 7); }
function pitchTop(p) { return Math.max(0, ...pitchesOf(p).map(t => pitchVal(p, t))); }
// 球種の効き目。キレの高い球種ほどよく投げ（r）、キレが全体に高いほど効き目が大きい（s）。power は球威に使う強さ
const pitchMixes = new WeakMap();
function pitchMix(p) {
  const list = pitchesOf(p), vals = list.map(t => pitchVal(p, t)), sig = U.sum(vals);
  let c = pitchMixes.get(p);
  if (c && c.list === list && c.sig === sig) return c;
  const r = { k: 0, b: 0, hr: 0, f: 0 };
  c = { list, sig, r, s: 0, power: 0 };
  if (list.length) {
    const share = PITCH_SHARE.slice(0, list.length), w = vals.map((v, i) => share[i] * v), total = U.sum(w);
    list.forEach((t, i) => { Object.keys(r).forEach(x => { r[x] += PITCHES[t][x] * w[i] / total; }); });
    const mean = total / U.sum(share);
    c.s = U.clamp(mean / PITCH_S_REF, 0.25, 1.7);
    c.power = mean + PITCH_N_BONUS[list.length];
  }
  pitchMixes.set(p, c);
  return c;
}
function pitchProfile(p) { return pitchMix(p).r; }
function pitchScale(p) { return pitchMix(p).s; }
function pitchPower(p) { return p.pvSeen != null ? p.pvSeen : pitchMix(p).power; } // pvSeen はスカウトの見立てで評価するとき
function pitchStyle(p) {
  const k = pitchProfile(p).k;
  return k >= PITCH_STYLE_K ? '三振型' : k <= PITCH_STYLE_G ? '打たせて取る' : 'バランス型';
}
// 新しい球種を覚える。覚えられなければ null
function learnPitch(p) {
  const list = pitchesOf(p);
  if (!list.length || list.length >= PITCH_MAX || rebornPitches(p)) return null; // 持ち球を決めた転生選手は、本人らしさを保つため増やさない
  const t = rollPitch(list), off = PITCH_OFFSET[list.length] * PITCH_STEP, top = pitchTop(p);
  p.pitches = [...list, t];
  p.pv[t] = Math.max(5, top + off + U.gauss() * 4);
  p.pc = p.pc || {}; p.pc[t] = off + Math.round(U.gauss() * 5);
  pitchFitCeil(p, t);
  return t;
}
// 能力と球種を同じように扱う（k は能力か球種の記号）
function abilGet(p, k) { return PITCHES[k] ? pitchVal(p, k) : p.a[k]; }
function abilSet(p, k, v) { if (PITCHES[k]) p.pv[k] = Math.round(v * 100) / 100; else p.a[k] = v; }
function abilLabel(k) { return PITCHES[k] ? PITCHES[k].name : ALL_LABEL[k]; }
function growKeys(p) { return canPitch(p) ? [...abilKeys(p), ...pitchesOf(p)] : abilKeys(p); } // 能力と全部の球種
function pickKeys(p) { return canPitch(p) ? [...abilKeys(p), U.pick(pitchesOf(p))] : abilKeys(p); } // 能力と、球種からどれか 1 つ

// 二刀流：投手と野手の両方の能力を持つ。p.isP は「本業」が投手かどうか
function canPitch(p) { return p.isP || !!p.twoWay; }
function canBat(p) { return !p.isP || !!p.twoWay; }
function abilKeys(p) { return p.twoWay ? [...PIT_KEYS, ...BAT_KEYS] : p.isP ? PIT_KEYS : BAT_KEYS; }

// もう片方の能力を足して二刀流にする（q はその能力の中心）
function makeTwoWay(p, q) {
  const c = v => U.clamp(v, 5, ABIL_MAX);
  if (p.isP) {
    BAT_KEYS.forEach(k => { p.a[k] = c(q + U.gauss() * 8); });
    p.traj = rollTraj(p.a.power);
    p.pos2 = U.pick(['外', '外', '一', '三']);
    p.subs = rollSubs(p.pos2, p.a.field);
    p.steal = rollSteal();
    p.eye = U.pickW(EYE_W);
  } else {
    p.a.velo = c(q + U.gauss() * 8); p.a.control = c(q + U.gauss() * 8);
    p.a.stamina = c(q + 5 + U.gauss() * 8); initPitches(p, c(q + U.gauss() * 8));
    p.apt = rollApt(p.a.stamina);
  }
  p.twoWay = true;
}

// 二刀流をやめる（本業でないほうの能力をなくす）
function dropTwoWay(p) {
  (p.isP ? BAT_KEYS : PIT_KEYS).forEach(k => { delete p.a[k]; });
  p.twoWay = false;
  delete p.pos2;
  if (p.isP) delete p.subs;
  if (!p.isP) { delete p.pitches; delete p.pv; delete p.pc; }
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

function batOvr(p) { const a = p.a, w = POS_OVR_W[(p.isP ? p.pos2 : p.pos)] || POS_OVR_W.外; return BAT_KEYS.reduce((s, k) => s + a[k] * w[k], 0); }
function pitOvr(p) { return p.role === '先発' ? starterVal(p) : relVal(p) * 0.95 + p.a.stamina * 0.05; }

function batVal(p) { return p.a.meet * 0.5 + p.a.power * 0.5; }
function starterVal(p) { return p.a.velo * 0.28 + p.a.control * 0.25 + pitchPower(p) * 0.3 + p.a.stamina * 0.17; }
function relVal(p) { return p.a.velo * 0.35 + p.a.control * 0.25 + pitchPower(p) * 0.4; }

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
  let s = realSal(500 + Math.pow(Math.max(0, o - 46), 2.5) * 3);
  if (p.foreign) s *= 1.3;
  return Math.max(MIN_SALARY, Math.round(s / 10) * 10);
}

// サブポジを決める。守備がうまい選手ほど、いろいろ守れやすい
function rollSubs(prim, field) {
  let n = U.pickW(SUB_COUNT_W);
  if (field >= 70 && n < 3 && U.chance(0.3)) n++;
  if (!SUB_CANDS[prim]) return []; // DH 専門などはサブポジなし
  const cands = SUB_CANDS[prim].slice();
  const subs = [];
  while (subs.length < n && cands.length) {
    const k = U.pickW(cands);
    subs.push(k);
    cands.splice(cands.findIndex(c => c[0] === k), 1);
  }
  return LPOS.filter(x => subs.includes(x)).concat(subs.includes('外') ? ['外'] : []);
}
// 盗塁の積極性。足の速さとは別の、走りたがるかどうか
function rollSteal() { return Math.round(U.clamp(1 + U.gauss() * STEAL_SD, 0.4, 1.8) * 100) / 100; }
function stealOf(p) { return p.steal || 1; }
function eyeOf(p) { return p.eye || 0; }
function stealWord(p) { const s = stealOf(p); return s >= STEAL_HI ? '積極的' : s <= STEAL_LO ? '慎重' : 'ふつう'; }
function subsOf(p) { return canBat(p) ? p.subs || [] : []; }

// 守備位置への向き不向き（1 = 本職）
function posFit(p, pos) {
  if (pos === '指') return 1;
  if (p.isP && !p.twoWay) return 0.3;
  const prim = p.isP ? p.pos2 : p.pos;
  if (prim === '指') return 0.3; // DH 専門は守らない（指名打者は上で 1）
  const area = pos === '左' || pos === '中' || pos === '右' ? '外' : pos;
  if (prim === area) return 1;
  if ((p.subs || []).includes(area)) return SUB_FIT;
  if (pos === '捕') return 0.4;
  return 0.6;
}

function potStars(pot) {
  const n = pot < 0.8 ? 1 : pot < 0.95 ? 2 : pot < 1.1 ? 3 : pot < 1.28 ? 4 : 5;
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

// 球速の能力 → km/h。90（157km）までは 1 で 0.3km、そこから上は 1 で 1km（103 で 170km）
function veloKmh(v) { return Math.round(v <= 90 ? 130 + v * 0.3 : 157 + (v - 90)); }
function kmhToVelo(km) { return U.clamp(km <= 157 ? (km - 130) / 0.3 : 90 + (km - 157), 5, VELO_MAX); }

// 才能で決まる伸びしろ（★が多いほど高くまで伸びる。天才はさらに上まで）
// 転生選手は、能力ごとにピーク時の値が上限（p.ceilA）
function abilCeil(p, k) {
  const up = ((k && p.ceilUp && p.ceilUp[k]) || 0) + ((k && p.awakeUp && p.awakeUp[k]) || 0); // 上限解放と覚醒で広がった分
  if (k && PITCHES[k]) return pitchCeilBase(p, k) + up + ((p.ceilUp && p.ceilUp.breaking) || 0) + ((p.awakeUp && p.awakeUp.breaking) || 0); // breaking は前の版で広がった分
  return (k && p.ceilA && p.ceilA[k] != null ? p.ceilA[k] + (p.genius ? 5 : 0) : CEIL_BASE + p.pot * CEIL_PER_POT + (p.genius ? 10 : 0)) + up;
}
// 伸びしろの上限の近くまで来て、練習してもほとんど伸びない能力（衰退期は衰えのほうを見せるので出さない）
// 能力の天井。転生選手はピーク時の値を練習で目指し、覚醒などで REBORN_OVER まで超えられる（天才肌はさらに +5）
function abilMax(p, k) {
  if (k && PITCHES[k]) return p.reborn ? Math.min(ABIL_MAX, abilCeil(p, k) + REBORN_OVER) : ABIL_MAX;
  const top = k === 'velo' ? VELO_MAX : ABIL_MAX;
  return p.ceilA && p.ceilA[k] != null ? Math.min(top, abilCeil(p, k) + REBORN_OVER) : top;
}
function abilStalled(p, k) { return growthPhase(p).k !== 'decline' && abilGet(p, k) < abilMax(p, k) && abilCeil(p, k) - abilGet(p, k) <= STALL_GAP; }

// 1 回の練習（6 日に 1 回とキャンプで呼ぶ）
function trainPlayer(p, mult) {
  const keys = abilKeys(p);
  const age = p.age, peak = p.peak;
  const ageMul = age <= peak - 3 ? 1.0 : age <= peak ? 0.35 : age <= peak + 3 ? 0.1 : 0.03;
  // 天才はよく伸びる。二刀流は両方を練習するので、ひとつひとつの伸びは小さめ
  const special = (p.genius ? 1.6 : 1) * (p.twoWay ? 0.6 : 1);
  const total = 0.6 * p.pot * ageMul * mult * special * U.rnd(0.6, 1.4);
  const focusKey = focusToKey(p);
  const pitches = canPitch(p) ? pitchesOf(p) : [];
  const n = keys.length + (pitches.length ? 1 : 0); // 球種はまとめて能力 1 つ分の練習。それぞれの球種がその分だけ伸びる
  const grow = (k, luck) => {
    const ceil = abilCeil(p, k), cur = abilGet(p, k);
    const share = focusKey ? (k === focusKey ? 0.6 : 0.4 / (n - 1)) : 1 / n;
    const gain = total * share * n * 0.5 * U.clamp((ceil - cur) / 40, 0.03, 1) * luck;
    abilSet(p, k, Math.max(cur, Math.min(abilMax(p, k), cur + gain)));
  };
  keys.forEach(k => grow(k, 1));
  pitches.forEach(t => grow(t, U.rnd(0.7, 1.3))); // 球種ごとに伸び方がばらつく
}

const FOCUS_BAT = ['バランス', 'ミート', 'パワー', '走力', '肩力', '守備力'];
const FOCUS_PIT = ['バランス', '球速', 'コントロール', 'スタミナ'];
function focusToKey(p) {
  if (p.focus === 'バランス') return null;
  return abilKeys(p).find(k => ALL_LABEL[k] === p.focus) || (canPitch(p) && pitchesOf(p).find(t => PITCHES[t].name === p.focus)) || null;
}
function focusOptions(p) {
  const pitches = canPitch(p) ? pitchesOf(p).map(t => PITCHES[t].name) : [];
  if (p.twoWay) return ['バランス', ...FOCUS_PIT.slice(1), ...pitches, ...FOCUS_BAT.slice(1)];
  return p.isP ? [...FOCUS_PIT, ...pitches] : FOCUS_BAT;
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
  // よく投げる順は、いま切れている球から（決めてある転生選手はそのまま）
  if (canPitch(p) && !rebornPitches(p) && p.pitches) p.pitches = p.pitches.slice().sort((x, y) => pitchVal(p, y) - pitchVal(p, x));
  // 若いうちは、いちばんの球の力に見合う数まで球種を覚えていく
  if (canPitch(p) && p.age <= 33 && pitchesOf(p).length < pitchTarget(pitchTop(p)) && U.chance(PITCH_LEARN)) {
    const t = learnPitch(p);
    if (t && p.teamId === S.myTeamId) addNews(`${p.name}が新しい球種「${PITCHES[t].name}」を覚えました。`, 'good');
  }
  const over = p.age - (p.peak + 1);
  const t = p.teamId != null ? S.teams[p.teamId] : null;
  const gym = t ? 1 - (facLv(t, 'gym') - 1) * GYM_SLOW : 1; // トレーニングルーム
  if (over > 0) {
    growKeys(p).forEach(k => {
      abilSet(p, k, Math.max(5, abilGet(p, k) - U.rnd(1, 3) * (1 + over * 0.3) * (p.retireAge ? 0.5 : 1) * gym)); // 長く続けた転生選手は衰えがゆるやか
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
