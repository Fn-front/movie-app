/**
 * UI関連の定数
 */

/**
 * 画像サイズ定数
 */
export const IMAGE_SIZES = {
  /** ポスター画像（タイル・グリッド表示用） */
  POSTER: { WIDTH: 500, HEIGHT: 750 },
  /** ポスター画像（詳細モーダル用） */
  POSTER_DETAIL: { WIDTH: 200, HEIGHT: 300 },
  /** サムネイル画像（リスト表示用） */
  THUMBNAIL: { WIDTH: 36, HEIGHT: 54 },
  /** カレンダーポスター画像 */
  CALENDAR_POSTER: { WIDTH: 46, HEIGHT: 69 },
  /** ユーザーアバター（デスクトップ） */
  AVATAR: { WIDTH: 32, HEIGHT: 32 },
  /** ユーザーアバター（モバイル） */
  AVATAR_MOBILE: { WIDTH: 40, HEIGHT: 40 },
  /** キャスト画像 */
  CAST: { WIDTH: 48, HEIGHT: 48 },
  /** プロバイダーロゴ */
  PROVIDER_LOGO: { WIDTH: 28, HEIGHT: 28 },
  /** TMDbロゴ（フッター） */
  TMDB_LOGO: { WIDTH: 100, HEIGHT: 8 },
} as const;

/**
 * アイコンサイズ定数
 */
export const ICON_SIZES = {
  /** 小サイズ（ナビゲーション・検索・メニュー等） */
  SM: 20,
  /** 中サイズ（閉じるボタン等） */
  MD: 24,
  /** 大サイズ（再生ボタン等） */
  LG: 32,
} as const;

/**
 * レーティング閾値
 */
export const RATING_THRESHOLDS = {
  /** 高評価（この値以上で high クラス適用） */
  HIGH: 7,
  /** 中評価（この値以上で mid クラス適用） */
  MID: 5,
} as const;

/**
 * 表示制限
 */
export const DISPLAY_LIMITS = {
  /** タイルに表示するジャンル数上限 */
  GENRE_MAX: 2,
  /** 映画詳細に表示するキャスト数上限 */
  CAST_MAX: 10,
  /** スケルトン表示数（デフォルト） */
  SKELETON_DEFAULT: 20,
  /** スケルトン表示数（小規模リスト） */
  SKELETON_SMALL: 8,
  /** 興味なし映画の初期表示数 */
  DISMISSED_INITIAL: 10,
} as const;
