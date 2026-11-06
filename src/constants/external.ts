/**
 * 外部URL・アセットパス定数
 */

export const EXTERNAL_URLS = {
  /**
   * YouTube埋め込みベースURL
   *
   * プライバシー強化モード（`youtube-nocookie.com`）を使う（#937）。
   * 予告編は**ダイアログを開いた時点で iframe が生成される**ため、Cookie同意
   * バナーの対象外のまま送信が起きる。同意を取ってから送るという建て付けに
   * 揃えられない以上、送る量を減らす。
   *
   * ⚠️ 変更するときは `src/lib/security/cspDirectives.mjs` の `frame-src` も
   * 揃えること。`frame-src` は `default-src` にフォールバックしないため、
   * 片方だけ変えると埋め込みが丸ごとブロックされる。
   */
  YOUTUBE_EMBED: 'https://www.youtube-nocookie.com/embed',
  /** プレースホルダー画像ベースURL */
  PLACEHOLDER_IMAGE: 'https://placehold.co',
} as const;

export const ASSET_PATHS = {
  /** TMDBロゴ */
  TMDB_LOGO: '/tmdb-logo.svg',
} as const;
