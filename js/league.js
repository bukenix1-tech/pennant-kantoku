'use strict';

// リーグ全体の進行：日程・オーダー・経営・オフシーズン

let S = null; // いまのゲームの状態（まるごと保存する）

function myTeam() { return S.teams[S.myTeamId]; }
function teamPlayers(t) { return t.players.map(id => S.players[id]); }
function addNews(text, kind) {
  S.news.unshift({ y: S.year, d: curDateLabel(), text, kind: kind || '' });
  if (S.news.length > 80) S.news.length = 80;
}

function dateLabel(e) { return `${e.m}/${e.d}(${WEEKDAYS[e.w]})`; }
function curDateLabel() {
  if (S.phase === 'post') return 'ポストシーズン';
  if (S.phase === 'off' || !S.schedule.length) return 'オフ';
  return dateLabel(S.schedule[Math.min(S.day, S.schedule.length - 1)]);
}
function gamesPlayed(t) { return t.w + t.l + t.d; }

function newFin() { return { gate: 0, food: 0, tv: 0, goods: 0, sponsor: 0, other: 0, salary: 0, ops: 0, invest: 0 }; }

// ---------- 新しいゲーム ----------
function newGame(myTeamId, games) {
  S = {
    version: 1, year: 2027, day: 0, games, myTeamId, phase: 'season',
    teams: [], players: {}, nextPid: 1, schedule: [], news: [], history: [], awardHist: [], records: { season: {} }, retired: [],
    lastGame: null, myGames: [], off: null, post: null, foreignCands: null, popups: [], freeAgents: [],
  };
  TEAM_DEFS.forEach((d, i) => {
    const t = {
      id: i, name: d.name, short: d.short, color: d.color, lg: d.lg,
      players: [], active: [], lineup: [], rotation: [], closer: null, setup: null, rotIdx: 0,
      w: 0, l: 0, d: 0, rs: 0, ra: 0,
      money: 150000 + U.rint(0, 10) * 5000, pop: U.rint(40, 60), goods: [], nextGoodsId: 1,
      fac: { train: 1, stadium: 1, scout: 1, medical: 1 }, intensity: '普通', fin: newFin(),
    };
    if (i !== myTeamId) t.fac.train = U.rint(1, 3);
    S.teams.push(t);
    const tq = 65 + U.gauss() * 2;
    const fpos = ['捕', '捕', '一', '一', '二', '二', '三', '三', '遊', '遊', '外', '外', '外', '外', '外'];
    const regular = new Set([0, 2, 4, 6, 8, 10, 11, 12]);
    fpos.forEach((pos, j) => {
      const age = U.rint(19, 36);
      const q = (regular.has(j) ? tq + 4 : tq - 7) + U.gauss() * 5 - Math.max(0, 24 - age) * 2;
      signPlayer(t, newPlayer(S, { pos, q, age }));
    });
    for (let j = 0; j < 14; j++) {
      const age = U.rint(19, 36);
      const q = (j < ROTATION_SIZE ? tq + 3 : tq - 3) + U.gauss() * 5 - Math.max(0, 24 - age) * 2;
      signPlayer(t, newPlayer(S, { isP: true, role: j < ROTATION_SIZE + 1 ? '先発' : '中継', q, age }));
    }
    // 二軍：若手の有望株と、中堅・ベテラン
    ['捕', '捕', '捕', '一', '一', '二', '二', '三', '三', '遊', '遊', '外', '外', '外', '外', '外', '外', '三', '二']
      .forEach(pos => signPlayer(t, newFarmPlayer(tq, { pos })));
    for (let j = 0; j < 22; j++) signPlayer(t, newFarmPlayer(tq, { isP: true, role: j < 8 ? '先発' : '中継' }));
    teamPlayers(t).forEach(initService);
    autoActive(t);
    autoLineup(t); autoRotation(t);
  });
  // 一軍の若い投手の中から 2 人だけ、最初から二刀流にする（打っても主力になれるくらい）
  U.shuffle(S.teams.flatMap(t => activePlayers(t).filter(p => p.isP && p.age <= 26 && ovr(p) >= 55))).slice(0, 2)
    .forEach(p => { makeTwoWay(p, Math.max(ovr(p), 62)); autoActive(S.teams[p.teamId]); autoLineup(S.teams[p.teamId]); });
  addIndependentFAs(12);
  startSeason();
  addNews(`${myTeam().name}の監督に就任しました。目指せ優勝！`, 'big');
}

// 最初からいる選手の FA 権の年数（年齢から見積もる）
function initService(p) {
  p.svc = Math.max(0, (p.age - 21) * U.rnd(0.2, 0.8));
  p.faNeed = U.chance(0.5) ? 8 : 7;
}

function newFarmPlayer(tq, opts) {
  const young = U.chance(0.65);
  const age = young ? U.rint(18, 23) : U.rint(24, 33);
  const q = (young ? tq - 10 : tq - 8) + U.gauss() * 5 - Math.max(0, 24 - age) * 2;
  return newPlayer(S, { ...opts, q, age });
}

function signPlayer(team, p) {
  p.teamId = team.id;
  team.players.push(p.id);
}

function removeFromTeam(p) {
  const t = S.teams[p.teamId];
  if (!t) return;
  t.players = t.players.filter(id => id !== p.id);
  t.lineup = t.lineup.filter(s => s.pid !== p.id);
  t.rotation = t.rotation.filter(id => id !== p.id);
  if (t.closer === p.id) t.closer = null;
  if (t.setup === p.id) t.setup = null;
  t.active = (t.active || []).filter(id => id !== p.id);
  p.teamId = null;
  endPlayerGoods(t, p);
}

// ---------- 一軍・二軍 ----------
function isActive(t, p) { return t.active.includes(p.id); }
function activePlayers(t) { return t.active.map(id => S.players[id]).filter(Boolean); }

// 登録を抹消してから 10 日は一軍に戻せない（シーズン中だけの決まり）
function daysUntilEligible(p) {
  if (S.phase !== 'season' || p.downDay == null) return 0;
  return Math.max(0, p.downDay + REREGISTER_DAYS - S.day);
}

// 一軍に上げられないときは理由を返す
function cannotPromote(t, p) {
  if (isActive(t, p)) return '一軍にいます';
  if (p.inj) return '故障中';
  if (t.active.length >= ACTIVE_MAX) return '一軍が満員';
  const d = daysUntilEligible(p);
  if (d > 0) return `再登録まであと${d}日`;
  if (p.foreign && activePlayers(t).filter(x => x.foreign).length >= FOREIGN_ACTIVE_MAX) return `外国人枠は${FOREIGN_ACTIVE_MAX}人まで`;
  return null;
}

function promote(t, p) { t.active.push(p.id); }

function demote(t, p) {
  t.active = t.active.filter(id => id !== p.id);
  if (S.phase === 'season') p.downDay = S.day;
}

// 一軍の顔ぶれをおまかせで選ぶ：投手 14 人（先発 6 ＋ リリーフ 8）、野手 15 人（捕手は 2 人以上）
function autoActive(t) {
  const all = teamPlayers(t).filter(p => !p.inj && (isActive(t, p) || daysUntilEligible(p) === 0));
  const chosen = [];
  let foreign = 0;
  const take = p => {
    if (chosen.includes(p) || chosen.length >= ACTIVE_MAX) return false;
    if (p.foreign) { if (foreign >= FOREIGN_ACTIVE_MAX) return false; foreign++; }
    chosen.push(p);
    return true;
  };
  const takeN = (list, n) => { let k = 0; for (const p of list) { if (k >= n) break; if (take(p)) k++; } };
  // 力のある二刀流は先に入れる
  takeN(all.filter(p => p.twoWay && ovr(p) >= 55).sort((a, b) => ovr(b) - ovr(a)), 3);
  const pit = all.filter(p => p.isP);
  takeN(pit.slice().sort((a, b) => (starterVal(b) + aptOf(b).sp * 6) - (starterVal(a) + aptOf(a).sp * 6)), ROTATION_SIZE);
  takeN(pit.slice().sort((a, b) => (relVal(b) + aptOf(b).rp * 4) - (relVal(a) + aptOf(a).rp * 4)), 8);
  const fie = all.filter(p => !p.isP).sort((a, b) => ovr(b) - ovr(a));
  takeN(fie.filter(p => p.pos === '捕'), 2);
  // 守る位置に穴があかないように、遊・二・三・一を守れる人を 1 人ずつ、外野を 3 人は入れる
  [['遊', 1], ['二', 1], ['三', 1], ['一', 1], ['中', 3]].forEach(([pos, n]) => {
    const can = p => posFit(p, pos) >= SUB_FIT;
    const have = chosen.filter(p => canBat(p) && can(p)).length;
    if (have < n) takeN(fie.filter(can), n - have);
  });
  fie.forEach(take);
  all.forEach(take);
  const before = t.active.slice();
  t.active = chosen.map(p => p.id);
  before.forEach(id => { if (!t.active.includes(id) && S.players[id] && S.phase === 'season') S.players[id].downDay = S.day; });
}

// 空いている一軍の枠を、上げられる選手で埋める（投手が 13 人より少なければ投手から）
function fillActive(t) {
  let n = 0;
  while (t.active.length < ACTIVE_MAX) {
    const act = activePlayers(t);
    const needP = act.filter(p => p.isP).length < 13;
    const cands = teamPlayers(t).filter(p => !cannotPromote(t, p)).sort((a, b) => (b.isP === needP) - (a.isP === needP) || ovr(b) - ovr(a));
    if (!cands.length) break;
    promote(t, cands[0]);
    n++;
  }
  return n;
}

// 一軍で試合ができないほど人が足りなければ、二軍から上げる
function ensureEnoughActive(t) {
  const healthy = isP => activePlayers(t).filter(p => p.isP === isP && !p.inj).length;
  const up = isP => {
    const c = teamPlayers(t).filter(p => p.isP === isP && !p.inj && !isActive(t, p) && daysUntilEligible(p) === 0)
      .sort((a, b) => ovr(b) - ovr(a))[0];
    if (!c) return false;
    if (t.active.length >= ACTIVE_MAX) {
      const out = activePlayers(t).filter(p => p.inj).sort((a, b) => a.isP - b.isP)[0];
      if (!out) return false;
      demote(t, out);
    }
    promote(t, c);
    if (t.id === S.myTeamId) addNews(`選手が足りないので${c.name}を一軍に上げました。`);
    return true;
  };
  while (healthy(false) < 10 && up(false));
  while (healthy(true) < 9 && up(true));
}

// ケガをした一軍の選手は抹消し、二軍から同じ種類（投手か野手か）の選手を上げる
function injuryReplace(t, p) {
  if (!t.active || !isActive(t, p)) return;
  demote(t, p);
  const sub = teamPlayers(t).filter(x => x.isP === p.isP && !cannotPromote(t, x)).sort((a, b) => ovr(b) - ovr(a))[0];
  if (sub) promote(t, sub);
  if (t.id === S.myTeamId) addNews(`${p.name}を登録抹消${sub ? `。代わりに${sub.name}を一軍に上げました` : ''}。`);
}

// ---------- オーダー ----------
function autoLineup(team) {
  const fs = activePlayers(team).filter(p => canBat(p) && !p.inj);
  const used = new Set();
  const slots = [];
  ['捕', '遊', '二', '中', '三', '右', '左', '一'].forEach(pos => {
    let best = null, bv = -1;
    fs.forEach(p => {
      if (used.has(p)) return;
      const f = posFit(p, pos);
      const v = batVal(p) * 0.6 + (p.a.field * 0.7 + p.a.arm * 0.3) * f * 0.5 + f * 45;
      if (v > bv) { bv = v; best = p; }
    });
    if (best) { used.add(best); slots.push({ p: best, pos }); }
  });
  const dh = fs.filter(p => !used.has(p)).sort((a, b) => batVal(b) - batVal(a))[0];
  if (dh) slots.push({ p: dh, pos: '指' });
  // 野手が 9 人そろわないときは、ケガ人や投手でも埋める
  if (slots.length < 9) {
    const inLine = new Set(slots.map(s => s.p));
    const spare = activePlayers(team).filter(p => !inLine.has(p)).sort((a, b) => (a.isP - b.isP) || (batVal(b) - batVal(a)));
    const free = LPOS.filter(pos => !slots.some(s => s.pos === pos));
    while (slots.length < 9 && spare.length) slots.push({ p: spare.shift(), pos: free.shift() || '指' });
  }
  // 打順：中軸 3 人に長打、1・2 番に足とミート
  slots.sort((a, b) => batVal(b.p) - batVal(a.p));
  const core = slots.slice(0, 3).sort((a, b) => b.p.a.power - a.p.a.power);
  const rest = slots.slice(3);
  const top = rest.slice(0, 3).sort((a, b) => (b.p.a.speed + b.p.a.meet) - (a.p.a.speed + a.p.a.meet));
  const order = [top[0], top[1], core[1], core[0], core[2], top[2], ...rest.slice(3)].filter(Boolean);
  team.lineup = order.map(s => ({ pid: s.p.id, pos: s.pos }));
}

function autoRotation(team) {
  const ps = activePlayers(team).filter(p => canPitch(p) && !p.inj);
  const spv = p => starterVal(p) + aptOf(p).sp * 6;
  const starters = ps.slice().sort((a, b) => spv(b) - spv(a)).slice(0, ROTATION_SIZE);
  team.rotation = starters.map(p => p.id);
  const pen = ps.filter(p => !starters.includes(p)).sort((a, b) => (relVal(b) + aptOf(b).rp * 4) - (relVal(a) + aptOf(a).rp * 4));
  team.closer = pen.length ? pen[0].id : null;
  team.setup = pen.length > 1 ? pen[1].id : null;
  refreshRoles(team);
}

function refreshRoles(team) {
  teamPlayers(team).forEach(p => {
    if (!canPitch(p)) return;
    if (team.rotation.includes(p.id)) p.role = '先発';
    else if (team.closer === p.id) p.role = '抑え';
    else if (team.setup === p.id) p.role = 'セットアッパー';
    else p.role = '中継';
  });
}

// ケガ人や抜けた選手を埋める
function ensureLineup(Sx, team) {
  const isMine = team.id === S.myTeamId;
  ensureEnoughActive(team);
  if (!isMine) { autoLineup(team); }
  const roster = new Set(team.active); // 試合に出られるのは一軍だけ
  if (team.lineup.length !== 9) autoLineup(team);
  team.lineup.forEach(slot => {
    const p = S.players[slot.pid];
    if (p && roster.has(p.id) && !p.inj && canBat(p)) return;
    const inLine = new Set(team.lineup.map(s => s.pid));
    const cands = activePlayers(team).filter(x => canBat(x) && !x.inj && !inLine.has(x.id));
    if (!cands.length) return;
    cands.sort((a, b) => (batVal(b) + posFit(b, slot.pos) * 40) - (batVal(a) + posFit(a, slot.pos) * 40));
    const sub = cands[0];
    if (isMine && p) addNews(`${p.name}に代わって${sub.name}が${slot.pos === '指' ? '指名打者' : slot.pos}に入りました。`);
    slot.pid = sub.id;
  });
  team.rotation = team.rotation.filter(id => roster.has(id));
  if (team.rotation.length < ROTATION_SIZE) {
    const extra = activePlayers(team).filter(p => canPitch(p) && !team.rotation.includes(p.id) && p.id !== team.closer && p.id !== team.setup)
      .sort((a, b) => starterVal(b) - starterVal(a));
    while (team.rotation.length < ROTATION_SIZE && extra.length) team.rotation.push(extra.shift().id);
  }
  if (team.closer != null && !roster.has(team.closer)) team.closer = null;
  if (team.setup != null && !roster.has(team.setup)) team.setup = null;
  refreshRoles(team);
}

function pickStarter(Sx, team) {
  const rot = team.rotation;
  // ふつうは中 5 日以上。だれも空いていなければ中 4 日まで詰める
  for (const need of [STARTER_REST, STARTER_REST - 1]) {
    for (let i = 0; i < rot.length; i++) {
      const idx = (team.rotIdx + i) % rot.length;
      const p = S.players[rot[idx]];
      if (p && !p.inj && p.rest >= need) { team.rotIdx = (idx + 1) % rot.length; return p; }
    }
  }
  // ローテが崩れたら、いちばん休んでいる投手
  const ps = activePlayers(team).filter(p => canPitch(p) && !p.inj && p.id !== team.closer && p.id !== team.setup);
  ps.sort((a, b) => (b.rest * 10 + b.a.stamina) - (a.rest * 10 + a.a.stamina));
  return ps[0] || teamPlayers(team).find(p => p.isP) || teamPlayers(team)[0];
}

// ---------- シーズン ----------
// 開幕は 3 月最後の金曜日
function openingDay(year) {
  const d = new Date(year, 2, 31);
  while (d.getDay() !== 5) d.setDate(d.getDate() - 1);
  return d;
}

function roundRobin(ids) {
  const n = ids.length, arr = ids.slice(), rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const day = [];
    for (let i = 0; i < n / 2; i++) day.push([arr[i], arr[n - 1 - i]]);
    rounds.push(day);
    arr.splice(1, 0, arr.pop());
  }
  return rounds;
}

// 3 連戦を基本に組み、交流戦はシーズンの 3 分の 1 あたりにまとめて入れる。月曜は休み
function makeSchedule(games) {
  const fmt = SEASON_FORMATS[games];
  const byLg = LEAGUES.map(lg => S.teams.filter(t => t.lg === lg).map(t => t.id));
  const R = byLg.map(roundRobin);
  const lens = [];
  for (let rem = fmt.intra; rem > 0; rem -= 3) lens.push(Math.min(3, rem));
  const intra = [];
  lens.forEach((len, si) => R[0].forEach((_, r) => {
    const pairs = [...R[0][r], ...R[1][r]].map(([a, b]) => (si % 2 ? { home: a, away: b } : { home: b, away: a }));
    intra.push({ len, pairs });
  }));
  U.shuffle(intra);
  const inter = [];
  for (let r = 0; r < byLg[1].length; r++) {
    const pairs = byLg[0].map((a, i) => {
      const b = byLg[1][(i + r) % byLg[1].length];
      return (i + r + S.year) % 2 ? { home: a, away: b, inter: true } : { home: b, away: a, inter: true };
    });
    inter.push({ len: fmt.inter, pairs });
  }
  U.shuffle(inter);
  const at = Math.round(intra.length * 0.35);
  const blocks = [...intra.slice(0, at), ...inter, ...intra.slice(at)];
  const gameDays = [];
  blocks.forEach(b => { for (let i = 0; i < b.len; i++) gameDays.push(b.pairs.map(x => ({ ...x }))); });
  const sched = [];
  const d = openingDay(S.year);
  let gi = 0;
  while (gi < gameDays.length) {
    const entry = { m: d.getMonth() + 1, d: d.getDate(), w: d.getDay(), games: [] };
    if (d.getDay() !== 1) entry.games = gameDays[gi++];
    sched.push(entry);
    d.setDate(d.getDate() + 1);
  }
  return sched;
}

// 次に自分のチームの試合がある日
function nextMyGame() {
  for (let i = S.day; i < S.schedule.length; i++) {
    const m = S.schedule[i].games.find(x => x.home === S.myTeamId || x.away === S.myTeamId);
    if (m) return { entry: S.schedule[i], m };
  }
  return null;
}

function startSeason() {
  S.day = 0;
  S.phase = 'season';
  S.schedule = makeSchedule(S.games);
  S.myGames = [];
  S.lastGame = null;
  S.off = null;
  S.post = null;
  S.foreignCands = null;
  Object.values(S.players).forEach(p => { p.stats = newStats(); p.rest = 7; p.fatigue = 0; p.downDay = null; });
  S.draftClass = makeDraftClass();
  announceDraftClass();
  S.watch = [];
  S.teams.forEach(t => {
    t.w = t.l = t.d = t.rs = t.ra = 0;
    t.rotIdx = 0;
    t.fin = newFin();
    t.goods.forEach(g => { g.season = 0; });
    const sponsor = Math.round((t.pop * 800 + 20000) * S.games / 143);
    t.money += sponsor; t.fin.sponsor += sponsor;
    if (t.id !== S.myTeamId) { autoActive(t); autoLineup(t); autoRotation(t); }
    else {
      const n = fillActive(t);
      if (n) addNews(`一軍の空き枠に${n}人を登録しました。`);
    }
    ensureLineup(S, t);
  });
  addNews(`${S.year}年シーズン開幕！ スポンサー収入 ${U.money(myTeam().fin.sponsor)}`, 'big');
}

function payroll(t) { return U.sum(teamPlayers(t), p => p.salary); }

function capacity(t) { return 20000 + t.fac.stadium * 6000; }

function homeGate(t) {
  const fill = U.clamp(0.62 + (t.pop - 50) / 250 + U.rnd(-0.03, 0.03), 0.4, 1);
  const att = Math.round(capacity(t) * fill / 10) * 10;
  const gate = att * TICKET_PRICE / 10000;
  const food = att * 0.05;
  const ops = 3000 + t.fac.stadium * 500;
  const tv = 1400; // 放映権（ホーム 1 試合ごと）
  t.money += gate + food + tv - ops;
  t.fin.gate += gate; t.fin.food += food; t.fin.tv += tv; t.fin.ops += ops;
  return att;
}

function dailyUpdate() {
  Object.values(S.players).forEach(p => {
    if (p.teamId == null) return;
    const t = S.teams[p.teamId];
    p.rest++;
    p.fatigue = Math.max(0, p.fatigue - 3);
    if (p.inj > 0) {
      if (S.phase === 'season') p.stats.injd = (p.stats.injd || 0) + 1; // 今季ケガで休んだ日数（引退を決めるときに見る）
      p.inj -= 1 + (U.chance(t.fac.medical * 0.1) ? 1 : 0);
      if (p.inj <= 0) {
        p.inj = 0;
        if (t.id === S.myTeamId) addNews(`${p.name}がケガから復帰しました。`);
      }
    }
    if (U.chance(0.25)) p.cond = U.clamp(p.cond + (U.chance(0.5) ? 1 : -1), 1, 5);
  });
}

function injuryCheck(res) {
  res.sides.forEach(side => {
    const t = side.team;
    const mul = INTENSITY[t.intensity].inj / 0.005 * (1.2 - t.fac.medical * 0.1);
    side.lineup.forEach(sl => {
      const p = sl.p;
      if (p.inj) return;
      if (U.chance(0.0012 * mul * (p.age >= 33 ? 1.5 : 1))) injure(p, U.rint(3, 30));
    });
  });
}

function injure(p, days) {
  p.inj = days;
  if (p.teamId === S.myTeamId) addNews(`${p.name}が故障しました（全治${days}日）。`, 'bad');
  if (p.teamId != null && S.phase !== 'off') injuryReplace(S.teams[p.teamId], p);
}

// 1 試合をして、入場料・ケガ・グッズ・自分の試合の記録までまとめる
function playOne(m, label, post) {
  const home = S.teams[m.home], away = S.teams[m.away];
  const myId = S.myTeamId;
  const mine = m.home === myId || m.away === myId;
  const res = post ? playPostGame(home, away, mine) : playGame(S, home, away, mine);
  m.score = res.score;
  const att = homeGate(home);
  if (!post) {
    home.rs += res.score[1]; home.ra += res.score[0];
    away.rs += res.score[0]; away.ra += res.score[1];
    if (res.score[1] > res.score[0]) { home.w++; away.l++; home.pop += 0.08; away.pop -= 0.05; }
    else if (res.score[0] > res.score[1]) { away.w++; home.l++; away.pop += 0.08; home.pop -= 0.05; }
    else { home.d++; away.d++; }
  } else {
    const win = res.score[1] > res.score[0] ? home : res.score[0] > res.score[1] ? away : null;
    if (win) win.pop += 0.4;
  }
  home.pop = U.clamp(home.pop, 0, 100); away.pop = U.clamp(away.pop, 0, 100);
  injuryCheck(res);
  if (mine) {
    const meIsHome = m.home === myId;
    sellGoods(myTeam(), meIsHome);
    if (!post) {
      const my = meIsHome ? res.score[1] : res.score[0], op = meIsHome ? res.score[0] : res.score[1];
      const r = my > op ? '勝' : my < op ? '敗' : '分';
      S.myGames.push({ day: label, opp: meIsHome ? m.away : m.home, home: meIsHome, my, op, r, inter: !!m.inter, wp: res.detail.wp, lp: res.detail.lp, sp: res.detail.sp });
    }
    S.lastGame = { label, home: m.home, away: m.away, score: res.score, att, ...res.detail };
  }
  return res;
}

function advanceDay() {
  if (S.phase !== 'season' || S.day >= S.schedule.length) return false;
  const entry = S.schedule[S.day];
  dailyUpdate();
  entry.games.forEach(m => playOne(m, dateLabel(entry), false));
  S.teams.forEach(t => t.active.forEach(id => { const p = S.players[id]; if (p) p.actDays = (p.actDays || 0) + 1; }));
  if (entry.games.length) {
    S.teams.forEach(t => {
      const pay = payroll(t) / 143; // 短いシーズンは、試合数に合わせて年俸も少なく払う
      t.money -= pay; t.fin.salary += pay;
    });
  }
  // 月曜（休み）に 1 週間分の練習の成果が出る
  if (entry.w === 1) {
    weeklyTraining(); randomEvent(); awakenCheck(1);
    S.teams.forEach(t => { if (t.id !== S.myTeamId) { autoActive(t); autoRotation(t); } });
  }
  S.day++;
  if (S.day >= S.schedule.length) endRegular();
  return true;
}

function weeklyTraining() {
  // 人気度は活躍しないと少しずつ下がる
  Object.values(S.players).forEach(p => { if (p.fame > 5) p.fame -= (p.fame - 5) * 0.08; });
  S.teams.forEach(t => {
    const it = INTENSITY[t.intensity];
    const mult = it.grow * (0.8 + t.fac.train * 0.1);
    teamPlayers(t).forEach(p => {
      if (p.inj) return;
      const farm = t.active && !isActive(t, p) && p.age <= 25 ? 1.15 : 1; // 二軍の若手は二軍戦で経験を積む
      trainPlayer(p, mult * farm);
      if (U.chance(it.inj * (1.2 - t.fac.medical * 0.1))) injure(p, U.rint(5, 20));
      if (it.cond && U.chance(0.3)) p.cond = U.clamp(p.cond + it.cond, 1, 5);
    });
  });
}

function randomEvent() {
  if (!U.chance(0.4)) return;
  const t = myTeam();
  const ps = teamPlayers(t);
  const roll = U.rint(1, 6);
  if (roll === 1) {
    const m = U.rint(2, 8) * 1000;
    t.money += m; t.fin.other += m;
    addNews(`地元企業とスポンサー契約！ ${U.money(m)}の収入。`, 'good');
  } else if (roll === 2) {
    const young = ps.filter(p => p.age <= 27 && !p.inj);
    if (!young.length) return;
    const p = U.pick(young);
    const keys = abilKeys(p);
    const k = U.pick(keys);
    const up = U.rint(3, 7);
    p.a[k] = Math.min(99, p.a[k] + up);
    addNews(`${p.name}が居残り特訓でコツをつかんだ！ ${ALL_LABEL[k]}が${up}上がった。`, 'good');
  } else if (roll === 3) {
    t.pop = U.clamp(t.pop + 3, 0, 100);
    addNews('ファン感謝デーが大盛況！ 人気が上がった。', 'good');
  } else if (roll === 4) {
    const p = U.pick(ps);
    p.cond = 1;
    addNews(`${p.name}が悩んでいる様子…（絶不調）`, 'bad');
  } else if (roll === 5) {
    const p = U.pick(ps);
    p.cond = 5;
    addNews(`${p.name}が絶好調！ 目の色が違う。`, 'good');
  } else {
    const m = 1500;
    t.money += m; t.fin.other += m; t.pop = U.clamp(t.pop + 1, 0, 100);
    addNews(`選手が地元テレビに出演。${U.money(m)}の出演料。`);
  }
}

// ---------- 順位・成績 ----------
function pct(t) { const n = t.w + t.l; return n ? t.w / n : 0; }

function standings(lg) {
  const arr = S.teams.filter(t => !lg || t.lg === lg)
    .sort((a, b) => pct(b) - pct(a) || b.w - a.w || (b.rs - b.ra) - (a.rs - a.ra));
  const top = arr[0];
  return arr.map(t => ({ t, gb: ((top.w - t.w) + (t.l - top.l)) / 2 }));
}

// リーグの中での順位
function rankOf(teamId) { return standings(S.teams[teamId].lg).findIndex(r => r.t.id === teamId) + 1; }

function leagueBatters(lg) { return Object.values(S.players).filter(p => p.teamId != null && canBat(p) && (!lg || S.teams[p.teamId].lg === lg)); }
function leaguePitchers(lg) { return Object.values(S.players).filter(p => p.teamId != null && canPitch(p) && (!lg || S.teams[p.teamId].lg === lg)); }
function ops(s) {
  if (!s.pa) return 0;
  const obp = (s.h + s.bb) / s.pa;
  const tb = s.h + s.d + s.t * 2 + s.hr * 3;
  return obp + (s.ab ? tb / s.ab : 0);
}

// 規定打席は試合数×3.1、規定投球回は試合数×1
function leaders(lg) {
  const gp = Math.max(1, gamesPlayed(S.teams.find(t => !lg || t.lg === lg)));
  const bats = leagueBatters(lg), pits = leaguePitchers(lg);
  const qualB = bats.filter(p => p.stats.pa >= gp * 3.1);
  const qualP = pits.filter(p => p.stats.outs >= gp * 3);
  const top = (arr, f, asc) => arr.slice().sort((a, b) => asc ? f(a) - f(b) : f(b) - f(a)).slice(0, 5);
  return [
    { name: '打率', list: top(qualB, p => p.stats.h / p.stats.ab), fmt: p => U.avg(p.stats.h, p.stats.ab) },
    { name: '本塁打', list: top(bats, p => p.stats.hr), fmt: p => p.stats.hr },
    { name: '打点', list: top(bats, p => p.stats.rbi), fmt: p => p.stats.rbi },
    { name: '盗塁', list: top(bats, p => p.stats.sb), fmt: p => p.stats.sb },
    { name: '防御率', list: top(qualP, p => p.stats.per / p.stats.outs, true), fmt: p => U.era(p.stats.per, p.stats.outs) },
    { name: '勝利', list: top(pits, p => p.stats.w), fmt: p => p.stats.w },
    { name: '奪三振', list: top(pits, p => p.stats.pk), fmt: p => p.stats.pk },
    { name: 'セーブ', list: top(pits, p => p.stats.sv), fmt: p => p.stats.sv },
  ];
}

// ---------- レギュラーシーズン終了〜ポストシーズン ----------
const AWARD_TITLE = { 打率: '首位打者', 本塁打: '本塁打王', 打点: '打点王', 盗塁: '盗塁王', 防御率: '最優秀防御率', 勝利: '最多勝', 奪三振: '最多奪三振', セーブ: '最多セーブ' };
const SERIES_RULE = {
  cs1: { name: 'CSファーストステージ', need: 2, adv: 0, max: 3 },
  cs2: { name: 'CSファイナルステージ', need: 4, adv: 1, max: 6 },
  js:  { name: '日本シリーズ', need: 4, adv: 0, max: 8 },
};

// 一軍に登録されていた日数を FA 権の年数に足す（シーズンの 87% いれば 1 年。本物の 145 日に近い割合）
function addServiceTime() {
  const full = Math.round(S.schedule.length * 0.87);
  Object.values(S.players).forEach(p => {
    if (!p.actDays) return;
    p.svc = (p.svc || 0) + Math.min(1, p.actDays / full);
    p.actDays = 0;
  });
}

// 先発で多く投げた投手は先発の、中継ぎで多く投げた投手は中継ぎの適性が上がることがある
function growApt() {
  Object.values(S.players).forEach(p => {
    if (!canPitch(p) || p.teamId == null) return;
    const a = aptOf(p), st = p.stats;
    if (st.gs >= S.games * 0.1 && a.sp < 2 && U.chance(0.35)) a.sp++;
    if (st.pg - st.gs >= S.games * 0.25 && a.rp < 2 && U.chance(0.35)) a.rp++;
    p.apt = a;
  });
}

function endRegular() {
  addServiceTime();
  growApt();
  // 過去の順位として残す
  if (!S.standHist) S.standHist = [];
  const snap = {};
  LEAGUES.forEach(lg => { snap[lg] = standings(lg).map(r => ({ id: r.t.id, name: r.t.name, short: r.t.short, color: r.t.color, w: r.t.w, l: r.t.l, d: r.t.d, rs: r.t.rs, ra: r.t.ra, gb: r.gb })); });
  S.standHist.unshift({ year: S.year, games: S.games, lg: snap, jp: null });
  S.phase = 'post';
  const awards = [];
  const champs = {};
  LEAGUES.forEach(lg => {
    const champ = standings(lg)[0].t;
    champs[lg] = champ.id;
    champ.pop = U.clamp(champ.pop + 5, 0, 100);
    leaders(lg).forEach(c => {
      const p = c.list[0];
      if (p) awards.push({ lg, title: AWARD_TITLE[c.name], pid: p.id, name: p.name, team: S.teams[p.teamId].short, val: c.fmt(p) });
    });
    // MVP：リーグ優勝チームでいちばん活躍した選手
    const score = p => p.isP ? (p.stats.w * 8 + p.stats.sv * 3 + p.stats.outs / 3 - p.stats.per * 2) : (ops(p.stats) * p.stats.pa * 0.4 + p.stats.hr * 2);
    const mvp = teamPlayers(champ).sort((a, b) => score(b) - score(a))[0];
    if (mvp) awards.unshift({ lg, title: 'MVP', pid: mvp.id, name: mvp.name, team: champ.short, val: '' });
  });
  awards.forEach(a => addFame(S.players[a.pid], a.title === 'MVP' ? 25 : 15));
  S.awardHist.unshift({ year: S.year, list: awards.map(a => ({ ...a })) });
  updateSeasonRecords();
  // シーズン終わりから CS まで数日あく
  Object.values(S.players).forEach(p => { p.rest += 3; p.fatigue = 0; });
  S.post = { stage: 'cs1', series: [], awards, champs, ranks: {}, day: 0, jp: null };
  LEAGUES.forEach(lg => {
    const ids = standings(lg).map(r => r.t.id);
    S.post.ranks[lg] = ids;
    S.post.series.push(newSeries('cs1', lg, ids[1], ids[2]));
  });
  const my = myTeam();
  addNews(`レギュラーシーズン終了！ ${LEAGUES.map(lg => `${LEAGUE_NAME[lg]}優勝は${S.teams[champs[lg]].name}`).join('、')}。${my.short}は${rankOf(my.id)}位。`, 'big');
}

function newSeries(stage, lg, top, low) {
  return { stage, lg, top, low, wTop: SERIES_RULE[stage].adv, wLow: 0, games: [], done: false, winner: null };
}

function seriesLabel(s) {
  return SERIES_RULE[s.stage].name + (s.stage === 'js' ? '' : `（${LEAGUE_NAME[s.lg]}）`);
}

// ポストシーズンの成績はレギュラーシーズンの成績に入れない
function playPostGame(home, away, wantLog) {
  const ps = [...home.players, ...away.players].map(id => S.players[id]);
  const saved = ps.map(p => p.stats);
  ps.forEach(p => { p.stats = newStats(); });
  const res = playGame(S, home, away, wantLog);
  ps.forEach((p, i) => { p.stats = saved[i]; });
  return res;
}

function advancePost() {
  if (S.phase !== 'post') return false;
  const P = S.post;
  dailyUpdate();
  P.series.filter(s => s.stage === P.stage && !s.done).forEach(s => {
    const rule = SERIES_RULE[s.stage];
    const gi = s.games.length;
    // CS は上位チームの本拠地。日本シリーズは 2-3-2（1・2・6・7 戦が上側の本拠地）
    const topHome = s.stage !== 'js' || [0, 1, 5, 6, 7].includes(gi) || gi > 7;
    const m = topHome ? { home: s.top, away: s.low } : { home: s.low, away: s.top };
    const res = playOne(m, `${seriesLabel(s)} 第${gi + 1}戦`, true);
    const topScore = m.home === s.top ? res.score[1] : res.score[0];
    const lowScore = m.home === s.top ? res.score[0] : res.score[1];
    if (topScore > lowScore) s.wTop++; else if (lowScore > topScore) s.wLow++;
    s.games.push({ home: m.home, away: m.away, score: res.score });
    if (s.wTop >= rule.need) finishSeries(s, s.top);
    else if (s.wLow >= rule.need) finishSeries(s, s.low);
    else if (s.stage !== 'js' && s.games.length >= rule.max) finishSeries(s, s.top); // 決まらなければ上位が勝ち抜け
  });
  P.day++;
  if (P.series.filter(s => s.stage === P.stage).every(s => s.done)) nextStage();
  return true;
}

function finishSeries(s, winner) {
  s.done = true;
  s.winner = winner;
  const w = S.teams[winner], l = S.teams[winner === s.top ? s.low : s.top];
  const mine = winner === S.myTeamId || l.id === S.myTeamId;
  const upset = s.stage !== 'js' && s.top !== winner ? '・下剋上' : '';
  addNews(`${seriesLabel(s)}：${w.name}が${l.short}を破りました（${Math.max(s.wTop, s.wLow)}勝${Math.min(s.wTop, s.wLow)}敗${upset}）`, mine ? (winner === S.myTeamId ? 'good' : 'bad') : '');
}

function nextStage() {
  const P = S.post;
  if (P.stage === 'cs1') {
    P.stage = 'cs2';
    LEAGUES.forEach(lg => {
      const first = P.series.find(s => s.stage === 'cs1' && s.lg === lg);
      P.series.push(newSeries('cs2', lg, P.ranks[lg][0], first.winner));
    });
  } else if (P.stage === 'cs2') {
    P.stage = 'js';
    const win = lg => P.series.find(s => s.stage === 'cs2' && s.lg === lg).winner;
    // 日本シリーズの本拠地の順は年ごとにリーグが入れ替わる
    const [a, b] = S.year % 2 ? [win('セ'), win('パ')] : [win('パ'), win('セ')];
    P.series.push(newSeries('js', null, a, b));
  } else {
    endPost(P.series.find(s => s.stage === 'js').winner);
  }
}

function endPost(jpId) {
  const P = S.post;
  P.jp = jpId;
  const my = myTeam();
  const rank = rankOf(my.id);
  const jp = S.teams[jpId];
  jp.pop = U.clamp(jp.pop + 10, 0, 100);
  // 自分のチームの勝ち上がり
  const reached = P.series.filter(s => s.top === my.id || s.low === my.id);
  const last = reached[reached.length - 1];
  let post = '';
  if (jpId === my.id) post = '日本一';
  else if (last) post = `${SERIES_RULE[last.stage].name}敗退`;
  let prize = 0;
  if (rank === 1) prize += 30000;
  if (reached.some(s => s.stage === 'js')) prize += 20000;
  if (jpId === my.id) prize += 50000;
  if (prize) { my.money += prize; my.fin.other += prize; }
  S.history.unshift({ year: S.year, lg: my.lg, lgChamp: S.teams[P.champs[my.lg]].name, jp: jp.name, rank, post, w: my.w, l: my.l, d: my.d });
  addNews(`日本一は${jp.name}！`, 'big');
  if (S.standHist && S.standHist[0] && S.standHist[0].year === S.year) S.standHist[0].jp = jp.name;
  // 成績を年度別に残す（FA で球団が変わる前に）
  Object.values(S.players).forEach(p => {
    if (p.teamId == null) return;
    if (p.stats.g || p.stats.pg) {
      milestoneNews(p);
      p.career.push({ y: S.year, t: S.teams[p.teamId].short, s: { ...p.stats } });
    }
  });
  S.phase = 'off';
  S.off = { step: 'awards', awards: P.awards, prize, rank, champ: jp.name, post, contract: null, draft: null };
}

// ---------- 記録・歴史・殿堂入り ----------
// 名球会のような節目（143 試合のとき）。短いシーズンでは試合数に合わせて小さくする
const MILESTONES = [
  { k: 'h', n: 2000, label: '通算2000安打' }, { k: 'hr', n: 400, label: '通算400本塁打' },
  { k: 'w', n: 200, label: '通算200勝' }, { k: 'sv', n: 250, label: '通算250セーブ' },
];
const byGames = n => Math.max(5, Math.round(n * S.games / 143));
const CAREER_KEYS = ['g', 'pa', 'ab', 'h', 'd', 't', 'hr', 'rbi', 'r', 'sb', 'bb', 'k', 'pg', 'gs', 'w', 'l', 'sv', 'outs', 'ph', 'phr', 'pbb', 'pk', 'per'];

// 通算成績（今季の分も入れる。シーズン後に career に入った年は二重に数えない）
function careerTotal(p) {
  const t = {};
  CAREER_KEYS.forEach(k => { t[k] = 0; });
  const rows = (p.career || []).slice();
  if (p.stats && !rows.some(c => c.y === S.year)) rows.push({ s: p.stats });
  rows.forEach(c => CAREER_KEYS.forEach(k => { t[k] += c.s[k] || 0; }));
  return t;
}

function titlesOf(pid) {
  const out = [];
  (S.awardHist || []).forEach(y => y.list.forEach(a => { if (a.pid === pid) out.push({ year: y.year, title: a.title, lg: a.lg }); }));
  // 整理で年表から消したタイトルは、選手のほうに移してある
  const p = S.players[pid];
  if (p && p.oldTitles) out.push(...p.oldTitles);
  return out;
}

// ---------- 古い年の記録の整理（人が選んだときだけ消す） ----------
// 順位表は「球団・勝敗・差」だけにし、タイトルは MVP だけ残す。
// 優勝・日本一・MVP・球団の記録・シーズン記録・通算記録・殿堂入りは変わらない
function slimHistory(untilYear, lgs) {
  S.awardHist.forEach(y => {
    if (y.year > untilYear) return;
    y.list = y.list.filter(a => {
      if (a.title === 'MVP' || !lgs.includes(a.lg)) return true;
      // まだいる選手のタイトルは、選手の詳細と殿堂入りの点に使うので、選手に移しておく
      const p = S.players[a.pid];
      if (p) (p.oldTitles = p.oldTitles || []).push({ year: y.year, title: a.title, lg: a.lg });
      return false;
    });
    y.slim = [...new Set([...(y.slim || []), ...lgs])];
  });
  S.standHist.forEach(y => {
    if (y.year > untilYear) return;
    lgs.forEach(lg => { y.lg[lg] = y.lg[lg].map(r => ({ id: r.id, w: r.w, l: r.l, d: r.d, gb: r.gb })); });
    y.slim = [...new Set([...(y.slim || []), ...lgs])];
  });
}

// 整理して減るおおよその文字数（ためしに写しで整理してみる）
function slimSaving(untilYear, lgs) {
  const keep = S;
  const before = JSON.stringify(S.awardHist).length + JSON.stringify(S.standHist).length;
  S = { ...keep, awardHist: JSON.parse(JSON.stringify(keep.awardHist)), standHist: JSON.parse(JSON.stringify(keep.standHist)), players: {} };
  try {
    slimHistory(untilYear, lgs);
    return before - JSON.stringify(S.awardHist).length - JSON.stringify(S.standHist).length;
  } finally { S = keep; }
}

// 整理した順位表の行に、球団の名前と色を足して、ふつうの行と同じに扱えるようにする
function histRow(r) {
  if (!r) return r;
  const t = S.teams[r.id];
  return { name: t.name, short: t.short, color: t.color, rs: null, ra: null, ...r };
}

// シーズン記録（歴代トップ 10）。率は規定に届いた選手だけ
const SEASON_REC = [
  { k: 'avg', name: '打率', bat: true, qual: true, f: s => s.h / s.ab },
  { k: 'hr', name: '本塁打', bat: true, f: s => s.hr }, { k: 'rbi', name: '打点', bat: true, f: s => s.rbi },
  { k: 'h', name: '安打', bat: true, f: s => s.h }, { k: 'sb', name: '盗塁', bat: true, f: s => s.sb },
  { k: 'ops', name: 'OPS', bat: true, qual: true, f: s => ops(s) },
  { k: 'w', name: '勝利', f: s => s.w }, { k: 'era', name: '防御率', qual: true, asc: true, f: s => s.per * 27 / s.outs },
  { k: 'sv', name: 'セーブ', f: s => s.sv }, { k: 'pk', name: '奪三振', f: s => s.pk },
];
const REC_TOP = 10;
const CAREER_REC = [
  ['h', '安打'], ['hr', '本塁打'], ['rbi', '打点'], ['sb', '盗塁'], ['g', '出場試合'],
  ['w', '勝利'], ['sv', 'セーブ'], ['pk', '奪三振'], ['pg', '登板'],
];
// ★のない引退選手を残す人数（セーブが増え続けないように）。殿堂入りの選手も★を外すとここに入る
const RETIRED_KEEP = 100;
function updateSeasonRecords() {
  const ps = Object.values(S.players).filter(p => p.teamId != null);
  SEASON_REC.forEach(r => {
    const list = ps.filter(p => (r.bat ? canBat(p) && p.stats.pa > 0 : canPitch(p) && p.stats.pg > 0))
      .filter(p => !r.qual || (r.bat ? p.stats.pa >= S.games * 3.1 : p.stats.outs >= S.games * 3))
      .map(p => ({ v: r.f(p.stats), pid: p.id, name: p.name, team: S.teams[p.teamId].short, year: S.year, games: S.games }));
    const all = (S.records.season[r.k] || []).concat(list).filter(x => isFinite(x.v));
    all.sort((a, b) => (r.asc ? a.v - b.v : b.v - a.v));
    const before = (S.records.season[r.k] || []).slice(0, 1)[0];
    S.records.season[r.k] = all.slice(0, REC_TOP);
    const top = S.records.season[r.k][0];
    // 1 年目は何でも記録になるので知らせない
    if (before && top && top.year === S.year) {
      addNews(`歴代記録！${top.team}の${top.name}がシーズン${r.name}の記録を塗り替えました。`, 'big');
    }
  });
}

// 今季で節目の記録に届いたら知らせる（career に今季を入れる前に呼ぶ）
function milestoneNews(p) {
  const after = careerTotal(p);
  MILESTONES.forEach(m => {
    const need = byGames(m.n);
    if (after[m.k] >= need && after[m.k] - (p.stats[m.k] || 0) < need) {
      addNews(`${S.teams[p.teamId].short}の${p.name}が${m.label}を達成しました！`, p.teamId === S.myTeamId ? 'good' : 'big');
    }
  });
}

function draftLabel(p) { return p.drafted ? `${p.drafted.year}年ドラフト${p.drafted.round}位（${p.drafted.team}）` : ''; }

// 引退するときに、名を残す選手の記録をとっておく（選手そのものは消える）
function retireRecord(p) {
  if (!S.retired) S.retired = [];
  const c = careerTotal(p);
  const titles = titlesOf(p.id);
  const ms = MILESTONES.filter(m => c[m.k] >= byGames(m.n)).map(m => m.label);
  const mvp = titles.filter(t => t.title === 'MVP').length;
  // 殿堂入りの点：いちばん節目に近い記録（節目で 1）に、MVP とタイトルの数を足す。25 年で 40 人ほど（年に 1〜2 人）になるように測った
  const pts = Math.max(c.h / byGames(2000), c.hr / byGames(400), c.w / byGames(200), c.sv / byGames(250), c.pk / byGames(2500))
    + mvp * 0.15 + (titles.length - mvp) * 0.05;
  const hof = ms.length > 0 || pts >= 1;
  const notable = hof || titles.length > 0 || pts >= 0.6;
  if (!notable) return;
  const years = (p.career || []).map(x => x.y);
  const teams = [...new Set((p.career || []).map(x => x.t))];
  const keep = {};
  ['g', 'pa', 'ab', 'h', 'hr', 'rbi', 'sb', 'pg', 'w', 'l', 'sv', 'outs', 'per', 'pk'].forEach(k => { keep[k] = c[k]; });
  S.retired.unshift({
    id: p.id, name: p.name, pos: canPitch(p) && !p.twoWay ? '投' : p.twoWay ? '二刀流' : p.pos, isP: canPitch(p), bat: canBat(p),
    from: years.length ? Math.min(...years) : S.year, to: S.year, teams, age: p.age, c: keep,
    titles: titles.map(t => `${t.year} ${t.title}`), ms, hof, hofYear: hof ? S.year : null, draft: draftLabel(p),
    star: hof, // 殿堂入りの選手には、はじめから星を付けておく（外せる）
    my: teams.includes(myTeam().short),
  });
  if (hof) addNews(`${p.name}（${teams.join('→')}）が引退し、殿堂入りしました。${ms.length ? `（${ms.join('・')}）` : ''}`, 'big');
  pruneRetired();
}

// ★付き（殿堂入りは最初から付いている）・通算記録のトップに入っている選手は残し、ほかは新しい順に RETIRED_KEEP 人まで
function pruneRetired() {
  const R = S.retired; // 新しい順
  const keep = new Set();
  CAREER_REC.forEach(([k]) => R.slice().sort((a, b) => b.c[k] - a.c[k]).slice(0, REC_TOP).forEach(r => { if (r.c[k] > 0) keep.add(r); }));
  let n = 0;
  S.retired = R.filter(r => r.star || keep.has(r) || ++n <= RETIRED_KEEP);
}

function toggleRetiredStar(id) {
  const r = S.retired.find(x => x.id === id);
  if (r) r.star = !r.star;
}

// ---------- 覚醒 ----------
const AWAKEN_TEXTS = ['フォームを改造して', '先輩のアドバイスで', 'ビデオで自分を研究して', '毎晩の素振りを続けて', 'コーチとの特訓で', '悔しい負けをバネにして', '自主トレで体を作り直して'];
const VETERAN_TEXTS = ['ベテランの意地で', '若手に負けまいと', 'フォームを一から見直して', '引退の二文字を振り払うように'];

// 型（早熟・普通・晩成）のピークより若く、才能（★）のある選手ほど覚醒しやすい。衰え始めた選手もごくまれに覚醒する
function awakenCheck(mult) {
  S.teams.forEach(t => {
    const fac = 0.9 + t.fac.train * 0.1;
    teamPlayers(t).forEach(p => {
      if (p.inj) return;
      const ageMul = p.age <= p.peak - 3 ? 1.5 : p.age <= p.peak ? 1 : p.age <= p.peak + 1 ? 0.5 : 0.15;
      const ch = 0.0015 * p.pot * p.pot * ageMul * fac * (p.cond >= 4 ? 1.5 : 1) * mult;
      if (U.chance(ch)) awaken(p);
    });
  });
}

const BIG_AWAKEN_CHANCE = 0.07; // 覚醒のうち、ごくまれに大爆発（大覚醒）する

function awaken(p) {
  const keys = abilKeys(p), lbl = ALL_LABEL;
  const big = U.chance(BIG_AWAKEN_CHANCE);
  const fk = focusToKey(p);
  const main = fk && U.chance(0.6) ? fk : U.pick(keys);
  const others = U.shuffle(keys.filter(k => k !== main));
  // ふつうは 2 つ、大覚醒は 3 つの能力が大きく伸びる
  const ups = big
    ? [[main, U.rint(18, 28)], [others[0], U.rint(10, 16)], [others[1], U.rint(6, 12)]]
    : [[main, U.rint(8, 15)], [others[0], U.rint(3, 7)]];
  const parts = ups.map(([k, v]) => {
    const before = p.a[k];
    p.a[k] = Math.max(p.a[k], Math.min(abilMax(p, k), p.a[k] + v));
    if (k === 'velo') return `球速 +${veloKmh(p.a[k]) - veloKmh(before)}km/h`;
    return `${lbl[k]} +${Math.round(p.a[k]) - Math.round(before)}`;
  });
  p.pot = Math.min(1.7, p.pot + (big ? 0.08 : 0.02));
  p.cond = 5;
  p.awakened = (p.awakened || 0) + 1;
  if (big) p.bigAwakened = (p.bigAwakened || 0) + 1;
  addFame(p, big ? 20 : 6);
  if (p.teamId === S.myTeamId) {
    const how = p.age >= p.peak + 2 ? `衰えたと言われていた${p.name}が${U.pick(VETERAN_TEXTS)}` : `${p.name}が${U.pick(AWAKEN_TEXTS)}`;
    const text = `${how}${big ? '大覚醒' : '覚醒'}した！ ${parts.join('、')}`;
    addNews((big ? '【大覚醒】' : '【覚醒】') + text, 'awaken');
    S.popups.push({ pid: p.id, text, big });
  }
}

// ---------- FA（フリーエージェント） ----------
// FA 権：一軍登録の年数が、高校出身は 8 年・それ以外は 7 年（一度使ったら次は 4 年）
function faNeed(p) { return p.faUsed ? 4 : (p.faNeed || 8); }
function faYearsHave(p) { return (p.svc || 0) - (p.svcUsed || 0); }
function hasFA(p) { return !p.foreign && faYearsHave(p) >= faNeed(p); }

// ---------- 成績から見た年俸の目安 ----------
// リーグ全体の OPS と防御率（その日のうちは使い回す）
function lgRates() {
  const key = S.year + '-' + S.day + '-' + S.phase;
  if (S._lgRates && S._lgRates.key === key) return S._lgRates;
  let ab = 0, pa = 0, h = 0, bb = 0, tb = 0, er = 0, outs = 0;
  Object.values(S.players).forEach(p => {
    const st = p.stats;
    if (!st) return;
    pa += st.pa; ab += st.ab; h += st.h; bb += st.bb; tb += st.h + st.d + st.t * 2 + st.hr * 3;
    er += st.per; outs += st.outs;
  });
  const r = { key, ops: pa ? (h + bb) / pa + (ab ? tb / ab : 0) : 0.7, era: outs > 300 ? er * 27 / outs : 3.7 };
  Object.defineProperty(S, '_lgRates', { value: r, writable: true, configurable: true, enumerable: false }); // セーブには入れない
  return r;
}

// その年の貢献（勝利数の目安。リーグ平均の選手が 1 年出ると 2 くらい）
function seasonWins(p) {
  const st = p.stats, lg = lgRates();
  const full = 143 / Math.max(1, S.games || 143); // 短いシーズンは 143 試合に直す
  let w = 0;
  if (canBat(p) && st.pa > 0) {
    const pos = (p.isP ? p.pos2 : p.pos);
    w += (ops(st) - lg.ops * 0.82 + (pos === '捕' || pos === '遊' ? 0.04 : 0)) * st.pa * full / 600 * 16;
  }
  if (canPitch(p) && st.outs > 0) {
    w += (lg.era * 1.3 - st.per * 27 / st.outs) * st.outs * full / 27 / 10 + st.sv * full * 0.05;
  }
  return w;
}
function playedEnough(p) { const st = p.stats; return st.pa >= 100 || st.outs >= 60; }
function perfSalary(p) {
  const w = Math.max(0, seasonWins(p));
  return Math.round((800 + w * SAL_PER_WIN + w * w * SAL_PER_WIN2) / 10) * 10;
}

// 契約更改：去年の年俸から、今年の成績で上げ下げする（能力の数字は使わない）
function renewSalary(p) {
  const old = p.salary;
  let now;
  if (!playedEnough(p)) {
    now = p.age <= 25 ? old * 1.03 : old * 0.9; // あまり出ていない：若手は少しだけ上がり、ほかは少し下がる
  } else {
    const target = perfSalary(p);
    if (seasonWins(p) < 0.5) now = Math.min(old, target); // 出ても働けなかった人は上げない
    else now = target > old ? Math.min(old + (target - old) * 0.6, old * 3 + 2000) : old - (old - target) * 0.5;
  }
  // 減額制限（1 億円以下は 25%、1 億円を超えると 40% まで）
  now = Math.max(now, old * (old > 10000 ? 0.6 : 0.75));
  return Math.max(MIN_SALARY, Math.round(now / 10) * 10);
}

// FA 市場での相場（年俸）。今の年俸と今年の成績の間くらいを、少し上乗せして
function faMarket(p) {
  const v = playedEnough(p) ? Math.max(p.salary, (p.salary + perfSalary(p)) / 2) : p.salary;
  return Math.max(1000, Math.round(v * 1.2 / 10) * 10);
}

// 年俸のチーム内順位で A（上位 3 人）・B（4〜10 位）・C（それ以外）
function faRank(t, p) {
  const order = teamPlayers(t).sort((a, b) => b.salary - a.salary).map(x => x.id);
  const i = order.indexOf(p.id);
  return i < 3 ? 'A' : i < 10 ? 'B' : 'C';
}
const FA_COMP = { A: 0.8, B: 0.6, C: 0 }; // 取った球団が元の球団に払う補償（年俸の何倍か）

// FA 宣言する確率。忠誠心が高いほど残る。引き留め（年俸アップの約束）でも残りやすくなる
function declareChance(p, retain) {
  const t = S.teams[p.teamId];
  let c = 0.75 - (p.loyalty / 100) * 0.9;
  if (faMarket(p) > p.salary * 1.2) c += 0.15;
  if (rankOf(t.id) >= 5) c += 0.1;
  if (p.age >= 35) c -= 0.35;
  if (ovr(p) < 50) c -= 0.25;
  if (ovr(p) >= 62) c += 0.15; // 主力ほど大きな契約を求めて宣言しやすい
  if (isHomeTeam(p, t)) c -= 0.12; // 地元の球団には少し残りやすい
  c -= retain === 1.5 ? 0.3 : retain === 1.2 ? 0.15 : 0;
  return U.clamp(c, 0.02, 0.9);
}

function isHomeTeam(p, t) { return !!p.home && TEAM_PREF[t.short] === p.home; }

function faMood(c) { return c < 0.2 ? '残留濃厚' : c < 0.4 ? '残留寄り' : c < 0.6 ? '五分五分' : '移籍も視野'; }

function offFAStart() {
  const eligible = [];
  S.teams.forEach(t => teamPlayers(t).forEach(p => { if (hasFA(p)) eligible.push(p.id); }));
  S.off.fa = { stage: 'pre', eligible, retain: {}, declared: [], myBids: {}, results: [] };
  S.off.step = 'fa';
}

function setRetain(pid, mul) { S.off.fa.retain[pid] = mul; }

// FA 宣言の発表。宣言した選手は FA 市場に出て、他球団が条件を出す
function offFADeclare() {
  const F = S.off.fa;
  F.eligible.forEach(id => {
    const p = S.players[id];
    if (!p || p.teamId == null) return;
    const t = S.teams[p.teamId];
    const mine = t.id === S.myTeamId;
    // 他球団は、いい選手なら引き留める
    const retain = mine ? (F.retain[id] || 0) : (ovr(p) >= 60 && U.chance(0.5) ? 1.2 : 0);
    if (!U.chance(declareChance(p, retain))) {
      if (retain) {
        p.salary = Math.round(p.salary * retain / 10) * 10;
        addLoyalty(p, 5);
        if (mine) addNews(`${p.name}は引き留めに応じ、残留を決めました（年俸${U.money(p.salary)}）。`, 'good');
      }
      return;
    }
    const rank = faRank(t, p);
    p.faUsed = true;
    p.svcUsed = p.svc || 0;
    F.declared.push({ pid: id, from: t.id, rank, oldSalary: p.salary, mv: faMarket(p), bids: aiBids(p, t) });
    removeFromTeam(p);
    p.lastTeam = t.short;
    addNews(`${p.name}（${t.short}・${p.isP ? '投手' : p.pos}）がFA宣言しました。`, mine ? 'bad' : '');
  });
  F.stage = 'market';
}

// 他球団の条件。チームで弱いところを埋められる選手なら手を挙げる
function aiBids(p, from) {
  const bids = [];
  const mv = faMarket(p);
  S.teams.forEach(t => {
    if (t.id === S.myTeamId) return;
    const same = teamPlayers(t).filter(x => x.isP === p.isP && x.id !== p.id).map(ovr).sort((a, b) => b - a);
    const bar = same[p.isP ? 9 : 8] || 0; // 投手は 10 番手、野手は 9 番手より上なら欲しい
    const former = t.id === from.id;
    const want = ovr(p) > bar + (former ? -5 : -2);
    if (!want || !U.chance(former ? 0.65 : 0.55)) return;
    const salary = Math.round(mv * U.rnd(0.9, 1.25) / 10) * 10;
    if (t.money < salary * 1.5) return;
    if (payroll(t) + salary > 380000) return; // 年俸総額が 38 億円を超える補強はしない
    bids.push({ team: t.id, salary, years: p.age <= 30 ? U.rint(2, 4) : U.rint(1, 2) });
  });
  // 手を挙げるのは多くても 4 球団
  return U.shuffle(bids).slice(0, 4);
}

function setMyBid(pid, mul, years) {
  const F = S.off.fa;
  const d = F.declared.find(x => x.pid === pid);
  const t = myTeam();
  if (!d) return 'その選手はいません。';
  if (mul == null) { delete F.myBids[pid]; return null; }
  const salary = Math.round(d.mv * mul / 10) * 10;
  const comp = d.from === t.id ? 0 : Math.round(d.oldSalary * FA_COMP[d.rank]);
  if (t.money < salary + comp) return 'お金が足りません（1 年目の年俸と補償金が払えません）。';
  F.myBids[pid] = { salary, years, mul };
  return null;
}

// 選手がどの球団を選ぶか。条件・年数・チームの強さと人気・元の球団への忠誠心で決まる
function bidScore(p, d, b) {
  const t = S.teams[b.team];
  const yearW = p.age >= 32 ? 0.12 : 0.06;
  let f = 1 + (pct(t) - 0.5) * 0.4 + (t.pop - 50) / 500 + U.rnd(-0.06, 0.06);
  if (b.team === d.from) f += (p.loyalty / 100) * 0.5;
  if (isHomeTeam(p, t)) f += 0.12; // 地元の球団には少し行きやすい
  return b.salary * (1 + yearW * (b.years - 1)) * f;
}

function offFAResolve() {
  const F = S.off.fa;
  F.declared.forEach(d => {
    const p = S.players[d.pid];
    const bids = d.bids.slice();
    const mine = F.myBids[d.pid];
    if (mine) bids.push({ team: S.myTeamId, salary: mine.salary, years: mine.years });
    let best = null, bs = -1;
    bids.forEach(b => { const v = bidScore(p, d, b); if (v > bs) { bs = v; best = b; } });
    const from = S.teams[d.from];
    if (!best) {
      // どこからも声がかからなければ元の球団に残る（宣言残留）
      signPlayer(from, p);
      F.results.push({ pid: d.pid, name: p.name, from: d.from, to: d.from, salary: p.salary, years: 1, bids: bids.length, note: '宣言残留' });
      return;
    }
    const to = S.teams[best.team];
    signPlayer(to, p);
    p.salary = best.salary;
    p.contractYears = best.years - 1;
    let comp = 0;
    if (to.id !== from.id) {
      comp = Math.round(d.oldSalary * FA_COMP[d.rank]);
      to.money -= comp; from.money += comp;
      if (to.id === S.myTeamId) to.fin.invest += comp;
      if (from.id === S.myTeamId) from.fin.other += comp;
      p.loyalty = 50;
    } else addLoyalty(p, 10);
    if (to.id !== S.myTeamId) autoActive(to);
    F.results.push({ pid: d.pid, name: p.name, from: d.from, to: to.id, salary: best.salary, years: best.years, bids: bids.length, comp, note: to.id === from.id ? '残留' : '移籍' });
    const involved = to.id === S.myTeamId || from.id === S.myTeamId;
    addNews(`FA：${p.name}が${to.id === from.id ? `${to.short}に残留` : `${from.short}から${to.short}へ移籍`}（${best.years}年・年俸${U.money(best.salary)}${comp ? `・補償金${U.money(comp)}` : ''}）`,
      involved ? (to.id === S.myTeamId ? 'good' : 'bad') : '');
  });
  F.stage = 'done';
}

// ---------- オフ ----------
// 引退する確率。年齢と、今季どれだけ一軍に出たかで決める
function retireChance(p, ca, o) {
  const st = p.stats, scale = Math.max(1, S.games || 143) / 143;
  const low = (st.injd || 0) < RETIRE_INJ_DAYS // 長くケガをしていた年は数えない
    && (!canBat(p) || st.g < RETIRE_LOW_G * scale) && (!canPitch(p) || st.pg < RETIRE_LOW_PG * scale);
  if (ca >= RETIRE_MAX_AGE) return 0.9; // 43 歳前後でほぼ全員
  if (low) return ca >= 36 ? 0.8 : ca >= 33 ? 0.5 : ca >= 30 ? 0.25 : 0;
  if (ca >= 38 && o < 50) return 0.5; // 出てはいても、力が大きく落ちた
  if (ca >= 31 && o < 45) return 0.5;
  return 0;
}

function offContract() {
  const my = myTeam();
  const retired = [], raises = [];
  S.teams.forEach(t => {
    teamPlayers(t).forEach(p => {
      const o = ovr(p);
      let leave = false;
      const ca = careerAge(p);
      if (p.retireAge) leave = p.age >= p.retireAge && U.chance(0.7); // 転生選手は、もとの選手が辞めた年ごろまで続ける
      else leave = U.chance(retireChance(p, ca, o));
      if (p.foreign && o < 55) leave = true;
      if (leave) {
        if (t.id === my.id) retired.push({ name: p.name, age: p.age, why: p.foreign && p.age < 35 ? '退団' : '引退' });
        retireRecord(p);
        removeFromTeam(p);
        delete S.players[p.id];
      }
    });
  });
  agingFreeAgents();
  S.teams.forEach(t => {
    teamPlayers(t).forEach(p => {
      const old = p.salary;
      const locked = p.contractYears > 0;
      if (locked) p.contractYears--; // 複数年契約のあいだは年俸がそのまま
      else p.salary = renewSalary(p);
      agePlayer(p);
      if (t.id === my.id) raises.push({ pid: p.id, name: p.name, old, now: p.salary, locked });
      addLoyalty(p, 3 + (t.goods.some(g => g.pid === p.id) ? 5 : 0));
      if (t.id === my.id && p.genius && !p.geniusKnown) {
        p.geniusKnown = true;
        addNews(`1 年見てきて分かった。${p.name}は「天才」だ！（伸びが段ちがい）`, 'awaken');
      }
    });
  });
  raises.sort((a, b) => (b.now - b.old) - (a.now - a.old));
  S.off.contract = { retired, raises };
  S.off.step = 'contract';
}

// その年のドラフト候補。シーズン開幕のときに発表され、ドラフトまでリストアップできる
function makeDraftClass() {
  const pool = [];
  // 年ごとの当たり外れ（「投手は豊作、野手は不作」のような年ができる）
  const bias = { P: U.clamp(U.gauss() * 3.5, -7, 7), B: U.clamp(U.gauss() * 3.5, -7, 7) };
  for (let i = 0; i < S.teams.length * DRAFT_ROUNDS + 30; i++) {
    const kind = U.pickW(DRAFT_KINDS);
    const age = kind === '高校' ? 18 : kind === '大学' ? 22 : kind === '高卒社会人' ? 21 : U.rint(23, 25);
    const isP = U.chance(0.45);
    const q = (kind === '高校' ? U.rnd(28, 46) : kind === '大学' ? U.rnd(38, 54) : kind === '高卒社会人' ? U.rnd(34, 50) : U.rnd(44, 58)) + (isP ? bias.P : bias.B);
    const pot = U.clamp(0.97 + U.gauss() * 0.24 + (kind === '高校' ? 0.08 : kind === '高卒社会人' ? 0.04 : 0), 0.6, 1.7);
    const p = newPlayer(S, { isP, q, age, pot });
    p.kind = kind;
    p.salary = 600;
    if (p.isP && p.pot >= 1.1 && U.chance(TWO_WAY_CHANCE / 0.2)) {
      PIT_KEYS.forEach(k => { p.a[k] = Math.min(99, p.a[k] + 6); });
      makeTwoWay(p, q + 4);
    }
    finishProspect(p, kind);
    pool.push(p.id);
  }
  addReborn(pool);
  return pool;
}

// ドラフト候補の仕上げ：スカウトの見立てのずれ・アマチュアの成績・「〇年に一人」
function finishProspect(p, kind) {
  // 能力ごとの「ずれの向きと大きさ」（-1〜1）を先に決めておく。実際のずれはスカウトの段階で小さくなる
  const miss = () => ({ unit: U.clamp(U.gauss() * 0.5, -1, 1) });
  p.noise = {};
  abilKeys(p).forEach(k => { p.noise[k] = miss(); });
  p.noise.pot = miss();
  p.amateur = makeAmateur(p, kind);
  const ry = rareYears(p);
  if (ry) p.rareYears = ry;
}

// 転生選手（reborn.js）を、毎年だいたい 1 人ドラフト候補にまぜる。いま球界にいる人（候補・選手・自由契約）は出ない。引退したら、また出られる
function addReborn(pool) {
  if (!REBORN.length || !U.chance(REBORN_YEAR_CHANCE)) return; // 合言葉が入っていない端末では出ない
  const alive = new Set(Object.values(S.players).map(p => p.reborn).filter(Boolean));
  const cands = REBORN.filter(R => !alive.has(R.id));
  if (!cands.length) return;
  [U.pickW(cands.map(R => [R, R.weight || 1]))].forEach(R => {
    const age = R.kind === '高校' ? 18 : R.kind === '大学' ? 22 : R.kind === '高卒社会人' ? 21 : 24;
    // ピーク時の能力（R.peak）から、入団時の能力・才能・伸びしろの上限を決める
    const peakA = { ...R.peak };
    if (peakA.velo >= 100) peakA.velo = kmhToVelo(peakA.velo); // 球速は km/h でも書ける
    const keys = Object.keys(peakA), avg = U.sum(keys, k => peakA[k]) / keys.length;
    const ratio = REBORN_START[R.kind] || 0.65;
    const pot = U.clamp((avg - CEIL_BASE) / CEIL_PER_POT, 1.3, 1.7); // 才能は必ず ★5
    const p = newPlayer(S, { isP: R.isP, pos: R.pos, q: avg * ratio, age, pot });
    p.name = R.name;
    if (R.twoWay) { makeTwoWay(p, avg * ratio); if (R.isP) { p.pos2 = R.pos2 || '外'; p.subs = R.subs || []; } } // 二刀流は peak に投打両方を書く
    keys.forEach(k => { p.a[k] = U.clamp(peakA[k] * ratio + U.gauss() * 2, 5, 99); });
    p.ceilA = peakA;
    if (R.isP) {
      // 先発・中継ぎ・抑えの向き不向き
      p.apt = R.apt ? { ...R.apt } : R.role === '先発' ? { sp: 2, rp: 1 } : { sp: 0, rp: 2 }; // apt（0△ 1〇 2◎）を書けばそれを使う
      p.role = R.role === '先発' ? '先発' : '中継';
    }
    if (R.team && TEAM_PREF[R.team]) p.home = TEAM_PREF[R.team]; // 出身地は、元の所属球団の本拠地
    if (R.retireAge) p.retireAge = R.retireAge;
    if (canBat(p)) { p.traj = R.traj || p.traj; if (!R.isP) p.subs = R.subs || p.subs; if (R.steal) p.steal = R.steal; }
    p.type = R.type || '晩成'; p.peak = GROWTH_PEAK[p.type]; // 転生選手はふつう晩成型（R.type で変えられる）
    p.genius = U.chance(GENIUS_CHANCE); // 天才肌になる確率はふつうの選手と同じ
    p.kind = R.kind;
    p.salary = 600;
    p.reborn = R.id;
    if (R.team) p.rebornTeam = R.team;
    finishProspect(p, R.kind);
    p.amateur.team = '？？？'; // 転生選手の出身校・所属は伏せる
    pool.push(p.id);
  });
}
function rebornOf(p) { return p.reborn ? REBORN.find(R => R.id === p.reborn) || null : null; }
function rebornTag(p) { return p.reborn ? `<span class="tag reborn" title="名選手をもとにした転生選手">転生</span>` : ''; }

// ドラフト候補の発表で、転生選手と「〇年に一人の逸材」をニュースにする
function announceDraftClass() {
  S.draftClass.map(id => S.players[id]).filter(p => p.reborn).forEach(p => {
    const R = rebornOf(p);
    addNews(`転生選手がドラフト候補に現れた！ ${p.name}（${p.amateur ? p.amateur.team : p.kind}）${R ? '― ' + R.note : ''}`, 'big');
  });
  S.draftClass.map(id => S.players[id]).filter(p => p.rareYears).forEach(p => {
    addNews(`今年のドラフト候補に「${p.rareYears}年に一人の逸材」と言われる${p.kind === '高校' ? '高校生' : p.kind === '大学' ? '大学生' : '社会人'}がいる！ ${p.name}（${p.amateur ? p.amateur.team : p.kind}）`, 'big');
  });
}

// 「〇年に一人の逸材」：本当の能力と才能が、何年に 1 人しか出ない高さか
function rareYears(p) {
  const v = draftValue(p) + (p.genius ? 8 : 0);
  const hit = RARE_PROSPECT.find(r => v >= r[0]);
  return hit ? hit[1] : 0;
}
function rareTag(p) { return p.rareYears ? `<span class="tag rare">${p.rareYears}年に一人の逸材</span>` : ''; }

function offDraftStart() {
  const pool = (S.draftClass || makeDraftClass()).filter(id => S.players[id]);
  S.draftClass = null;
  // 2 巡目からはウェーバー（下位から、両リーグ交互）。3 巡目は逆（上位から）、4 巡目はまた下位から…と入れ替わる
  const w = waiverOrder();
  const picks = [];
  for (let r = 2; r <= DRAFT_ROUNDS; r++) (r % 2 === 0 ? w.order : w.order.slice().reverse()).forEach(id => picks.push(id));
  S.off.draft = { pool, stage: 'r1', r1: { sub: 0, log: [] }, order: picks, idx: 0, result: [], first: w.first, myDone: false };
  S.off.step = 'draft';
}

// ウェーバーの順番：交流戦で勝ち越したリーグの最下位から、両リーグ交互に
function waiverOrder() {
  const wins = { セ: 0, パ: 0 };
  S.schedule.forEach(e => e.games.forEach(m => {
    if (!m.inter || !m.score) return;
    if (m.score[1] > m.score[0]) wins[S.teams[m.home].lg]++;
    else if (m.score[0] > m.score[1]) wins[S.teams[m.away].lg]++;
  }));
  const first = wins.パ > wins.セ ? 'パ' : wins.セ > wins.パ ? 'セ' : U.pick(LEAGUES);
  const second = first === 'セ' ? 'パ' : 'セ';
  const A = standings(first).map(r => r.t.id).reverse(), B = standings(second).map(r => r.t.id).reverse();
  const order = [];
  for (let i = 0; i < A.length; i++) order.push(A[i], B[i]);
  return { order, first, wins };
}

function draftRound() {
  const D = S.off.draft;
  if (D.stage === 'r1') return 1;
  return Math.min(DRAFT_ROUNDS, 2 + Math.floor(D.idx / S.teams.length));
}

// スカウトの段階ごとの、見立てのずれの最大（能力の数字）。段階を上げるほど小さくなる
const SCOUT_RANGE = [0, 15, 10, 6, 3, 1];
function scoutRange() { return SCOUT_RANGE[myTeam().fac.scout]; }

// どの能力も少しずつずれて見える。ずれの大きさはスカウトの段階で決まる
function scoutView(p, key) {
  const n = p.noise && p.noise[key];
  const real = key === 'pot' ? p.pot : p.a[key];
  if (!n || typeof n !== 'object') return real;
  const unit = n.unit != null ? n.unit : (n.dev || 0) / 15; // 前の版のセーブにも対応
  const dev = unit * scoutRange();
  if (key === 'pot') return U.clamp(real + dev * 0.025, 0.5, 1.7);
  return U.clamp(real + dev, 1, 99);
}

// ---------- ドラフトの評価（スカウトの見立てで決めるので、スカウトが低いと外れることもある） ----------
function seenOvr(p) { return ovr({ ...p, a: Object.fromEntries(Object.keys(p.a).map(k => [k, scoutView(p, k)])) }); }
function draftScore(p) { return scoutView(p, 'pot') * 40 + seenOvr(p) * 0.6; }
// ふつうの年に「目玉 3 人・1 位級 12 人・上位 36 人」くらいになる点
const DRAFT_TIERS = [
  [94, '競合必至の目玉', 1], [84, 'ドライチ級', 2], [76, '上位で消える逸材', 3],
  [67, '中位指名候補', 4], [58, '下位指名候補', 5], [-Infinity, '指名漏れもありうる', 6],
];
const DRAFT_TOP = 76; // 「上位候補」とみなす点
// 上位候補の人数が この数以下なら「不作」、以上なら「豊作」（だいたい 2 割ずつの年がそうなる）
const REVIEW_LINE = { P: [14, 21], B: [16, 25] };
function draftTier(p) { const s = draftScore(p); return DRAFT_TIERS.find(t => s >= t[0]); }

function toggleWatch(pid) {
  if (!S.watch) S.watch = [];
  const i = S.watch.indexOf(pid);
  if (i >= 0) S.watch.splice(i, 1); else S.watch.push(pid);
}

// ---------- アマチュア時代の成績と講評 ----------
const UNIV_LEAGUES = ['東都大学リーグ', '東京六大学リーグ', '首都大学リーグ', '関西学生リーグ', '九州六大学リーグ', '北海道六大学リーグ'];
const COMPANIES = ['ミナト自動車', '北辰製鉄', '大和ガス', '東邦電力', '三葉重工', '青葉通運'];
const KIND_BASE = { 高校: 37, 大学: 46, 高卒社会人: 42, 社会人: 51 }; // 出身ごとの能力の真ん中
// ドラフト候補の出身の割合。高卒社会人は、高校を出て社会人で 3 年たった 21 歳（本物でも高卒の社会人は 3 年たたないと指名できない）
const DRAFT_KINDS = [['高校', 40], ['大学', 32], ['社会人', 18], ['高卒社会人', 10]];

// 成績とタイトルは本当の能力から作る（スカウトの見立てとは別の、表に出ている事実）
function makeAmateur(p, kind) {
  const base = KIND_BASE[kind];
  const z = v => U.clamp((v - base) / 9 + U.gauss() * 0.35, -2.5, 3);
  const n0 = v => Math.max(0, Math.round(v));
  const avg = v => U.avg(v * 1000, 1000);
  const era = v => U.clamp(v, 0.3, 6).toFixed(2);
  const A = { kind, team: '', line: '', title: '' };
  let league = '';
  if (kind === '高校') {
    A.team = `${U.pick('桐明清光星翔誠聖'.split(''))}${U.pick('陵稜和英風南北城'.split(''))}${U.pick(['学院', '高', '実業', '学園'])}（${p.home}）`;
  } else if (kind === '大学') {
    league = U.pick(UNIV_LEAGUES);
    A.team = `${U.pick(['東邦', '西海', '南星', '北陵', '中央学院', '国際', '明和', '清和'])}${U.pick(['大', '学院大', '工業大', '体育大'])}（${league}）`;
  } else {
    A.team = kind === '高卒社会人' ? `${U.pick(COMPANIES)}（社会人・高卒3年目）` : `${U.pick(COMPANIES)}（社会人）`;
  }
  const km = veloKmh(p.isP ? p.a.velo : 0) + U.rint(1, 3);
  if (!p.isP) {
    const zm = z(p.a.meet), zp = z(p.a.power), zs = z(p.a.speed);
    const all = (zm + zp + zs) / 3;
    if (kind === '高校') {
      const hr = n0(18 + 13 * zp + U.gauss() * 4);
      A.line = `高校通算 ${hr}本塁打 ・ 打率${avg(U.clamp(0.36 + 0.045 * zm + U.gauss() * 0.02, 0.22, 0.56))} ・ ${n0(10 + 8 * zs)}盗塁`;
      if (all > 0.3 && U.chance(0.6)) A.title = U.chance(0.5) ? `甲子園で${U.rint(1, 3)}本塁打` : `甲子園ベスト${U.pick([4, 8, 16])}`;
    } else if (kind === '大学') {
      A.line = `リーグ通算 ${U.rint(70, 100)}試合 打率${avg(U.clamp(0.285 + 0.035 * zm + U.gauss() * 0.015, 0.18, 0.42))} ・ ${n0(5 + 4 * zp + U.gauss() * 1.5)}本塁打 ・ ${n0(8 + 6 * zs + U.gauss() * 2)}盗塁`;
      if (zm > 1.1) A.title = `${league}で首位打者`;
      else if (zp > 1.1) A.title = `${league}で本塁打王`;
      else if (zs > 1.2) A.title = `${league}で盗塁王`;
      else if (all > 0.6 && U.chance(0.5)) A.title = `${league}でベストナイン`;
    } else {
      A.line = `公式戦 打率${avg(U.clamp(0.3 + 0.03 * zm + U.gauss() * 0.015, 0.2, 0.42))} ・ ${n0(6 + 4 * zp + U.gauss() * 1.5)}本塁打`;
      if (all > 0.8 && U.chance(0.6)) A.title = '都市対抗で打撃賞';
    }
  } else {
    const zq = z((p.a.velo + p.a.control + p.a.breaking) / 3), zk = z((p.a.velo + p.a.breaking) / 2);
    if (kind === '高校') {
      A.line = `最速${km}km/h ・ 3年夏の県大会 防御率${era(1.5 - 0.4 * zq + U.gauss() * 0.3)}`;
      if (zq > 0.3 && U.chance(0.6)) A.title = U.chance(0.5) ? `甲子園で${U.rint(15, 45)}奪三振` : `甲子園ベスト${U.pick([4, 8, 16])}`;
    } else if (kind === '大学') {
      const w = n0(12 + 5 * zq + U.gauss() * 2);
      A.line = `リーグ通算 ${w}勝${n0(8 - 3 * zq + U.gauss() * 2)}敗 防御率${era(2.2 - 0.45 * zq + U.gauss() * 0.3)} ・ ${n0(130 + 45 * zk + U.gauss() * 15)}奪三振 ・ 最速${km}km/h`;
      if (zq > 1.1) A.title = `${league}で最優秀防御率`;
      else if (zk > 1.1) A.title = `${league}で最多奪三振`;
      else if (zq > 0.6 && U.chance(0.5)) A.title = `${league}でベストナイン`;
    } else {
      A.line = `公式戦 防御率${era(2.4 - 0.45 * zq + U.gauss() * 0.3)} ・ 最速${km}km/h`;
      if (zq > 0.8 && U.chance(0.6)) A.title = '都市対抗で橋戸賞';
    }
    if (p.twoWay) A.line += ` ／ 打っては 打率${avg(U.clamp(0.3 + 0.04 * z(p.a.meet), 0.2, 0.5))}・${n0(4 + 6 * z(p.a.power))}本塁打`;
  }
  return A;
}

const SCOUT_GOOD = {
  meet: '確実性が高く広角に打てる', power: 'スイングが速く長打力が魅力', speed: '50m 5秒台の俊足', arm: '強肩で送球が正確', field: '守備範囲が広い',
  velo: '威力のある直球が武器', control: '制球が良く四球が少ない', stamina: '完投できるスタミナ', breaking: 'キレのある変化球',
};
const SCOUT_BAD = {
  meet: '確実性に課題', power: '長打は少なめ', speed: '足は速くない', arm: '送球に不安', field: '守備に課題',
  velo: '球速はもう一つ', control: '制球にばらつき', stamina: 'スタミナに課題', breaking: '変化球の精度が課題',
};

// スカウトの講評。見立て（scoutView）で書くので、スカウトが低いと外れていることもある
function scoutComment(p) {
  const keys = abilKeys(p).slice().sort((a, b) => scoutView(p, b) - scoutView(p, a));
  const best = keys[0], worst = keys[keys.length - 1];
  const base = KIND_BASE[p.kind] || 45;
  const parts = [SCOUT_GOOD[best]];
  if (scoutView(p, keys[1]) >= base + 8) parts.push(SCOUT_GOOD[keys[1]]);
  if (scoutView(p, worst) < base) parts.push(SCOUT_BAD[worst]);
  const pot = scoutView(p, 'pot');
  if (canBat(p) && trajOf(p) === 4) parts.push('打球が高く上がるアーチスト');
  else if (canBat(p) && trajOf(p) === 1) parts.push('低く鋭い打球のライナー打者');
  if (pot >= 1.42) parts.push('将来のスター候補');
  else if (pot >= 1.22) parts.push('伸びしろ十分');
  else if (pot < 0.85) parts.push('完成度は高いが伸びしろは小さめ');
  if (p.kind === '高校' && pot >= 1.15 && ovr(p) < 38) parts.push('じっくり育てたい素材型');
  if (p.kind === '社会人' && ovr(p) >= 52) parts.push('即戦力');
  if (p.kind === '高卒社会人') parts.push(ovr(p) >= 46 ? '社会人の3年で体ができ、まだ若い' : '若さが魅力で、もうひと伸びしそう');
  if (p.twoWay) parts.push('投打の二刀流');
  return parts.join('。') + '。';
}

// 天才の気配に気づくか。スカウトの段階が高いほど本物に気づき、低いと見間違えることもある
const GENIUS_NOTICE = [0, 0.25, 0.4, 0.55, 0.75, 0.95];
function geniusHint(p) {
  const lv = myTeam().fac.scout;
  if (p.geniusRoll == null) p.geniusRoll = Math.random();
  if (p.genius) return p.geniusRoll < GENIUS_NOTICE[lv];
  return p.geniusRoll < (5 - lv) * 0.005; // 見間違い
}

function draftValue(p) { return ovr(p) * 0.6 + p.pot * 40 + (p.age <= 18 ? 5 : 0); }

// 交渉権を得た選手を球団に入れる
function assignPick(teamId, pid, round, note) {
  const D = S.off.draft;
  const p = S.players[pid];
  D.pool = D.pool.filter(id => id !== pid);
  signPlayer(S.teams[teamId], p);
  p.loyalty = U.rint(55, 75);
  p.faNeed = p.kind === '高校' ? 8 : 7;
  p.svc = 0;
  // 何年のドラフトの何位で、どの球団に入ったか（選手の詳細に出す）
  p.drafted = { year: S.year, round, team: S.teams[teamId].short, note: note || '', from: p.amateur ? p.amateur.team : '' };
  D.result.push({ round, team: teamId, pid, name: p.name, pos: p.pos, kind: p.kind, note: note || '' });
  if (teamId === S.myTeamId) addNews(`ドラフト${round}位で${p.name}（${p.kind}・${p.pos}）${note ? `（${note}）` : ''}の交渉権を獲得！`, 'good');
  else if ((S.watch || []).includes(pid)) addNews(`気になっていた${p.name}は${S.teams[teamId].short}が${round}位で指名しました。`, 'bad');
}

// ---------- 1 巡目：入札と抽選 ----------
// 他球団の入札。いちばん評価の高い選手に集まりやすいが、少しばらける（競合や一本釣りが生まれる）
function aiBid(taken) {
  const cands = S.off.draft.pool.map(id => S.players[id]).filter(p => !taken.has(p.id))
    .sort((a, b) => draftValue(b) - draftValue(a)).slice(0, 7);
  const w = [0.28, 0.2, 0.16, 0.12, 0.1, 0.08, 0.06];
  let r = Math.random();
  for (let i = 0; i < cands.length; i++) { r -= w[i]; if (r < 0) return cands[i].id; }
  return cands[0] && cands[0].id;
}

// 1 位の入札をまとめて開き、重なった選手は抽選。外れた球団は次の入札へ（myPid は自分の入札）
function draftBidRound(myPid) {
  const D = S.off.draft, R = D.r1;
  const won = new Set(D.result.filter(r => r.round === 1).map(r => r.team));
  const bidders = S.teams.map(t => t.id).filter(id => !won.has(id));
  if (!bidders.length) return [];
  R.sub++;
  const bids = {};
  bidders.forEach(id => {
    const pid = id === S.myTeamId ? myPid : aiBid(new Set());
    (bids[pid] = bids[pid] || []).push(id);
  });
  const logs = [];
  Object.keys(bids).forEach(k => {
    const pid = +k, teams = bids[k];
    const winner = U.pick(teams);
    const p = S.players[pid];
    logs.push({ sub: R.sub, pid, name: p.name, kind: p.kind, pos: p.pos, teams, winner });
    assignPick(winner, pid, 1, R.sub === 1 ? (teams.length > 1 ? `${teams.length}球団競合` : '') : '外れ1位');
  });
  // 競合した選手を先に並べる
  logs.sort((a, b) => b.teams.length - a.teams.length);
  R.log.push(...logs);
  return logs;
}

// 自分の 1 位入札。自分が交渉権を取るまで（取ったら残りの球団の分も）入札を続ける
function draftMyBid(pid) {
  const D = S.off.draft;
  const all = [];
  all.push(...draftBidRound(pid));
  const mineWon = () => D.result.some(r => r.round === 1 && r.team === S.myTeamId);
  if (mineWon()) {
    // 自分が決まったら、ほかの球団の外れ 1 位は自動で進める
    while (D.result.filter(r => r.round === 1).length < S.teams.length) all.push(...draftBidRound(null));
    D.stage = 'waiver';
    draftRunAI();
  }
  return all;
}

// ---------- 2 巡目から：ウェーバー ----------
function draftPick(teamId, pid) {
  assignPick(teamId, pid, draftRound());
  S.off.draft.idx++;
}

function draftRunAI() {
  const D = S.off.draft;
  while (D.idx < D.order.length) {
    const tid = D.order[D.idx];
    if (tid === S.myTeamId && !D.myDone) break;
    if (tid === S.myTeamId) { D.idx++; continue; } // 選択終了したあとは飛ばす
    const best = D.pool.map(id => S.players[id]).sort((a, b) => draftValue(b) - draftValue(a))[0];
    if (!best) { D.idx++; continue; }
    draftPick(tid, best.id);
  }
}

function draftMyPick(pid) {
  draftPick(S.myTeamId, pid);
  draftRunAI();
}

// 選択終了：このあとは指名しない
function draftPass() {
  S.off.draft.myDone = true;
  draftRunAI();
}

function draftDone() { const D = S.off.draft; return D.stage === 'waiver' && D.idx >= D.order.length; }

// ---------- ドラフト採点（スカウト部長の見立て） ----------
// 指名した選手の評価の点（draftScore）を、良い順に重みを付けて足す。上位の選手ほど重く見る
const PICK_W = [1, 0.8, 0.65, 0.5, 0.4, 0.3, 0.25];
// 12 球団の中の順位で A〜E を付ける（A 2 球団・B 3・C 4・D 2・E 1）
const GRADE_BY_RANK = ['A', 'A', 'B', 'B', 'B', 'C', 'C', 'C', 'C', 'D', 'D', 'E'];
function gradeByRank(rows, key) {
  rows.slice().sort((a, b) => b[key] - a[key]).forEach((r, i) => { r.grade = GRADE_BY_RANK[Math.min(i, GRADE_BY_RANK.length - 1)]; });
  return rows;
}

function draftGrades(D) {
  const rows = S.teams.map(t => {
    const picks = D.result.filter(r => r.team === t.id).sort((a, b) => a.round - b.round);
    const ps = picks.map(r => S.players[r.pid]).filter(Boolean);
    const scored = ps.map(p => ({ p, s: draftScore(p) })).sort((a, b) => b.s - a.s);
    const pts = scored.reduce((sum, x, i) => sum + x.s * (PICK_W[i] || 0.2), 0);
    // ひとこと
    const notes = [];
    const lucky = picks.find(r => r.round === 1 && /競合/.test(r.note || ''));
    if (lucky) notes.push(`${lucky.note}の${lucky.name}を引き当てた`);
    else if (scored[0]) notes.push(`目玉は${scored[0].p.name}（${draftTier(scored[0].p)[1]}）`);
    const hs = ps.filter(p => p.kind === '高校').length, ready = ps.filter(p => p.kind !== '高校' && seenOvr(p) >= 58).length;
    if (ps.length && hs >= Math.ceil(ps.length / 2)) notes.push('高校生中心で将来性重視');
    else if (ready >= 2) notes.push('即戦力を厚く');
    if (picks.length <= 3) notes.push(`${picks.length}人で選択終了`);
    return { id: t.id, pts: Math.round(pts), picks: picks.map(r => r.pid), n: picks.length, note: notes.join('・') };
  });
  return gradeByRank(rows, 'pts');
}

// その年のドラフトの「いま」：指名した選手が今どれくらいの選手になっているか（答え合わせ）
function draftNow(h) {
  const rows = h.rows.map(r => {
    const ps = r.picks.map(id => S.players[id]).filter(p => p && (p.teamId != null || S.freeAgents.includes(p.id)));
    const ovrs = ps.map(p => ovr(p)).sort((a, b) => b - a);
    const nowPts = ovrs.slice(0, 3).reduce((s, v, i) => s + v * [1, 0.7, 0.5][i], 0);
    const best = ps.slice().sort((a, b) => ovr(b) - ovr(a))[0];
    const titles = ps.reduce((s, p) => s + titlesOf(p.id).length, 0);
    return { id: r.id, was: r.grade, alive: ps.length, n: r.picks.length, best, titles, nowPts: nowPts + titles * 3 };
  });
  return gradeByRank(rows, 'nowPts');
}

function offCampStart() {
  // ドラフト採点を残す（スカウトの見立てが消える前に）
  const grades = draftGrades(S.off.draft);
  if (!S.draftHist) S.draftHist = [];
  S.draftHist.unshift({ year: S.year, rows: grades.map(r => ({ id: r.id, grade: r.grade, pts: r.pts, picks: r.picks, note: r.note })) });
  const mineG = grades.find(r => r.id === S.myTeamId);
  if (mineG) addNews(`ドラフト採点：${myTeam().short}は「${mineG.grade}」（${mineG.note || '指名なし'}）`, mineG.grade === 'A' ? 'good' : mineG.grade === 'E' ? 'bad' : '');
  // 指名されなかった候補は消える
  S.off.draft.pool.forEach(id => delete S.players[id]);
  S.off.draft.pool = [];
  Object.values(S.players).forEach(p => { delete p.noise; });
  // 他球団の戦力外通告（自由契約になる）と、自由契約選手の獲得
  S.teams.forEach(t => {
    if (t.id === S.myTeamId) return;
    // いちばん弱い選手よりはっきり上の自由契約選手がいれば、2 人まで取る
    for (let k = 0; k < 2; k++) {
      const fas = S.freeAgents.map(id => S.players[id]).filter(p => p && !p.foreign);
      const best = fas.sort((a, b) => tradeValue(b) - tradeValue(a)).find(fa => {
        const worst = teamPlayers(t).filter(p => p.isP === fa.isP).sort((a, b) => tradeValue(a) - tradeValue(b))[0];
        return worst && tradeValue(fa) > tradeValue(worst) * 1.3;
      });
      if (!best) break;
      signFreeAgent(t, best);
    }
    while (t.players.length > ROSTER_MAX - 2) {
      const worst = teamPlayers(t).sort((a, b) => tradeValue(a) - tradeValue(b))[0];
      toFreeAgent(worst);
    }
  });
  S.teams.forEach(t => { if (t.id !== S.myTeamId) fillRoster(t, ROSTER_MAX - 4); });
  const filled = fillRoster(myTeam(), ROSTER_MIN);
  if (filled) addNews(`選手が足りないので、育成選手${filled}人を支配下に上げました。`);
  S.off.step = 'camp';
}

// 人数が足りない球団は、他球団（自分以外）なら自由契約選手からいい選手を取り、いなければ育成から上げる
function fillRoster(t, min) {
  let n = 0;
  while (t.players.length < min) {
    const ps = teamPlayers(t);
    const pitchers = ps.filter(p => p.isP).length;
    const isP = pitchers < ps.length - pitchers;
    const fa = t.id === S.myTeamId ? null : S.freeAgents.map(id => S.players[id])
      .filter(p => p && p.isP === isP && ovr(p) >= 45 && !p.foreign)
      .sort((a, b) => tradeValue(b) - tradeValue(a))[0];
    if (fa) signFreeAgent(t, fa);
    else signPlayer(t, newPlayer(S, { isP, q: U.rnd(35, 48), age: U.rint(19, 27) }));
    n++;
  }
  return n;
}

// ---------- 自由契約 ----------
// 自由契約にできるのはオフの契約更改〜開幕前だけ（戦力外通告の時期）
function releaseOpen() { return S.phase === 'off' && ['contract', 'draft', 'camp'].includes(S.off.step); }

// 自由契約選手・外国人と契約できるのは、オフの契約更改〜開幕前と、シーズン中の 7 月末まで
function faOpen() {
  if (S.phase === 'off') return ['contract', 'draft', 'camp'].includes(S.off.step);
  if (S.phase !== 'season') return false;
  return S.schedule[Math.min(S.day, S.schedule.length - 1)].m <= TRADE_DEADLINE_MONTH;
}

// 自由契約選手の希望年俸（戦力外からの再出発なので安め）
// 自由契約の希望年俸：能力なりの額か、前の年俸の 6 割の安いほう
function faDemand(p) {
  const v = Math.min(calcSalary(p) * 0.7, p.salary ? p.salary * 0.6 : Infinity);
  return Math.max(MIN_SALARY, Math.round(v / 10) * 10);
}

function toFreeAgent(p) {
  const t = S.teams[p.teamId];
  p.lastTeam = t ? t.short : p.lastTeam;
  removeFromTeam(p);
  p.salary = faDemand(p);
  p.faYears = 0;
  p.inj = 0;
  S.freeAgents.push(p.id);
}

function signFreeAgent(t, p) {
  S.freeAgents = S.freeAgents.filter(id => id !== p.id);
  signPlayer(t, p);
  p.loyalty = 45; // 拾ってもらった恩
  if (t.id !== S.myTeamId && p.lastTeam === myTeam().short) addNews(`自由契約にした${p.name}が${t.short}と契約しました。`);
}

function signFreeAgentMine(pid) {
  const t = myTeam(), p = S.players[pid];
  if (!faOpen()) return '自由契約選手と契約できるのは、オフの契約更改〜開幕前と、シーズン中の7月末までです。';
  if (!p || !S.freeAgents.includes(pid)) return 'その選手はもういません。';
  if (t.players.length >= ROSTER_MAX) return `人数が${ROSTER_MAX}人で一杯です。`;
  const fee = Math.round(p.salary * 0.2);
  if (t.money < fee) return 'お金が足りません。';
  t.money -= fee; t.fin.invest += fee;
  signFreeAgent(t, p);
  ensureLineup(S, t);
  addNews(`自由契約の${p.name}（${p.isP ? '投手' : p.pos}・${p.age}歳・前${p.lastTeam || '-'}）と契約！ 契約金${U.money(fee)}・年俸${U.money(p.salary)}`, 'big');
  return null;
}

// 独立リーグなどから、毎年何人か自由契約選手が出てくる
function addIndependentFAs(n) {
  for (let i = 0; i < n; i++) {
    const p = newPlayer(S, { isP: i % 2 === 0, q: U.rnd(42, 56), age: U.rint(24, 32) });
    p.lastTeam = '独立リーグ';
    p.salary = faDemand(p);
    p.faYears = 0;
    S.freeAgents.push(p.id);
  }
}

// オフに 1 つ歳を取り、年を取りすぎた人・2 年続けて決まらなかった人は引退する
function agingFreeAgents() {
  S.freeAgents = S.freeAgents.filter(id => {
    const p = S.players[id];
    if (!p) return false;
    agePlayer(p);
    p.faYears = (p.faYears || 0) + 1;
    if (careerAge(p) >= 37 || p.faYears >= 2 || ovr(p) < 38) { retireRecord(p); delete S.players[id]; return false; }
    p.salary = faDemand(p);
    return true;
  });
  addIndependentFAs(6);
}

function offNewSeason() {
  // 春のキャンプ
  for (let i = 0; i < 4; i++) weeklyTraining();
  awakenCheck(3); // キャンプは覚醒のチャンス
  S.year++;
  startSeason();
}

// ---------- トレード・補強 ----------
function tradeOpen() {
  if (S.phase === 'off') return S.off.step === 'camp';
  if (S.phase !== 'season') return false;
  return S.schedule[Math.min(S.day, S.schedule.length - 1)].m <= TRADE_DEADLINE_MONTH;
}

function proposeTrade(otherId, giveIds, getIds) {
  const me = myTeam(), other = S.teams[otherId];
  const give = giveIds.map(id => S.players[id]), get = getIds.map(id => S.players[id]);
  if (!give.length && !get.length) return { ok: false, msg: '選手を選んでください。' };
  const meAfter = me.players.length - give.length + get.length;
  const otAfter = other.players.length - get.length + give.length;
  if (meAfter > ROSTER_MAX) return { ok: false, msg: `こちらの人数が${ROSTER_MAX}人を超えます。` };
  if (otAfter > ROSTER_MAX) return { ok: false, msg: `相手の人数が${ROSTER_MAX}人を超えます。` };
  const count = (t, out, inn, isP) => teamPlayers(t).filter(p => p.isP === isP).length
    - out.filter(p => p.isP === isP).length + inn.filter(p => p.isP === isP).length;
  if (count(other, get, give, false) < 12 || count(other, get, give, true) < 11) return { ok: false, msg: '相手の選手が足りなくなるので断られました。' };
  if (count(me, give, get, false) < 10 || count(me, give, get, true) < 8) return { ok: false, msg: 'こちらの選手が足りなくなります。' };
  const vGive = U.sum(give, tradeValue), vGet = U.sum(get, tradeValue);
  if (vGive < vGet * 1.08) return { ok: false, msg: `${other.short}「その条件では受けられませんね。」` };
  give.forEach(p => { removeFromTeam(p); signPlayer(other, p); p.loyalty = 20; });
  get.forEach(p => { removeFromTeam(p); signPlayer(me, p); p.loyalty = 20; });
  autoActive(other); autoLineup(other); autoRotation(other);
  ensureLineup(S, me);
  addNews(`トレード成立！ ${give.map(p => p.name).join('・') || 'なし'} ⇔ ${get.map(p => p.name).join('・') || 'なし'}（${other.short}）`, 'big');
  return { ok: true, msg: 'トレード成立！' };
}

const FOREIGN_SCOUT_COST = 5000;

function scoutForeign() {
  const t = myTeam();
  t.money -= FOREIGN_SCOUT_COST; t.fin.invest += FOREIGN_SCOUT_COST;
  const cands = [];
  for (let i = 0; i < 3; i++) {
    const p = newPlayer(S, { isP: U.chance(0.5), q: U.rnd(64, 82), age: U.rint(26, 33), foreign: true, pot: U.rnd(0.8, 1.1) });
    p.salary = calcSalary(p);
    cands.push(p.id);
  }
  (S.foreignCands || []).forEach(id => { if (S.players[id] && S.players[id].teamId == null) delete S.players[id]; });
  S.foreignCands = cands;
}

function signForeign(pid) {
  const t = myTeam(), p = S.players[pid];
  if (!faOpen()) return '外国人と契約できるのは、オフの契約更改〜開幕前と、シーズン中の7月末までです。';
  if (t.players.length >= ROSTER_MAX) return `人数が${ROSTER_MAX}人で一杯です。先に自由契約にしてください。`;
  const fee = Math.round(p.salary * 0.5);
  t.money -= fee; t.fin.invest += fee;
  signPlayer(t, p);
  p.loyalty = 30;
  S.foreignCands = S.foreignCands.filter(id => id !== pid);
  addNews(`新外国人 ${p.name}（${p.pos}）と契約！ 契約金${U.money(fee)}・年俸${U.money(p.salary)}`, 'big');
  return null;
}

function releasePlayer(pid) {
  const p = S.players[pid];
  const t = myTeam();
  if (!releaseOpen()) return '自由契約にできるのは、オフの契約更改〜開幕前だけです。';
  if (t.players.length <= 20) return 'これ以上は減らせません。';
  toFreeAgent(p);
  ensureLineup(S, t);
  addNews(`${p.name}を自由契約にしました。`);
  return null;
}

function upgradeFacility(k) {
  const t = myTeam();
  const lv = t.fac[k];
  if (lv >= FAC_MAX) return;
  const cost = facilityCost(lv);
  t.money -= cost; t.fin.invest += cost;
  t.fac[k]++;
  addNews(`${FACILITIES[k].name}をレベル${t.fac[k]}に改修しました（${U.money(cost)}）。`, 'good');
}

// ---------- グッズ ----------
function goodsName(g) {
  const ty = GOODS_TYPES[g.type];
  return ty.player ? `${g.pname} ${ty.name}` : ty.name;
}

// 出たばかりはよく売れ、だんだん飽きられる
function goodsFresh(g) { return g.dev > 0 ? 1.3 : Math.max(0.5, 1.3 - g.sold * 0.01); }

// ホーム 1 試合あたりの売上（万円）
function goodsRate(t, g) {
  const ty = GOODS_TYPES[g.type];
  let r = ty.base * (0.5 + t.pop / 100);
  if (ty.player) {
    const p = S.players[g.pid];
    if (!p) return 0;
    r *= 0.1 + p.fame / 45;
    r *= 1 + (p.visual * 0.2 - 0.4) * ty.visual;
  }
  return r * goodsFresh(g);
}

function sellGoods(t, isHome) {
  t.goods.forEach(g => {
    if (g.dev > 0) {
      g.dev--;
      if (!g.dev) addNews(`${goodsName(g)}が発売されました！`, 'good');
      return;
    }
    const v = goodsRate(t, g) * (isHome ? 1 : AWAY_SALES) * U.rnd(0.85, 1.15);
    g.sold++; g.total += v; g.season += v; g.last = v;
    t.money += v; t.fin.goods += v;
  });
}

function developGoods(type, pid) {
  const t = myTeam(), ty = GOODS_TYPES[type];
  if (!ty) return 'グッズの種類を選んでください。';
  if (t.goods.length >= GOODS_MAX) return `グッズは同時に${GOODS_MAX}個までです。古いものを販売終了してください。`;
  let p = null;
  if (ty.player) {
    p = S.players[pid];
    if (!p || p.teamId !== t.id) return '選手を選んでください。';
    if (t.goods.some(g => g.type === type && g.pid === p.id)) return 'そのグッズはもうあります。';
  } else if (t.goods.some(g => g.type === type)) return 'そのグッズはもうあります。';
  if (t.money < ty.cost) return 'お金が足りません。';
  t.money -= ty.cost; t.fin.invest += ty.cost;
  const g = { id: t.nextGoodsId++, type, pid: p ? p.id : null, pname: p ? p.name : '', dev: ty.days, sold: 0, total: 0, season: 0, last: 0 };
  t.goods.push(g);
  if (p) { addLoyalty(p, 15); addFame(p, 2); }
  addNews(`${goodsName(g)}の開発を始めました（${U.money(ty.cost)}・${ty.days}試合後に発売）。${p ? `${p.name}もうれしそうだ。` : ''}`);
  return null;
}

function stopGoods(id) {
  const t = myTeam();
  const g = t.goods.find(x => x.id === id);
  if (!g) return;
  t.goods = t.goods.filter(x => x !== g);
  addNews(`${goodsName(g)}の販売を終了しました（通算売上 ${U.money(g.total)}）。`);
}

// 選手がいなくなったら、その選手のグッズは売れなくなる
function endPlayerGoods(t, p) {
  if (!t.goods) return;
  const gone = t.goods.filter(g => g.pid === p.id);
  if (!gone.length) return;
  t.goods = t.goods.filter(g => g.pid !== p.id);
  if (t.id === S.myTeamId) gone.forEach(g => addNews(`${p.name}が球団を離れたため、${goodsName(g)}は販売終了になりました。`, 'bad'));
}

// 古いセーブデータに足りない値を足す
function migrate() {
  S.teams.forEach(t => {
    if (!t.goods) t.goods = [];
    if (!t.nextGoodsId) t.nextGoodsId = 1;
    if (t.fin.food == null) t.fin.food = 0;
    if (t.fin.tv == null) t.fin.tv = 0;
    if (t.setup === undefined) t.setup = null;
    delete t.ticket;
  });
  if (!S.popups) S.popups = [];
  if (!S.freeAgents) S.freeAgents = [];
  if (!S.watch) S.watch = [];
  // ウェーバーだけだったころのドラフトの途中から読み込んだとき
  if (S.off && S.off.draft && !S.off.draft.stage) Object.assign(S.off.draft, { stage: 'waiver', r1: { sub: 0, log: [] }, myDone: false, first: 'セ' });
  if (S.phase !== 'off' && !S.draftClass) { S.draftClass = makeDraftClass(); announceDraftClass(); }
  if (!S.standHist) S.standHist = [];
  if (!S.awardHist) S.awardHist = [];
  if (!S.records) S.records = { season: {} };
  if (!S.retired) S.retired = [];
  if (!S.draftHist) S.draftHist = [];
  S.retired.forEach(r => { if (r.hof && r.star === undefined) r.star = true; });
  Object.values(S.players).forEach(p => { if (p.svc == null) initService(p); });
  Object.values(S.players).forEach(p => { if (canPitch(p) && !p.apt) p.apt = rollApt(p.a.stamina); });
  Object.values(S.players).forEach(p => { if (p.home === undefined) p.home = p.foreign ? null : U.pick(PREFS); });
  Object.values(S.players).forEach(p => { if (canBat(p) && !p.traj) p.traj = rollTraj(p.a.power); });
  Object.values(S.players).forEach(p => { if (canBat(p) && !p.subs) p.subs = rollSubs(p.isP ? p.pos2 : p.pos, p.a.field); });
  Object.values(S.players).forEach(p => { if (canBat(p) && !p.steal) p.steal = rollSteal(); });
  S.teams.forEach(t => { if (!t.active) { t.active = []; autoActive(t); ensureLineup(S, t); } });
  Object.values(S.players).forEach(p => {
    if (p.visual == null) p.visual = rollVisual();
    if (p.fame == null) p.fame = initialFame(p);
    if (p.loyalty == null) p.loyalty = U.rint(30, 80);
  });
}

// ---------- 保存 ----------
// セーブはパワプロのようにスロットに分ける。スロットごとに中身と「見出し（どの球団の何年か）」を別々に持つ
const SLOT_COUNT = 3;
let currentSlot = null; // いま遊んでいるスロット（1〜3）

function slotKey(n) { return `${SAVE_KEY}_slot${n}`; }
function metaKey(n) { return `${SAVE_KEY}_meta${n}`; }

function makeMeta() {
  const t = myTeam();
  const when = S.phase === 'season' ? curDateLabel() : S.phase === 'post' ? 'ポストシーズン' : 'オフ';
  return {
    team: t.name, color: t.color, year: S.year, when, w: t.w, l: t.l, d: t.d,
    lg: LEAGUE_NAME[t.lg], rank: rankOf(t.id), money: t.money, titles: S.history.filter(x => x.post === '日本一').length,
    savedAt: Date.now(),
  };
}

// セーブは圧縮して置く（lz-string。だいたい 9 分の 1 になる）。頭に「LZ1:」が付いていれば圧縮、なければ前の形のまま読む
const SAVE_LZ = 'LZ1:';
function packSave(obj) { return SAVE_LZ + LZString.compressToUTF16(JSON.stringify(obj)); }
function unpackSave(raw) { return JSON.parse(raw.startsWith(SAVE_LZ) ? LZString.decompressFromUTF16(raw.slice(SAVE_LZ.length)) : raw); }

// 圧縮には時間がかかるので、ふだんの保存は少し待ってから裏でまとめてする（save-worker.js）
let saveOk = true, saveDirty = false, saveTimer = null, saveWorker = null, saveSeq = 0, saveBusy = false;

// 保存を頼む。前の保存がうまくいっていれば true（容量がいっぱいなどで失敗していたら false）
function saveGame() {
  if (!S || !currentSlot) return true;
  saveDirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveInBackground, 600);
  return saveOk;
}

// いますぐ保存する（タイトルへ戻る・読み込み直す・閉じるときなど）。できたら true
function saveGameNow() {
  clearTimeout(saveTimer);
  if (!S || !currentSlot) { saveDirty = false; return true; }
  saveDirty = false;
  saveSeq++; // 裏で圧縮中の古い分は捨てる
  saveBusy = false;
  try {
    localStorage.setItem(slotKey(currentSlot), packSave(S));
    localStorage.setItem(metaKey(currentSlot), JSON.stringify(makeMeta()));
    saveOk = true;
  } catch (e) {
    console.warn('保存できませんでした', e);
    saveOk = false;
  }
  return saveOk;
}
function flushSave() { if (saveDirty || saveBusy) saveGameNow(); }

function saveInBackground() {
  if (!saveDirty || !S || !currentSlot) return;
  if (!saveWorker) {
    try { saveWorker = new Worker('js/save-worker.js'); } catch (e) { saveWorker = false; }
  }
  if (!saveWorker) { saveGameNow(); return; }
  const seq = ++saveSeq, slot = currentSlot, meta = JSON.stringify(makeMeta());
  saveDirty = false;
  saveBusy = true;
  saveWorker.onmessage = e => {
    if (e.data.seq !== saveSeq) return; // もっと新しい保存が来ている
    saveBusy = false;
    try {
      localStorage.setItem(slotKey(slot), SAVE_LZ + e.data.out);
      localStorage.setItem(metaKey(slot), meta);
      saveOk = true;
    } catch (err) {
      console.warn('保存できませんでした', err);
      saveOk = false;
      UI.toast = '保存できませんでした（ブラウザの保存容量がいっぱいかもしれません）。';
      render();
    }
  };
  saveWorker.onerror = () => { saveWorker = false; saveGameNow(); };
  saveWorker.postMessage({ seq, json: JSON.stringify(S) });
}
// 閉じる・裏に回るときは、待たずに保存しておく
window.addEventListener('pagehide', flushSave);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });

function loadGame(n) {
  try {
    flushSave();
    const raw = localStorage.getItem(slotKey(n));
    if (!raw) return false;
    S = unpackSave(raw);
    migrate();
    currentSlot = n;
    return true;
  } catch (e) { return false; }
}

function slotMeta(n) {
  try { const raw = localStorage.getItem(metaKey(n)); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}

function deleteSlot(n) {
  if (n === currentSlot) { clearTimeout(saveTimer); saveSeq++; saveDirty = false; saveBusy = false; } // 消したあとに、裏の保存で書き戻さない
  try { localStorage.removeItem(slotKey(n)); localStorage.removeItem(metaKey(n)); localStorage.removeItem(expKey(n)); } catch (e) { /* なにもしない */ }
}

// ---------- セーブのファイル書き出し・読み込み ----------
// ブラウザのデータを消しても、書き出したファイルから戻せる。パソコンとスマホの間で移すのにも使える
const SAVE_FILE_APP = 'pennant-kantoku';
function expKey(n) { return `${SAVE_KEY}_exp${n}`; }

// スロット n の中身をファイルにする文字列と名前を作る（n が遊んでいるスロットなら、いまの状態を使う）
function exportSlot(n) {
  let data;
  if (n === currentSlot && S) data = S;
  else {
    const raw = localStorage.getItem(slotKey(n));
    if (!raw) return null;
    data = unpackSave(raw);
  }
  const meta = slotMeta(n) || {};
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const team = data.teams && data.teams[data.myTeamId] ? data.teams[data.myTeamId].short : 'セーブ';
  const name = `ペナント監督_${team}_${data.year}年_${ymd}.json`;
  const text = JSON.stringify({ app: SAVE_FILE_APP, format: 1, exportedAt: Date.now(), meta, data });
  try { localStorage.setItem(expKey(n), String(Date.now())); } catch (e) { /* 書き出し日が残せなくても、ファイルはできる */ }
  return { name, text };
}

function lastExport(n) {
  try { const v = localStorage.getItem(expKey(n)); return v ? +v : null; } catch (e) { return null; }
}

// シーズンの終わりに「書き出しますか？」と聞くかどうか（端末ごと）
const NO_ASK_KEY = `${SAVE_KEY}_noBackupAsk`;
function backupAskOff() { try { return localStorage.getItem(NO_ASK_KEY) === '1'; } catch (e) { return false; } }
function setBackupAskOff(v) { try { if (v) localStorage.setItem(NO_ASK_KEY, '1'); else localStorage.removeItem(NO_ASK_KEY); } catch (e) { /* なにもしない */ } }

// ファイルの中身を確かめて、スロット n に入れる。だめなら理由を返す
function importToSlot(n, text) {
  let obj;
  try { obj = JSON.parse(text); } catch (e) { return 'ファイルを読めませんでした（壊れているか、ちがう種類のファイルです）。'; }
  const data = obj && obj.app === SAVE_FILE_APP ? obj.data : null;
  if (!data || !Array.isArray(data.teams) || !data.players || data.myTeamId == null) return 'このゲームのセーブファイルではありません。';
  const keepS = S, keepSlot = currentSlot;
  try {
    S = data;
    migrate();
    currentSlot = n;
    if (!saveGameNow()) return '保存できませんでした（ブラウザの保存容量がいっぱいかもしれません）。';
    localStorage.setItem(expKey(n), String(obj.exportedAt || Date.now()));
  } catch (e) {
    return 'セーブの中身がおかしいため、読み込めませんでした。';
  } finally {
    S = keepS; currentSlot = keepSlot;
  }
  return null;
}

// ブラウザに「このサイトのデータは勝手に消さないで」と頼む（できないブラウザもある）
let storagePersisted = null;
function askPersistentStorage() {
  if (!navigator.storage || !navigator.storage.persisted) { storagePersisted = 'unsupported'; return; }
  navigator.storage.persisted()
    .then(p => (p ? true : navigator.storage.persist()))
    .then(p => { storagePersisted = !!p; })
    .catch(() => { storagePersisted = 'unsupported'; });
}

// いまのデータを別のスロットにも残す（バックアップ）
function copyToSlot(n) {
  try {
    localStorage.setItem(slotKey(n), packSave(S));
    localStorage.setItem(metaKey(n), JSON.stringify(makeMeta()));
    return true;
  } catch (e) { return false; }
}

// スロットがなかったころのセーブは、スロット 1 に移す
function migrateOldSave() {
  try {
    const old = localStorage.getItem(SAVE_KEY);
    if (!old) return;
    if (!localStorage.getItem(slotKey(1))) {
      S = JSON.parse(old);
      migrate();
      currentSlot = 1;
      saveGameNow();
      S = null;
      currentSlot = null;
    }
    localStorage.removeItem(SAVE_KEY);
  } catch (e) { S = null; currentSlot = null; }
}
