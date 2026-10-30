'use strict';

// 名前と球団の元データ（球団名は架空）
const SURNAMES = ('佐藤 鈴木 高橋 田中 伊藤 渡辺 山本 中村 小林 加藤 吉田 山田 佐々木 山口 松本 井上 木村 林 斎藤 清水 ' +
  '山崎 森 池田 橋本 阿部 石川 山下 中島 石井 小川 前田 岡田 長谷川 藤田 後藤 近藤 村上 遠藤 青木 坂本 ' +
  '福田 太田 西村 藤井 金子 岡本 藤原 中野 三浦 原田 中川 松田 竹内 小野 田村 中山 和田 石田 森田 上田 ' +
  '柴田 酒井 工藤 横山 宮崎 宮本 内田 高木 安藤 島田 谷口 大野 丸山 今井 高田 河野 藤本 武田 村田 上野 ' +
  '杉山 増田 小山 大塚 平野 菅原 久保 松井 千葉 岩崎 桜井 木下 野口 松尾 菊地 野村 新井 浅野 早川 栗原').split(' ');

const GIVEN = ('翔太 大輝 蓮 悠斗 颯太 陽向 拓海 健太 大和 翼 隼人 直樹 雄大 亮 誠 剛 智也 達也 和也 優斗 ' +
  '海斗 涼 光 大地 一輝 慎吾 浩二 修 勇気 晴人 樹 湊 蒼 陸 航 新 匠 駿 将 康介 啓太 俊介 聡 豊 武 恭平 ' +
  '純 圭 哲也 雅人 遼 拓真 尚人 弘樹 克也 勝 賢治 光太郎 龍之介 一郎').split(' ');

const FOREIGN_NAMES = ('スミス ジョンソン ロペス ガルシア マルティネス ブラウン デービス ミラー ウィルソン ロドリゲス ' +
  'ペレス サンチェス ラミレス トーレス ゴンザレス ハリス クラーク ルイス ウォーカー ヤング ヘルナンデス ' +
  'アダムス ベイカー ネルソン カーター ミッチェル ロバーツ フィリップス キャンベル パーカー').split(' ');

// 2 リーグ 6 球団ずつ（球団名は架空）
const TEAM_DEFS = [
  { name: '東京ギャラクシーズ', short: '東京', color: '#1d4ed8', lg: 'セ' },
  { name: '大阪ブレイズ',       short: '大阪', color: '#dc2626', lg: 'セ' },
  { name: '名古屋サンダース',   short: '名古屋', color: '#ca8a04', lg: 'セ' },
  { name: '横浜オーシャンズ',   short: '横浜', color: '#0369a1', lg: 'セ' },
  { name: '広島ファルコンズ',   short: '広島', color: '#be123c', lg: 'セ' },
  { name: '京都エンペラーズ',   short: '京都', color: '#7c3aed', lg: 'セ' },
  { name: '福岡シーガルズ',     short: '福岡', color: '#0891b2', lg: 'パ' },
  { name: '札幌スノーベアーズ', short: '札幌', color: '#475569', lg: 'パ' },
  { name: '仙台フォレスターズ', short: '仙台', color: '#15803d', lg: 'パ' },
  { name: '千葉ウェーブス',     short: '千葉', color: '#0f172a', lg: 'パ' },
  { name: '埼玉グリフォンズ',   short: '埼玉', color: '#1e40af', lg: 'パ' },
  { name: '神戸ブルーウィンズ', short: '神戸', color: '#9a3412', lg: 'パ' },
];
const LEAGUES = ['セ', 'パ'];
// 選手の出身地と、球団の本拠地の都道府県（FA のとき、地元の球団には少し残りやすい・行きやすい）
const PREFS = ['北海道', '宮城', '東京', '神奈川', '埼玉', '千葉', '静岡', '愛知', '京都', '大阪', '兵庫', '広島', '福岡', '沖縄'];
const TEAM_PREF = { 東京: '東京', 大阪: '大阪', 名古屋: '愛知', 横浜: '神奈川', 広島: '広島', 京都: '京都', 福岡: '福岡', 札幌: '北海道', 仙台: '宮城', 千葉: '千葉', 埼玉: '埼玉', 神戸: '兵庫' };
const LEAGUE_NAME = { セ: 'セ・リーグ', パ: 'パ・リーグ' };

// 試合数の型：同じリーグの相手と intra 試合ずつ、交流戦は別リーグの相手と inter 試合ずつ
const SEASON_FORMATS = {
  143: { intra: 25, inter: 3, label: '143試合（本番と同じ）' },
  83:  { intra: 13, inter: 3, label: '83試合（短め）' },
  43:  { intra: 5,  inter: 3, label: '43試合（お試し）' },
};
const ROTATION_SIZE = 6;  // 先発ローテは 6 人
const STARTER_REST = 6;   // 中 5 日以上あいていれば投げられる（ふつうは月曜休みで中 6 日になる）
const TRADE_DEADLINE_MONTH = 7; // 7 月末までトレードできる
const WEEKDAYS = '日月火水木金土';


const BAT_KEYS = ['meet', 'power', 'speed', 'arm', 'field'];
const BAT_LABEL = { meet: 'ミート', power: 'パワー', speed: '走力', arm: '肩力', field: '守備力' };
const PIT_KEYS = ['velo', 'control', 'stamina', 'breaking'];
const PIT_LABEL = { velo: '球速', control: 'コントロール', stamina: 'スタミナ', breaking: '変化球' };
const ALL_LABEL = { ...BAT_LABEL, ...PIT_LABEL };
const CEIL_BASE = 31, CEIL_PER_POT = 30; // 伸びしろの上限 = CEIL_BASE + 才能 × CEIL_PER_POT（天才は +10）
const STALL_GAP = 2; // 伸びしろの上限までこれだけしか無い能力に「停滞」を付ける
const GENIUS_CHANCE = 0.015;   // 天才（伸びがいい）が生まれる確率
const TWO_WAY_CHANCE = 0.02;   // ドラフト候補が二刀流である確率（才能のある投手だけ）
const TWO_WAY_MIN_OVR = 60;    // 二刀流に挑戦できるのは総合がこれ以上の選手
const APT_MARK = ['△', '○', '◎']; // 先発・中継ぎの適性
const APT_MUL = [1, 1, 1.03];     // 適性ごとの力の出方（△ でも落ちない。◎ だと少し上がる）
// 弾道（1〜4）。打球の上がりやすさ。高いほどホームランとフライが多く、低いほどゴロ・ライナーが多い
const TRAJ_HR = [0, 0.6, 0.85, 1.0, 1.2];          // ホームランの出やすさの倍率
const TRAJ_FLY = [0, 0.36, 0.46, 0.55, 0.64];     // 凡打のうちフライになる割合
const TRAJ_BABIP = [0, 0.012, 0.004, -0.004, -0.012]; // 低い弾道はライナー・ゴロで安打が少し出やすい
const TRAJ_UP_POWER = [0, 0, 45, 60, 75];         // この弾道に上がるのに要るパワー
const TRAJ_UP_CHANCE = 0.3;                        // パワーが足りていれば、オフにこの確率で 1 つ上がる
const SHORT_LABEL = { meet: 'ミ', power: 'パ', speed: '走', arm: '肩', field: '守', velo: '', control: '制', stamina: 'ス', breaking: '変' };

// 選手の本来の守備位置（外 = 外野）
const FPOS = ['捕', '一', '二', '三', '遊', '外'];
// 打順に置く守備位置（指 = 指名打者）
const LPOS = ['捕', '一', '二', '三', '遊', '左', '中', '右', '指'];

// サブポジション（本職のほかに守れる位置）。本職ごとに、守れるようになりやすい位置と重み
const SUB_CANDS = {
  捕: [['一', 3], ['三', 1]],
  一: [['三', 2], ['外', 3], ['捕', 0.5]],
  二: [['遊', 3], ['三', 2], ['一', 1], ['外', 1]],
  三: [['一', 3], ['二', 1.5], ['遊', 1], ['外', 1.5]],
  遊: [['二', 4], ['三', 3], ['外', 1]],
  外: [['一', 3], ['三', 1], ['二', 0.5]],
};
const SUB_COUNT_W = [[0, 40], [1, 35], [2, 18], [3, 7]]; // サブポジの数の出やすさ
const REBORN_YEAR_CHANCE = 0.85; // 転生選手がその年のドラフト候補に現れる確率（現れるのは 1 人）
const SUB_FIT = 0.9; // サブポジで守ったときの守備の強さ（本職 = 1）

const GROWTH_PEAK = { 早熟: 24, 普通: 27, 晩成: 30, 超晩成: 33 };
const SUPER_LATE_CHANCE = 0.05; // 超晩成型（30 代で開花する）が生まれる確率
const SUPER_LATE_SHIFT = 3;      // 超晩成型は、引退や戦力外の年齢の見方をこれだけ遅らせる

const COND_MUL = [1, 0.88, 0.94, 1, 1.06, 1.12];
const COND_LABEL = ['', '絶不調', '不調', '普通', '好調', '絶好調'];
const COND_ICON = ['', '⬇', '↘', '➡', '↗', '⬆'];

const INTENSITY = {
  軽め:   { grow: 0.7, inj: 0.002, cond: +1 },
  普通:   { grow: 1.0, inj: 0.005, cond: 0 },
  猛練習: { grow: 1.45, inj: 0.016, cond: -1 },
};

const FACILITIES = {
  train:   { name: '練習施設', desc: '選手の伸びが良くなる' },
  stadium: { name: '球場',     desc: '入れられるお客さんが増える' },
  scout:   { name: 'スカウト', desc: 'ドラフト候補の能力の見立てが外れにくくなる' },
  medical: { name: '医療施設', desc: 'ケガが早く治り、ケガをしにくくなる' },
};
const FAC_MAX = 5;
// 次の段階に上げる費用（万円）
function facilityCost(level) { return level * 120000; }

// チケット代は固定（円）。入場料はファンの数で少しだけ変わる
const TICKET_PRICE = 4000;

// グッズの種類。base = ホーム 1 試合あたりの基本の売上（万円）、visual = ビジュアルの効きやすさ（0〜1）
const GOODS_TYPES = {
  towel:   { name: '応援タオル',     player: true,  cost: 1500,  days: 3, base: 90,  visual: 0.3 },
  acryl:   { name: 'アクリルスタンド', player: true,  cost: 3000,  days: 4, base: 140, visual: 1.0 },
  uniform: { name: 'レプリカユニフォーム', player: true, cost: 8000, days: 6, base: 260, visual: 0.5 },
  cap:     { name: '球団キャップ',   player: false, cost: 5000,  days: 5, base: 160, visual: 0 },
  plush:   { name: 'マスコットぬいぐるみ', player: false, cost: 10000, days: 8, base: 230, visual: 0 },
};
const GOODS_MAX = 8;          // 同時に売れる数
const AWAY_SALES = 0.4;       // ビジターの日の売上（通販）の割合
const VISUAL_WEIGHTS = [15, 30, 30, 18, 7]; // ビジュアル ★1〜★5 の出やすさ（%）

const ROSTER_MAX = 70;        // 支配下登録の上限
const ROSTER_MIN = 50;        // これを下回ると育成選手を上げて埋める
const ACTIVE_MAX = 29;        // 一軍に登録できる人数
const FOREIGN_ACTIVE_MAX = 4; // 一軍に登録できる外国人の数
const REREGISTER_DAYS = 10;   // 登録を抹消したら、この日数は一軍に戻せない
const DRAFT_ROUNDS = 7;
// 「〇年に一人の逸材」の線（draftValue＋天才 8）。ドラフト候補を 1 万年分作って測った、その年数に 1 人が届く値
const RARE_PROSPECT = [[110.7, 200], [108.7, 100], [106.7, 50], [105.4, 30], [104.3, 20], [102.4, 10]];
const SAVE_KEY = 'pennant_save_v2'; // 12 球団にしたので v1 とは別

// 年俸（万円）。成績の目安額 = 800 + 勝利数 × SAL_PER_WIN + 勝利数² × SAL_PER_WIN2
const MIN_SALARY = 420;
const SAL_PER_WIN = 2200;
const SAL_PER_WIN2 = 600;
