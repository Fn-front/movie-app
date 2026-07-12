/**
 * Content Security Policy (CSP) ヘッダ生成ロジック
 *
 * nonce ベースの CSP を採用し、`script-src` から `'unsafe-inline'` を除去する。
 * インラインスクリプト（layout.tsx のテーマ初期化）にはリクエストごとに生成した
 * nonce を付与することで実行を許可する。
 *
 * `'strict-dynamic'` を併用することで、nonce 付きスクリプトが動的に読み込む
 * スクリプト（Next.js の chunk 等）を信頼し、明示的なホワイトリスト維持を不要にする。
 */

/** リクエストごとに一意な nonce を生成する（base64 エンコードした UUID） */
export function generateNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString('base64');
}

/**
 * CSP ヘッダ値を生成する。
 *
 * @param nonce リクエストごとの nonce
 * @param isDev 開発環境かどうか。開発時のみ `script-src` に `'unsafe-eval'` を付与する
 *   （Next.js の開発ツールが eval を利用するため）。本番では付与しない。
 * @returns 1 行に整形した CSP ヘッダ値
 */
export function buildCspHeader(nonce: string, isDev: boolean): string {
  const directives = [
    "default-src 'self'",
    // nonce + strict-dynamic により 'unsafe-inline' を除去。
    // 本番では 'unsafe-eval' を付与しない（多層防御の強化）。
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${
      isDev ? " 'unsafe-eval'" : ''
    }`,
    // style-src は Next.js / 各種ライブラリのインラインスタイルに依存するため
    // 'unsafe-inline' を維持する（今回の対応スコープ外）。
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
  ];

  return directives.join('; ');
}
