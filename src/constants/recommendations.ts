/**
 * レコメンド関連の定数
 */

import { MS_PER_SECOND } from './time';

/**
 * レコメンド最大件数
 */
export const RECOMMENDATIONS_MAX_COUNT = 10;

/**
 * レコメンド生成リトライ上限（初回を除く追加試行回数）
 */
export const RECOMMENDATIONS_MAX_RETRIES = 2;

/**
 * AIへの初回要求時に見込む採用率
 *
 * AIが返した候補のうち、TMDbで解決でき除外にも引っかからず採用できる割合。
 * 必要件数をこの率で割り戻した件数を要求する（10件必要なら 10/0.67 ≒ 15件）。
 * 2回目以降は直前の試行で実測した採用率に置き換える。
 */
export const RECOMMENDATIONS_INITIAL_HIT_RATE = 0.67;

/**
 * 要求件数の算出に使う採用率の下限
 *
 * 実測の採用率が極端に低いときに要求件数が青天井にならないよう、
 * 割り戻しに使う率をこの値で打ち止めにする。
 */
export const RECOMMENDATIONS_MIN_HIT_RATE = 0.3;

/**
 * 1回のAI呼び出しで要求する件数の上限
 *
 * 採用率が低くても、1回のレスポンスが長くなりすぎるとコストと
 * ハルシネーションの双方が増えるため上限を設ける。
 */
export const RECOMMENDATIONS_MAX_REQUEST_COUNT = 30;

/**
 * TMDb候補選択時に許容する公開年の差（年）
 * AIが返した公開年とTMDb検索結果の公開年がこの範囲内なら一致候補とみなす。
 */
export const RECOMMENDATIONS_YEAR_MATCH_TOLERANCE = 1;

/**
 * 1ジャンルが占めてよい最大比率
 *
 * お気に入りに偏り（例: アクションばかり）があるユーザーには同系統ばかりが
 * 返るため、採用段階で上限を設けて多様性を確保する。
 * 10件中4件までを同一ジャンルとする。
 */
export const RECOMMENDATIONS_MAX_GENRE_RATIO = 0.4;

/**
 * 多様性リランキング用に余分に解決する候補数
 *
 * 必要件数ぴったりしか解決しないと入れ替え先が無く、リランキングが
 * ただの並べ替えで終わる。少し多めに確保してから選抜する。
 */
export const RECOMMENDATIONS_DIVERSITY_POOL_EXTRA = 5;

/**
 * リトライごとに上乗せする temperature
 *
 * 同じ入力・同じ温度で再送しても似た候補が返るだけでリトライが空振りする。
 * 試行を重ねるごとに少し上げて出力を散らす。
 */
export const RECOMMENDATIONS_RETRY_TEMPERATURE_STEP = 0.1;

/**
 * リトライ時の temperature 上限
 * 上げすぎると実在しない作品が増えるため頭打ちにする。
 */
export const RECOMMENDATIONS_RETRY_MAX_TEMPERATURE = 1;

/**
 * お気に入りをプロンプトに載せる際の評価帯（降順に並べる）
 *
 * 評価値をただ羅列するより、帯ごとに見出しを分けた方がAIが重みを扱いやすい。
 * 高評価帯の傾向を強く反映させるため、システムプロンプト側でも
 * `HIGH_RATING_THRESHOLD` 以上を優先するよう明示している。
 */
export const RECOMMENDATIONS_RATING_BANDS = [
  {
    label: '高評価（8〜10点）- この傾向を最も重視してください',
    min: 8,
    max: 10,
  },
  { label: '中評価（5〜7点）', min: 5, max: 7 },
  { label: '低評価（1〜4点）- 参考程度にとどめてください', min: 1, max: 4 },
] as const;

/**
 * 「傾向を特に強く反映する」とみなす評価の下限
 * RECOMMENDATIONS_RATING_BANDS の高評価帯と揃える。
 */
export const RECOMMENDATIONS_HIGH_RATING_THRESHOLD = 8;

/**
 * 「避けるべき傾向」としてプロンプトに載せる項目数の上限（監督・テーマ・年代ごと）
 *
 * 興味なしが増えるほど傾向も増えるが、全件渡すと指示が薄まる。
 * 頻出する上位だけに絞って、避けるべき方向を明確に伝える。
 */
export const RECOMMENDATIONS_DISMISSED_TRAIT_LIMIT = 5;

/**
 * アクティブユーザー判定期間（日数）
 * last_login_at がこの日数以内のユーザーのみレコメンド生成対象
 */
export const RECOMMENDATIONS_ACTIVE_USER_DAYS = 3;

/**
 * レコメンド生成CRONのバッチサイズ（同時処理するユーザー数の上限）
 */
export const RECOMMENDATIONS_BATCH_SIZE = 5;

/**
 * レコメンド利用イベントの種別
 *
 * CTR = click / impression、ウォッチリスト追加率 = add_to_watchlist / impression、
 * dismiss率 = dismiss / impression で算出する。
 */
export const RECOMMENDATION_EVENT_TYPE = {
  /** 画面に表示された */
  IMPRESSION: 'impression',
  /** タイルがクリックされた */
  CLICK: 'click',
  /** ウォッチリストに追加された */
  ADD_TO_WATCHLIST: 'add_to_watchlist',
  /** 興味なしにされた */
  DISMISS: 'dismiss',
} as const;

export type RecommendationEventType =
  (typeof RECOMMENDATION_EVENT_TYPE)[keyof typeof RECOMMENDATION_EVENT_TYPE];

/**
 * 表示（impression）とみなすタイルの可視率
 * Intersection Observer の threshold に渡す。
 */
export const RECOMMENDATION_IMPRESSION_THRESHOLD = 0.5;

/**
 * 利用イベントの保持日数
 * 行動ログを無期限に持たないよう、日次CRONで超過分を削除する。
 */
export const RECOMMENDATION_EVENT_RETENTION_DAYS = 90;

/**
 * 1リクエストで記録できるイベント件数の上限
 * 表示イベントはまとめて送るため複数件を許容するが、
 * 1画面のレコメンド最大件数（10件）に各種別が付く程度を想定した上限とする。
 */
export const RECOMMENDATION_EVENTS_MAX_PER_REQUEST = 40;

/**
 * 利用イベントをまとめて送るまでの待ち時間（ミリ秒）
 *
 * 表示イベントは画面表示時に一斉に発火するため、最初の1件からこの時間だけ
 * 待ってまとめる。1件ずつ送るとレート制限に即到達する（#757）。
 * 長くするとクリック直後の離脱で取りこぼす可能性が上がるため、
 * 一斉発火がまとまる最小限にとどめる。
 */
export const RECOMMENDATION_EVENTS_FLUSH_DELAY_MS = 500;

/**
 * 送信済み利用イベントを記録する sessionStorage のキー
 *
 * 表示イベントは再訪のたびに再送されるが、サーバー側は
 * (user_id, recommendation_id, event_type) の一意制約で重複を無視するため
 * DB上は no-op で、レート制限の枠だけを消費していた。送信済みを
 * タブ単位で覚えて無駄撃ちを止める。レコメンドは洗い替えのたびに
 * recommendation_id が再採番されるため、更新後は自然に再送される。
 */
export const RECOMMENDATION_EVENTS_SENT_STORAGE_KEY =
  'recommendationEvents.sent';

/**
 * レコメンド手動更新設定
 */
export const RECOMMENDATION_REFRESH = {
  /** 月あたりの更新上限回数 */
  MAX_COUNT: 10,
  /**
   * クライアント側クールダウン（ミリ秒）
   * 更新完了後この時間は更新ボタンを無効化し、連打による無駄な呼び出しを防ぐ。
   */
  CLIENT_COOLDOWN_MS: 30 * MS_PER_SECOND,
  /**
   * サーバー側クールダウン（秒）
   * 直前の呼び出しからこの時間が経過していなければ 429 を返す。
   * クライアント側より長くして、API直叩きによるコスト集中を防ぐ。
   */
  SERVER_COOLDOWN_SECONDS: 60,
} as const;

/**
 * レコメンドメッセージ
 */
export const RECOMMENDATIONS_MESSAGES = {
  NO_FAVORITES: 'お気に入りを登録すると、AIがおすすめ映画を提案します',
  NOT_GENERATED: 'おすすめ映画を準備中です',
  SECTION_TITLE: 'あなたへのおすすめ',
  GENERATION_ERROR: 'レコメンド生成中にエラーが発生しました',
} as const;

/**
 * レコメンド利用イベント記録のメッセージ
 */
export const RECOMMENDATION_EVENTS_MESSAGES = {
  INVALID_BODY: 'イベントの内容が不正です',
  RECORD_FAILED: 'イベントの記録に失敗しました',
} as const;

/**
 * レコメンド手動更新メッセージ
 */
export const RECOMMENDATION_REFRESH_MESSAGES = {
  SUCCESS: 'おすすめ映画を更新しました',
  LIMIT_EXCEEDED: '今月の更新回数上限に達しました（10回/月）',
  COOLDOWN: '更新間隔が短すぎます。しばらく待ってからお試しください',
  GENERATION_FAILED: 'レコメンド生成に失敗しました',
  FETCH_COUNT_FAILED: '更新回数の取得に失敗しました',
  RESET_NOTICE: '来月リセットされます',
  REMAINING_LABEL: (remaining: number, max: number) =>
    `残り${remaining}回 / 月${max}回`,
} as const;

/**
 * レコメンド手動更新エラーコード
 */
export const RECOMMENDATION_REFRESH_ERROR_CODE = {
  LIMIT_EXCEEDED: 'REFRESH_LIMIT_EXCEEDED',
  COOLDOWN: 'REFRESH_COOLDOWN',
  GENERATION_FAILED: 'GENERATION_FAILED',
} as const;
