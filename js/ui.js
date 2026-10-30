'use strict';

// 画面を描く（状態 S を読んで HTML を作るだけ）

const UI = {
  tab: 'home', viewTeam: null, trade: { team: null, give: [], get: [] }, toast: '',
  sortKey: null, newTeam: 0, newGames: 143, lg: null, newSlot: null, watchOnly: false, pkind: '', faDraft: {}, histYear: null, posf: { team: '', draft: '', fa: '' }, geniusOnly: false, teamView: 'list', statSort: { bat: 'avg', pit: 'era' }, goodsType: 'towel', goodsPid: null, draftYearF: '', dhYear: null, recView: 'hist', recYear: null, slimUntil: null, slimScope: 'other',
};

const TABS = [
  ['home', 'ホーム'], ['team', 'チーム'], ['roster', '一軍・二軍'], ['order', 'オーダー'], ['train', '練習'],
  ['sched', '日程'], ['stand', '順位・成績'], ['money', '経営'], ['trade', 'トレード'], ['fa', '自由契約'], ['prospects', 'ドラフト候補'], ['records', '記録・殿堂'],
];

const h = U.esc;

// ---------- スマホ用 ----------
// 画面の幅が狭いとき（スマホ）は、選手の表をカードにする。パソコンでは今までどおり表
function isMobile() { return window.matchMedia('(max-width: 700px)').matches; }

// 弾道（↗の数）。野手だけ
function trajTag(p) {
  if (!canBat(p)) return '';
  const t = trajOf(p);
  return `<span class="ab traj t${t}" title="弾道${t}（高いほどホームランとフライが多い）">弾<b>${t}</b></span>`;
}

function abilSum(p, view) {
  const v = k => (view ? scoutView(p, k) : p.a[k]);
  return abilKeys(p).map(k => `<span class="ab">${SHORT_LABEL[k]}${k === 'velo' ? veloKmh(v(k)) + 'km' : `<span class="g g${U.grade(v(k))}">${U.grade(v(k))}</span>`}</span>`).join('') + trajTag(p);
}

function statLine(p) {
  const s = p.stats, out = [];
  if (canBat(p)) out.push(`打率${U.avg(s.h, s.ab)} ${s.hr}本 ${s.rbi}点 ${s.sb}盗`);
  if (canPitch(p)) out.push(`${s.pg}登板 ${s.w}勝${s.l}敗${s.sv ? s.sv + 'S' : ''} 防御率${U.era(s.per, s.outs)}`);
  return out.join(' ／ ');
}

// o: { lead, name, ovr, sub, lines, action, view, noCond, cls }
function playerCard(p, o = {}) {
  return `<div class="pcard ${o.cls || ''}">
    <div class="pc-top">${o.lead || ''}<div class="pc-name">${o.name || nameCell(p)}</div><div class="pc-ovr"><small>総合</small>${o.ovr != null ? o.ovr : Math.round(ovr(p))}</div></div>
    <div class="pc-sub">${posBadge(p)}<span>${p.age}歳</span>${o.view ? '' : phaseMark(p)}${o.noCond ? '' : condCell(p)}${o.sub || ''}</div>
    <div class="pc-abil">${abilSum(p, o.view)}</div>
    ${o.lines || ''}
    ${o.action ? `<div class="pc-act">${o.action}</div>` : ''}
  </div>`;
}

// 成長の時期の印（成長期・ピーク・衰退期）
function phaseMark(p) {
  const g = growthPhase(p);
  return `<span class="phase ph-${g.k}" title="${g.name}">${g.short}</span>`;
}

// 18〜40 歳の帯に、成長期・ピーク・衰退期と、いまの歳を描く
function growthBar(p) {
  const g = growthSpan(p), A0 = 18, A1 = 40;
  const pc = a => ((U.clamp(a, A0, A1 + 1) - A0) / (A1 + 1 - A0)) * 100;
  const seg = (from, to, k, name) => (to < from ? '' : `<span class="gb-seg ph-${k}" style="left:${pc(from)}%;width:${pc(to + 1) - pc(from)}%">${name}</span>`);
  return `<div class="gbar">${seg(A0, g.growEnd, 'grow', '成長期')}${seg(g.peakFrom, g.peakTo, 'peak', 'ピーク')}${seg(g.declineFrom, A1, 'decline', '衰退期')}
    <span class="gb-now" style="left:${pc(p.age + 0.5)}%"><b>${p.age}歳</b></span></div>
    <div class="gb-ages"><span>${A0}</span><span>${A1}歳</span></div>`;
}

function cardList(list, fn) { return `<div class="pcards">${list.map(fn).join('') || '<p class="muted">いません</p>'}</div>`; }

// ポジションの分け方（投手は先発と中継ぎ、野手は守備位置）
const POS_GROUPS = ['先発', '中継ぎ', '捕', '一', '二', '三', '遊', '外'];
// ローテや勝ちパターンに入っていない投手は、スタミナで先発型か中継ぎ型かを決める
// 先発・中継ぎは適性が ○ 以上なら数える（両方に入る投手もいる）
function posMatch(p, g) {
  if (!g) return true;
  if (g === '先発') return canPitch(p) && aptOf(p).sp >= 1;
  if (g === '中継ぎ') return canPitch(p) && aptOf(p).rp >= 1;
  return canBat(p) && (p.isP ? p.pos2 : p.pos) === g;
}

// ポジションの色つきの印（投手は先発・中継ぎの適性も）
function aptBadge(p) {
  const a = aptOf(p);
  return `<span class="apt a${a.sp}">先${APT_MARK[a.sp]}</span><span class="apt a${a.rp}">中${APT_MARK[a.rp]}</span>`;
}
// サブポジ（本職のほかに守れる位置）は、小さく薄い札で
function subsBadge(p) {
  const s = subsOf(p);
  return s.length ? `<span class="subs" title="サブポジ：${s.join('・')}（本職より少し守備が弱い）">${s.map(x => `<span class="pb sub pb-${x}">${x}</span>`).join('')}</span>` : '';
}
function posBadge(p) {
  const out = [];
  if (canPitch(p)) out.push(`<span class="pb pb-投">投</span>${aptBadge(p)}`);
  if (canBat(p)) { const ps = p.isP ? p.pos2 : p.pos; out.push(`<span class="pb pb-${ps}">${ps}</span>${subsBadge(p)}`); }
  return `<span class="pbs">${out.join('')}</span>`;
}

// 自分のチームのポジションごとの人数（カッコは一軍）
function posCounts() {
  const t = myTeam();
  const ps = teamPlayers(t);
  return `<div class="poscount"><span class="muted">${h(t.short)}の人数：</span>${POS_GROUPS.map(g => {
    const all = ps.filter(p => posMatch(p, g));
    const act = all.filter(p => t.active.includes(p.id)).length;
    return `<span class="pc"><b>${g}</b> ${all.length}<small>（一軍${act}）</small></span>`;
  }).join('')}<span class="pc">計 <b>${ps.length}</b>/${ROSTER_MAX}</span></div>`;
}

// ポジションでしぼり込むボタン
function posFilter(key) {
  const cur = UI.posf[key] || '';
  return `<div class="seg wrapseg">${[['', 'すべて'], ...POS_GROUPS.map(g => [g, g])].map(([g, n]) => `<button class="${cur === g ? 'on' : ''}" data-act="posf" data-key="${key}" data-g="${g}">${n}</button>`).join('')}</div>`;
}

function gradeCell(v) {
  const g = U.grade(v);
  return `<span class="g g${g}">${g}</span><small class="num">${Math.round(v)}</small>`;
}
function condCell(p) { return `<span class="cond c${p.cond}" title="${COND_LABEL[p.cond]}">${COND_ICON[p.cond]}</span>`; }
function nameCell(p) {
  const inj = p.inj ? `<span class="tag bad">故障${p.inj}日</span>` : '';
  const fr = p.foreign ? '<span class="tag">外</span>' : '';
  const t = p.teamId != null ? S.teams[p.teamId] : null;
  const farm = t && t.active && !t.active.includes(p.id) ? '<span class="tag farm">二軍</span>' : '';
  const tw = p.twoWay ? '<span class="tag twoway">二刀流</span>' : '';
  const gn = p.geniusKnown ? '<span class="tag genius">天才</span>' : '';
  return `<a href="#" data-act="player" data-pid="${p.id}">${h(p.name)}</a>${tw}${gn}${fr}${farm}${inj}`;
}
function teamChip(t) { return `<span class="chip" style="background:${t.color}">${h(t.short)}</span>`; }

function render() {
  const app = document.getElementById('app');
  if (!S) { app.innerHTML = renderTitle() + (UI.toast ? `<div class="toast">${h(UI.toast)}</div>` : ''); UI.toast = ''; return; }
  const first = S.phase === 'off' ? ['off', 'オフシーズン'] : S.phase === 'post' ? ['post', 'ポストシーズン'] : TABS[0];
  const tabs = [first, ...TABS.slice(1)];
  if (['home', 'off', 'post'].includes(UI.tab)) UI.tab = first[0];
  app.innerHTML = `
    ${renderHeader()}
    <nav class="tabs">${tabs.map(([k, n]) => `<button class="${UI.tab === k ? 'on' : ''}" data-act="tab" data-tab="${k}">${n}</button>`).join('')}</nav>
    <main>${renderScreen()}</main>
    ${UI.toast ? `<div class="toast">${h(UI.toast)}</div>` : ''}`;
  UI.toast = '';
}

function renderScreen() {
  switch (UI.tab) {
    case 'off': return renderOff();
    case 'post': return renderPost();
    case 'team': return renderTeam();
    case 'order': return renderOrder();
    case 'roster': return renderRoster();
    case 'train': return renderTrain();
    case 'sched': return renderSched();
    case 'stand': return renderStand();
    case 'money': return renderMoney();
    case 'trade': return renderTrade();
    case 'fa': return renderFA();
    case 'prospects': return renderProspects();
    case 'records': return renderRecords();
    default: return renderHome();
  }
}

// ---------- タイトル ----------
function slotWhen(ms) {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function renderSlotCard(n) {
  const m = slotMeta(n);
  const importBtn = `<label class="filebtn">📂 ファイルから読み込む<input type="file" accept=".json,application/json" data-chg="importFile" data-n="${n}"></label>`;
  if (!m) {
    return `<div class="slot empty">
      <div class="slot-no">スロット${n}</div>
      <div class="slot-body muted">データなし</div>
      <div class="slot-btns"><button class="primary" data-act="slotNew" data-n="${n}">ここで新しく始める</button>${importBtn}</div>
    </div>`;
  }
  const ex = lastExport(n);
  return `<div class="slot" style="--c:${m.color}">
    <div class="slot-no">スロット${n}</div>
    <div class="slot-body">
      <div class="slot-team">${h(m.team)}</div>
      <div>${m.year}年 ${h(m.when)} ・ ${m.w}勝${m.l}敗${m.d ? m.d + '分' : ''} ${h(m.lg)}${m.rank}位</div>
      <div class="muted">資金 ${U.money(m.money)}${m.titles ? ` ・ 日本一 ${m.titles}回` : ''} ・ 保存 ${slotWhen(m.savedAt)}</div>
      <div class="muted small">${ex ? `ファイルに書き出したのは ${slotWhen(ex)}` : 'まだファイルに書き出していません'}</div>
    </div>
    <div class="slot-btns">
      <button class="primary big" data-act="continue" data-n="${n}">つづきから</button>
      <button class="sm" data-act="exportSlot" data-n="${n}">💾 ファイルに書き出す</button>
      ${importBtn}
      <button class="sm" data-act="slotNew" data-n="${n}">上書きして新しく始める</button>
      <button class="sm danger" data-act="slotDelete" data-n="${n}">消す</button>
    </div>
  </div>`;
}

function renderTitle() {
  if (!UI.newSlot) {
    return `
    <div class="title">
      <h1>⚾ ペナント監督</h1>
      <p class="sub">球団を率いて、育てて、稼いで、日本一を目指せ。</p>
      <section class="card">
        <h2>データを選んでください</h2>
        <div class="slots">${Array.from({ length: SLOT_COUNT }, (_, i) => renderSlotCard(i + 1)).join('')}</div>
        <p class="note">試合を進めるたびに、選んだスロットへ自動で保存されます。ほかのスロットは変わりません。</p>
        <p class="note">ブラウザの閲覧データを消すと、セーブも消えます。ときどき「ファイルに書き出す」で残しておくと、消えても「ファイルから読み込む」で戻せます。</p>
        ${versionLine()}
      </section>
    </div>`;
  }
  const m = slotMeta(UI.newSlot);
  return `
  <div class="title">
    <h1>⚾ ペナント監督</h1>
    <section class="card">
      <div class="row"><h2>スロット${UI.newSlot}で新しく始める</h2><button data-act="slotBack">◀ もどる</button></div>
      ${m ? `<p class="neg"><b>注意：</b>スロット${UI.newSlot}の「${h(m.team)} ${m.year}年」のデータは消えます。</p>` : ''}
      <p>率いる球団を選んでください。</p>
      ${LEAGUES.map(lg => `<h3>${LEAGUE_NAME[lg]}</h3><div class="teampick">
        ${TEAM_DEFS.map((d, i) => d.lg !== lg ? '' : `<button class="tp ${UI.newTeam === i ? 'on' : ''}" style="--c:${d.color}" data-act="pickTeam" data-i="${i}">${h(d.name)}</button>`).join('')}
      </div>`).join('')}
      <p>1 シーズンの試合数：
        ${Object.keys(SEASON_FORMATS).sort((a, b) => b - a).map(n => `<label><input type="radio" name="games" value="${n}" data-chg="games" ${UI.newGames === +n ? 'checked' : ''}> ${SEASON_FORMATS[n].label}</label>`).join(' ')}
      </p>
      <p class="muted">2 リーグ 12 球団・交流戦あり・月曜休みの 6 人ローテ。シーズンのあとはクライマックスシリーズと日本シリーズ。</p>
      <button class="big primary" data-act="newGame">プレイボール！</button>
    </section>
  </div>`;
}

// ---------- 上の帯 ----------
function renderHeader() {
  const t = myTeam();
  const rank = rankOf(t.id);
  let adv = '<span class="tag">オフシーズン</span>';
  if (S.phase === 'season') {
    adv = `<button class="primary" data-act="adv" data-n="game">次の試合 ▶</button>
       <button data-act="adv" data-n="week">1週間 ▶▶</button>
       <button data-act="adv" data-n="all">シーズン終了<span class="hide-m">まで</span> ⏭</button>`;
  } else if (S.phase === 'post') {
    adv = `<button class="primary" data-act="adv" data-n="post1">次の試合 ▶</button>
       <button data-act="adv" data-n="postall"><span class="hide-m">日本シリーズ</span>終了まで ⏭</button>`;
  }
  const when = S.phase === 'season' ? `${curDateLabel()} ・ ${gamesPlayed(t)}/${S.games}試合` : S.phase === 'post' ? 'ポストシーズン' : 'オフ';
  return `
  <header style="--c:${t.color}">
    <div class="hl">
      <div class="tname">${h(t.name)}</div>
      <div class="meta">${S.year}年 ${when}
        ・ <b>${t.w}勝${t.l}敗${t.d ? t.d + '分' : ''}</b> ${LEAGUE_NAME[t.lg]}${rank}位 ・ 一軍 ${t.active.length}/${ACTIVE_MAX} ・ 支配下 ${t.players.length}/${ROSTER_MAX} ・ 資金 <b class="${t.money < 0 ? 'neg' : ''}">${U.money(t.money)}</b> ・ 人気 ${Math.round(t.pop)}</div>
    </div>
    <div class="hr">${adv}<button class="ghost" data-act="menu" title="メニュー（保存・スロット）">💾<span class="hide-m"> スロット${currentSlot}</span> ☰</button></div>
  </header>`;
}

// ---------- ホーム ----------
// ---------- セーブを守る：ファイルへの書き出しのすすめ ----------
const BACKUP_NAG_DAYS = 7; // 書き出してからこの日数がたったら、ホームで知らせる
function backupAgeDays() { const t = lastExport(currentSlot); return t ? (Date.now() - t) / 86400000 : Infinity; }
const backupButtons = () => `<button class="primary" data-act="exportNow">💾 ファイルに書き出す</button>${navigator.canShare ? ' <button data-act="shareNow">📤 共有して送る（LINE・ドライブなど）</button>' : ''}`;

function backupBanner() {
  const d = backupAgeDays();
  if (d < BACKUP_NAG_DAYS) return '';
  return `<div class="backup-banner"><b>💾 ${d === Infinity ? 'まだセーブをファイルに書き出していません。' : `最後にファイルへ書き出してから${Math.floor(d)}日たちました。`}</b>
    ブラウザのデータが消えると、セーブも消えてしまいます。<div class="backup-btns">${backupButtons()}</div></div>`;
}

function renderBackupAsk() {
  const ex = lastExport(currentSlot);
  return `<div class="backup-ask"><h2>💾 ${S.year}年シーズンおつかれさまでした</h2>
    <p>ここでセーブをファイルに書き出しておくと、ブラウザのデータが消えても、このときから続きを遊べます。</p>
    <p class="muted small">${ex ? `最後に書き出したのは ${slotWhen(ex)}` : 'まだ一度も書き出していません'}</p>
    <p class="backup-btns">${backupButtons()}</p>
    <p><button data-act="closeModal">今回は書き出さない</button></p>
    <label class="small muted"><input type="checkbox" data-chg="noBackupAsk" ${backupAskOff() ? 'checked' : ''}> シーズンの終わりに聞かない（ホームのお知らせと 💾☰ メニューからはいつでも書き出せます）</label></div>`;
}

function renderHome() {
  const t = myTeam();
  let next = '<p>レギュラーシーズンの試合はすべて終わりました。</p>';
  const nm = nextMyGame();
  if (nm) {
    const m = nm.m;
    const opp = S.teams[m.home === t.id ? m.away : m.home];
    const sp = S.players[t.rotation[t.rotIdx % t.rotation.length]];
    const today = S.schedule[S.day];
    const off = today && !today.games.length ? '<p class="muted">今日は試合なし（月曜・移動日）</p>' : '';
    next = `${off}<p class="muted">${dateLabel(nm.entry)}${m.inter ? ' <span class="tag">交流戦</span>' : ''}</p>
      <div class="vs">${teamChip(t)} vs ${teamChip(opp)} <span class="muted">（${m.home === t.id ? 'ホーム' : 'ビジター'}）</span></div>
      <p>予告先発：${sp ? nameCell(sp) : '未定'}　相手：${opp.w}勝${opp.l}敗 ${LEAGUE_NAME[opp.lg]}${rankOf(opp.id)}位</p>`;
  }
  return `${backupBanner()}
  <div class="grid2">
    <section class="card"><h2>次の試合（第${Math.min(gamesPlayed(t) + 1, S.games)}戦）</h2>${next}</section>
    <section class="card"><h2>${LEAGUE_NAME[t.lg]} 順位</h2>${standTable(standings(t.lg), true)}</section>
  </div>
  ${S.lastGame ? `<section class="card"><h2>前の試合（${h(S.lastGame.label)}）</h2>${boxScore(S.lastGame)}</section>` : ''}
  <section class="card"><h2>ニュース</h2>${newsList(20)}</section>`;
}

function newsList(n) {
  if (!S.news.length) return '<p class="muted">まだありません。</p>';
  return `<ul class="news">${S.news.slice(0, n).map(x => `<li class="${x.kind}"><span class="muted">${x.y} ${typeof x.d === 'number' ? `第${x.d}戦` : x.d}</span> ${h(x.text)}</li>`).join('')}</ul>`;
}

function boxScore(g) {
  const tA = S.teams[g.away], tH = S.teams[g.home];
  const my = S.myTeamId;
  const myIdx = g.home === my ? 1 : 0;
  const won = g.score[myIdx] > g.score[1 - myIdx], lost = g.score[myIdx] < g.score[1 - myIdx];
  const n = Math.max(9, g.line[0].length);
  const cols = Array.from({ length: n }, (_, i) => i);
  const row = (t, i) => `<tr><th>${teamChip(t)}</th>${cols.map(c => `<td>${g.line[i][c] != null ? g.line[i][c] : ''}</td>`).join('')}<td class="r">${g.score[i]}</td><td>${g.hits[i]}</td></tr>`;
  const bat = g.bat[myIdx].map((b, i) => `<tr><td>${i + 1}</td><td>${b.pos}</td><td class="l">${h(b.name)}</td><td>${b.ab}</td><td>${b.h}</td><td>${b.hr}</td><td>${b.rbi}</td><td>${b.bb}</td><td>${b.k}</td></tr>`).join('');
  const pit = i => g.pit[i].map(p => `<tr><td class="l">${h(p.name)}</td><td>${U.ip(p.outs)}</td><td>${p.pc}</td><td>${p.h}</td><td>${p.r}</td><td>${p.bb}</td><td>${p.k}</td></tr>`).join('');
  const log = g.log.map(x => `<li class="${x.t === 'run' ? (x.side === myIdx ? 'good' : 'bad') : 'muted'}">${h(x.s)}</li>`).join('');
  return `
  <div class="result ${won ? 'win' : lost ? 'lose' : ''}">${won ? '勝利！' : lost ? '敗戦' : '引き分け'}　${h(tA.short)} ${g.score[0]} - ${g.score[1]} ${h(tH.short)}
    <span class="muted">観客 ${g.att.toLocaleString()}人</span></div>
  <div class="scroll"><table class="line"><tr><th></th>${cols.map(c => `<th>${c + 1}</th>`).join('')}<th>計</th><th>安</th></tr>${row(tA, 0)}${row(tH, 1)}</table></div>
  <p>勝：${h(g.wp || '-')}　負：${h(g.lp || '-')}${g.sp ? `　S：${h(g.sp)}` : ''}</p>
  <div class="grid2">
    <div><h3>${h(myTeam().short)}の打撃</h3><div class="scroll"><table class="tbl"><tr><th>#</th><th>守</th><th>選手</th><th>打数</th><th>安</th><th>本</th><th>点</th><th>四</th><th>三振</th></tr>${bat}</table></div></div>
    <div><h3>投手</h3><div class="scroll"><table class="tbl"><tr><th>${h(tA.short)}</th><th>回</th><th>球数</th><th>安</th><th>失</th><th>四</th><th>三振</th></tr>${pit(0)}
      <tr><th>${h(tH.short)}</th><th></th><th></th><th></th><th></th><th></th><th></th></tr>${pit(1)}</table></div></div>
  </div>
  <details><summary>試合の流れ</summary><ul class="log">${log || '<li class="muted">得点なし</li>'}</ul></details>`;
}

// ---------- チーム ----------
// 何年のドラフトで入った選手か、で絞り込む（'' = すべて、'none' = ドラフトの記録がない選手）
function draftYearMatch(p) {
  const f = UI.draftYearF;
  if (!f) return true;
  if (f === 'none') return !p.drafted;
  return !!p.drafted && p.drafted.year === +f;
}
function draftYearFilter(ps) {
  const years = [...new Set(ps.filter(p => p.drafted).map(p => p.drafted.year))].sort((a, b) => b - a);
  if (UI.draftYearF && UI.draftYearF !== 'none' && !years.includes(+UI.draftYearF)) UI.draftYearF = '';
  const n = f => ps.filter(p => (f === 'none' ? !p.drafted : p.drafted && p.drafted.year === f)).length;
  return `<div class="row" style="justify-content:flex-start"><label>入団：<select data-chg="draftYearF">
    <option value="">すべての選手</option>
    ${years.map(y => `<option value="${y}" ${String(y) === String(UI.draftYearF) ? 'selected' : ''}>${y}年ドラフト（${n(y)}人）</option>`).join('')}
    <option value="none" ${UI.draftYearF === 'none' ? 'selected' : ''}>ドラフト以外（ゲーム開始前・外国人など）（${n('none')}人）</option>
  </select></label></div>`;
}

function renderTeam() {
  const t = S.teams[UI.viewTeam != null ? UI.viewTeam : S.myTeamId];
  const ps = teamPlayers(t);
  const act = p => (t.active.includes(p.id) ? 0 : 1);
  const bats = ps.filter(canBat).sort((a, b) => act(a) - act(b) || FPOS.indexOf(a.pos) - FPOS.indexOf(b.pos) || ovr(b) - ovr(a));
  const roleOrder = ['先発', '抑え', 'セットアッパー', '中継'];
  const pits = ps.filter(canPitch).sort((a, b) => act(a) - act(b) || roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role) || ovr(b) - ovr(a));
  const g = UI.posf.team;
  const showBat = !g || (g !== '先発' && g !== '中継ぎ');
  const showPit = !g || g === '先発' || g === '中継ぎ';
  const geniuses = t.id === S.myTeamId ? ps.filter(p => p.geniusKnown) : [];
  const sel = `<select data-chg="viewTeam">${LEAGUES.map(lg => `<optgroup label="${LEAGUE_NAME[lg]}">${S.teams.filter(x => x.lg === lg).map(x => `<option value="${x.id}" ${x.id === t.id ? 'selected' : ''}>${h(x.name)}${x.id === S.myTeamId ? '（自分）' : ''}</option>`).join('')}</optgroup>`).join('')}</select>`;
  return `
  <section class="card">
    <div class="row"><h2>${teamChip(t)} ${h(t.name)}</h2>${sel}</div>
    <p class="muted">支配下 ${ps.length}人（上限${ROSTER_MAX}）・ 一軍 ${t.active.length}人 ・ 年俸総額 ${U.money(payroll(t))} ・ 名前を押すと詳しく見られます</p>
    <div class="seg">${[['list', '選手一覧'], ['stats', '今季の成績']].map(([k, n]) => `<button class="${UI.teamView === k ? 'on' : ''}" data-act="teamView" data-k="${k}">${n}</button>`).join('')}</div>
    ${posFilter('team')}
    ${draftYearFilter(ps)}
    ${UI.teamView === 'stats' ? teamStats(t, g, showBat, showPit) : `${showBat ? `<h3>野手${g ? `（${g}）` : ''}</h3>${batTable(bats.filter(p => posMatch(p, g) && draftYearMatch(p)))}` : ''}
    ${showPit ? `<h3>投手${g ? `（${g}）` : ''}</h3>${pitTable(pits.filter(p => posMatch(p, g) && draftYearMatch(p)))}` : ''}`}
  </section>
  ${t.id === S.myTeamId ? `<section class="card genius-box"><h2>✨ 天才</h2>
    ${geniuses.length ? `<p>${geniuses.map(p => `${nameCell(p)}（${posBadge(p)}・${p.age}歳・総合${Math.round(ovr(p))}）`).join('　')}</p>`
      : '<p class="muted">いまはいません。天才は伸びが段ちがいの選手で、自分のチームで 1 年過ごすと分かります。</p>'}
  </section>` : ''}`;
}

// ---------- 今季の成績（チームの選手の一覧） ----------
const r3 = v => (isFinite(v) ? v.toFixed(3).replace(/^0/, '') : '-');
const BAT_COLS = [
  ['g', '試合', s => s.g], ['pa', '打席', s => s.pa], ['ab', '打数', s => s.ab], ['h', '安打', s => s.h],
  ['d', '二塁打', s => s.d], ['t', '三塁打', s => s.t], ['hr', '本塁打', s => s.hr], ['rbi', '打点', s => s.rbi],
  ['r', '得点', s => s.r], ['sb', '盗塁', s => s.sb], ['bb', '四球', s => s.bb], ['k', '三振', s => s.k],
  ['avg', '打率', s => (s.ab ? s.h / s.ab : -1), r3], ['obp', '出塁率', s => (s.pa ? (s.h + s.bb) / s.pa : -1), r3],
  ['slg', '長打率', s => (s.ab ? (s.h + s.d + s.t * 2 + s.hr * 3) / s.ab : -1), r3], ['ops', 'OPS', s => (s.pa ? ops(s) : -1), r3],
];
const PIT_COLS = [
  ['pg', '登板', s => s.pg], ['gs', '先発', s => s.gs], ['w', '勝', s => s.w], ['l', '敗', s => s.l], ['sv', 'S', s => s.sv],
  ['ip', '投球回', s => s.outs, v => U.ip(v)], ['ph', '被安打', s => s.ph], ['phr', '被本塁打', s => s.phr], ['pbb', '四球', s => s.pbb],
  ['pk', '奪三振', s => s.pk], ['per', '失点', s => s.per],
  ['era', '防御率', s => (s.outs ? s.per * 27 / s.outs : 99), v => (v >= 99 ? '-.--' : v.toFixed(2))],
  ['whip', 'WHIP', s => (s.outs ? (s.ph + s.pbb) * 3 / s.outs : 99), v => (v >= 99 ? '-' : v.toFixed(2))],
  ['k9', '奪三振率', s => (s.outs ? s.pk * 27 / s.outs : -1), v => (v < 0 ? '-' : v.toFixed(2))],
];
// 小さいほうが良い数字は、小さい順に並べる
const LOW_IS_GOOD = new Set(['era', 'whip', 'per', 'ph', 'phr', 'pbb', 'l', 'k']);

function statTable(kind, list, gp) {
  const cols = kind === 'bat' ? BAT_COLS : PIT_COLS;
  const key = UI.statSort[kind];
  const col = cols.find(c => c[0] === key) || cols[0];
  const qual = p => (kind === 'bat' ? p.stats.pa >= gp * 3.1 : p.stats.outs >= gp * 3);
  // 率の並べ替えは、規定に届いた選手を先に
  const isRate = ['avg', 'obp', 'slg', 'ops', 'era', 'whip', 'k9'].includes(key);
  const rows = list.slice().sort((a, b) => (isRate ? qual(b) - qual(a) : 0)
    || (LOW_IS_GOOD.has(key) ? col[2](a.stats) - col[2](b.stats) : col[2](b.stats) - col[2](a.stats)));
  const fmt = c => c[3] || (v => v);
  return `<div class="scroll"><table class="tbl stats"><tr><th>名前</th><th>守</th>${cols.map(c => `<th><a href="#" class="sorth ${c[0] === key ? 'on' : ''}" data-act="statSort" data-kind="${kind}" data-k="${c[0]}">${c[1]}${c[0] === key ? (LOW_IS_GOOD.has(key) ? '▲' : '▼') : ''}</a></th>`).join('')}</tr>
    ${rows.map(p => `<tr class="${qual(p) ? 'qual' : ''}"><td class="l">${nameCell(p)}</td><td>${posBadge(p)}</td>${cols.map(c => `<td class="${c[0] === key ? 'sortcol' : ''}">${fmt(c)(c[2](p.stats))}</td>`).join('')}</tr>`).join('')}
  </table></div>`;
}

function teamStats(t, g, showBat, showPit) {
  const gp = Math.max(1, gamesPlayed(t));
  const ps = teamPlayers(t).filter(p => posMatch(p, g) && draftYearMatch(p));
  const bats = ps.filter(p => canBat(p) && p.stats.pa > 0);
  const pits = ps.filter(p => canPitch(p) && p.stats.pg > 0);
  const S0 = list => list.reduce((a, p) => { Object.keys(p.stats).forEach(k => { a[k] = (a[k] || 0) + p.stats[k]; }); return a; }, {});
  const tb = S0(bats), tp = S0(pits);
  return `
    <p class="muted">見出しを押すと並べ替えます。色のついた行は規定（打席 ${Math.ceil(gp * 3.1)}・投球回 ${gp}）に届いている選手です。今季まだ出ていない選手は出していません。</p>
    ${showBat ? `<h3>打撃（${bats.length}人）　チーム打率 ${U.avg(tb.h || 0, tb.ab || 0)}・${tb.hr || 0}本塁打・${tb.sb || 0}盗塁</h3>${bats.length ? statTable('bat', bats, gp) : '<p class="muted">まだいません</p>'}` : ''}
    ${showPit ? `<h3>投球（${pits.length}人）　チーム防御率 ${U.era(tp.per || 0, tp.outs || 0)}・${tp.pk || 0}奪三振</h3>${pits.length ? statTable('pit', pits, gp) : '<p class="muted">まだいません</p>'}` : ''}`;
}

function batTable(list) {
  if (isMobile()) return cardList(list, p => playerCard(p, { sub: `<span class="muted">人気${Math.round(p.fame)} ・ ${U.money(p.salary)}</span>`, lines: `<div class="pc-line">${statLine(p)}</div>` }));
  return `<div class="scroll"><table class="tbl">
  <tr><th>名前</th><th>守</th><th>年</th><th>調</th>${BAT_KEYS.map(k => `<th>${BAT_LABEL[k]}</th>`).join('')}<th>弾</th><th>総合</th><th>人気</th>
  <th>試合</th><th>打率</th><th>本</th><th>点</th><th>盗</th><th>OPS</th><th>年俸</th></tr>
  ${list.map(p => {
    const s = p.stats;
    return `<tr><td class="l">${nameCell(p)}</td><td>${posBadge(p)}</td><td class="nowrap">${p.age}${phaseMark(p)}</td><td>${condCell(p)}</td>
    ${BAT_KEYS.map(k => `<td>${gradeCell(p.a[k])}</td>`).join('')}<td>${canBat(p) ? trajOf(p) : '-'}</td><td>${Math.round(ovr(p))}</td><td>${Math.round(p.fame)}</td>
    <td>${s.g}</td><td>${U.avg(s.h, s.ab)}</td><td>${s.hr}</td><td>${s.rbi}</td><td>${s.sb}</td><td>${s.pa ? ops(s).toFixed(3) : '-'}</td><td>${U.money(p.salary)}</td></tr>`;
  }).join('')}</table></div>`;
}

function pitTable(list) {
  if (isMobile()) return cardList(list, p => playerCard(p, { sub: `<span>${p.role || '-'}</span><span class="muted">人気${Math.round(p.fame)} ・ ${U.money(p.salary)}</span>`, lines: `<div class="pc-line">${statLine(p)}</div>` }));
  return `<div class="scroll"><table class="tbl">
  <tr><th>名前</th><th>役割</th><th>年</th><th>調</th><th>球速</th>${PIT_KEYS.slice(1).map(k => `<th>${PIT_LABEL[k]}</th>`).join('')}<th>総合</th><th>人気</th>
  <th>登板</th><th>勝</th><th>敗</th><th>S</th><th>防御率</th><th>回</th><th>三振</th><th>年俸</th></tr>
  ${list.map(p => {
    const s = p.stats;
    return `<tr><td class="l">${nameCell(p)}</td><td class="nowrap">${p.role || '-'} ${aptBadge(p)}</td><td class="nowrap">${p.age}${phaseMark(p)}</td><td>${condCell(p)}</td>
    <td class="num">${veloKmh(p.a.velo)}km</td>${PIT_KEYS.slice(1).map(k => `<td>${gradeCell(p.a[k])}</td>`).join('')}<td>${Math.round(ovr(p))}</td><td>${Math.round(p.fame)}</td>
    <td>${s.pg}</td><td>${s.w}</td><td>${s.l}</td><td>${s.sv}</td><td>${U.era(s.per, s.outs)}</td><td>${U.ip(s.outs)}</td><td>${s.pk}</td><td>${U.money(p.salary)}</td></tr>`;
  }).join('')}</table></div>`;
}

function growthBox(p) {
  const g = growthSpan(p), ph = growthPhase(p);
  const now = ph.k === 'grow' ? `あと${ph.left + 1}年はよく伸びます。`
    : ph.k === 'peak' ? (ph.left > 0 ? `あと${ph.left}年はピークが続き、${g.declineFrom}歳から衰え始めます。` : `来年（${g.declineFrom}歳）から衰え始めます。`)
      : `毎年オフに能力が少しずつ下がります（年を取るほど大きく）。`;
  return `<div class="growth"><p><b>${p.type}型</b> ・ 成長期 〜${g.growEnd}歳 ・ ピーク ${g.peakFrom}〜${g.peakTo}歳 ・ 衰退期 ${g.declineFrom}歳〜
    ・ いま <span class="phase ph-${ph.k}">${ph.name}</span> ${now}</p>${growthBar(p)}</div>`;
}

const TRAJ_WORD = ['', 'ライナー・ゴロが多い', 'やや低め', 'やや高め', '高く上がるアーチスト'];

function renderPlayerModal(p) {
  const mine = p.teamId === S.myTeamId;
  const keys = abilKeys(p), lbl = ALL_LABEL;
  const bars = keys.map(k => `<div class="bar"><span class="bl">${lbl[k]}</span>${abilStalled(p, k) ? `<span class="gstack"><span class="grow1">${gradeCell(p.a[k])}</span><small class="stall" title="伸びしろの上限に近く、練習してもほとんど伸びない">停滞</small></span>` : gradeCell(p.a[k])}
    <span class="bt"><span style="width:${Math.round(p.a[k])}%"></span></span>${k === 'velo' ? `<span class="muted">${veloKmh(p.a.velo)}km/h</span>` : ''}</div>`).join('')
    + (canBat(p) ? `<div class="bar"><span class="bl">弾道</span>${trajTag(p)}<span class="muted small">${TRAJ_WORD[trajOf(p)]}</span></div>
      <div class="bar"><span class="bl">盗塁</span><span class="tag steal s-${stealWord(p)}">${stealWord(p)}</span><span class="muted small">${stealWord(p) === '積極的' ? 'すきがあればどんどん走る' : stealWord(p) === '慎重' ? 'あまり走らない' : ''}</span></div>` : '');
  const careerRows = [...p.career, { y: S.year, t: p.teamId != null ? S.teams[p.teamId].short : '-', s: p.stats, now: true }]
    .filter((c, i, arr) => !(c.now && arr.some(x => !x.now && x.y === S.year)));
  const crow = (c, pit) => {
    const s = c.s;
    return pit
      ? `<tr><td>${c.y}${c.now ? '（今季）' : ''}</td><td>${h(c.t)}</td><td>${s.pg}</td><td>${s.w}</td><td>${s.l}</td><td>${s.sv}</td><td>${U.era(s.per, s.outs)}</td><td>${U.ip(s.outs)}</td><td>${s.pk}</td></tr>`
      : `<tr><td>${c.y}${c.now ? '（今季）' : ''}</td><td>${h(c.t)}</td><td>${s.g}</td><td>${U.avg(s.h, s.ab)}</td><td>${s.h}</td><td>${s.hr}</td><td>${s.rbi}</td><td>${s.sb}</td><td>${s.pa ? ops(s).toFixed(3) : '-'}</td></tr>`;
  };
  const titles = titlesOf(p.id);
  const totalRow = pit => (careerRows.length > 1 ? crow({ y: '通算', t: '', s: careerTotal(p) }, pit).replace('<tr>', '<tr class="total">') : '');
  const headP = '<tr><th>年</th><th>球団</th><th>登板</th><th>勝</th><th>敗</th><th>S</th><th>防御率</th><th>回</th><th>三振</th></tr>';
  const headB = '<tr><th>年</th><th>球団</th><th>試合</th><th>打率</th><th>安打</th><th>本</th><th>点</th><th>盗</th><th>OPS</th></tr>';
  const focusOpts = focusOptions(p).map(f => `<option ${p.focus === f ? 'selected' : ''}>${f}</option>`).join('');
  const team = p.teamId != null ? S.teams[p.teamId] : null;
  return `
  <h2>${h(p.name)} ${p.foreign ? '<span class="tag">外国人</span>' : ''}${rebornTag(p)}</h2>
  ${rebornOf(p) ? `<p class="muted">転生選手：${h(rebornOf(p).note)}</p>` : ''}
  <p>${team ? teamChip(team) : ''} ${p.twoWay ? `二刀流（投手：${p.role || '-'}・野手：${p.isP ? p.pos2 : p.pos}）` : p.isP ? `投手（${p.role}）` : `野手（${p.pos}）`} ${posBadge(p)}${canBat(p) ? ` ・ サブポジ ${subsOf(p).length ? subsOf(p).join('・') : 'なし'}` : ''} ・ ${p.age}歳 ・ ${p.type}型 ・ 才能 <span class="stars">${potStars(p.pot)}</span>
   ・ 調子 ${condCell(p)} ${COND_LABEL[p.cond]} ・ 年俸 ${U.money(p.salary)} ${p.inj ? `<span class="tag bad">故障 残り${p.inj}日</span>` : ''}${p.awakened ? `<span class="tag awaken-tag">覚醒×${p.awakened}</span>` : ''}${p.bigAwakened ? `<span class="tag awaken-tag big">大覚醒×${p.bigAwakened}</span>` : ''}</p>
  ${growthBox(p)}
  <div class="bars">${bars}</div>
  <p>総合 <b>${Math.round(ovr(p))}</b>　トレード価値 ${tradeValue(p).toLocaleString()}</p>
  <p class="drafted">${p.drafted
    ? `📝 入団：<b>${p.drafted.year}年ドラフト${p.drafted.round}位</b>（${h(p.drafted.team)}${p.drafted.note ? `・${h(p.drafted.note)}` : ''}）${p.rareYears ? ` <span class="muted">「${p.rareYears}年に一人の逸材」と言われた</span>` : ''}${p.drafted.from ? ` <span class="muted">${h(p.drafted.from)}から</span>` : ''}`
    : p.foreign ? '📝 入団：外国人選手として契約' : '<span class="muted">📝 入団：ゲームを始める前からいる選手（ドラフトの記録なし）</span>'}</p>
  <p>出身 ${p.home ? h(p.home) : '海外'}${team && isHomeTeam(p, team) ? ' <span class="tag">地元</span>' : ''}
    ・ ${p.foreign ? 'FA権なし（外国人）' : hasFA(p) ? '<b>FA権あり</b>' : `FA権まであと${Math.max(0, faNeed(p) - faYearsHave(p)).toFixed(1)}年`}（一軍登録 ${faYearsHave(p).toFixed(1)}年）
    ${p.contractYears > 0 ? ` ・ 複数年契約 あと${p.contractYears}年（年俸固定）` : ''}</p>
  <div class="bars">
    <div class="bar"><span class="bl">人気度</span><small class="num">${Math.round(p.fame)}</small><span class="bt"><span class="fame" style="width:${Math.round(p.fame)}%"></span></span></div>
    <div class="bar"><span class="bl">忠誠心</span><small class="num">${Math.round(p.loyalty)}</small><span class="bt"><span class="loyal" style="width:${Math.round(p.loyalty)}%"></span></span></div>
    <div class="bar"><span class="bl">ビジュアル</span><span class="stars">${visualStars(p.visual)}</span></div>
  </div>
  ${canBat(p) ? `<h3>成績${p.twoWay ? '（打撃）' : ''}</h3><div class="scroll"><table class="tbl">${headB}${careerRows.map(c => crow(c, false)).join('')}${totalRow(false)}</table></div>` : ''}
  ${canPitch(p) ? `<h3>成績${p.twoWay ? '（投球）' : ''}</h3><div class="scroll"><table class="tbl">${headP}${careerRows.map(c => crow(c, true)).join('')}${totalRow(true)}</table></div>` : ''}
  ${titles.length ? `<p>🏆 タイトル：${titles.map(t => `${t.year} ${h(t.title)}`).join('、')}</p>` : ''}
  ${p.amateur ? `<p class="muted">アマ時代：${h(p.amateur.team)} ・ ${h(p.amateur.line)}${p.amateur.title ? ` ・ 🏆 ${h(p.amateur.title)}` : ''}</p>` : ''}
  ${mine ? `<h3>監督の指示</h3>
    <p>${myTeam().active.includes(p.id)
      ? `<b>一軍</b> <button data-act="demote" data-pid="${p.id}">登録抹消（二軍へ）</button> <span class="muted">${S.phase === 'season' ? `抹消すると${REREGISTER_DAYS}日間は一軍に戻せません` : ''}</span>`
      : `<b>二軍</b> ${cannotPromote(myTeam(), p) ? `<span class="muted">一軍に上げられません（${h(cannotPromote(myTeam(), p))}）</span>` : `<button class="primary" data-act="promote" data-pid="${p.id}">一軍に登録</button>`}`}</p>
    <p>練習の重点：<select data-chg="focus" data-pid="${p.id}">${focusOpts}</select></p>
    <p>${p.twoWay
      ? `<button data-act="dropTwoWay" data-pid="${p.id}">二刀流をやめる</button> <span class="muted">${p.isP ? '打撃' : '投球'}の能力がなくなり、本業に専念します</span>`
      : p.age <= 27 && ovr(p) < TWO_WAY_MIN_OVR ? `<span class="muted">二刀流に挑戦できるのは総合${TWO_WAY_MIN_OVR}以上の選手です（いま${Math.round(ovr(p))}）</span>`
      : p.age <= 27 ? `<button data-act="tryTwoWay" data-pid="${p.id}">二刀流に挑戦させる</button> <span class="muted">${p.isP ? '打撃' : '投球'}の練習を始めます（最初は低い能力から。練習の伸びは両方に分かれます）</span>` : ''}</p>
    ${releaseOpen()
      ? `<p><button class="danger" data-act="release" data-pid="${p.id}">自由契約にする</button> <span class="muted">チームから外します。他球団に拾われることもあります</span></p>`
      : '<p class="muted">自由契約にできるのは、オフの契約更改〜開幕前だけです。</p>'}` : ''}
  ${S.freeAgents.includes(p.id) ? `<p><span class="tag">自由契約</span> 前所属 ${h(p.lastTeam || '-')} ・ 希望年俸 ${U.money(p.salary)}</p>` : ''}`;
}

// ---------- オーダー ----------
// 選ぶ欄の中にも能力を出す（ミB パA 走C 肩D 守C）
const abilText = (p, keys) => keys.map(k => (k === 'velo' ? `${veloKmh(p.a.velo)}km` : `${SHORT_LABEL[k]}${U.grade(p.a[k])}`)).join(' ');
const batOpt = f => `${h(f.name)}（${f.isP ? f.pos2 : f.pos}${subsOf(f).length ? '・' + subsOf(f).join('') : ''}）${abilText(f, BAT_KEYS)} 弾${trajOf(f)} 総${Math.round(batOvr(f))}${f.inj ? ' 故障' : ''}`;
const pitOpt = p => `${h(p.name)}（${abilText(p, PIT_KEYS)} 総${Math.round(ovr(p))}）${p.inj ? '故障' : ''}`;

// 一軍の控え・中継ぎを、能力つきの表で見せる
function benchTable(list) {
  if (isMobile()) return cardList(list, p => playerCard(p, { sub: `<span class="muted">打率${U.avg(p.stats.h, p.stats.ab)} ${p.stats.hr}本</span>` }));
  if (!list.length) return '<p class="muted">なし</p>';
  return `<div class="scroll"><table class="tbl"><tr><th>名前</th><th>守</th><th>年</th><th>調</th>${BAT_KEYS.map(k => `<th>${BAT_LABEL[k]}</th>`).join('')}<th>弾</th><th>総合</th><th>打率</th><th>本</th></tr>
    ${list.map(p => `<tr><td class="l">${nameCell(p)}</td><td>${posBadge(p)}</td><td class="nowrap">${p.age}${phaseMark(p)}</td><td>${condCell(p)}</td>${BAT_KEYS.map(k => `<td>${gradeCell(p.a[k])}</td>`).join('')}<td>${canBat(p) ? trajOf(p) : '-'}</td>
      <td>${Math.round(batOvr(p))}</td><td>${U.avg(p.stats.h, p.stats.ab)}</td><td>${p.stats.hr}</td></tr>`).join('')}</table></div>`;
}
function penTable(list, t) {
  const role = p => (p.id === t.closer ? '抑え' : p.id === t.setup ? 'セットアッパー' : '中継ぎ');
  if (isMobile()) return cardList(list, p => playerCard(p, { sub: `<span>${role(p)}</span><span class="muted">${p.stats.pg}登板 防${U.era(p.stats.per, p.stats.outs)} ${p.stats.sv}S</span>` }));
  if (!list.length) return '<p class="muted">なし</p>';
  return `<div class="scroll"><table class="tbl"><tr><th>名前</th><th>役割</th><th>年</th><th>調</th><th>球速</th>${PIT_KEYS.slice(1).map(k => `<th>${PIT_LABEL[k]}</th>`).join('')}<th>総合</th><th>登板</th><th>防御率</th><th>S</th></tr>
    ${list.map(p => `<tr><td class="l">${nameCell(p)}</td><td class="nowrap">${role(p)} ${aptBadge(p)}</td><td class="nowrap">${p.age}${phaseMark(p)}</td><td>${condCell(p)}</td><td class="num">${veloKmh(p.a.velo)}km</td>
      ${PIT_KEYS.slice(1).map(k => `<td>${gradeCell(p.a[k])}</td>`).join('')}<td>${Math.round(ovr(p))}</td><td>${p.stats.pg}</td><td>${U.era(p.stats.per, p.stats.outs)}</td><td>${p.stats.sv}</td></tr>`).join('')}</table></div>`;
}

function renderOrder() {
  const t = myTeam();
  const fielders = activePlayers(t).filter(canBat).sort((a, b) => batOvr(b) - batOvr(a));
  const pitchers = activePlayers(t).filter(canPitch).sort((a, b) => ovr(b) - ovr(a));
  const inLine = new Set(t.lineup.map(s => s.pid));
  const bench = fielders.filter(p => !inLine.has(p.id));
  const pOpt = (cur, list) => list.map(p => `<option value="${p.id}" ${p.id === cur ? 'selected' : ''}>${pitOpt(p)}</option>`).join('');
  const rot = t.rotation.map((id, i) => `<tr><td>${i + 1}${i === t.rotIdx % t.rotation.length ? ' <span class="tag">次</span>' : ''}</td>
      <td class="l"><select data-chg="rot" data-i="${i}">${pOpt(id, pitchers)}</select></td>
      <td>${condCell(S.players[id])}</td><td class="num">${veloKmh(S.players[id].a.velo)}km</td>${PIT_KEYS.slice(1).map(k => `<td>${gradeCell(S.players[id].a[k])}</td>`).join('')}<td>${Math.round(ovr(S.players[id]))}</td><td>${S.players[id].rest >= STARTER_REST ? '◯' : `中${Math.max(0, S.players[id].rest - 1)}日`}</td>
      <td>${S.players[id].stats.w}-${S.players[id].stats.l}</td><td>${U.era(S.players[id].stats.per, S.players[id].stats.outs)}</td></tr>`).join('');
  const pen = pitchers.filter(p => !t.rotation.includes(p.id));
  return `
  <section class="card">
    <div class="row"><h2>打順と守備</h2><button data-act="autoOrder">おまかせで組む</button></div>
    <p class="muted">選手をタップして、もう一人をタップすると入れ替わります。打順どうしなら打順を、控えを選ぶとスタメンと交代します。守備図の位置をタップすると、選んだ選手がそこを守ります。適性△×は守備が弱くなります（一軍・二軍の入れ替えは「一軍・二軍」の画面で）。</p>
    ${orderBoard(t, bench)}
  </section>
  <section class="card">
    <h2>先発ローテーション（${ROTATION_SIZE}人）</h2>
    <p class="muted">月曜が休みなので、6 人で回すとそれぞれ中 6 日で投げられます。間が中 5 日より短いと次の人に飛ばします。</p>
    <div class="scroll"><table class="tbl"><tr><th>#</th><th>投手</th><th>調</th><th>球速</th>${PIT_KEYS.slice(1).map(k => `<th>${PIT_LABEL[k]}</th>`).join('')}<th>総合</th><th>登板</th><th>勝敗</th><th>防御率</th></tr>${rot}</table></div>
    <h2>リリーフ</h2>
    <p>抑え（9回）：<select data-chg="closer"><option value="">なし</option>${pOpt(t.closer, pen.filter(p => p.id !== t.setup))}</select></p>
    <p>セットアッパー（8回）：<select data-chg="setup"><option value="">なし</option>${pOpt(t.setup, pen.filter(p => p.id !== t.closer))}</select></p>
    <p class="muted">3 点差以内でリードしている 8 回はセットアッパー、9 回は抑えが出ます。リリーフは 3 日続けては投げません。</p>
    <h3>リリーフ陣（${pen.length}人）</h3>${penTable(pen.slice().sort((a, b) => (b.id === t.closer) - (a.id === t.closer) || (b.id === t.setup) - (a.id === t.setup) || relVal(b) - relVal(a)), t)}
  </section>`;
}

// ---------- オーダー画面（打順表と守備図） ----------
const FIELD_SPOT = { 捕: [50, 90], 一: [76, 58], 二: [63, 42], 三: [24, 58], 遊: [37, 42], 左: [16, 20], 中: [50, 9], 右: [84, 20] };
function posClass(pos) { return ['左', '中', '右'].includes(pos) ? '外' : pos; }

function fitTag(fit) { return fit >= SUB_FIT ? '<span class="tag">サブ</span>' : `<span class="tag ${fit < 0.7 ? 'bad' : ''}">適性${fit < 0.7 ? '×' : '△'}</span>`; }
function orderRow(p, o) {
  const fit = o.pos ? posFit(p, o.pos) : 1;
  return `<button class="po-row${o.sel ? ' sel' : ''}${p.inj ? ' inj' : ''}" data-act="osel" data-k="${o.k}" ${o.k === 'line' ? `data-i="${o.i}"` : `data-pid="${p.id}"`}>
    <span class="po-no">${o.k === 'line' ? o.i + 1 : ''}</span>
    <span class="po-pos">${o.pos ? `<span class="pb pb-${posClass(o.pos)}">${o.pos}</span>` : `<span class="pb pb-${p.isP ? p.pos2 : p.pos}">${p.isP ? p.pos2 : p.pos}</span>`}</span>
    <span class="po-name">${h(p.name)}<span class="po-can">${o.pos ? posBadge(p) : subsBadge(p)}</span>${fit < 1 ? fitTag(fit) : ''}${p.inj ? '<span class="tag bad">故障</span>' : ''}</span>
    <span class="po-cond">${condCell(p)}</span>
    <span class="po-traj">${trajTag(p)}</span>
    ${BAT_KEYS.map(k => `<span class="po-g">${gradeCell(p.a[k])}</span>`).join('')}
    <span class="po-st muted">${U.avg(p.stats.h, p.stats.ab)} ${p.stats.hr}本</span>
  </button>`;
}

function orderBoard(t, bench) {
  if (UI.osel && UI.osel.k === 'bench' && !bench.some(p => p.id === UI.osel.pid)) UI.osel = null; // 控えから外れた選手は選びなおし
  const sel = UI.osel;
  const head = `<div class="po-row po-head"><span class="po-no">#</span><span class="po-pos">守</span><span class="po-name">選手</span><span class="po-cond">調</span><span class="po-traj">弾</span>${BAT_KEYS.map(k => `<span class="po-g">${SHORT_LABEL[k]}</span>`).join('')}<span class="po-st">打率 本</span></div>`;
  const lineRows = t.lineup.map((s, i) => orderRow(S.players[s.pid], { k: 'line', i, pos: s.pos, sel: sel && sel.k === 'line' && sel.i === i })).join('');
  const benchRows = bench.length
    ? bench.map(p => orderRow(p, { k: 'bench', sel: sel && sel.k === 'bench' && sel.pid === p.id })).join('')
    : '<p class="muted">なし</p>';
  const selPid = sel ? (sel.k === 'line' ? t.lineup[sel.i].pid : sel.pid) : null;
  const spot = (pos, xy) => {
    const s = t.lineup.find(x => x.pos === pos);
    const p = s && S.players[s.pid];
    const bad = p && posFit(p, pos) < SUB_FIT;
    return `<button class="fspot${p && p.id === selPid ? ' sel' : ''}${bad ? ' bad' : ''}" style="left:${xy[0]}%;top:${xy[1]}%" data-act="ofield" data-pos="${pos}">
      <span class="pb pb-${posClass(pos)}">${pos}</span><span class="fname">${p ? h(p.name.split(' ')[0]) : '空き'}</span></button>`;
  };
  const hasDH = t.lineup.some(x => x.pos === '指');
  const nextSp = t.rotation.length ? S.players[t.rotation[t.rotIdx % t.rotation.length]] : null;
  const field = `<div class="po-field">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path d="M50 98 L2 50 A68 68 0 0 1 98 50 Z" fill="#3f8f3a"/>
      <path d="M50 96 L22 66 L50 38 L78 66 Z" fill="#c8945a"/>
      <path d="M50 90 L30 68 L50 47 L70 68 Z" fill="#4c9d45"/>
      <circle cx="50" cy="66" r="3.2" fill="#c8945a"/>
      <path d="M50 96 L2 50 M50 96 L98 50" stroke="#fff" stroke-width=".5" fill="none"/>
    </svg>
    ${Object.entries(FIELD_SPOT).map(([pos, xy]) => spot(pos, xy)).join('')}
    <div class="fmound">${nextSp ? `<span class="pb pb-投">投</span><span class="fname">${h(nextSp.name.split(' ')[0])}</span>` : ''}</div>
    ${hasDH ? spot('指', [86, 90]) : ''}
  </div>`;
  const hint = sel
    ? `<b>${h(S.players[selPid].name)}</b> を選んでいます。入れ替える相手か、守る位置をタップしてください。 <button class="sm" data-act="oclear">やめる</button>`
    : '選手をタップして選びます。';
  return `<div class="po-hint">${hint}</div>
  <div class="po-wrap">
    <div class="po-list">${head}${lineRows}<h3>控え（${bench.length}人）</h3>${benchRows}</div>
    ${field}
  </div>`;
}

// ---------- オフの FA ----------
function renderFAStep() {
  const F = S.off.fa;
  const t = myTeam();
  if (F.stage === 'pre') {
    const mine = F.eligible.map(id => S.players[id]).filter(p => p && p.teamId === t.id).sort((a, b) => ovr(b) - ovr(a));
    const others = F.eligible.length - mine.length;
    const rows = mine.map(p => {
      const r = F.retain[p.id] || 0;
      const c = declareChance(p, r);
      return `<tr><td class="l">${nameCell(p)}${isHomeTeam(p, t) ? '<span class="tag">地元</span>' : ''}</td><td>${posBadge(p)}</td><td class="nowrap">${p.age}${phaseMark(p)}</td><td>${Math.round(ovr(p))}</td>
        <td>${U.money(p.salary)}</td><td>${U.money(faMarket(p))}</td><td>${Math.round(p.loyalty)}</td><td><b>${faMood(c)}</b></td>
        <td><select data-chg="retain" data-pid="${p.id}">${[[0, 'しない'], [1.2, '年俸1.2倍を約束'], [1.5, '年俸1.5倍を約束']].map(([v, n]) => `<option value="${v}" ${r === v ? 'selected' : ''}>${n}</option>`).join('')}</select></td></tr>`;
    }).join('');
    return `<section class="card"><h2>FA権を持つ選手</h2>
      <p>一軍に登録された年数が、高校出身は 8 年・大学や社会人出身は 7 年になると FA 権が取れます（一度使ったら次は 4 年）。
        FA 権を持つ選手は、ここで FA 宣言するかどうかを決めます。<b>忠誠心が高い選手ほど残りやすく</b>、地元の球団にも少し残りやすくなります。</p>
      <p class="muted">引き留め（年俸アップの約束）をすると残りやすくなります。残ってくれたら約束どおり年俸が上がります。他球団では ${others} 人が FA 権を持っています。</p>
      ${rows ? `<div class="scroll"><table class="tbl"><tr><th>名前</th><th>守</th><th>年</th><th>総合</th><th>年俸</th><th>FA相場</th><th>忠誠心</th><th>意向</th><th>引き留め</th></tr>${rows}</table></div>` : '<p>あなたのチームには FA 権を持つ選手がいません。</p>'}
      <button class="primary big" data-act="faDeclare">FA宣言の発表へ ▶</button></section>`;
  }
  if (F.stage === 'market') {
    const rows = F.declared.map(d => {
      const p = S.players[d.pid];
      const from = S.teams[d.from];
      const my = F.myBids[d.pid];
      const dr = UI.faDraft[d.pid] || { mul: 1, years: p.age <= 30 ? 3 : 1 };
      const comp = d.from === t.id ? 0 : Math.round(d.oldSalary * FA_COMP[d.rank]);
      return `<tr class="${my ? 'sel' : ''}"><td class="l">${nameCell(p)}${isHomeTeam(p, t) ? '<span class="tag">地元</span>' : ''}</td><td>${posBadge(p)}</td><td class="nowrap">${p.age}${phaseMark(p)}</td><td>${Math.round(ovr(p))}</td>
        <td>${teamChip(from)}</td><td>${d.rank}</td><td>${U.money(d.mv)}</td><td>${comp ? U.money(comp) : '-'}</td><td>${d.bids.length ? `${d.bids.length}球団` : 'なし'}</td>
        <td class="l nowrap">${my ? `<b>年俸${U.money(my.salary)}・${my.years}年</b> <button class="sm" data-act="faBidCancel" data-pid="${d.pid}">取り消す</button>` : `
          <select data-chg="faMul" data-pid="${d.pid}">${[0.9, 1, 1.2, 1.5].map(v => `<option value="${v}" ${dr.mul === v ? 'selected' : ''}>相場×${v}（${U.money(Math.round(d.mv * v / 10) * 10)}）</option>`).join('')}</select>
          <select data-chg="faYears" data-pid="${d.pid}">${[1, 2, 3, 4].map(v => `<option value="${v}" ${dr.years === v ? 'selected' : ''}>${v}年</option>`).join('')}</select>
          <button class="sm primary" data-act="faBid" data-pid="${d.pid}">${d.from === t.id ? '残留を申し込む' : '申し込む'}</button>`}</td></tr>`;
    }).join('');
    return `<section class="card"><h2>FA市場（${F.declared.length}人が宣言）</h2>
      <p>宣言した選手に条件（年俸と年数）を出せます。選手は、年俸・年数・チームの強さと人気・元の球団への忠誠心・地元かどうかを比べて決めます。
        年を取った選手ほど長い契約を喜びます。</p>
      <p class="muted">補償金：年俸がチームで上位 3 人（A ランク）なら年俸の 0.8 倍、4〜10 位（B ランク）なら 0.6 倍を、元の球団に払います。
        「他球団の関心」は、手を挙げている球団の数です。資金 ${U.money(t.money)}</p>
      ${rows ? `<div class="scroll"><table class="tbl"><tr><th>名前</th><th>守</th><th>年</th><th>総合</th><th>前所属</th><th>ランク</th><th>相場</th><th>補償金</th><th>他球団の関心</th><th>あなたの条件</th></tr>${rows}</table></div>` : '<p>今年は FA 宣言した選手がいません。</p>'}
      <button class="primary big" data-act="faResolve">交渉を締め切る（結果発表） ▶</button></section>`;
  }
  const rows = F.results.map(r => `<tr class="${r.to === t.id || r.from === t.id ? 'me' : ''}"><td class="l">${S.players[r.pid] ? nameCell(S.players[r.pid]) : h(r.name)}</td>
    <td>${teamChip(S.teams[r.from])}</td><td>→</td><td>${teamChip(S.teams[r.to])}</td><td>${h(r.note)}</td><td>${U.money(r.salary)}</td><td>${r.years}年</td><td>${r.comp ? U.money(r.comp) : '-'}</td><td>${r.bids}球団</td></tr>`).join('');
  return `<section class="card"><h2>FAの結果</h2>
    ${rows ? `<div class="scroll"><table class="tbl"><tr><th>名前</th><th>元</th><th></th><th>先</th><th></th><th>年俸</th><th>年数</th><th>補償金</th><th>条件を出した</th></tr>${rows}</table></div>` : '<p>今年は FA の動きがありませんでした。</p>'}
    <button class="primary big" data-act="offNext">契約更改へ ▶</button></section>`;
}

// ---------- 一軍・二軍 ----------
function renderRoster() {
  const t = myTeam();
  const act = activePlayers(t), farm = teamPlayers(t).filter(p => !t.active.includes(p.id));
  const foreign = act.filter(p => p.foreign).length;
  if (UI.rsel != null && (!S.players[UI.rsel] || S.players[UI.rsel].teamId !== t.id)) UI.rsel = null;
  const sel = UI.rsel != null ? S.players[UI.rsel] : null;
  const selAct = sel && isActive(t, sel);
  const byOvr = (a, b) => ovr(b) - ovr(a);
  const row = p => {
    const on = sel && sel.id === p.id;
    const farm = !isActive(t, p);
    const why = farm ? cannotPromote(t, p) : null;
    const abil = abilKeys(p).map(k => `<span class="po-g">${SHORT_LABEL[k]}${k === 'velo' ? `<span class="kmh">${veloKmh(p.a.velo)}</span>` : `<span class="g g${U.grade(p.a[k])}">${U.grade(p.a[k])}</span>`}</span>`).join('');
    return `<button class="ro-row${on ? ' sel' : ''}${why && why !== '一軍が満員' ? ' locked' : ''}" data-act="rsel" data-pid="${p.id}">
      <span class="ro-pos">${posBadge(p)}</span>
      <span class="ro-name">${h(p.name)}${p.foreign ? '<span class="tag">外</span>' : ''}${p.twoWay ? '<span class="tag twoway">二刀流</span>' : ''}${p.inj ? `<span class="tag bad">故障${p.inj}日</span>` : ''}${why && why !== '一軍が満員' && !p.inj ? `<span class="tag">${h(why)}</span>` : ''}</span>
      <span class="ro-age">${p.age}${phaseMark(p)}</span>
      <span class="ro-cond">${condCell(p)}</span>
      <span class="ro-abil">${abil}${trajTag(p)}</span>
      <span class="ro-ovr">${Math.round(ovr(p))}</span>
    </button>`;
  };
  const group = (list, title) => `<h3>${title}（${list.length}人）</h3>${list.length ? list.sort(byOvr).map(row).join('') : '<p class="muted">なし</p>'}`;
  const hint = sel
    ? `<b>${h(sel.name)}</b>（${selAct ? '一軍' : '二軍'}）を選んでいます。${selAct ? '二軍' : '一軍'}の選手をタップすると入れ替わります。
       ${selAct ? `<button class="sm" data-act="demote" data-pid="${sel.id}">抹消だけする</button>` : `<button class="sm primary" data-act="promote" data-pid="${sel.id}">登録だけする</button>`}
       <button class="sm" data-act="rclear">やめる</button>`
    : '選手をタップして選び、反対側の選手をタップすると一軍と二軍が入れ替わります。';
  return `
  <section class="card">
    <div class="row"><h2>一軍・二軍</h2><button data-act="autoActive">一軍をおまかせで組む</button></div>
    <p>一軍 <b>${act.length}/${ACTIVE_MAX}人</b>（投手${act.filter(p => p.isP).length}・野手${act.filter(p => !p.isP).length}）・ 外国人 ${foreign}/${FOREIGN_ACTIVE_MAX} ・ 支配下 ${t.players.length}/${ROSTER_MAX}</p>
    <p class="muted">試合に出られるのは一軍だけです。シーズン中に抹消した選手は${REREGISTER_DAYS}日たつまで一軍に戻せません。ケガをした一軍の選手は自動で抹消され、二軍から代わりが上がります。</p>
    <div class="po-hint">${hint}</div>
    <div class="ro-wrap">
      <div class="ro-col ro-act"><h2>一軍</h2>${group(act.filter(p => p.isP), '投手')}${group(act.filter(p => !p.isP), '野手')}</div>
      <div class="ro-col ro-farm"><h2>二軍</h2>${group(farm.filter(p => p.isP), '投手')}${group(farm.filter(p => !p.isP), '野手')}</div>
    </div>
  </section>`;
}

// ---------- 練習 ----------
function renderTrain() {
  const t = myTeam();
  const ps = teamPlayers(t).sort((a, b) => a.isP - b.isP || a.age - b.age);
  const mult = INTENSITY[t.intensity].grow * (0.8 + t.fac.train * 0.1);
  return `
  <section class="card">
    <h2>練習方針</h2>
    <p>毎週月曜（休みの日）に練習の成果が出ます。二軍の 25 歳以下は二軍戦で経験を積むので、少し伸びやすくなります。まれに選手が<b>覚醒</b>して大きく伸びることもあります。若い選手・才能（★）の多い選手ほど伸びます。</p>
    <div class="seg">${Object.keys(INTENSITY).map(k => `<button class="${t.intensity === k ? 'on' : ''}" data-act="intensity" data-k="${k}">${k}</button>`).join('')}</div>
    <p class="muted">軽め：伸びは小さいが調子が上がりやすく、ケガも少ない ／ 猛練習：よく伸びるがケガと不調が増える
      ／ いまの伸び倍率 ×${mult.toFixed(2)}（練習施設 Lv${t.fac.train}）</p>
  </section>
  <section class="card">
    <h2>選手ごとの重点</h2>
    <div class="scroll"><table class="tbl"><tr><th>名前</th><th>守</th><th>年</th><th>型</th><th>才能</th><th>総合</th><th>重点</th></tr>
    ${ps.map(p => `<tr><td class="l">${nameCell(p)}</td><td>${posBadge(p)}</td><td class="nowrap">${p.age}${phaseMark(p)}</td><td>${p.type}</td><td class="stars">${potStars(p.pot)}</td><td>${Math.round(ovr(p))}</td>
      <td><select data-chg="focus" data-pid="${p.id}">${focusOptions(p).map(f => `<option ${p.focus === f ? 'selected' : ''}>${f}</option>`).join('')}</select></td></tr>`).join('')}
    </table></div>
  </section>`;
}

// ---------- 日程 ----------
function renderSched() {
  const t = myTeam();
  const done = S.myGames.slice().reverse().map(g => {
    const o = S.teams[g.opp];
    return `<tr><td>${h(g.day)}</td><td>${teamChip(o)}${g.inter ? '<span class="tag">交流戦</span>' : ''}</td><td>${g.home ? 'ホーム' : 'ビジター'}</td><td class="${g.r === '勝' ? 'win' : g.r === '敗' ? 'lose' : ''}">${g.r}</td><td>${g.my} - ${g.op}</td>
    <td class="l muted">勝 ${h(g.wp || '-')} / 負 ${h(g.lp || '-')}${g.sp ? ` / S ${h(g.sp)}` : ''}</td></tr>`;
  }).join('');
  const up = [];
  if (S.phase === 'season') {
    for (let d = S.day; d < Math.min(S.schedule.length, S.day + 14); d++) {
      const e = S.schedule[d];
      const m = e.games.find(x => x.home === t.id || x.away === t.id);
      if (!m) { up.push(`<tr class="muted"><td>${dateLabel(e)}</td><td colspan="2">休み</td></tr>`); continue; }
      up.push(`<tr><td>${dateLabel(e)}</td><td>${teamChip(S.teams[m.home === t.id ? m.away : m.home])}${m.inter ? '<span class="tag">交流戦</span>' : ''}</td><td>${m.home === t.id ? 'ホーム' : 'ビジター'}</td></tr>`);
    }
  }
  const last10 = S.myGames.slice(-10).map(g => g.r).join('');
  const inter = S.myGames.filter(g => g.inter);
  return `
  <div class="grid2">
    <section class="card"><h2>これからの試合</h2>${up.length ? `<table class="tbl"><tr><th>日付</th><th>相手</th><th></th></tr>${up.join('')}</table>` : '<p>ありません</p>'}</section>
    <section class="card"><h2>直近10試合</h2><p class="big-text">${last10 || '-'}</p>
      <h3>相手別</h3>${vsTable()}
      <p>交流戦 ${inter.filter(g => g.r === '勝').length}勝${inter.filter(g => g.r === '敗').length}敗${inter.filter(g => g.r === '分').length}分</p></section>
  </div>
  <section class="card"><h2>結果</h2><div class="scroll"><table class="tbl"><tr><th>日付</th><th>相手</th><th></th><th></th><th>スコア</th><th>投手</th></tr>${done || '<tr><td colspan="6">まだ試合をしていません</td></tr>'}</table></div></section>`;
}

function vsTable() {
  const rows = S.teams.filter(t => t.id !== S.myTeamId).sort((a, b) => (a.lg !== myTeam().lg) - (b.lg !== myTeam().lg)).map(o => {
    const gs = S.myGames.filter(g => g.opp === o.id);
    const w = gs.filter(g => g.r === '勝').length, l = gs.filter(g => g.r === '敗').length;
    return `<tr><td>${teamChip(o)}</td><td>${w}勝${l}敗</td></tr>`;
  }).join('');
  return `<table class="tbl">${rows}</table>`;
}

// ---------- 順位・成績 ----------
function standTable(st, small) {
  return `<div class="scroll"><table class="tbl">
  <tr><th>順</th><th>球団</th><th>試合</th><th>勝</th><th>敗</th><th>分</th><th>勝率</th><th>差</th>${small ? '' : '<th>得点</th><th>失点</th><th>人気</th>'}</tr>
  ${st.map((r, i) => `<tr class="${r.t.id === S.myTeamId ? 'me' : ''}"><td>${i + 1}</td><td class="l">${teamChip(r.t)} ${small ? '' : h(r.t.name)}</td>
    <td>${r.t.w + r.t.l + r.t.d}</td><td>${r.t.w}</td><td>${r.t.l}</td><td>${r.t.d}</td><td>${pct(r.t).toFixed(3).replace(/^0/, '')}</td><td>${i ? r.gb.toFixed(1) : '-'}</td>
    ${small ? '' : `<td>${r.t.rs}</td><td>${r.t.ra}</td><td>${Math.round(r.t.pop)}</td>`}</tr>`).join('')}
  </table></div>`;
}

function renderStand() {
  if (!UI.lg) UI.lg = myTeam().lg;
  const lg = UI.lg;
  const ls = leaders(lg);
  const gp = Math.max(1, gamesPlayed(S.teams.find(t => t.lg === lg)));
  const hist = S.history.length ? `<table class="tbl"><tr><th>年</th><th>日本一</th><th>${h(myTeam().short)}のリーグの優勝</th><th>${h(myTeam().short)}</th></tr>${S.history.map(x => `<tr><td>${x.year}</td><td class="l">${h(x.jp || x.champ || '')}</td><td class="l">${h(x.lgChamp || '')}</td><td class="l">${x.rank}位（${x.w}勝${x.l}敗${x.d}分）${x.post ? ` ${h(x.post)}` : ''}</td></tr>`).join('')}</table>` : '<p class="muted">まだありません</p>';
  return `
  <div class="grid2">${LEAGUES.map(l => `<section class="card"><h2>${LEAGUE_NAME[l]}</h2>${standTable(standings(l), false)}</section>`).join('')}</div>
  <section class="card"><div class="row"><h2>個人成績トップ5</h2>
    <div class="seg">${LEAGUES.map(l => `<button class="${l === lg ? 'on' : ''}" data-act="lg" data-lg="${l}">${LEAGUE_NAME[l]}</button>`).join('')}</div></div>
    <p class="muted">打率は${Math.ceil(gp * 3.1)}打席以上、防御率は${gp}回以上が対象</p>
    <div class="leaders">${ls.map(c => `<div><h3>${c.name}</h3><ol>${c.list.map(p => `<li>${teamChip(S.teams[p.teamId])} ${nameCell(p)} <b>${c.fmt(p)}</b></li>`).join('') || '<li class="muted">該当なし</li>'}</ol></div>`).join('')}</div>
  </section>
  <section class="card"><h2>歴代</h2>${hist}</section>
  ${renderStandHist()}`;
}

function renderStandHist() {
  const H = S.standHist || [];
  if (!H.length) return '<section class="card"><h2>過去の順位</h2><p class="muted">シーズンが終わると、ここに最終順位が残ります。</p></section>';
  if (!H.some(x => x.year === UI.histYear)) UI.histYear = H[0].year;
  const y = H.find(x => x.year === UI.histYear);
  const table = rows => `<div class="scroll"><table class="tbl"><tr><th>順</th><th>球団</th><th>勝</th><th>敗</th><th>分</th><th>勝率</th><th>差</th><th>得点</th><th>失点</th></tr>
    ${rows.map((r, i) => `<tr class="${r.id === S.myTeamId ? 'me' : ''}"><td>${i + 1}</td><td class="l"><span class="chip" style="background:${r.color}">${h(r.short)}</span> ${h(r.name)}${y.jp === r.name ? ' <span class="tag awaken-tag">日本一</span>' : ''}</td>
      <td>${r.w}</td><td>${r.l}</td><td>${r.d}</td><td>${(r.w + r.l ? r.w / (r.w + r.l) : 0).toFixed(3).replace(/^0/, '')}</td><td>${i ? r.gb.toFixed(1) : '-'}</td><td>${r.rs != null ? r.rs : '-'}</td><td>${r.ra != null ? r.ra : '-'}</td></tr>`).join('')}</table></div>`;
  return `<section class="card"><div class="row"><h2>過去の順位</h2>
    <select data-chg="histYear">${H.map(x => `<option value="${x.year}" ${x.year === UI.histYear ? 'selected' : ''}>${x.year}年</option>`).join('')}</select></div>
    <p>${y.year}年（${y.games}試合）${y.jp ? ` ・ 日本一：<b>${h(y.jp)}</b>` : ''}</p>
    <div class="grid2">${LEAGUES.map(lg => `<div><h3>${LEAGUE_NAME[lg]}${(y.slim || []).includes(lg) ? ' <span class="muted small">（整理済み：得点・失点は消しました）</span>' : ''}</h3>${table(y.lg[lg].map(histRow))}</div>`).join('')}</div>
  </section>`;
}

// ---------- 記録・歴史・殿堂 ----------
const recFmt = k => (k === 'avg' || k === 'ops' ? v => v.toFixed(3).replace(/^0/, '') : k === 'era' ? v => v.toFixed(2) : v => v);
// 記録の中の名前（いる選手は押すと詳細が開く。引退した選手は名前だけ）
const pName = (id, name) => (S.players[id] ? `<a href="#" data-act="player" data-pid="${id}">${h(name)}</a>` : h(name));

function renderRecords() {
  const v = UI.recView;
  const seg = [['hist', '年表'], ['season', 'シーズン記録'], ['career', '通算記録'], ['hof', '殿堂入り'], ['team', '球団の記録']];
  const body = v === 'season' ? recSeason() : v === 'career' ? recCareer() : v === 'hof' ? recHof() : v === 'team' ? recTeam() : recHist();
  return `<section class="card"><h2>記録・歴史・殿堂</h2>
    <div class="seg">${seg.map(([k, n]) => `<button class="${v === k ? 'on' : ''}" data-act="recView" data-k="${k}">${n}</button>`).join('')}</div>
    ${body}</section>`;
}

// 年表：優勝・日本一・MVP と、その年のタイトル
function recHist() {
  const H = S.standHist || [];
  if (!H.length) return '<p class="muted">シーズンが終わると、ここに年ごとの優勝やタイトルが残ります。</p>';
  const aw = y => (S.awardHist.find(x => x.year === y) || { list: [] }).list;
  const mvp = (y, lg) => { const a = aw(y).find(x => x.title === 'MVP' && x.lg === lg); return a ? `${pName(a.pid, a.name)}<span class="muted">（${h(a.team)}）</span>` : '-'; };
  const mine = y => S.history.find(x => x.year === y);
  const rows = H.map(y => {
    const m = mine(y.year);
    return `<tr><td>${y.year}</td>${LEAGUES.map(lg => `<td class="l">${teamTag(histRow(y.lg[lg][0]))}</td>`).join('')}<td class="l">${y.jp ? `🏆 ${h(y.jp)}` : '-'}</td>
      ${LEAGUES.map(lg => `<td class="l">${mvp(y.year, lg)}</td>`).join('')}<td class="l">${m ? `${m.rank}位${m.post ? ` ${h(m.post)}` : ''}` : '-'}</td></tr>`;
  }).join('');
  if (!H.some(x => x.year === UI.recYear)) UI.recYear = H[0].year;
  const list = aw(UI.recYear);
  const detail = list.length ? `<div class="grid2">${LEAGUES.map(lg => `<div><h3>${LEAGUE_NAME[lg]}</h3><table class="tbl">${list.filter(a => a.lg === lg)
    .map(a => `<tr><td class="l">${h(a.title)}</td><td class="l">${pName(a.pid, a.name)}<span class="muted">（${h(a.team)}）</span></td><td>${h(String(a.val))}</td></tr>`).join('')}</table></div>`).join('')}</div>`
    : '<p class="muted">この年のタイトルの記録はありません。</p>';
  const slimNote = ((S.awardHist.find(x => x.year === UI.recYear) || {}).slim || []).map(lg => LEAGUE_NAME[lg]);
  return `<div class="scroll"><table class="tbl"><tr><th>年</th>${LEAGUES.map(lg => `<th>${LEAGUE_NAME[lg]}優勝</th>`).join('')}<th>日本一</th>${LEAGUES.map(lg => `<th>${LEAGUE_NAME[lg]}MVP</th>`).join('')}<th>${h(myTeam().short)}</th></tr>${rows}</table></div>
    <div class="row"><h3>タイトル</h3><select data-chg="recYear">${H.map(x => `<option value="${x.year}" ${x.year === UI.recYear ? 'selected' : ''}>${x.year}年</option>`).join('')}</select></div>
    ${slimNote.length ? `<p class="muted small">${slimNote.join('・')}は整理したので、MVP のほかのタイトルは消してあります（選手の詳細にはまだ残っています）。</p>` : ''}
    ${detail}
    ${slimPanel(H)}`;
}

// 古い年の記録の整理
function slimPanel(H) {
  if (H.length < 2) return '';
  const years = H.map(x => x.year);
  if (!years.includes(UI.slimUntil)) UI.slimUntil = years[Math.min(years.length - 1, 10)] || years[years.length - 1];
  const myLg = myTeam().lg, other = LEAGUES.find(l => l !== myLg);
  const lgs = UI.slimScope === 'both' ? LEAGUES : [other];
  const save = slimSaving(UI.slimUntil, lgs);
  const from = years[years.length - 1];
  return `<details class="slim"><summary>🧹 古い年の記録を整理する（セーブを軽くする）</summary>
    <p>選んだ年までの<b>順位表の得点・失点</b>と、<b>MVP 以外のタイトルの一覧</b>を消します。</p>
    <p class="muted small">残るもの：優勝・日本一・MVP・各球団の順位と勝敗・球団の記録・シーズン記録・通算記録・殿堂入り。
      まだいる選手が取ったタイトルは、選手の詳細と殿堂入りの点には残ります。</p>
    <p><select data-chg="slimUntil">${years.map(y => `<option value="${y}" ${y === UI.slimUntil ? 'selected' : ''}>${from}〜${y}年</option>`).join('')}</select>
      <select data-chg="slimScope"><option value="other" ${UI.slimScope !== 'both' ? 'selected' : ''}>${LEAGUE_NAME[other]}（自分のいないリーグ）だけ</option><option value="both" ${UI.slimScope === 'both' ? 'selected' : ''}>両リーグ</option></select></p>
    <p>${save > 0 ? `だいたい <b>${save.toLocaleString()}文字</b> 軽くなります（いまのセーブは約${JSON.stringify(S).length.toLocaleString()}文字）。` : 'この範囲は、もう整理してあります。'}</p>
    <p><button class="danger" data-act="slimNow" ${save > 0 ? '' : 'disabled'}>整理する（元に戻せません）</button></p></details>`;
}

function teamTag(r) { return r ? `<span class="chip" style="background:${r.color}">${h(r.short)}</span> <span class="muted">${r.w}勝</span>` : '-'; }

function recSeason() {
  const R = S.records.season;
  if (!SEASON_REC.some(r => (R[r.k] || []).length)) return '<p class="muted">シーズンが終わると、歴代のシーズン記録（トップ10）がここに残ります。</p>';
  return `<p class="muted">歴代のトップ${REC_TOP}です。打率・OPS・防御率は規定に届いた選手だけ。今季の記録は、レギュラーシーズンが終わったときに入ります。</p>
    <div class="leaders">${SEASON_REC.map(r => `<div><h3>${r.name}</h3><ol>${(R[r.k] || []).map(x => `<li class="${S.players[x.pid] && S.players[x.pid].teamId === S.myTeamId ? 'me' : ''}">${pName(x.pid, x.name)} <b>${recFmt(r.k)(x.v)}</b> <span class="muted">${h(x.team)}・${x.year}${x.games !== 143 ? `（${x.games}試合）` : ''}</span></li>`).join('') || '<li class="muted">まだなし</li>'}</ol></div>`).join('')}</div>`;
}

function careerPool() {
  const act = Object.values(S.players).filter(p => p.teamId != null || S.freeAgents.includes(p.id))
    .map(p => ({ id: p.id, name: p.name, c: careerTotal(p), active: true, team: p.teamId != null ? S.teams[p.teamId].short : '自由契約', bat: canBat(p), isP: canPitch(p) }));
  const ret = S.retired.map(r => ({ id: r.id, name: r.name, c: r.c, active: false, team: r.teams.join('→'), bat: r.bat, isP: r.isP, hof: r.hof }));
  return act.concat(ret);
}

function recCareer() {
  const pool = careerPool();
  const top = k => pool.filter(x => x.c[k] > 0).sort((a, b) => b.c[k] - a.c[k]).slice(0, REC_TOP);
  // 節目の記録に近づいている現役選手
  const near = [];
  pool.filter(x => x.active).forEach(x => MILESTONES.forEach(m => {
    const need = byGames(m.n), have = x.c[m.k];
    if (have < need && have >= need * 0.75) near.push({ x, m, need, have });
  }));
  near.sort((a, b) => (b.have / b.need) - (a.have / a.need));
  return `<p class="muted">現役と、記録を残して引退した選手の通算です。<span class="tag">現役</span>が付いている選手は、まだ記録を伸ばせます。</p>
    <div class="leaders">${CAREER_REC.map(([k, n]) => `<div><h3>${n}</h3><ol>${top(k).map(x => `<li>${x.active ? pName(x.id, x.name) : h(x.name)} <b>${x.c[k]}</b> <span class="muted">${h(x.team)}</span>${x.active ? '<span class="tag">現役</span>' : ''}${x.hof ? '<span class="tag awaken-tag">殿堂</span>' : ''}</li>`).join('') || '<li class="muted">まだなし</li>'}</ol></div>`).join('')}</div>
    <h3>節目の記録が近い現役選手</h3>
    ${near.length ? `<ul class="news">${near.slice(0, 12).map(n => `<li>${pName(n.x.id, n.x.name)} <span class="muted">${h(n.x.team)}</span>：${n.m.label}まで あと<b>${n.need - n.have}</b>（いま${n.have}）</li>`).join('')}</ul>` : '<p class="muted">いまはいません。</p>'}
    <p class="muted small">節目：${MILESTONES.map(m => `${m.label.replace(/\d+/, byGames(m.n))}`).join('・')}${S.games !== 143 ? `（${S.games}試合のシーズンに合わせています）` : ''}</p>`;
}

function careerLine(r) {
  const c = r.c, out = [];
  if (r.bat && c.pa) out.push(`${c.g}試合 打率${U.avg(c.h, c.ab)} ${c.h}安打 ${c.hr}本 ${c.rbi}打点 ${c.sb}盗塁`);
  if (r.isP && c.pg) out.push(`${c.pg}登板 ${c.w}勝${c.l}敗${c.sv ? ` ${c.sv}S` : ''} 防御率${U.era(c.per, c.outs)} ${c.pk}奪三振`);
  return out.join(' ／ ');
}

function recHof() {
  const hof = S.retired.filter(r => r.hof), others = S.retired.filter(r => !r.hof);
  const card = r => `<div class="hof-card ${r.hof ? 'hof' : ''} ${r.my ? 'mine' : ''}"><div class="hof-name"><button class="star-btn ${r.star ? 'on' : ''} ${r.hof ? 'hof-star' : ''}" data-act="retStar" data-id="${r.id}" title="${r.hof ? '殿堂入りの星（外すと、古い順に消えることがあります）' : '星を付けると消えません'}">${r.star ? '★' : '☆'}</button>${r.hof ? '🏛️ ' : ''}<b>${h(r.name)}</b> <span class="muted">${h(r.pos)}・${r.from}〜${r.to}年・${h(r.teams.join('→'))}</span>${r.my ? '<span class="tag">わがチームのOB</span>' : ''}${r.draft ? ` <span class="muted small">${h(r.draft)}</span>` : ''}</div>
    <div>${careerLine(r)}</div>
    ${r.ms.length ? `<div class="atitle">${r.ms.map(h).join('・')}</div>` : ''}
    ${r.titles.length ? `<div class="muted small">🏆 ${r.titles.map(h).join('、')}</div>` : ''}</div>`;
  return `<p class="muted">引退した選手のうち、${MILESTONES.map(m => m.label.replace(/\d+/, byGames(m.n))).join('・')}のどれかに届いた選手と、タイトルや長い活躍で大きな記録を残した選手が殿堂入りします。</p>
    <p class="muted small">殿堂入りの選手には、はじめから<span class="hof-star-sample">★</span>が付いていて、ずっと残ります。★を外すと、ほかの選手と同じように古い順に消えることがあります。</p>
    <h3>殿堂入り（${hof.length}人${hof.some(r => !r.star) ? `・★を外した${hof.filter(r => !r.star).length}人` : ''}）</h3>${hof.length ? hof.map(card).join('') : '<p class="muted">まだいません。名選手が引退すると、ここに入ります。</p>'}
    <h3>記録を残して引退した選手（${others.length}人・★${others.filter(r => r.star).length}人）</h3>
    <p class="muted small">☆を押して★にした選手は、ずっと残ります。★のない選手は（★を外した殿堂入りの選手もふくめて）、新しい${RETIRED_KEEP}人と、通算記録のトップ${REC_TOP}に入っている選手だけが残り、それより古い選手は引退する選手が出るたびに消えていきます。</p>
    ${others.length ? others.map(card).join('') : '<p class="muted">まだいません。</p>'}`;
}

// 球団ごとの優勝回数・最多勝利のシーズン
function recTeam() {
  const H = S.standHist || [];
  if (!H.length) return '<p class="muted">シーズンが終わると、球団ごとの記録がここに残ります。</p>';
  const rows = S.teams.map(t => {
    const seasons = H.map(y => { const i = y.lg[t.lg].findIndex(r => r.id === t.id); return i < 0 ? null : { ...histRow(y.lg[t.lg][i]), rank: i + 1, year: y.year, games: y.games, jp: y.jp === t.name }; }).filter(Boolean);
    const best = seasons.slice().sort((a, b) => b.w / Math.max(1, b.w + b.l) - a.w / Math.max(1, a.w + a.l))[0];
    return { t, lgWin: seasons.filter(s => s.rank === 1).length, jp: seasons.filter(s => s.jp).length, best, last: seasons.filter(s => s.rank === 6).length };
  }).sort((a, b) => b.jp - a.jp || b.lgWin - a.lgWin);
  const allSeasons = [];
  H.forEach(y => LEAGUES.forEach(lg => y.lg[lg].forEach((r, i) => allSeasons.push({ ...histRow(r), year: y.year, rank: i + 1, games: y.games }))));
  const pctOf = r => r.w / Math.max(1, r.w + r.l);
  const bestAll = allSeasons.slice().sort((a, b) => pctOf(b) - pctOf(a)).slice(0, 5);
  const worstAll = allSeasons.slice().sort((a, b) => pctOf(a) - pctOf(b)).slice(0, 5);
  const sline = r => `<li><span class="chip" style="background:${r.color}">${h(r.short)}</span> ${r.year}年 <b>${r.w}勝${r.l}敗${r.d}分</b>（勝率${pctOf(r).toFixed(3).replace(/^0/, '')}・${r.rank}位）</li>`;
  return `<div class="scroll"><table class="tbl"><tr><th>球団</th><th>日本一</th><th>リーグ優勝</th><th>最下位</th><th>いちばん良かった年</th></tr>
    ${rows.map(x => `<tr class="${x.t.id === S.myTeamId ? 'me' : ''}"><td class="l">${teamChip(x.t)} ${h(x.t.name)}</td><td>${x.jp}</td><td>${x.lgWin}</td><td>${x.last}</td>
      <td class="l">${x.best ? `${x.best.year}年 ${x.best.w}勝${x.best.l}敗（${x.best.rank}位）` : '-'}</td></tr>`).join('')}</table></div>
    <div class="grid2"><div><h3>歴代の最高勝率</h3><ol class="plain">${bestAll.map(sline).join('')}</ol></div><div><h3>歴代の最低勝率</h3><ol class="plain">${worstAll.map(sline).join('')}</ol></div></div>`;
}

// ---------- 経営 ----------
function renderMoney() {
  const t = myTeam();
  const f = t.fin;
  const inc = f.gate + f.food + (f.tv || 0) + f.goods + f.sponsor + f.other, exp = f.salary + f.ops + f.invest;
  const facs = Object.keys(FACILITIES).map(k => {
    const lv = t.fac[k];
    const cost = facilityCost(lv);
    return `<tr><td class="l"><b>${FACILITIES[k].name}</b><br><span class="muted">${FACILITIES[k].desc}</span></td><td>${'■'.repeat(lv)}${'□'.repeat(FAC_MAX - lv)} Lv${lv}</td>
      <td>${lv < FAC_MAX ? `<button data-act="upgrade" data-k="${k}" ${t.money < cost ? 'disabled' : ''}>改修 ${U.money(cost)}</button>` : '最大'}</td></tr>`;
  }).join('');
  const fc = (S.foreignCands || []).map(id => S.players[id]).filter(Boolean);
  const fcHtml = fc.length ? `<div class="scroll"><table class="tbl"><tr><th>名前</th><th>守</th><th>年</th><th>能力</th><th>年俸</th><th></th></tr>
    ${fc.map(p => `<tr><td class="l">${nameCell(p)}</td><td>${posBadge(p)}</td><td class="nowrap">${p.age}${phaseMark(p)}</td>
      <td class="l">${abilKeys(p).map(k => `${SHORT_LABEL[k]}${k === 'velo' ? veloKmh(p.a.velo) + 'km' : `<span class="g g${U.grade(p.a[k])}">${U.grade(p.a[k])}</span>`}`).join(' ')}${trajTag(p)}</td>
      <td>${U.money(p.salary)}</td><td><button data-act="signForeign" data-pid="${p.id}">契約（契約金${U.money(p.salary * 0.5)}）</button></td></tr>`).join('')}</table></div>` : '';
  return `
  <div class="grid2">
    <section class="card"><h2>今季の収支</h2>
      <table class="tbl money">
        <tr><th class="l">入場料</th><td>${U.money(f.gate)}</td></tr>
        <tr><th class="l">飲食</th><td>${U.money(f.food)}</td></tr>
        <tr><th class="l">放映権</th><td>${U.money(f.tv || 0)}</td></tr>
        <tr><th class="l">グッズ</th><td>${U.money(f.goods)}</td></tr>
        <tr><th class="l">スポンサー</th><td>${U.money(f.sponsor)}</td></tr>
        <tr><th class="l">その他</th><td>${U.money(f.other)}</td></tr>
        <tr><th class="l">年俸</th><td class="neg">${U.money(-f.salary)}</td></tr>
        <tr><th class="l">球場運営費</th><td class="neg">${U.money(-f.ops)}</td></tr>
        <tr><th class="l">投資（施設・補強）</th><td class="neg">${U.money(-f.invest)}</td></tr>
        <tr><th class="l">差し引き</th><td class="${inc - exp < 0 ? 'neg' : ''}"><b>${U.money(inc - exp)}</b></td></tr>
      </table>
      <p>資金 <b>${U.money(t.money)}</b> ・ 年俸総額 ${U.money(payroll(t))}/年</p>
    </section>
    <section class="card"><h2>チケットと人気</h2>
      <p>人気 <b>${Math.round(t.pop)}</b> / 100</p><div class="bt wide"><span style="width:${t.pop}%"></span></div>
      <p>チケット代 <b>${TICKET_PRICE.toLocaleString()}円</b>（固定）・ 球場の定員 ${capacity(t).toLocaleString()}人</p>
      <p>ホーム 1 試合の入場料 およそ <b>${U.money(capacity(t) * U.clamp(0.62 + (t.pop - 50) / 250, 0.4, 1) * TICKET_PRICE / 10000)}</b></p>
      <p class="muted">入場料はほぼ決まった収入です。ファンが多い（人気が高い）と少しだけ増えます。大きく稼ぐならグッズを。</p>
    </section>
  </div>
  ${renderGoods(t)}
  <section class="card"><h2>施設</h2><table class="tbl">${facs}</table></section>
  <section class="card"><h2>助っ人外国人</h2>
    <p>海外に調査を出すと、候補が 3 人見つかります（調査費 ${U.money(FOREIGN_SCOUT_COST)}）。</p>
    <button data-act="scoutForeign">調査に出す</button>
    ${fcHtml}
  </section>`;
}

function renderGoods(t) {
  const types = Object.keys(GOODS_TYPES);
  if (!GOODS_TYPES[UI.goodsType]) UI.goodsType = types[0];
  const ty = GOODS_TYPES[UI.goodsType];
  const ps = teamPlayers(t).sort((a, b) => b.fame - a.fame);
  if (ty.player && !ps.some(p => p.id === UI.goodsPid)) UI.goodsPid = ps.length ? ps[0].id : null;
  const draft = { type: UI.goodsType, pid: ty.player ? UI.goodsPid : null, dev: 1, sold: 0 };
  const est = goodsRate(t, draft);
  const pickP = S.players[UI.goodsPid];
  const playerSel = ty.player ? `<select data-chg="goodsPid">${ps.map(p => `<option value="${p.id}" ${p.id === UI.goodsPid ? 'selected' : ''}>${h(p.name)}（人気${Math.round(p.fame)}・${visualStars(p.visual)}）</option>`).join('')}</select>` : '<span class="muted">球団のグッズ（球団の人気で売れる）</span>';
  const rows = t.goods.map(g => {
    const p = g.pid != null ? S.players[g.pid] : null;
    const state = g.dev > 0 ? `<span class="tag">開発中 あと${g.dev}試合</span>` : `販売中（${g.sold}試合）`;
    return `<tr><td class="l"><b>${h(goodsName(g))}</b>${p ? `<br><span class="muted">人気${Math.round(p.fame)} ・ ${visualStars(p.visual)}</span>` : ''}</td><td>${state}</td>
      <td>${g.dev > 0 ? '-' : Math.round(goodsFresh(g) * 100) + '%'}</td><td>${U.money(goodsRate(t, g))}</td><td>${U.money(g.season)}</td><td>${U.money(g.total)}</td>
      <td><button class="sm" data-act="stopGoods" data-id="${g.id}">販売終了</button></td></tr>`;
  }).join('');
  return `
  <section class="card"><h2>グッズ開発</h2>
    <p class="muted">選手のグッズは、その選手の <b>人気度</b>（活躍で上がり、活躍しないと下がる）と <b>ビジュアル</b>（★）で売れ行きが変わります。
      出たばかりはよく売れ、だんだん飽きられます。選手が移籍・引退すると販売終了。グッズを作ってもらった選手は球団への忠誠心が上がります。</p>
    <div class="row" style="justify-content:flex-start">
      <select data-chg="goodsType">${types.map(k => `<option value="${k}" ${k === UI.goodsType ? 'selected' : ''}>${GOODS_TYPES[k].name}（${U.money(GOODS_TYPES[k].cost)}）</option>`).join('')}</select>
      ${playerSel}
      <button class="primary" data-act="devGoods" ${t.goods.length >= GOODS_MAX || t.money < ty.cost ? 'disabled' : ''}>開発する</button>
    </div>
    <p>開発費 <b>${U.money(ty.cost)}</b> ・ 発売まで ${ty.days}試合 ・ 発売直後の見込み ホーム1試合 <b>${U.money(est)}</b>（ビジターの日は通販で${Math.round(AWAY_SALES * 100)}%）
      ${ty.player && ty.visual >= 1 ? '<span class="tag">ビジュアルが効く</span>' : ''}${ty.player && pickP && pickP.inj ? '<span class="tag bad">故障中</span>' : ''}</p>
    <h3>販売中のグッズ（${t.goods.length}/${GOODS_MAX}）</h3>
    ${rows ? `<div class="scroll"><table class="tbl"><tr><th>グッズ</th><th>状態</th><th>鮮度</th><th>ホーム1試合</th><th>今季売上</th><th>通算</th><th></th></tr>${rows}</table></div>` : '<p class="muted">まだありません。</p>'}
  </section>`;
}

// ---------- トレード ----------
function renderTrade() {
  if (!tradeOpen()) {
    return `<section class="card"><h2>トレード</h2><p>${S.phase === 'off' ? 'オフのキャンプ前（ドラフトの後）に再開します。' : S.phase === 'post' ? 'ポストシーズン中はできません。' : 'トレード期限（7月末）を過ぎました。オフに再開します。'}</p></section>`;
  }
  const T = UI.trade;
  if (T.team == null || T.team === S.myTeamId) T.team = S.teams.find(t => t.id !== S.myTeamId).id;
  const other = S.teams[T.team], me = myTeam();
  const list = (team, sel, side) => teamPlayers(team).sort((a, b) => a.isP - b.isP || ovr(b) - ovr(a)).map(p => `
    <tr class="${sel.includes(p.id) ? 'sel' : ''}"><td><input type="checkbox" data-chg="tsel" data-side="${side}" data-pid="${p.id}" ${sel.includes(p.id) ? 'checked' : ''}></td>
    <td class="l">${nameCell(p)}</td><td>${posBadge(p)}</td><td class="nowrap">${p.age}${phaseMark(p)}</td><td>${Math.round(ovr(p))}</td><td>${tradeValue(p).toLocaleString()}</td></tr>`).join('');
  const vGive = U.sum(T.give.map(id => S.players[id]).filter(Boolean), tradeValue);
  const vGet = U.sum(T.get.map(id => S.players[id]).filter(Boolean), tradeValue);
  const ratio = vGet ? vGive / vGet : (vGive ? 2 : 0);
  const mood = !vGive && !vGet ? '選手を選んでください' : ratio >= 1.08 ? '😊 相手は乗り気です' : ratio >= 0.9 ? '🤔 もう一声…' : '😠 話になりません';
  const head = '<tr><th></th><th>名前</th><th>守</th><th>年</th><th>総合</th><th>価値</th></tr>';
  return `
  <section class="card">
    <div class="row"><h2>トレード</h2>
      <select data-chg="tteam">${LEAGUES.map(lg => `<optgroup label="${LEAGUE_NAME[lg]}">${S.teams.filter(t => t.lg === lg && t.id !== S.myTeamId).map(t => `<option value="${t.id}" ${t.id === T.team ? 'selected' : ''}>${h(t.name)}</option>`).join('')}</optgroup>`).join('')}</select></div>
    <p>出す価値 <b>${vGive.toLocaleString()}</b> ⇔ もらう価値 <b>${vGet.toLocaleString()}</b>　${mood}</p>
    <button class="primary" data-act="propose">この条件で申し込む</button>
    <div class="grid2">
      <div><h3>${teamChip(me)} 出す選手</h3><div class="scroll"><table class="tbl">${head}${list(me, T.give, 'give')}</table></div></div>
      <div><h3>${teamChip(other)} もらう選手</h3><div class="scroll"><table class="tbl">${head}${list(other, T.get, 'get')}</table></div></div>
    </div>
  </section>`;
}

// ---------- 自由契約 ----------
function renderFA() {
  const t = myTeam();
  const open = faOpen();
  const list = S.freeAgents.map(id => S.players[id]).filter(p => p && posMatch(p, UI.posf.fa)).sort((a, b) => a.isP - b.isP || ovr(b) - ovr(a));
  const row = p => {
    const keys = abilKeys(p);
    const fee = Math.round(p.salary * 0.2);
    const can = open && t.players.length < ROSTER_MAX && t.money >= fee;
    return `<tr><td class="l">${nameCell(p)}</td><td>${posBadge(p)}</td><td class="nowrap">${p.age}${phaseMark(p)}</td><td>${p.type}</td><td class="stars">${potStars(p.pot)}</td>
      <td class="l">${keys.map(k => `${SHORT_LABEL[k]}${k === 'velo' ? veloKmh(p.a.velo) + 'km' : `<span class="g g${U.grade(p.a[k])}">${U.grade(p.a[k])}</span>`}`).join(' ')}${trajTag(p)}</td>
      <td>${Math.round(ovr(p))}</td><td>${h(p.lastTeam || '-')}</td><td>${U.money(p.salary)}</td>
      <td><button class="sm primary" data-act="signFA" data-pid="${p.id}" ${can ? '' : 'disabled'}>契約（契約金${U.money(fee)}）</button></td></tr>`;
  };
  const head = '<tr><th>名前</th><th>守</th><th>年</th><th>型</th><th>才能</th><th>能力</th><th>総合</th><th>前所属</th><th>希望年俸</th><th></th></tr>';
  const block = arr => (isMobile()
    ? cardList(arr, p => {
      const fee = Math.round(p.salary * 0.2);
      const can = open && t.players.length < ROSTER_MAX && t.money >= fee;
      return playerCard(p, { sub: `<span>${p.type}</span><span class="muted">才能</span><span class="stars">${potStars(p.pot)}</span>`,
        lines: `<div class="pc-line">前所属 ${h(p.lastTeam || '-')} ・ 希望年俸 ${U.money(p.salary)}</div>`,
        action: `<button class="sm primary" data-act="signFA" data-pid="${p.id}" ${can ? '' : 'disabled'}>契約（契約金${U.money(fee)}）</button>` });
    })
    : `<div class="scroll"><table class="tbl">${head}${arr.map(row).join('')}</table></div>`);
  return `
  <section class="card"><h2>自由契約選手</h2>
    <p>${open ? '<b>いま契約できます。</b>' : '<b>いまは契約できません。</b>'}
      契約できるのは <b>オフの契約更改〜開幕前</b> と <b>シーズン中の7月末まで</b>。自分の選手を自由契約にできるのは <b>オフの契約更改〜開幕前</b> だけです。</p>
    <p class="muted">他球団から戦力外になった選手や、独立リーグの選手です。希望年俸は安めですが、2 年続けて決まらないと引退します。
      他球団も人数が足りないとここから選手を取ります。</p>
    ${posCounts()}
    ${needsCard('fa')}
    ${posFilter('fa')}
    ${list.length ? `${list.some(p => !p.isP) ? `<h3>野手</h3>${block(list.filter(p => !p.isP))}` : ''}
      ${list.some(p => p.isP) ? `<h3>投手</h3>${block(list.filter(p => p.isP))}` : ''}` : '<p class="muted">該当する選手はいません。</p>'}
  </section>`;
}

// ---------- オフシーズン ----------
function renderOff() {
  const O = S.off;
  const steps = [['awards', '表彰'], ['fa', 'FA'], ['contract', '契約更改'], ['draft', 'ドラフト'], ['camp', 'キャンプ']];
  const bar = `<div class="steps">${steps.map(([k, n]) => `<span class="${O.step === k ? 'on' : ''}">${n}</span>`).join('→')}</div>`;
  let body = '';
  if (O.step === 'awards') {
    body = `
    <section class="card"><h2>${S.year}年 シーズン終了</h2>
      <p class="big-text">日本一：${h(O.champ)}</p>
      <p>${h(myTeam().name)}は ${LEAGUE_NAME[myTeam().lg]} <b>${O.rank}位</b>（${myTeam().w}勝${myTeam().l}敗${myTeam().d}分）${O.post ? ` ・ <b>${h(O.post)}</b>` : ''}${O.prize ? `　賞金 ${U.money(O.prize)}` : ''}</p>
      <div class="grid2">${LEAGUES.map(lg => `<div><h3>${LEAGUE_NAME[lg]}</h3>${standTable(standings(lg), true)}</div>`).join('')}</div>
    </section>
    <section class="card"><h2>表彰</h2><div class="grid2">${LEAGUES.map(lg => `<div><h3>${LEAGUE_NAME[lg]}</h3><table class="tbl">${O.awards.filter(a => (a.lg || lg) === lg).map(a => `<tr class="${S.players[a.pid] && S.players[a.pid].teamId === S.myTeamId ? 'me' : ''}"><th class="l">${a.title}</th><td class="l">${h(a.name)}（${h(a.team)}）</td><td>${a.val}</td></tr>`).join('')}</table></div>`).join('')}</div>
      <button class="primary big" data-act="offNext">FAへ ▶</button></section>`;
  } else if (O.step === 'fa') {
    body = renderFAStep();
  } else if (O.step === 'contract') {
    const c = O.contract;
    body = `
    <section class="card"><h2>引退・退団</h2>${c.retired.length ? `<ul>${c.retired.map(r => `<li>${h(r.name)}（${r.age}歳）${r.why}</li>`).join('')}</ul>` : '<p>いません。</p>'}</section>
    <section class="card"><h2>契約更改</h2><p class="muted">成績と能力で来季の年俸が決まりました。選手は 1 つ歳を取りました。</p>
      <div class="scroll"><table class="tbl"><tr><th>名前</th><th>守</th><th>年齢</th><th>総合</th><th>今季</th><th>来季</th><th>増減</th></tr>
      ${c.raises.filter(r => S.players[r.pid] && S.players[r.pid].teamId === S.myTeamId).map(r => { const p = S.players[r.pid]; return `<tr><td class="l">${nameCell(p)}</td><td>${posBadge(p)}</td><td class="nowrap">${p.age}${phaseMark(p)}</td><td>${Math.round(ovr(p))}</td><td>${U.money(r.old)}</td><td>${U.money(r.now)}</td><td class="${r.now >= r.old ? 'win' : 'lose'}">${r.locked ? '<span class="muted">複数年契約</span>' : `${r.now >= r.old ? '+' : ''}${U.money(r.now - r.old)}`}</td></tr>`; }).join('')}
      </table></div>
      <p>来季の年俸総額 <b>${U.money(payroll(myTeam()))}</b></p>
      <button class="primary big" data-act="offNext">ドラフトへ ▶</button></section>`;
  } else if (O.step === 'draft') {
    body = renderDraft();
  } else if (O.step === 'camp') {
    const t = myTeam();
    const over = t.players.length - ROSTER_MAX;
    body = `
    <section class="card"><h2>キャンプ前の準備</h2>
      <p>いまの人数 <b>${t.players.length}人</b>（上限${ROSTER_MAX}人）</p>
      ${over > 0 ? `<p class="neg">あと${over}人、戦力外通告（自由契約）かトレードで減らしてください。下の一覧からできます。</p>` : ''}
      <p>トレード・自由契約選手や外国人の補強・自由契約（戦力外）・施設の改修・オーダーの見直しができます。準備ができたら春のキャンプへ。</p>
      <p class="muted">他球団の戦力外になった選手が「自由契約」の画面に並んでいます。</p>
      <button class="primary big" data-act="offNext" ${over > 0 ? 'disabled' : ''}>キャンプを行い ${S.year + 1}年シーズン開幕 ▶</button>
    </section>
    ${renderReleasePanel()}`;
  }
  return backupBanner() + bar + body + `<section class="card"><h2>ニュース</h2>${newsList(10)}</section>`;
}

// ドラフト候補の表（シーズン中のリストアップとドラフト本番で同じものを使う）
// mode: 'bid'（1 位入札）・'pick'（ウェーバーで指名）・false（見るだけ）
function prospectTable(ids, mode) {
  const pickable = !!mode;
  const pickBtn = p => (mode === 'bid'
    ? `<button class="sm primary" data-act="draftBid" data-pid="${p.id}">1位で入札</button>`
    : `<button class="sm primary" data-act="draftPick" data-pid="${p.id}">指名</button>`);
  // 並び順も見立てで決める（本当の能力が並び順から漏れないように）
  const seen = seenOvr;
  const tierTag = p => { const t = draftTier(p); return `<span class="tier t${t[2]}">${t[1]}</span>`; };
  const watch = S.watch || [];
  let pool = ids.map(id => S.players[id]).filter(Boolean);
  if (UI.watchOnly) pool = pool.filter(p => watch.includes(p.id));
  pool = pool.filter(p => posMatch(p, UI.posf.draft));
  if (UI.geniusOnly) pool = pool.filter(geniusHint);
  pool.sort((a, b) => (watch.includes(b.id) - watch.includes(a.id)) || draftScore(b) - draftScore(a));
  const rows = pool.map(p => {
    const keys = abilKeys(p);
    const A = p.amateur;
    const on = watch.includes(p.id);
    return `<tr class="${on ? 'sel' : ''}"><td><button class="star-btn ${on ? 'on' : ''}" data-act="watch" data-pid="${p.id}" title="気になる">${on ? '★' : '☆'}</button></td>
      <td class="l"><b>${h(p.name)}</b>${p.twoWay ? '<span class="tag twoway">二刀流</span>' : ''}${rebornTag(p)}${rareTag(p)}</td><td>${p.kind}</td><td>${posBadge(p)}</td><td>${p.age}</td>
      <td>${geniusHint(p) ? '<span class="tag genius">天才肌？</span>' : ''}</td><td class="stars">${potStars(scoutView(p, 'pot'))}</td><td class="stars">${visualStars(p.visual)}</td>
      <td class="l">${keys.map(k => `${SHORT_LABEL[k]}${k === 'velo' ? veloKmh(scoutView(p, k)) + 'km' : `<span class="g g${U.grade(scoutView(p, k))}">${U.grade(scoutView(p, k))}</span>`}`).join(' ')}${trajTag(p)}</td>
      <td class="l wrap amateur"><div>${tierTag(p)}</div>${A ? `<div>${h(A.team)}</div><div>${h(A.line)}</div>${A.title ? `<div class="atitle">🏆 ${h(A.title)}</div>` : ''}` : ''}
        <div class="muted">講評：${h(scoutComment(p))}</div></td>
      ${pickable ? `<td>${pickBtn(p)}</td>` : ''}</tr>`;
  }).join('');
  const cards = isMobile() ? cardList(pool, p => {
    const A = p.amateur;
    const on = watch.includes(p.id);
    return playerCard(p, {
      cls: on ? 'sel' : '', view: true, noCond: true, ovr: Math.round(seen(p)),
      lead: `<button class="star-btn ${on ? 'on' : ''}" data-act="watch" data-pid="${p.id}">${on ? '★' : '☆'}</button>`,
      name: `<b>${h(p.name)}</b>${p.twoWay ? '<span class="tag twoway">二刀流</span>' : ''}${rebornTag(p)}${rareTag(p)}${geniusHint(p) ? '<span class="tag genius">天才肌？</span>' : ''}`,
      sub: `<span>${p.kind}</span><span class="muted">才能</span><span class="stars">${potStars(scoutView(p, 'pot'))}</span><span class="muted">ビジュアル</span><span class="stars">${visualStars(p.visual)}</span>`,
      lines: `<div class="pc-line">${tierTag(p)}</div>${A ? `<div class="pc-line">${h(A.team)}<br>${h(A.line)}</div>${A.title ? `<div class="pc-line atitle">🏆 ${h(A.title)}</div>` : ''}` : ''}<div class="pc-line muted">講評：${h(scoutComment(p))}</div>`,
      action: pickable ? pickBtn(p) : '',
    });
  }) : '';
  const nGenius = ids.map(id => S.players[id]).filter(p => p && geniusHint(p)).length;
  const filters = `${posCounts()}${posFilter('draft')}<div class="row" style="justify-content:flex-start">
    <label><input type="checkbox" data-chg="watchOnly" ${UI.watchOnly ? 'checked' : ''}> ★ 気になる選手だけ（${watch.filter(id => ids.includes(id)).length}人）</label>
    <label><input type="checkbox" data-chg="geniusOnly" ${UI.geniusOnly ? 'checked' : ''}> ✨ 天才肌の気配だけ（${nGenius}人）</label></div>`;
  if (isMobile()) return filters + cards;
  return `${filters}<div class="scroll"><table class="tbl"><tr><th>★</th><th>名前</th><th>出身</th><th>守</th><th>年</th><th>天才</th><th>才能</th><th>ビジュアル</th><th>能力（見立て）</th><th>評価・アマ時代の成績・スカウト講評</th>${pickable ? '<th></th>' : ''}</tr>${rows || '<tr><td colspan="11" class="muted">該当する選手はいません</td></tr>'}</table></div>`;
}

function scoutNote() {
  const lv = myTeam().fac.scout;
  return `スカウト Lv${lv}：見えている能力は、本当の能力から<b>最大 ±${scoutRange()}</b> ずれています（たいていはその半分くらい）。
    スカウトの段階を上げるほどずれが小さくなり、Lv5 ではほぼ正確です（Lv1 ±15 → Lv2 ±10 → Lv3 ±6 → Lv4 ±3 → Lv5 ±1）。成績とタイトルは事実なので、見立てと見比べてください。評価（ドライチ級など）と総評も見立てから出しています。`;
}

// ---------- 補強のおすすめ（ドラフト・自由契約） ----------
// ポジションごとに「人数・主力の力（リーグ平均とくらべて）・主力の年齢・若手の数」を見て点をつける
const NEED_TARGET = { 先発: 12, 中継ぎ: 16, 捕: 4, 一: 3, 二: 4, 三: 4, 遊: 4, 外: 10 }; // 70 人のときの目安の人数
function posValue(p, g) { return g === '先発' ? starterVal(p) : g === '中継ぎ' ? relVal(p) : batOvr(p); }

function draftNeeds() {
  const my = myTeam();
  const top = (t, g, n) => teamPlayers(t).filter(p => posMatch(p, g)).sort((a, b) => posValue(b, g) - posValue(a, g)).slice(0, n);
  return POS_GROUPS.map(g => {
    const all = teamPlayers(my).filter(p => posMatch(p, g));
    const n = g === '先発' ? 6 : g === '中継ぎ' ? 6 : g === '外' ? 3 : 1;   // 主力として見る人数
    const mine = top(my, g, n);
    const avg = list => (list.length ? U.sum(list, p => posValue(p, g)) / list.length : 0);
    const myLevel = avg(mine);
    const league = U.sum(S.teams, t => avg(top(t, g, n))) / S.teams.length;
    const old = mine.filter(p => p.age >= 32).length;
    const young = all.filter(p => p.age <= 23).length;
    const short = Math.max(0, NEED_TARGET[g] - all.length);
    const reasons = [];
    let score = 0;
    if (short > 0) { score += short * 2; reasons.push(`人数が少ない（${all.length}人・目安${NEED_TARGET[g]}人）`); }
    if (myLevel < league - 2) { score += (league - myLevel) / 2; reasons.push(`主力の力がリーグ平均より下（${Math.round(myLevel)}・平均${Math.round(league)}）`); }
    if (old > 0 && old >= Math.ceil(n / 2)) { score += old * 1.5; reasons.push(`主力の${old}人が32歳以上`); }
    if (young === 0) { score += 2; reasons.push('23歳以下の若手がいない'); } else if (young === 1) { score += 1; reasons.push('23歳以下の若手が1人だけ'); }
    return { g, score, reasons, count: all.length };
  }).sort((a, b) => b.score - a.score);
}

function needsCard(filterKey) {
  const needs = draftNeeds().filter(x => x.score > 0).slice(0, 3);
  if (!needs.length) return '<div class="needs"><b>📋 補強のおすすめ</b>：どのポジションもそろっています。いちばん力のある選手を取りましょう。</div>';
  return `<div class="needs"><b>📋 補強のおすすめ</b>（スカウト部長より）
    <ol>${needs.map(x => `<li><a href="#" data-act="posf" data-key="${filterKey}" data-g="${x.g}"><span class="pb pb-${x.g === '先発' || x.g === '中継ぎ' ? '投' : x.g}">${x.g}</span></a>
      ${x.reasons.map(h).join('・')}</li>`).join('')}</ol>
    <p class="muted small">ポジションの印を押すと、その候補だけに絞り込めます。</p></div>`;
}

// ---------- 今年のドラフトの総評（スカウト部長の見立て） ----------
const KIND_WORD = { 高校: '高校生', 大学: '大学生', 社会人: '社会人', 高卒社会人: '高卒社会人' };
const POS_WORD = { 捕: '捕手', 一: '一塁手', 二: '二塁手', 三: '三塁手', 遊: '遊撃手', 外: '外野手', 先発: '先発投手', 中継ぎ: '中継ぎ投手' };
function draftReview(ids) {
  const ps = ids.map(id => S.players[id]).filter(Boolean);
  if (!ps.length) return '';
  const top = ps.filter(p => draftScore(p) >= DRAFT_TOP);
  const pit = top.filter(p => p.isP).length, bat = top.length - pit;
  const word = (n, lo, hi) => (n >= hi ? '豊作' : n <= lo ? '不作' : '例年並み');
  const wp = word(pit, REVIEW_LINE.P[0], REVIEW_LINE.P[1]), wb = word(bat, REVIEW_LINE.B[0], REVIEW_LINE.B[1]);
  const lines = [];
  if (wp === wb) {
    lines.push(wp === '豊作' ? '今年は<b>投手・野手ともに豊作</b>。どの球団もいい選手が取れそうです。'
      : wp === '不作' ? '今年は<b>投手・野手ともに不作</b>。上位の選手は奪い合いになりそうです。'
        : '今年は投手・野手ともに<b>例年並み</b>です。');
  } else {
    lines.push(`今年は<b>投手が${wp}</b>、<b>野手は${wb}</b>です。`);
  }
  lines.push(`上位で消えそうな選手は ${top.length}人（投手${pit}人・野手${bat}人）。`);
  const stars = top.filter(p => draftTier(p)[2] === 1).sort((a, b) => draftScore(b) - draftScore(a)).slice(0, 3);
  lines.push(stars.length
    ? `目玉は${stars.map(p => `<b>${h(p.name)}</b>（${KIND_WORD[p.kind]}・${p.isP ? '投手' : POS_WORD[p.pos]}）`).join('、')}。1位は重なりそうです。`
    : '飛び抜けた目玉はおらず、1位の入札は割れそうです。');
  // 出身ごとの多い・少ない（全体の割合とくらべて）
  const kinds = Object.keys(KIND_WORD).map(k => {
    const all = ps.filter(p => p.kind === k).length, t = top.filter(p => p.kind === k).length;
    return { k, t, r: top.length && all ? (t / top.length) / (all / ps.length) : 1 };
  }).sort((a, b) => b.r - a.r);
  if (kinds[0].r >= 1.3 && kinds[0].t >= 3) lines.push(`上位候補は${KIND_WORD[kinds[0].k]}が多め（${kinds[0].t}人）。`);
  const ready = ps.filter(p => p.kind !== '高校' && seenOvr(p) >= 58).length; // ふつうの年は 9 人くらい
  lines.push(ready >= 14 ? `すぐに使える即戦力が${ready}人と多い年です。` : ready <= 6 ? `即戦力は${ready}人と少なめで、育てて使う年です。` : `即戦力は${ready}人。`);
  const thin = ['捕', '遊'].filter(g => !top.some(p => posMatch(p, g)));
  if (thin.length) lines.push(`上位候補に${thin.map(g => POS_WORD[g]).join('・')}がいません。`);
  // 補強したいポジションとの照らし合わせ
  const need = draftNeeds().find(x => x.score > 0);
  if (need) {
    const n = top.filter(p => posMatch(p, need.g)).length;
    lines.push(`うちが補強したい<b>${POS_WORD[need.g]}</b>は、上位候補に${n}人${n >= 4 ? 'いて、狙いやすい年です' : n === 0 ? 'もおらず、中位以下で探すことになりそうです' : 'います'}。`);
  }
  return `<div class="review"><b>📰 今年のドラフト総評</b>（スカウト部長より）<p>${lines.join('<br>')}</p></div>`;
}

function renderProspects() {
  if (S.phase === 'off' && S.off.step !== 'awards' && S.off.step !== 'contract') {
    return `<section class="card"><h2>ドラフト候補</h2><p>${S.off.step === 'draft' ? 'ドラフト会議中です。「オフシーズン」の画面で指名してください。' : '今年のドラフトは終わりました。次の候補は開幕のときに発表されます。'}</p></section>`;
  }
  const ids = S.draftClass || [];
  return `
  <section class="card"><h2>${S.year}年 ドラフト候補</h2>
    <p>シーズンのあとのドラフト会議に出てくる選手です。☆を押すと「気になる選手」に入り、ドラフトで上に並びます。他球団に先に指名されるとニュースで知らせます。</p>
    <p class="muted">${scoutNote()}</p>
    ${draftReview(ids)}
    ${needsCard('draft')}
    ${prospectTable(ids, false)}
  </section>
  ${renderDraftHistory()}`;
}

// ドラフト採点の表（今年の採点と、過去の答え合わせで使う）
const GRADE_CLASS = { A: 'ga', B: 'gb', C: 'gc', D: 'gd', E: 'ge' };
const gradeMark = g => `<span class="dgrade ${GRADE_CLASS[g] || ''}">${g}</span>`;
function draftGradeCard(rows, title) {
  const sorted = rows.slice().sort((a, b) => b.pts - a.pts);
  return `<section class="card"><h2>📝 ${title}</h2>
    <p class="muted">スカウト部長の見立てで、指名した選手の評価を良い順に重みを付けて足し、12 球団の中の順位で A〜E を付けました（A 2 球団・B 3・C 4・D 2・E 1）。何年かたったら「ドラフト候補」の画面の下で答え合わせができます。</p>
    <div class="scroll"><table class="tbl"><tr><th>採点</th><th>球団</th><th>指名</th><th>点</th><th>ひとこと</th></tr>
    ${sorted.map(r => `<tr class="${r.id === S.myTeamId ? 'me' : ''}"><td>${gradeMark(r.grade)}</td><td class="l">${teamChip(S.teams[r.id])}</td><td>${r.n != null ? r.n : r.picks.length}人</td><td>${r.pts}</td><td class="l">${h(r.note || '')}</td></tr>`).join('')}
    </table></div></section>`;
}

// 過去のドラフトの答え合わせ
function renderDraftHistory() {
  const H = S.draftHist || [];
  if (!H.length) return '<section class="card"><h2>📝 過去のドラフト（答え合わせ）</h2><p class="muted">ドラフトが終わると、ここに採点が残ります。何年かたってから、指名した選手がどう育ったかを見比べられます。</p></section>';
  if (!H.some(x => x.year === UI.dhYear)) UI.dhYear = H[0].year;
  const y = H.find(x => x.year === UI.dhYear);
  const now = draftNow(y);
  const byId = id => now.find(r => r.id === id);
  const rows = y.rows.slice().sort((a, b) => byId(b.id).nowPts - byId(a.id).nowPts).map(r => {
    const n = byId(r.id);
    const up = n.grade < r.grade ? '⤴' : n.grade > r.grade ? '⤵' : '';
    return `<tr class="${r.id === S.myTeamId ? 'me' : ''}"><td class="l">${teamChip(S.teams[r.id])}</td><td>${gradeMark(r.grade)}</td><td>${gradeMark(n.grade)} ${up}</td>
      <td>${n.alive}/${n.n}人</td><td class="l">${n.best ? `${nameCell(n.best)} <span class="muted">総合${Math.round(ovr(n.best))}</span>` : '-'}</td><td>${n.titles || '-'}</td></tr>`;
  }).join('');
  const mine = y.rows.find(r => r.id === S.myTeamId);
  const myList = mine ? mine.picks.map((id, i) => {
    const p = S.players[id];
    return p ? `<li>${nameCell(p)} ${posBadge(p)} <span class="muted">${p.drafted ? `${p.drafted.round}位` : ''} ・ ${p.age}歳 ・ 総合${Math.round(ovr(p))}${p.teamId != null && p.teamId !== S.myTeamId ? ` ・ いまは${h(S.teams[p.teamId].short)}` : p.teamId == null ? ' ・ 自由契約' : ''}</span></li>`
      : `<li class="muted">${i + 1}人目：もういません（引退・退団）</li>`;
  }).join('') : '';
  return `<section class="card"><div class="row"><h2>📝 過去のドラフト（答え合わせ）</h2>
    <select data-chg="dhYear">${H.map(x => `<option value="${x.year}" ${x.year === UI.dhYear ? 'selected' : ''}>${x.year}年</option>`).join('')}</select></div>
    <p class="muted">「当時」はドラフト直後の採点、「いま」は指名した選手の今の総合（上位 3 人）とタイトルの数で付け直した採点です。引退した選手は数えません。</p>
    <div class="scroll"><table class="tbl"><tr><th>球団</th><th>当時</th><th>いま</th><th>残っている</th><th>いちばん育った選手</th><th>タイトル</th></tr>${rows}</table></div>
    ${mine ? `<h3>${h(myTeam().short)}が${y.year}年に指名した選手</h3><ul class="news">${myList}</ul>` : ''}</section>`;
}

function renderDraft() {
  const D = S.off.draft;
  const done = draftDone();
  const t = myTeam();
  const lotteryHtml = renderLotteryLog(D.r1.log);
  const res = D.result.filter(r => r.round > 1).slice().reverse().map(r => `<li>${r.round}位 ${teamChip(S.teams[r.team])} ${h(r.name)}（${r.kind}・${r.pos}）</li>`).join('');
  const orderNote = `2 巡目からはウェーバー：<b>${LEAGUE_NAME[D.first]}</b>（交流戦で勝ち越し）の最下位から、両リーグ交互に指名します。3 巡目は逆に上位から、そのあとは 1 巡ごとに入れ替わります。`;
  let head;
  if (D.stage === 'r1') {
    head = `<h2>ドラフト 1 巡目（入札）${D.r1.sub ? ` ・ 外れ1位の入札（${D.r1.sub + 1}回目）` : ''}</h2>
      <p>12 球団がいっせいに 1 位の選手を入札します。<b>重なったら抽選</b>で交渉権が決まり、外れた球団は残った選手から「外れ 1 位」を入札し直します。</p>`;
  } else if (done) {
    head = '<h2>ドラフト終了</h2>';
  } else {
    head = `<h2>ドラフト ${draftRound()}巡目 ・ あなたの番です</h2><p class="muted">${orderNote}</p>`;
  }
  const myPicks = D.result.filter(r => r.team === t.id).map(r => `<li>${r.round}位 ${h(r.name)}（${r.kind}・${r.pos}）${r.note ? ` <span class="tag">${h(r.note)}</span>` : ''}</li>`).join('');
  return `
  <div class="grid2">
    <section class="card">${head}
      <p>支配下 <b>${t.players.length}人</b>（上限${ROSTER_MAX}人）${t.players.length > ROSTER_MAX ? ` <span class="tag">上限を${t.players.length - ROSTER_MAX}人こえています</span>` : ''}</p>
      <p class="muted">ドラフトでは上限をこえて指名してかまいません。開幕前（キャンプの前）までに戦力外通告で${ROSTER_MAX}人以内にすれば大丈夫です。</p>
      ${done ? '<button class="primary big" data-act="offNext">キャンプ準備へ ▶</button>'
        : D.stage === 'waiver' ? '<button data-act="draftPass">選択終了（このあとは指名しない）</button>' : ''}
      ${myPicks ? `<h3>${h(t.short)}の指名</h3><ul class="news">${myPicks}</ul>` : ''}
    </section>
    <section class="card"><h2>1 巡目の結果</h2>${lotteryHtml || '<p class="muted">これから入札です</p>'}
      ${res ? `<h3>2 巡目から</h3><ul class="news">${res}</ul>` : ''}</section>
  </div>
  ${done ? `${draftGradeCard(draftGrades(D), '今年のドラフト採点')}${renderReleasePanel()}` : `<section class="card"><h2>候補選手</h2><p class="muted">${scoutNote()}</p>${draftReview(D.pool.concat(D.result.map(r => r.pid)))}${needsCard('draft')}${prospectTable(D.pool, D.stage === 'r1' ? 'bid' : 'pick')}</section>`}`;
}

// 1 巡目の入札と抽選の結果
function renderLotteryLog(logs) {
  if (!logs.length) return '';
  const subs = [...new Set(logs.map(l => l.sub))];
  return subs.map(n => `<h3>${n === 1 ? '1 位入札' : `外れ1位（${n}回目の入札）`}</h3><ul class="news">${logs.filter(l => l.sub === n).map(l => {
    const mine = l.teams.includes(S.myTeamId);
    const cls = mine ? (l.winner === S.myTeamId ? 'good' : 'bad') : '';
    return `<li class="${cls}">${h(l.name)}（${l.kind}・${l.pos}）：${l.teams.length > 1
      ? `${l.teams.map(id => teamChip(S.teams[id])).join('')} が競合 → 抽選で ${teamChip(S.teams[l.winner])} が交渉権`
      : `${teamChip(S.teams[l.winner])} が単独指名`}</li>`;
  }).join('')}</ul>`).join('');
}

// 自分が入札した回の結果を大きく見せる
function renderLotteryPopup(logs) {
  const my = S.myTeamId;
  const mine = logs.filter(l => l.teams.includes(my));
  const won = mine.some(l => l.winner === my);
  const lines = mine.map(l => l.teams.length > 1
    ? `${h(l.name)}：${l.teams.length}球団が競合 … 抽選の結果、${l.winner === my ? '<b>交渉権を獲得！</b>' : `${h(S.teams[l.winner].short)}が交渉権。<b>外れ…</b>`}`
    : `${h(l.name)}：単独指名で<b>交渉権を獲得！</b>`).join('<br>');
  return `<div class="awaken-box ${won ? '' : 'lose-box'}">
    <div class="awaken-title">${won ? '🎯 交渉権獲得' : '😣 抽選に外れました'}</div>
    <p class="awaken-text">${lines}</p>
    ${won ? '' : '<p>残った選手から「外れ 1 位」を入札し直してください。</p>'}
    <p><button class="primary big" data-act="closeModal">${won ? 'よし！' : 'もう一度入札する'}</button></p>
  </div>`;
}

// 戦力外通告（自由契約）の一覧。弱い順に並べ、その場で通告できる
function renderReleasePanel() {
  if (!releaseOpen()) return '';
  const t = myTeam();
  const over = t.players.length - ROSTER_MAX;
  const list = teamPlayers(t).sort((a, b) => tradeValue(a) - tradeValue(b));
  const rows = list.map(p => `<tr><td class="l">${nameCell(p)}</td><td>${posBadge(p)}</td><td class="nowrap">${p.age}${phaseMark(p)}</td><td>${p.type}</td><td class="stars">${potStars(p.pot)}</td>
    <td>${Math.round(ovr(p))}</td><td>${U.money(p.salary)}</td><td><button class="sm danger" data-act="release" data-pid="${p.id}">戦力外</button></td></tr>`).join('');
  return `<section class="card"><h2>戦力外通告</h2>
    <p>支配下 <b>${t.players.length}人</b>（上限${ROSTER_MAX}人）${over > 0 ? ` ・ <span class="neg">あと${over}人減らす必要があります</span>` : ' ・ 上限以内です'}</p>
    <p class="muted">トレード価値の低い順に並んでいます。戦力外にした選手は自由契約選手になり、他球団に拾われることもあります。</p>
    <div class="scroll release-list"><table class="tbl"><tr><th>名前</th><th>守</th><th>年</th><th>型</th><th>才能</th><th>総合</th><th>年俸</th><th></th></tr>${rows}</table></div>
  </section>`;
}

// ---------- ポストシーズン ----------
function renderPost() {
  const P = S.post;
  const my = S.myTeamId;
  const card = s => {
    const top = S.teams[s.top], low = S.teams[s.low];
    const rule = SERIES_RULE[s.stage];
    const cells = s.games.map(g => {
      const ts = g.home === s.top ? g.score[1] : g.score[0], ls = g.home === s.top ? g.score[0] : g.score[1];
      return `<td class="${ts > ls ? 'win' : ts < ls ? 'lose' : ''}">${ts}-${ls}</td>`;
    }).join('');
    const mine = s.top === my || s.low === my;
    return `<div class="series ${mine ? 'mine' : ''}">
      <h3>${seriesLabel(s)}</h3>
      <p class="vsline">${teamChip(top)} ${h(top.name)} <b class="big-num">${s.wTop}</b> - <b class="big-num">${s.wLow}</b> ${h(low.name)} ${teamChip(low)}</p>
      <p class="muted">${rule.need}勝で勝ち抜け${rule.adv ? '（リーグ1位に1勝のアドバンテージ・全試合1位の本拠地）' : s.stage === 'cs1' ? '（全試合2位の本拠地）' : '（2-3-2 の本拠地）'}
        ${s.done ? ` → <b>${h(S.teams[s.winner].name)}</b> ${s.stage === 'js' ? '日本一！' : '勝ち抜け'}` : ''}</p>
      ${s.games.length ? `<div class="scroll"><table class="tbl"><tr>${s.games.map((_, i) => `<th>第${i + 1}戦</th>`).join('')}</tr><tr>${cells}</tr></table></div>` : '<p class="muted">これから</p>'}
    </div>`;
  };
  const stages = ['js', 'cs2', 'cs1'].filter(st => P.series.some(s => s.stage === st));
  const inIt = P.series.some(s => s.stage === P.stage && !s.done && (s.top === my || s.low === my));
  return `
  <section class="card"><h2>${S.year}年 ポストシーズン</h2>
    <p>${inIt ? '<b>あなたのチームが戦っています！</b>' : 'あなたのチームはいま試合がありません。最後まで見届けましょう。'}</p>
    ${stages.map(st => `<div class="grid2">${P.series.filter(s => s.stage === st).map(card).join('')}</div>`).join('')}
  </section>
  ${S.lastGame && /CS|日本シリーズ/.test(S.lastGame.label) ? `<section class="card"><h2>前の試合（${h(S.lastGame.label)}）</h2>${boxScore(S.lastGame)}</section>` : ''}
  <section class="card"><h2>ニュース</h2>${newsList(12)}</section>`;
}

function renderAwaken(list) {
  const big = list.some(x => x.big);
  return `<div class="awaken-box ${big ? 'big' : ''}">
    <div class="awaken-title">${big ? '💥 大 覚 醒 💥' : '⚡ 覚 醒 ⚡'}</div>
    ${list.map(x => `<p class="awaken-text ${x.big ? 'big' : ''}">${h(x.text)}</p>`).join('')}
    <p><button class="primary big" data-act="closeModal">${big ? 'すごすぎる！！' : 'やったね！'}</button></p>
  </div>`;
}

// いまの版と、どこから開いているか（更新されないときに見る）。値は main.js がオフライン用の仕組みから受け取る
let swReg = null;
let appVersion = '';
function versionLine() {
  return `<div class="version"><span>版：<b>${appVersion ? h(appVersion.replace('pennant-', '')) : '（オフライン用の準備なし）'}</b></span>
    <span class="muted small">${h(location.host || 'ファイル')}</span>
    ${'serviceWorker' in navigator && location.protocol === 'https:' ? '<button class="sm" data-act="checkUpdate">🔄 新しい版を確かめる</button>' : ''}</div>`;
}

function renderMenu() {
  const others = Array.from({ length: SLOT_COUNT }, (_, i) => i + 1).filter(n => n !== currentSlot);
  return `<h2>メニュー</h2>
  ${versionLine()}
  <p>いま遊んでいるデータ：<b>スロット${currentSlot}</b>（試合を進めるたびに自動で保存しています）</p>
  <p><button data-act="saveNow">いま保存する</button></p>
  <h3>ファイルに書き出す（いちばん安心）</h3>
  <p class="muted">ブラウザのデータを消しても、書き出したファイルがあれば戻せます。Google ドライブ・iCloud・LINE の自分あてなどに置いておいてください。パソコンとスマホの間で移すのにも使えます。</p>
  <p><button class="primary" data-act="exportNow">💾 ファイルに書き出す</button>
    ${navigator.canShare ? '<button data-act="shareNow">📤 共有して送る（LINE・ドライブなど）</button>' : ''}</p>
  <p class="muted small">${lastExport(currentSlot) ? `最後に書き出したのは ${slotWhen(lastExport(currentSlot))}` : 'まだ書き出していません'}</p>
  <h3>ブラウザに消されにくくする設定</h3>
  <p>${storagePersisted === true ? '✅ オン（容量が足りないときなどに、ブラウザが勝手に消すことはありません）'
    : storagePersisted === 'unsupported' ? 'このブラウザではこの設定が使えません。ファイルへの書き出しで守ってください。'
      : '⚠️ オフ（ブラウザが許可しませんでした。ホーム画面に追加したアイコンから開くと、オンになりやすくなります）'}</p>
  <p class="muted small">この設定がオンでも、自分で閲覧データを消したときはセーブも消えます。</p>
  <h3>バックアップ（別のスロットへ）</h3>
  <p class="muted">いまのデータを別のスロットにも残せます。大事な場面の前に残しておくと、あとでそこからやり直せます。</p>
  <p>${others.map(n => { const m = slotMeta(n); return `<button data-act="copySlot" data-n="${n}">スロット${n}にコピー${m ? `（${h(m.team)} ${m.year}年を上書き）` : '（空き）'}</button>`; }).join(' ')}</p>
  <h3>家族の合言葉</h3>
  ${REBORN.length
    ? `<p>✅ 合言葉が入っています（転生選手 ${REBORN.length}人）。ドラフト候補に、まれに転生選手が現れます。</p><p><button class="sm" data-act="clearPass">この端末から合言葉を消す</button></p>`
    : `<p class="muted">家族の合言葉を入れると、ドラフト候補に転生選手が現れるようになります（この端末に覚えます）。</p>
       <p><input id="passIn" type="password" autocomplete="off" placeholder="合言葉"> <button data-act="setPass">入れる</button></p>`}
  <h3>そのほか</h3>
  <p><button data-act="toTitle">タイトルへ戻る</button></p>
  <p><button class="danger" data-act="reset">スロット${currentSlot}のデータを消す</button></p>`;
}

function openModal(html) {
  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('modal').classList.remove('hidden');
}
function closeModal() { document.getElementById('modal').classList.add('hidden'); }
