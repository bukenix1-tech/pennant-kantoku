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
// 金銭トレード：お金 CASH_PER_VALUE 万円を、トレード価値 1 として数える。主力（総合で上から TRADE_CORE_N 人）はお金だけでは出してもらえない
const CASH_PER_VALUE = 10, TRADE_CORE_N = 8;
// 契約の選択肢。年俸は FA 相場や査定額に掛ける倍率。値は仮（AI）
const CONTRACT_YEARS_MAX = 6;
const CONTRACT_MULS = [0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.5, 2];
// 契約更改で複数年を結ぶときの選択肢と、受けてもらえる見込み（基本＋忠誠心＋上乗せ。若手は長い契約を嫌い、ベテランは喜ぶ）。値は仮（AI）
const EXTEND_MULS = [0.9, 1, 1.1, 1.2, 1.3, 1.5], EXTEND_YEARS_MAX = 5;
const EXTEND_BASE = 0.35, EXTEND_LOYAL = 0.35, EXTEND_PAY = 1.5, EXTEND_YEAR = 0.05;
// 無償で引き取ってもらえる年俸の上限（査定額に対する倍率）。値は仮（AI）
const FREE_TRADE_SALARY = 1.3;
// 相手からのトレードの話：1 週間ごとの確率・返事の期限（週）・同時に来る数・そのうち無償の話の割合。値は仮（AI）
const TRADE_OFFER_CHANCE = 0.15, TRADE_OFFER_WEEKS = 3, TRADE_OFFER_MAX = 2, TRADE_OFFER_FREE = 0.35;
const WEEKDAYS = '日月火水木金土';


const BAT_KEYS = ['meet', 'power', 'speed', 'arm', 'field'];
const BAT_LABEL = { meet: 'ミート', power: 'パワー', speed: '走力', arm: '肩力', field: '守備力' };
const PIT_KEYS = ['velo', 'control', 'stamina', 'breaking'];
const PIT_LABEL = { velo: '球速', control: 'コントロール', stamina: 'スタミナ', breaking: '変化球' };
const ALL_LABEL = { ...BAT_LABEL, ...PIT_LABEL };
const CEIL_BASE = 31, CEIL_PER_POT = 30; // 伸びしろの上限 = CEIL_BASE + 才能 × CEIL_PER_POT（天才は +10）
// 上限解放：停滞した能力の伸びしろの上限が、ときどき広がる（1 週間ごとに 1 人あたりこの確率。キャンプは 3 倍）
const LIMIT_BREAK_CHANCE = 0.0025, LIMIT_BREAK_UP = [6, 12], LIMIT_BREAK_MAX = 20;
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
// 引退：一軍の出場がこれより少ない年（野手は試合、投手は登板）は、30 歳から引退しやすくなる。長くケガをした年は数えない
const RETIRE_LOW_G = 30, RETIRE_LOW_PG = 10, RETIRE_INJ_DAYS = 60, RETIRE_MAX_AGE = 43;
const REBORN_START = { 高校: 0.6, 高卒社会人: 0.68, 大学: 0.72, 社会人: 0.95 }; // 転生選手の入団時の能力（ピーク時の何割か）
// 能力の上限。球速だけは別（103 で 170km）
const ABIL_MAX = 110, VELO_MAX = 103;
const REBORN_OVER = 7; // 転生選手がピーク時の値を超えられる幅
// 転生外国人：外国人スカウトの候補に混ざる確率と、来日したときの能力（ピーク時の何割か）
const FOREIGN_REBORN_CHANCE = 0.2, FOREIGN_REBORN_START = 0.92;
const REBORN_YEAR_CHANCE = 0.85; // 転生選手がその年のドラフト候補に現れる確率
const REBORN_MORE_CHANCE = [0.15, 0.25]; // 現れた年に、2 人目・3 人目も現れる確率（前の人が現れたときだけ）
const SUB_FIT = 0.9;
// 盗塁の積極性（試みる回数の倍率）。1 がふつう。これ以上で「積極的」、これ以下で「慎重」
const STEAL_SD = 0.3, STEAL_HI = 1.3, STEAL_LO = 0.7;
// 選球眼（特殊能力）。-1 = 早打ち（×）、0 = なし、1 = ○、2 = ◎。四球と三振の出やすさにかける
const EYE_W = [[-1, 10], [0, 75], [1, 12], [2, 3]];
const EYE_BB = { '-1': 0.75, 0: 1, 1: 1.4, 2: 2.0 };
const EYE_K = { '-1': 1.08, 0: 1, 1: 0.95, 2: 0.9 };
const EYE_MARK = { '-1': '×', 1: '○', 2: '◎' };
// 守備の重さ。むずかしい位置ほど、その選手の守備がチームの失点に強く効く
const POS_DEF_W = { 捕: 1.4, 遊: 1.6, 二: 1.3, 中: 1.3, 三: 1.0, 右: 0.8, 左: 0.7, 一: 0.5 };
// 野手の総合の出し方（本職ごと）。むずかしい位置ほど守備と肩、指名打者・一塁は打撃を重く見る
const POS_OVR_W = {
  捕: { meet: 0.25, power: 0.25, speed: 0.05, arm: 0.2, field: 0.25 },
  遊: { meet: 0.26, power: 0.2, speed: 0.15, arm: 0.12, field: 0.27 },
  二: { meet: 0.28, power: 0.22, speed: 0.15, arm: 0.08, field: 0.27 },
  三: { meet: 0.3, power: 0.3, speed: 0.08, arm: 0.12, field: 0.2 },
  外: { meet: 0.3, power: 0.3, speed: 0.15, arm: 0.1, field: 0.15 },
  一: { meet: 0.36, power: 0.4, speed: 0.08, arm: 0.02, field: 0.14 },
  指: { meet: 0.45, power: 0.5, speed: 0.05, arm: 0, field: 0 },
}; // サブポジで守ったときの守備の強さ（本職 = 1）

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
  dorm:     { name: '寮',               desc: '25歳以下の若手の伸びが良くなる', cost: 0.5 },
  gym:      { name: 'トレーニングルーム', desc: 'ベテランの衰えがゆるやかになる', cost: 0.5 },
  analysis: { name: 'データ分析室',     desc: '相手の研究で、打者も投手も試合で少し有利になる', cost: 0.5 },
};
const FAC_MAX = 5;
// 次の段階に上げる費用（万円）。cost のある施設はその割合
function facilityCost(level, k) { return Math.round(level * 120000 * ((FACILITIES[k] && FACILITIES[k].cost) || 1)); }
// 施設の維持費：毎年、改修に使った総額のこの割合を払う（レベル 1 は 0）。値は仮（AI）
const FAC_UPKEEP = 0.08;
function facilityUpkeep(level, k) {
  let total = 0;
  for (let l = 1; l < level; l++) total += facilityCost(l, k);
  return Math.round(total * FAC_UPKEEP);
}
// 施設の効き目（レベル 1 で効き目なし。1 つ上がるごと）
const DORM_GROW = 0.06, GYM_SLOW = 0.08, ANALYSIS_BONUS = 0.6;
// 功績のある選手の減俸をゆるめる：功績 1（殿堂入りくらい）で、下げ幅を MERIT_SOFT だけ減らし、減額制限を MERIT_FLOOR だけ上げる
const MERIT_SOFT = 0.5, MERIT_FLOOR = 0.15;
// 人気度は毎週、下限との差の FAME_DECAY ずつ下がる。下限は 5 ＋ 功績×FAME_FLOOR_MERIT（殿堂入りくらいで 60）
const FAME_DECAY = 0.05, FAME_FLOOR_MERIT = 55;
// 達成記録（ノーヒットノーラン・完全試合・サイクル安打・1 試合 4 本塁打・1 試合の奪三振）。FEAT_K 個以上の奪三振で記録に入る。値は仮（AI）
const FEAT_K = 14;
const NONO_EXTRA = 30; // ノーヒットノーランを続けている先発は、いつもの球数の限りをこれだけ超えても投げる（仮・AI）
const FEAT_WORD = { pg: '完全試合', nh: 'ノーヒットノーラン', rnh: '継投ノーヒットノーラン', cyc: 'サイクル安打', hr4: '1試合4本塁打', k: '1試合の奪三振' };
const FEAT_FAME = { pg: 10, nh: 6, rnh: 2, cyc: 4, hr4: 5, k: 3 };
// 引退する選手の慰留（1 人 1 回）。残ってくれる見込み＝RETAIN_BASE＋忠誠心/100×RETAIN_LOYAL−（年齢−RETAIN_AGE）×RETAIN_AGE_DROP。
// 残ったら年俸を RETAIN_RAISE だけ上乗せした 1 年契約。値は仮（AI）
const RETAIN_BASE = 0.1, RETAIN_LOYAL = 0.6, RETAIN_AGE = 34, RETAIN_AGE_DROP = 0.07, RETAIN_MIN = 0.05, RETAIN_MAX = 0.9, RETAIN_RAISE = 0.1;
// FA と出場機会：今季あまり出られなかった選手は、宣言しやすく（FA_PLAY_DECLARE）、レギュラーになれる球団を選びやすい
// 移籍先で何番手になるか：野手は 9 番手、投手は 10 番手までならレギュラー。外れると評価が FA_PLAY_PICK（出られなかった選手は 2 倍まで）下がる
const FA_PLAY_DECLARE = 0.35, FA_PLAY_PICK = 0.12, FA_PLAY_MIN_OVR = 48;
// オールスター：シーズンの AS_AT（割合）あたりに 2 試合。各リーグ 野手 AS_BAT 人・投手 AS_PIT 人
// ファン投票（人気度）で野手 9 人と投手 3 人、残りは監督推薦（成績）。選ばれると人気が上がる
const AS_AT = 0.55, AS_BAT = 16, AS_PIT = 12, AS_FAME = { fan: 5, pick: 3, mvp: 8 };
// 起用への不満：チームで上位の力があるのに出番が GRUMBLE_SHARE より少ない選手は、毎週忠誠心が GRUMBLE_LOYALTY 下がる（GRUMBLE_FROM 試合目から）
// 「上位の力」はチームで野手 GRUMBLE_RANK.B 番手・投手 GRUMBLE_RANK.P 番手まで（総合の順）
const GRUMBLE_SHARE = 0.4, GRUMBLE_LOYALTY = 1.5, GRUMBLE_FROM = 18, GRUMBLE_RANK = { B: 7, P: 8 };
// 国際大会：INTL_EVERY 年に 1 回、日本シリーズのあと。8 か国が 4 か国ずつ 2 組で総当たり → 上位 2 か国で準決勝 → 決勝
// 日本代表は野手 INTL_BAT 人・投手 INTL_PIT 人を自動で選ぶ。相手の国は、日本代表の総合の平均 ＋ q の強さで選手を作る（選手は架空）
// 出た選手は人気が上がる（INTL_FAME）。疲れやケガは考えない（人の言葉 2026-11-02）
const INTL_EVERY = 4, INTL_BAT = 15, INTL_PIT = 13, INTL_FAME = { pick: 3, champ: 5, mvp: 6 };
const INTL_COUNTRIES = [
  { name: 'アメリカ', q: -6, names: 'us' }, { name: 'ドミニカ共和国', q: -7, names: 'latin' }, { name: '韓国', q: -10, names: 'kr' },
  { name: 'ベネズエラ', q: -10, names: 'latin' }, { name: '台湾', q: -12, names: 'tw' }, { name: 'メキシコ', q: -12, names: 'latin' },
  { name: 'オランダ', q: -14, names: 'nl' },
];
const INTL_NAMES = {
  us: 'スミス ジョンソン ブラウン デービス ミラー ウィルソン ハリス クラーク ルイス ウォーカー ヤング アダムス ベイカー ネルソン カーター ミッチェル ロバーツ フィリップス キャンベル パーカー ターナー コリンズ スチュワート モリス ロジャース クック ベル マーフィー',
  latin: 'ロペス ガルシア マルティネス ロドリゲス ペレス サンチェス ラミレス トーレス ゴンザレス ヘルナンデス フローレス リベラ ゴメス ディアス レイエス クルス モラレス オルティス グティエレス メンドーサ カスティーヨ バルガス ソト ゲレーロ',
  nl: 'デヨング ヤンセン ファンダイク バッカー フィッセル スミット デフリース ボス ミュルデル ブラウワー ファンデルメール ディクストラ フェルメール ホーフマン ケンペル マルティス',
  krS: 'キム イ パク チェ チョン カン チョ ユン チャン イム ハン オ ソ シン クォン ファン',
  krG: 'ジフン ミンジュン ヒョンス ジョンホ ソンミン ドンヒョン ジェウォン テヨン ウジン スンホ ジュンヨン ヨンジェ',
  twS: 'リン チェン ワン ホアン ジャン リー ウー ツァイ リウ ヤン シュー ジョウ',
  twG: 'ジーホン ウェイルン ズーハオ ジアミン ヨウチェン グアンユー ボーウェン ジーウェイ イーシュエン ジュンジエ',
};
// 背番号。投手・捕手・野手で好まれる番号から順に空いているものを付ける
const NO_POOL = {
  P: [18, 11, 14, 17, 15, 16, 19, 20, 21, 13, 12, 47, 41, 28, 29, 30, 26, 34, 43, 45, 46, 48, 49, 57, 58, 59, 61, 62, 63, 64, 65, 66, 67, 68, 69, 90, 91, 92, 93],
  C: [27, 22, 2, 10, 32, 37, 39, 40, 44, 52, 54, 60],
  B: [1, 3, 5, 6, 7, 8, 9, 10, 2, 4, 0, 51, 55, 23, 24, 25, 31, 33, 35, 36, 38, 42, 50, 53, 56, 70, 94, 95, 96, 97, 98, 99],
};
// 永久欠番：功績が RETIRE_NO_MERIT 以上で、その球団に RETIRE_NO_YEARS 年以上いた選手が引退したら選べる（3 年に 1 人くらい）
// ほかの球団は、功績が RETIRE_NO_AUTO 以上で RETIRE_NO_AUTO_YEARS 年以上いた選手を、RETIRE_NO_AUTO_CHANCE の確率で永久欠番にする（リーグ全体で年 1 人弱）
// 永久欠番にすると球団の人気が RETIRE_NO_POP 上がる
const RETIRE_NO_MERIT = 0.75, RETIRE_NO_YEARS = 8, RETIRE_NO_AUTO = 1, RETIRE_NO_AUTO_YEARS = 10, RETIRE_NO_AUTO_CHANCE = 0.3, RETIRE_NO_POP = 3;
// 宣伝：お金を払って、そのシーズンのグッズの売上の割合を上げる（goods = 上がる割合）。どれも 1 シーズンに 1 回まで。値は仮（AI）
const PROMOS = {
  web:   { name: 'ネット広告',         cost: 8000,  goods: 0.08, desc: '通販のページへ呼び込む' },
  event: { name: 'ファン感謝イベント', cost: 20000, goods: 0.2, desc: '球場でファンと選手が交流し、グッズを売り込む' },
  cm:    { name: 'テレビCM',           cost: 50000, goods: 0.4, desc: '全国に流して一気に知ってもらう' },
};

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
