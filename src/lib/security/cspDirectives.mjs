/**
 * Content Security Policy (CSP) ディレクティブの単一ソース。
 *
 * `next.config.mjs`（Node ESM・TS トランスパイル前）からは TypeScript の
 * `csp.ts` を直接 import できないため、CSP の定義そのものはプレーン ESM
 * である本モジュールに集約する。`csp.ts` と `next.config.mjs` の双方が
 * ここを import することで、値の二重定義（同期漏れ）を防ぐ。
 *
 * 方針（段階1 から継続）:
 * - `script-src` に `'unsafe-inline'` を許容し、静的プリレンダ（nonce 不要）
 *   を維持する。nonce / strict-dynamic は hydration mismatch を招くため不採用。
 * - dev のみ `script-src` に `'unsafe-eval'` を付与する（Next.js 開発ツールが
 *   eval を利用するため）。
 *
 * 段階2 で追加:
 * - CSP 違反を自前収集するため `report-to` / `report-uri` を付与する
 *   （enforce CSP に付与し、通常運用での違反を監視する）。
 */

/**
 * CSP 違反レポートの受信エンドポイント（自前 API Route）。
 * `report-uri`（後方互換）と `Reporting-Endpoints` の URL に共通で用いる。
 */
export const CSP_REPORT_PATH = '/api/csp-report';

/**
 * `report-to` で参照する Reporting API のエンドポイント名（グループ名）。
 * `Reporting-Endpoints` ヘッダのキーと一致させること。
 */
export const CSP_REPORT_GROUP = 'csp-endpoint';

/**
 * CSP ディレクティブ配列を生成する。
 *
 * @param {object} [options] 生成オプション
 * @param {boolean} [options.isDev=false] 開発環境かどうか。
 *   true の場合のみ `script-src` に `'unsafe-eval'` を付与する。
 * @param {boolean} [options.withReporting=false] 違反レポート用ディレクティブ
 *   （`report-to` / `report-uri`）を付与するかどうか。
 * @returns {string[]} CSP ディレクティブの配列（"; " で連結して利用する）
 */
export function getCspDirectives({
  isDev = false,
  withReporting = false,
} = {}) {
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

  if (withReporting) {
    // report-to は Reporting API（Reporting-Endpoints ヘッダのグループ名を参照）。
    // report-uri は report-to 未対応ブラウザ向けの後方互換。
    directives.push(`report-to ${CSP_REPORT_GROUP}`);
    directives.push(`report-uri ${CSP_REPORT_PATH}`);
  }

  return directives;
}

/**
 * CSP ヘッダ値（1 行文字列）を生成する。
 *
 * @param {object} [options] {@link getCspDirectives} と同じオプション
 * @returns {string} "; " で連結した CSP ヘッダ値
 */
export function buildCspHeaderValue(options) {
  return getCspDirectives(options).join('; ');
}

/**
 * `Reporting-Endpoints` ヘッダ値を生成する。
 * report-to のグループ名（{@link CSP_REPORT_GROUP}）と受信 URL を対応づける。
 *
 * @returns {string} 例: `csp-endpoint="/api/csp-report"`
 */
export function buildReportingEndpointsValue() {
  return `${CSP_REPORT_GROUP}="${CSP_REPORT_PATH}"`;
}
