'use strict';

// 1 試合を 1 打席ずつ計算する

function newRec(p, start, lead) {
  return { p, start, outs: 0, pc: 0, h: 0, r: 0, bb: 0, k: 0, hr: 0, entryLead: lead };
}

function prepareSide(S, team, idx) {
  ensureLineup(S, team);
  const lineup = team.lineup.map(s => ({
    p: S.players[s.pid], pos: s.pos,
    box: { ab: 0, h: 0, hr: 0, rbi: 0, bb: 0, k: 0, r: 0, sb: 0 },
  }));
  const starter = pickStarter(S, team);
  const rot = new Set(team.rotation);
  const pen = team.active.map(id => S.players[id])
    .filter(p => canPitch(p) && p !== starter && !p.inj && !rot.has(p.id) && p.fatigue < 6); // 3 連投はさせない
  const closerP = team.closer != null ? S.players[team.closer] : null;
  const setupP = team.setup != null ? S.players[team.setup] : null;
  let def = 0, n = 0, cArm = 40;
  lineup.forEach(s => {
    if (s.pos === '指') return;
    const f = posFit(s.p, s.pos);
    def += (s.p.a.field * 0.8 + s.p.a.arm * 0.2) * f;
    n++;
    if (s.pos === '捕') cArm = s.p.a.arm * f;
  });
  const side = {
    team, idx, lineup, bi: 0, pen,
    closer: closerP && pen.includes(closerP) ? closerP : null, closerUsed: false,
    setup: setupP && pen.includes(setupP) ? setupP : null,
    def: def / n, cArm, used: [], winCand: null, loseCand: null,
  };
  side.cur = newRec(starter, true, 0);
  side.used.push(side.cur);
  return side;
}

function pitchLimit(rec) {
  return rec.start ? 70 + rec.p.a.stamina * 0.6 : 15 + rec.p.a.stamina * 0.35;
}

function fatigueMul(rec) {
  const over = rec.pc - pitchLimit(rec) * 0.75;
  return over > 0 ? Math.max(0.75, 1 - over * 0.004) : 1;
}

function doPA(b, rec, fld) {
  const p = rec.p;
  const cb = COND_MUL[b.cond], cp = COND_MUL[p.cond] * fatigueMul(rec) * aptMul(p, rec.start);
  const meet = b.a.meet * cb, pow = b.a.power * cb, spd = b.a.speed;
  const stuff = (p.a.velo * 0.45 + p.a.breaking * 0.55) * cp;
  const ctrl = p.a.control * cp;
  const pBB = U.clamp(0.085 + (50 - ctrl) * 0.0013, 0.02, 0.2);
  const pK = U.clamp(0.185 + (stuff - 50) * 0.0035 - (meet - 50) * 0.003, 0.05, 0.42);
  const pHR = U.clamp(0.021 + (pow - 50) * 0.001 - (stuff - 50) * 0.0004, 0.002, 0.09);
  let r = Math.random();
  if (r < pBB) return { t: 'BB', pc: U.rint(4, 7) };
  r -= pBB;
  if (r < pK) return { t: 'K', pc: U.rint(3, 7) };
  r -= pK;
  if (r < pHR) return { t: 'HR', pc: U.rint(1, 6) };
  const pc = U.rint(1, 6);
  const babip = U.clamp(0.29 + (meet - 50) * 0.0022 + (spd - 50) * 0.0007
    - (fld.def - 50) * 0.0018 - (stuff - 50) * 0.0008, 0.2, 0.42);
  if (Math.random() < babip) {
    const x = Math.random();
    if (x < 0.018 + Math.max(0, spd - 50) * 0.0006) return { t: '3B', pc };
    if (x < 0.2 + (pow - 50) * 0.002) return { t: '2B', pc };
    return { t: '1B', pc };
  }
  return { t: Math.random() < 0.5 ? 'GO' : 'FO', pc };
}

function changePitcher(g, fld, bat, inning, atStart) {
  const rec = fld.cur, p = rec.p;
  const lead = g.score[fld.idx] - g.score[bat.idx];
  const saveSit = inning >= 9 && lead >= 1 && lead <= 3;
  const holdSit = inning === 8 && lead >= 1 && lead <= 3;
  const closerAvail = fld.closer && !fld.closerUsed;
  const setupAvail = fld.setup && !fld.used.some(r => r.p === fld.setup);
  let change = false;
  const lim = pitchLimit(rec);
  if (rec.start) {
    if (rec.pc >= lim) change = true;
    else if (rec.r >= 5 && rec.pc >= 40) change = true;
    else if (atStart && inning >= 7 && rec.pc >= lim - 20) change = true;
  } else {
    if (rec.pc >= lim) change = true;
    else if (atStart && rec.outs >= 3) change = true;
  }
  // 8 回はセットアッパー、9 回は抑えにつなぐ
  if (atStart && saveSit && closerAvail && p !== fld.closer) change = true;
  if (atStart && holdSit && setupAvail && p !== fld.setup) change = true;
  if (!change) return;
  let next = null;
  if (saveSit && closerAvail) next = fld.closer;
  else if (holdSit && setupAvail) next = fld.setup;
  else {
    const usedSet = new Set(fld.used.map(r => r.p));
    // 勝ちパターン（セットアッパー・抑え）はリードしている終盤まで取っておく
    let cands = fld.pen.filter(x => !usedSet.has(x) && x !== fld.closer && x !== fld.setup);
    if (!cands.length && setupAvail) cands = [fld.setup];
    if (!cands.length && closerAvail && inning >= 8) cands = [fld.closer];
    if (!cands.length) return;
    // 前の日に投げた投手は後回しにして、登板を散らす
    cands.sort((a, b) => (relVal(b) + aptOf(b).rp * 4 - b.fatigue * 3) - (relVal(a) + aptOf(a).rp * 4 - a.fatigue * 3));
    if (lead <= -4) next = cands[cands.length - 1];
    else if (lead >= 5) next = cands[Math.floor(cands.length / 2)];
    else next = cands[0];
  }
  if (next === fld.closer) fld.closerUsed = true;
  fld.cur = newRec(next, false, lead);
  fld.used.push(fld.cur);
  if (g.log) g.log.push({ t: 'chg', s: `${inning}回 ${fld.team.short} 投手交代 ${p.name} → ${next.name}` });
}

function halfInning(g, bat, fld, inning) {
  const top = bat.idx === 0;
  const tag = `${inning}回${top ? '表' : '裏'}`;
  let outs = 0, runs = 0;
  const bases = [null, null, null];
  const score = (runner, slot) => {
    g.score[bat.idx]++; runs++;
    runner.p.stats.r++; runner.slot.box.r++;
    runner.rec.r++;
    if (slot) { slot.p.stats.rbi++; slot.box.rbi++; }
  };
  changePitcher(g, fld, bat, inning, true);
  let first = true;
  while (outs < 3) {
    if (!top && inning >= 9 && g.score[1] > g.score[0]) break;
    if (!first) changePitcher(g, fld, bat, inning, false);
    first = false;
    const rec = fld.cur;

    // 盗塁
    if (bases[0] && !bases[1] && outs < 2) {
      const rn = bases[0], sp = rn.p.a.speed;
      if (sp >= 55 && Math.random() < (sp - 50) * 0.006) {
        const ok = Math.random() < U.clamp(0.62 + (sp - 65) * 0.012 - (fld.cArm - 50) * 0.006, 0.3, 0.95);
        bases[0] = null;
        if (ok) {
          bases[1] = rn; rn.p.stats.sb++; rn.slot.box.sb++;
        } else {
          outs++; rec.outs++;
          if (g.log) g.log.push({ t: 'ev', s: `${tag} ${rn.p.name} 盗塁失敗` });
          if (outs >= 3) break;
        }
      }
    }

    const slot = bat.lineup[bat.bi % 9];
    bat.bi++;
    const b = slot.p;
    const before = g.score[bat.idx] - g.score[fld.idx];
    const runsBefore = g.score[bat.idx];
    const res = doPA(b, rec, fld);
    rec.pc += res.pc;
    b.stats.pa++;
    const runner = { p: b, rec, slot };
    let desc = '';
    const hit = () => { b.stats.ab++; b.stats.h++; slot.box.ab++; slot.box.h++; rec.h++; };
    switch (res.t) {
      case 'BB':
        b.stats.bb++; slot.box.bb++; rec.bb++;
        if (bases[0]) {
          if (bases[1]) { if (bases[2]) score(bases[2], slot); bases[2] = bases[1]; }
          bases[1] = bases[0];
        }
        bases[0] = runner;
        desc = '押し出し四球';
        break;
      case 'K':
        b.stats.ab++; b.stats.k++; slot.box.ab++; slot.box.k++; rec.k++;
        outs++; rec.outs++;
        break;
      case 'HR':
        hit(); b.stats.hr++; slot.box.hr++; rec.hr++;
        for (let i = 2; i >= 0; i--) if (bases[i]) { score(bases[i], slot); bases[i] = null; }
        score(runner, slot);
        desc = ['ソロホームラン', 'ツーランホームラン', 'スリーランホームラン', '満塁ホームラン'][g.score[bat.idx] - runsBefore - 1];
        break;
      case '1B':
        hit();
        if (bases[2]) { score(bases[2], slot); bases[2] = null; }
        if (bases[1]) {
          if (Math.random() < 0.55 + (bases[1].p.a.speed - 50) * 0.006) score(bases[1], slot);
          else bases[2] = bases[1];
          bases[1] = null;
        }
        if (bases[0]) {
          if (!bases[2] && Math.random() < 0.25 + (bases[0].p.a.speed - 50) * 0.005) bases[2] = bases[0];
          else bases[1] = bases[0];
          bases[0] = null;
        }
        bases[0] = runner;
        desc = 'タイムリーヒット';
        break;
      case '2B':
        hit(); b.stats.d++;
        if (bases[2]) { score(bases[2], slot); bases[2] = null; }
        if (bases[1]) { score(bases[1], slot); bases[1] = null; }
        if (bases[0]) {
          if (Math.random() < 0.35 + (bases[0].p.a.speed - 50) * 0.006) score(bases[0], slot);
          else bases[2] = bases[0];
          bases[0] = null;
        }
        bases[1] = runner;
        desc = 'タイムリーツーベース';
        break;
      case '3B':
        hit(); b.stats.t++;
        for (let i = 2; i >= 0; i--) if (bases[i]) { score(bases[i], slot); bases[i] = null; }
        bases[2] = runner;
        desc = 'タイムリースリーベース';
        break;
      case 'GO':
        b.stats.ab++; slot.box.ab++;
        outs++; rec.outs++;
        if (bases[0] && outs <= 2 && Math.random() < 0.13 + (50 - b.a.speed) * 0.002) {
          outs++; rec.outs++; bases[0] = null;
          if (g.log) g.log.push({ t: 'ev', s: `${tag} ${b.name} 併殺打` });
        } else if (outs < 3) {
          if (bases[2] && Math.random() < 0.45) { score(bases[2], slot); bases[2] = null; }
          if (bases[1] && !bases[2] && Math.random() < 0.5) { bases[2] = bases[1]; bases[1] = null; }
          if (bases[0]) {
            if (Math.random() < 0.6) bases[0] = runner; // 野手選択
            else if (!bases[1]) { bases[1] = bases[0]; bases[0] = null; }
          }
        }
        desc = '内野ゴロ';
        break;
      case 'FO':
        outs++; rec.outs++;
        if (outs < 3 && bases[2] && Math.random() < 0.4 + (bases[2].p.a.speed - 50) * 0.005) {
          score(bases[2], slot); bases[2] = null;
          desc = '犠牲フライ';
        } else { b.stats.ab++; slot.box.ab++; }
        break;
    }
    const after = g.score[bat.idx] - g.score[fld.idx];
    if (before <= 0 && after > 0) { bat.winCand = bat.cur; fld.loseCand = fld.cur; }
    const got = g.score[bat.idx] - runsBefore;
    if (g.log && got > 0) {
      g.log.push({ t: 'run', side: bat.idx, s: `${tag} ${b.name} ${desc}${got > 1 && res.t !== 'HR' ? `（${got}点）` : ''}　${g.score[0]}-${g.score[1]}` });
    }
    if (!top && inning >= 9 && g.score[1] > g.score[0]) {
      addFame(b, 3); // サヨナラの一打
      break;
    }
  }
  return runs;
}

function playGame(S, home, away, wantLog) {
  const A = prepareSide(S, away, 0), H = prepareSide(S, home, 1);
  const g = { score: [0, 0], line: [[], []], log: wantLog ? [] : null, innings: 0 };
  for (let inn = 1; inn <= 12; inn++) {
    g.line[0].push(halfInning(g, A, H, inn));
    if (inn >= 9 && g.score[1] > g.score[0]) { g.line[1].push('X'); g.innings = inn; break; }
    g.line[1].push(halfInning(g, H, A, inn));
    g.innings = inn;
    if (inn >= 9 && g.score[0] !== g.score[1]) break;
  }
  if (g.log && g.score[1] > g.score[0] && g.line[1][g.line[1].length - 1] !== 'X') {
    g.log.push({ t: 'ev', s: 'サヨナラ勝ち！' });
  }

  // 成績をまとめる
  [A, H].forEach(s => {
    s.lineup.forEach(sl => { sl.p.stats.g++; });
    s.used.forEach(r => {
      const st = r.p.stats;
      st.pg++; st.outs += r.outs; st.ph += r.h; st.per += r.r; st.pbb += r.bb; st.pk += r.k; st.phr += r.hr;
      if (r.start) { st.gs++; r.p.rest = 0; } else r.p.fatigue += 3 + r.outs;
    });
  });
  let wp = null, lp = null, sp = null;
  const winner = g.score[0] > g.score[1] ? A : g.score[1] > g.score[0] ? H : null;
  if (winner) {
    const loser = winner === A ? H : A;
    let w = winner.winCand || winner.used[0];
    if (w.start && w.outs < 15 && winner.used.length > 1) {
      w = winner.used.slice(1).reduce((a, b) => (b.outs > a.outs ? b : a));
    }
    w.p.stats.w++; wp = w.p;
    const l = loser.loseCand || loser.used[0];
    l.p.stats.l++; lp = l.p;
    const last = winner.used[winner.used.length - 1];
    if (last !== w && !last.start && last.entryLead >= 1 && last.entryLead <= 3) { last.p.stats.sv++; sp = last.p; }
    addFame(wp, 1.5);
    if (sp) addFame(sp, 1);
  }
  // 活躍で人気度が上がる
  [A, H].forEach(s => {
    s.lineup.forEach(sl => { const b = sl.box; addFame(sl.p, b.hr * 1.5 + b.h * 0.3 + b.rbi * 0.25 + b.sb * 0.3); });
    s.used.forEach(r => { addFame(r.p, r.k * 0.08 + (r.start && r.outs >= 18 && r.r <= 3 ? 1 : 0)); });
  });

  const res = {
    home: home.id, away: away.id, score: g.score.slice(), wp, lp, sp, sides: [A, H],
  };
  if (wantLog) {
    res.detail = {
      line: g.line, log: g.log, innings: g.innings,
      hits: [U.sum(H.used, r => r.h), U.sum(A.used, r => r.h)],
      bat: [A, H].map(s => s.lineup.map(sl => ({ name: sl.p.name, pos: sl.pos, ...sl.box }))),
      pit: [A, H].map(s => s.used.map(r => ({ name: r.p.name, outs: r.outs, h: r.h, r: r.r, bb: r.bb, k: r.k, pc: r.pc }))),
      wp: wp && wp.name, lp: lp && lp.name, sp: sp && sp.name,
    };
  }
  return res;
}
