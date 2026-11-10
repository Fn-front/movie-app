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
  /**
   * YouTube の視聴ページURL（埋め込みが使えないときの代替導線 / #980）
   *
   * クロスオリジンの iframe は `onError` が発火せず、埋め込みの失敗を
   * **検知できない**。そのため出し分けはせず常時表示する。埋め込みが
   * 禁止されている動画・年齢制限・削除済み・CSPでのブロックなど、
   * 空のプレイヤーになる経路はいずれもこのリンクで迂回できる。
   *
   * 埋め込みと違い `youtube-nocookie.com` ではなく `youtube.com` を指す。
   * nocookie 側に視聴ページが無いため。**トップレベル遷移なので
   * `frame-src` の管轄外**で、片方を変えてももう片方は壊れない。
   *
   * 利用者がクリックしたときだけ遷移するので、端末からの自動送信は
   * 増えない（#937 の「同意前の送信を減らす」方針と矛盾しない）。
   */
  YOUTUBE_WATCH: 'https://www.youtube.com/watch',
  /** プレースホルダー画像ベースURL */
  PLACEHOLDER_IMAGE: 'https://placehold.co',
} as const;

export const ASSET_PATHS = {
  /** TMDBロゴ */
  TMDB_LOGO: '/tmdb-logo.svg',
} as const;
