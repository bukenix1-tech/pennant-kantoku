'use strict';

// ボタンや選択の操作を受けて、状態を変えて描き直す

const ACTIONS = {
  pickTeam(el) { UI.newTeam = +el.dataset.i; },
  newGame() {
    const n = UI.newSlot, m = slotMeta(n);
    if (m && !confirm(`スロット${n}の「${m.team} ${m.year}年」のデータを消して、新しく始めます。
本当によろしいですか？（元に戻せません）`)) return 'keep';
    newGame(UI.newTeam, UI.newGames);
    currentSlot = n;
    UI.newSlot = null;
    UI.tab = 'home';
  },
  continue(el) {
    if (!loadGame(+el.dataset.n)) UI.toast = 'セーブデータを読めませんでした。';
    UI.tab = 'home';
  },
  slotNew(el) { UI.newSlot = +el.dataset.n; },
  slotBack() { UI.newSlot = null; },
  slotDelete(el) {
    const n = +el.dataset.n, m = slotMeta(n);
    if (!m || !confirm(`スロット${n}の「${m.team} ${m.year}年」のデータを消します。
本当によろしいですか？（元に戻せません）`)) return 'keep';
    deleteSlot(n);
    UI.toast = `スロット${n}を消しました。`;
  },
  copySlot(el) {
    const n = +el.dataset.n, m = slotMeta(n);
    if (m && !confirm(`スロット${n}の「${m.team} ${m.year}年」のデータに上書きして、いまのデータをコピーします。よろしいですか？`)) return 'keep';
    UI.toast = copyToSlot(n) ? `スロット${n}にコピーしました。` : '保存できませんでした（ブラウザの保存容量がいっぱいかもしれません）。';
    closeModal();
  },
  tab(el) { UI.tab = el.dataset.tab; if (UI.tab === 'team') UI.viewTeam = null; },
  adv(el) {
    const n = el.dataset.n;
    const before = S.phase;
    if (n === 'game') {
      const k = S.myGames.length;
      while (S.phase === 'season' && S.myGames.length === k) if (!advanceDay()) break;
    } else if (n === 'week') {
      for (let i = 0; i < 7; i++) if (!advanceDay()) break;
    } else if (n === 'all') {
      while (advanceDay());
    } else if (n === 'post1') {
      advancePost();
    } else if (n === 'postall') {
      while (advancePost());
    }
    if (before !== S.phase) { UI.tab = S.phase === 'post' ? 'post' : S.phase === 'off' ? 'off' : 'home'; window.scrollTo(0, 0); }
    // シーズンが終わったら、セーブをファイルに書き出すかを聞く
    if (before !== 'off' && S.phase === 'off' && !backupAskOff()) UI.backupAsk = true;
  },
  lg(el) { UI.lg = el.dataset.lg; },
  closeModal() { closeModal(); },
  player(el) { openModal(renderPlayerModal(S.players[+el.dataset.pid])); return 'keep'; },
  release(el) {
    const p = S.players[+el.dataset.pid];
    if (!confirm(`${p.name}を自由契約にしますか？（元に戻せません）`)) return 'keep';
    const err = releasePlayer(p.id);
    if (err) UI.toast = err; else closeModal();
  },
  promote(el) {
    const t = myTeam(), p = S.players[+el.dataset.pid];
    const why = cannotPromote(t, p);
    if (why) { UI.toast = why; return; }
    UI.rsel = null;
    promote(t, p);
    addNews(`${p.name}を一軍に登録しました。`);
    if (!document.getElementById('modal').classList.contains('hidden')) openModal(renderPlayerModal(p));
  },
  demote(el) {
    const t = myTeam(), p = S.players[+el.dataset.pid];
    UI.rsel = null;
    demote(t, p);
    ensureLineup(S, t);
    addNews(`${p.name}の登録を抹消しました。`);
    if (!document.getElementById('modal').classList.contains('hidden')) openModal(renderPlayerModal(p));
  },
  tryTwoWay(el) {
    const p = S.players[+el.dataset.pid];
    if (ovr(p) < TWO_WAY_MIN_OVR) { UI.toast = `二刀流に挑戦できるのは総合${TWO_WAY_MIN_OVR}以上の選手です。`; return; }
    if (!confirm(`${p.name}に二刀流を挑戦させますか？`)) return 'keep';
    makeTwoWay(p, U.rnd(35, 45)); // 力のある選手なので、もう片方もそこそこから始まる
    refreshRoles(myTeam());
    addNews(`${p.name}が二刀流に挑戦！`, 'good');
    openModal(renderPlayerModal(p));
  },
  dropTwoWay(el) {
    const p = S.players[+el.dataset.pid];
    if (!confirm(`${p.name}の二刀流をやめさせますか？（${p.isP ? '打撃' : '投球'}の能力はなくなります）`)) return 'keep';
    dropTwoWay(p);
    const t = myTeam();
    ensureLineup(S, t); refreshRoles(t);
    openModal(renderPlayerModal(p));
  },
  autoActive() {
    const t = myTeam();
    autoActive(t); autoLineup(t); autoRotation(t);
    UI.toast = '一軍をおまかせで組みました。';
  },
  autoOrder() {
    const t = myTeam();
    autoLineup(t); autoRotation(t);
    UI.toast = 'おまかせでオーダーを組みました。';
  },
  // オーダー画面：1 人目をタップで選び、2 人目（または守備位置）で入れ替える
  osel(el) {
    const t = myTeam(), sel = UI.osel;
    const cur = el.dataset.k === 'line' ? { k: 'line', i: +el.dataset.i } : { k: 'bench', pid: +el.dataset.pid };
    if (!sel) { UI.osel = cur; return; }
    UI.osel = null;
    if (sel.k === 'line' && cur.k === 'line') {
      if (sel.i !== cur.i) [t.lineup[sel.i], t.lineup[cur.i]] = [t.lineup[cur.i], t.lineup[sel.i]];
    } else if (sel.k === 'bench' && cur.k === 'bench') {
      if (sel.pid !== cur.pid) UI.osel = cur;
    } else {
      const line = sel.k === 'line' ? sel : cur, b = sel.k === 'bench' ? sel : cur;
      t.lineup[line.i].pid = b.pid; // 控えの選手が、その打順と守備位置に入る
    }
  },
  ofield(el) {
    const t = myTeam(), sel = UI.osel, pos = el.dataset.pos;
    const j = t.lineup.findIndex(s => s.pos === pos);
    if (!sel) { if (j >= 0) UI.osel = { k: 'line', i: j }; return; }
    UI.osel = null;
    if (sel.k === 'bench') { if (j >= 0) t.lineup[j].pid = sel.pid; return; }
    if (j === sel.i) return;
    if (j >= 0) t.lineup[j].pos = t.lineup[sel.i].pos;
    t.lineup[sel.i].pos = pos;
  },
  oclear() { UI.osel = null; },
  // 一軍・二軍：一軍の選手と二軍の選手を続けてタップすると入れ替わる
  rsel(el) {
    const t = myTeam(), p = S.players[+el.dataset.pid], sel = UI.rsel != null ? S.players[UI.rsel] : null;
    if (!sel || sel.id === p.id || isActive(t, sel) === isActive(t, p)) { UI.rsel = sel && sel.id === p.id ? null : p.id; return; }
    UI.rsel = null;
    const up = isActive(t, p) ? sel : p, down = isActive(t, p) ? p : sel;
    const keep = down.downDay;
    demote(t, down);
    const why = cannotPromote(t, up);
    if (why) { promote(t, down); down.downDay = keep; UI.toast = `${up.name}は登録できません（${why}）`; return; }
    promote(t, up);
    ensureLineup(S, t);
    addNews(`${down.name}の登録を抹消し、${up.name}を一軍に登録しました。`);
  },
  rclear() { UI.rsel = null; },
  lmove(el) {
    const t = myTeam(), i = +el.dataset.i, j = i + +el.dataset.d;
    if (j < 0 || j >= t.lineup.length) return;
    [t.lineup[i], t.lineup[j]] = [t.lineup[j], t.lineup[i]];
  },
  intensity(el) { myTeam().intensity = el.dataset.k; },
  upgrade(el) { upgradeFacility(el.dataset.k); },
  devGoods() { const err = developGoods(UI.goodsType, UI.goodsPid); UI.toast = err || '開発を始めました！'; },
  stopGoods(el) {
    if (!confirm('このグッズの販売を終了しますか？')) return 'keep';
    stopGoods(+el.dataset.id);
  },
  scoutForeign() {
    if (myTeam().money < FOREIGN_SCOUT_COST) { UI.toast = 'お金が足りません。'; return; }
    scoutForeign();
  },
  signFA(el) { const err = signFreeAgentMine(+el.dataset.pid); UI.toast = err || '契約しました！'; },
  signForeign(el) { const err = signForeign(+el.dataset.pid); UI.toast = err || '契約しました！'; },
  propose() {
    const T = UI.trade;
    const r = proposeTrade(T.team, T.give, T.get);
    UI.toast = r.msg;
    if (r.ok) { T.give = []; T.get = []; }
  },
  offNext() {
    const step = S.off.step;
    if (step === 'awards') offFAStart();
    else if (step === 'fa') offContract();
    else if (step === 'contract') offDraftStart();
    else if (step === 'draft') offCampStart();
    else if (step === 'camp') {
      if (myTeam().players.length > ROSTER_MAX) return;
      offNewSeason();
      UI.tab = 'home';
    }
    window.scrollTo(0, 0);
  },
  draftPick(el) { draftMyPick(+el.dataset.pid); },
  draftBid(el) {
    const p = S.players[+el.dataset.pid];
    if (!confirm(`${p.name}を1位で入札しますか？`)) return 'keep';
    const logs = draftMyBid(p.id);
    saveGame();
    render();
    openModal(renderLotteryPopup(logs));
    return 'keep';
  },
  draftPass() {
    if (!confirm('選択終了しますか？ このあとのドラフトでは指名できません。')) return 'keep';
    draftPass();
  },
  faDeclare() { offFADeclare(); window.scrollTo(0, 0); },
  faResolve() {
    if (!confirm('交渉を締め切って、FA の結果を発表します。よろしいですか？')) return 'keep';
    offFAResolve(); window.scrollTo(0, 0);
  },
  faBid(el) {
    const pid = +el.dataset.pid, d = UI.faDraft[pid] || {};
    const p = S.players[pid];
    const err = setMyBid(pid, d.mul || 1, d.years || (p.age <= 30 ? 3 : 1));
    UI.toast = err || '条件を出しました。';
  },
  faBidCancel(el) { setMyBid(+el.dataset.pid, null); },
  watch(el) { toggleWatch(+el.dataset.pid); },
  posf(el) { UI.posf[el.dataset.key] = el.dataset.g; },
  teamView(el) { UI.teamView = el.dataset.k; },
  recView(el) { UI.recView = el.dataset.k; },
  slimNow() {
    const myLg = myTeam().lg, other = LEAGUES.find(l => l !== myLg);
    const lgs = UI.slimScope === 'both' ? LEAGUES : [other];
    const from = S.standHist[S.standHist.length - 1].year;
    if (!confirm(`${from}〜${UI.slimUntil}年の${lgs.map(l => LEAGUE_NAME[l]).join('・')}の、順位表の得点・失点と MVP 以外のタイトルの一覧を消します。\n元に戻せません。先に「ファイルに書き出す」で残しておくと安心です。よろしいですか？`)) return 'keep';
    slimHistory(UI.slimUntil, lgs);
    UI.toast = '古い年の記録を整理しました。';
  },
  retStar(el) {
    const r = S.retired.find(x => x.id === +el.dataset.id);
    if (r && r.hof && r.star && !confirm(`殿堂入りの${r.name}の★を外しますか？
外すと、ほかの選手と同じように、古い順に記録が消えることがあります。`)) return 'keep';
    toggleRetiredStar(+el.dataset.id);
  },
  statSort(el) { UI.statSort[el.dataset.kind] = el.dataset.k; },
  menu() { openModal(renderMenu()); return 'keep'; },
  checkUpdate() { checkUpdate(); return 'keep'; },
  exportNow() {
    saveGame();
    const f = exportSlot(currentSlot);
    downloadText(f.name, f.text);
    closeModal();
    UI.toast = `「${f.name}」を書き出しました。`;
  },
  shareNow() {
    saveGame();
    const f = exportSlot(currentSlot);
    const file = new File([f.text], f.name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: 'ペナント監督のセーブ' }).catch(() => {});
    } else {
      downloadText(f.name, f.text);
      UI.toast = 'この端末では共有できないので、ファイルとして書き出しました。';
    }
    closeModal();
  },
  exportSlot(el) {
    const f = exportSlot(+el.dataset.n);
    if (!f) { UI.toast = 'そのスロットにはデータがありません。'; return; }
    downloadText(f.name, f.text);
    UI.toast = `「${f.name}」を書き出しました。`;
  },
  saveNow() { closeModal(); UI.toast = saveGame() ? `スロット${currentSlot}に保存しました。` : '保存できませんでした。'; },
  toTitle() { saveGame(); closeModal(); S = null; currentSlot = null; },
  reset() {
    if (!confirm(`スロット${currentSlot}のデータを消して、タイトルに戻ります。
本当によろしいですか？（元に戻せません）`)) return 'keep';
    deleteSlot(currentSlot); closeModal(); S = null; currentSlot = null;
  },
};

const CHANGES = {
  games(el) { UI.newGames = +el.value; },
  watchOnly(el) { UI.watchOnly = el.checked; },
  noBackupAsk(el) { setBackupAskOff(el.checked); return 'keep'; },
  recYear(el) { UI.recYear = +el.value; },
  draftYearF(el) { UI.draftYearF = el.value; },
  dhYear(el) { UI.dhYear = +el.value; },
  slimUntil(el) { UI.slimUntil = +el.value; },
  slimScope(el) { UI.slimScope = el.value; },
  importFile(el) {
    const n = +el.dataset.n, file = el.files && el.files[0];
    el.value = '';
    if (!file) return 'keep';
    const m = slotMeta(n);
    if (m && !confirm(`スロット${n}の「${m.team} ${m.year}年」のデータに上書きして、ファイル「${file.name}」を読み込みます。よろしいですか？`)) return 'keep';
    const reader = new FileReader();
    reader.onload = () => {
      const err = importToSlot(n, String(reader.result));
      UI.toast = err || `スロット${n}に読み込みました。「つづきから」で遊べます。`;
      render();
    };
    reader.onerror = () => { UI.toast = 'ファイルを読めませんでした。'; render(); };
    reader.readAsText(file);
    return 'keep';
  },
  geniusOnly(el) { UI.geniusOnly = el.checked; },
  histYear(el) { UI.histYear = +el.value; },
  retain(el) { setRetain(+el.dataset.pid, +el.value); },
  faMul(el) { const pid = +el.dataset.pid; UI.faDraft[pid] = { ...(UI.faDraft[pid] || { years: 3 }), mul: +el.value }; return 'keep'; },
  faYears(el) { const pid = +el.dataset.pid; UI.faDraft[pid] = { ...(UI.faDraft[pid] || { mul: 1 }), years: +el.value }; return 'keep'; },
  viewTeam(el) { UI.viewTeam = +el.value; },
  focus(el) { S.players[+el.dataset.pid].focus = el.value; return 'keep'; },
  lpos(el) {
    const t = myTeam(), i = +el.dataset.i, pos = el.value;
    const j = t.lineup.findIndex((s, k) => k !== i && s.pos === pos);
    if (j >= 0) t.lineup[j].pos = t.lineup[i].pos;
    t.lineup[i].pos = pos;
  },
  lplayer(el) {
    const t = myTeam(), i = +el.dataset.i, pid = +el.value;
    const j = t.lineup.findIndex((s, k) => k !== i && s.pid === pid);
    if (j >= 0) t.lineup[j].pid = t.lineup[i].pid;
    t.lineup[i].pid = pid;
  },
  rot(el) {
    const t = myTeam(), i = +el.dataset.i, pid = +el.value;
    const j = t.rotation.indexOf(pid);
    if (j >= 0) t.rotation[j] = t.rotation[i];
    t.rotation[i] = pid;
    if (t.closer === pid) t.closer = null;
    if (t.setup === pid) t.setup = null;
    refreshRoles(t);
  },
  closer(el) {
    const t = myTeam();
    t.closer = el.value === '' ? null : +el.value;
    if (t.setup === t.closer) t.setup = null;
    refreshRoles(t);
  },
  setup(el) {
    const t = myTeam();
    t.setup = el.value === '' ? null : +el.value;
    if (t.closer === t.setup) t.closer = null;
    refreshRoles(t);
  },
  goodsType(el) { UI.goodsType = el.value; },
  goodsPid(el) { UI.goodsPid = +el.value; },
  tteam(el) { UI.trade = { team: +el.value, give: [], get: [] }; },
  tsel(el) {
    const arr = UI.trade[el.dataset.side], pid = +el.dataset.pid;
    const k = arr.indexOf(pid);
    if (el.checked && k < 0) arr.push(pid);
    if (!el.checked && k >= 0) arr.splice(k, 1);
  },
};

document.addEventListener('click', e => {
  if (e.target.id === 'modal' || e.target.closest('.modal-close')) { closeModal(); render(); showPopups(); return; }
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  e.preventDefault();
  const fn = ACTIONS[el.dataset.act];
  if (!fn) return;
  const r = fn(el, e);
  if (S && !saveGame()) UI.toast = '保存できませんでした（ブラウザの保存容量がいっぱいかもしれません）。';
  if (r !== 'keep') render();
  showPopups();
});

// 覚醒などの知らせを大きく出す。そのあとに、シーズン終わりの書き出しのすすめ
function showPopups() {
  if (!S) return;
  if (S.popups && S.popups.length) {
    openModal(renderAwaken(S.popups));
    S.popups = [];
    saveGame();
    return;
  }
  if (UI.backupAsk) { UI.backupAsk = false; openModal(renderBackupAsk()); }
}

document.addEventListener('change', e => {
  const el = e.target.closest('[data-chg]');
  if (!el) return;
  const fn = CHANGES[el.dataset.chg];
  if (!fn) return;
  const r = fn(el, e);
  if (S) saveGame();
  if (r !== 'keep') render();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); render(); }
});

// ファイルとして保存させる
function downloadText(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

migrateOldSave();
askPersistentStorage();
render();
// スマホとパソコンの幅をまたいだら描き直す（画面を回したときなど）
window.matchMedia('(max-width: 700px)').addEventListener('change', () => render());

// ネットに置いたとき（https）は、一度開けば電波がなくても遊べるようにする。ファイルを直接開いたときは何もしない
// 新しい版を出したら、開き直したとき・アプリに戻ってきたときに自分で取りにいき、入れ替わったら読み込み直す
if ('serviceWorker' in navigator && window.isSecureContext && location.protocol.startsWith('http')) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
    .then(reg => { swReg = reg; reg.update().catch(() => {}); askVersion(); })
    .catch(e => console.warn('オフライン用の準備ができませんでした', e));
  navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.version) { appVersion = e.data.version; render(); } });
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // はじめて入ったときは読み込み直さない。版が入れ替わったときだけ
    if (!hadController || reloading) return;
    reloading = true;
    if (S) saveGame();
    location.reload();
  });
  // iPhone のホーム画面のアプリは、閉じたつもりでも裏で残っていることがあるので、前に戻ってきたときにも確かめる
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && swReg) swReg.update().catch(() => {}); });
}
function askVersion() {
  if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage('version');
}

// メニューの「新しい版を確かめる」
async function checkUpdate() {
  UI.toast = '新しい版を確かめています…';
  render();
  try {
    if (swReg) await swReg.update();
  } catch (e) { /* つながらないときは、いまの版のまま */ }
  if (S) saveGame();
  location.reload();
}
