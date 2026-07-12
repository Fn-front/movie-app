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
 *
 * 段階3 で追加:
 * - DOM-based XSS を型レベルで封じるため Trusted Types を導入する。まずは
 *   `Content-Security-Policy-Report-Only` に `require-trusted-types-for 'script'`
 *   と `trusted-types <policy>` を付与し、違反を `/api/csp-report` に収集する
 *   （enforce CSP＝unsafe-inline はそのまま維持し、既存機能を壊さない）。
 * - Report-Only 段階で違反が出ないことを確認してから、段階4 で enforce CSP へ
 *   `require-trusted-types-for 'script'` を昇格させる。
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
 * Trusted Types のポリシー名（許可リスト）。
 * `trusted-types` ディレクティブに列挙する名前と、クライアント側で
 * `trustedTypes.createPolicy(...)` に渡す名前を一致させるため単一ソース化する。
 *
 * - `sanitize-html`: DOMPurify で sanitize する汎用 HTML ポリシー（アプリ用）。
 * - `theme-init`: `layout.tsx` のテーマ初期化インラインスクリプト（固定文字列）を
 *   enforce 昇格後も動作させるための named ポリシー。
 * - `dompurify`: DOMPurify が内部で生成し得るデフォルトポリシー名。明示的に
 *   許可リストへ含めておく（内部ポリシー利用時に enforce でブロックされないため）。
 * - `nextjs`: Next.js（App Router のスクリプト注入等）が利用し得るポリシー名。
 *   Report-Only 段階で違反を観測し、enforce 昇格時の許可要否を判断する。
 */
export const TRUSTED_TYPES_POLICIES = Object.freeze([
  'sanitize-html',
  'theme-init',
  'dompurify',
  'nextjs',
]);

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

/**
 * Trusted Types 用の Report-Only CSP ディレクティブ配列を生成する（段階3）。
 *
 * enforce CSP（{@link getCspDirectives}）とは独立した
 * `Content-Security-Policy-Report-Only` ヘッダに載せる。Report-Only なので
 * 違反はブロックされず `/api/csp-report` に収集されるのみ。これにより
 * `unsafe-inline` を維持したまま DOM-based XSS の sink を安全に洗い出せる。
 *
 * - `require-trusted-types-for 'script'`: DOM sink（innerHTML 等）へ生文字列を
 *   渡す操作を TrustedHTML 必須にする。
 * - `trusted-types <policy...>`: 許可するポリシー名の列挙。
 *   ここに無い名前で `createPolicy` すると（enforce 時に）失敗する。
 * - `report-to` / `report-uri`: 違反を既存の収集エンドポイントへ送る。
 *
 * @returns {string[]} Report-Only CSP ディレクティブの配列
 */
export function getTrustedTypesReportOnlyDirectives() {
  return [
    "require-trusted-types-for 'script'",
    `trusted-types ${TRUSTED_TYPES_POLICIES.join(' ')}`,
    `report-to ${CSP_REPORT_GROUP}`,
    `report-uri ${CSP_REPORT_PATH}`,
  ];
}

/**
 * Trusted Types 用の Report-Only CSP ヘッダ値（1 行文字列）を生成する。
 *
 * @returns {string} `Content-Security-Policy-Report-Only` に設定する値
 */
export function buildTrustedTypesReportOnlyHeaderValue() {
  return getTrustedTypesReportOnlyDirectives().join('; ');
}
