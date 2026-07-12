/**
 * Content Security Policy (CSP) ヘッダ生成ロジック
 *
 * `script-src` に `'unsafe-inline'` を許容することで、静的プリレンダ
 * （nonce 不要）を維持したまま CSP を配信できるようにする。
 * nonce / strict-dynamic による全ページ動的化は hydration mismatch を
 * 引き起こしたため採用しない（XSS 多層防御は後続段階で report / Trusted
 * Types により補う）。
 *
 * unsafe-inline を許容するため CSP は nonce に依存せず、next.config.mjs で
 * 全パスへ静的ヘッダとして配信する。
 */

/**
 * CSP ヘッダ値を生成する。
 *
 * @param isDev 開発環境かどうか。開発時のみ `script-src` に `'unsafe-eval'` を付与する
 *   （Next.js の開発ツールが eval を利用するため）。本番では付与しない。
 * @returns 1 行に整形した CSP ヘッダ値
 */
export function buildCspHeader(isDev: boolean): string {
  const directives = [
    "default-src 'self'",
    // 静的プリレンダを維持するため 'unsafe-inline' を許容する。
    // dev は Next.js 開発ツールが eval を利用するため 'unsafe-eval' も付与する。
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
    // style-src は Next.js / 各種ライブラリのインラインスタイルに依存するため
    // 'unsafe-inline' を維持する。
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https://image.tmdb.org data: blob:",
    // data: は @fullcalendar/core が内部でアイコンフォント(fcicons)を
    // base64エンコードした data: URI で読み込むために必要
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co",
    'frame-src https://www.youtube.com',
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // プラグイン（<object>/<embed>）を全面禁止し、埋め込みベクタを塞ぐ
    "object-src 'none'",
  ];

  return directives.join('; ');
}
