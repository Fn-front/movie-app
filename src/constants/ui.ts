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
  /** カレンダーポスター画像（日別リスト） */
  CALENDAR_POSTER: { WIDTH: 56, HEIGHT: 84 },
  /** カレンダーポスター画像（月グリッドのセル内チップ） */
  CALENDAR_CHIP_POSTER: { WIDTH: 24, HEIGHT: 36 },
  /** ユーザーアバター（デスクトップ） */
  AVATAR: { WIDTH: 32, HEIGHT: 32 },
  /** ユーザーアバター（モバイル） */
  AVATAR_MOBILE: { WIDTH: 40, HEIGHT: 40 },
  /** キャスト画像 */
  CAST: { WIDTH: 48, HEIGHT: 48 },
  /** 人物ページのプロフィール画像（TMDbのw185に合わせた2:3比） */
  PERSON_PROFILE: { WIDTH: 185, HEIGHT: 278 },
  /** プロバイダーロゴ */
  PROVIDER_LOGO: { WIDTH: 28, HEIGHT: 28 },
  /**
   * TMDbロゴ（フッター）
   *
   * tmdb-logo.svg の viewBox（489.04 × 35.4 = 約 13.81:1）に合わせる。
   * next/image は実レンダリング値と属性値を突き合わせ、片方だけ変化していると
   * 警告を出すため、比がズレていると CSS 幅が宣言幅と一致したときだけ
   * 「幅は同じなのに高さだけ違う」状態になって警告が出る（#871）。
   * 比が合っていれば `height: auto` で両方が連動するので発火しない。
   * 表示サイズは footer.module.scss 側が決めるため、ここは比だけが意味を持つ
   */
  TMDB_LOGO: { WIDTH: 138, HEIGHT: 10 },
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
  /**
   * ポスターを即時読み込みするタイル数（一覧の先頭から）
   *
   * グリッドは `minmax(180px, 1fr)` の `auto-fill` で、1440px 幅だと6列。
   * ヘッダーの高さはページによって違い、フォールド上に入る行数も変わる。
   * 1440×900 での実測:
   * - お気に入り: 1行目 top=171 / 2行目 top=526〜793 → **2行とも収まる**
   * - 公開中・公開予定: 1行目 top=243 / 2行目 top=635〜902 → 2行目は見切れる
   *
   * 最も多く入るページ（お気に入り）に合わせて2行ぶんにする。1行ぶん（6）だと
   * 2行目のタイルが LCP になったときに遅延読み込みのままになる（#878）。
   * これを超えると後続タイルの遅延読み込みが効かなくなるため、増やす場合は
   * フォールド上に収まるかを実測して確認すること。
   *
   * ⚠️ モバイル（2列）では12件＝約6行ぶんを先読みすることになる。
   */
  EAGER_TILE_MAX: 12,
} as const;
