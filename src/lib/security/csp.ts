/**
 * Content Security Policy (CSP) ヘッダ生成ロジック
 *
 * `script-src` に `'unsafe-inline'` を許容することで、静的プリレンダ
 * （nonce 不要）を維持したまま CSP を配信できるようにする。
 * nonce / strict-dynamic による全ページ動的化は hydration mismatch を
 * 引き起こしたため採用しない（XSS 多層防御は report / Trusted Types で補う）。
 *
 * CSP の値そのものは `next.config.mjs`（Node ESM）と共有するため、プレーン
 * ESM の共有モジュール `cspDirectives.mjs` に単一ソース化している。本ファイル
 * はその共有ロジックへの薄いラッパであり、値を重複定義しない。
 */

import { buildCspHeaderValue } from './cspDirectives.mjs';

/**
 * CSP ヘッダ値を生成する。
 *
 * 違反レポート用ディレクティブ（`report-to` / `report-uri`）を含む enforce CSP
 * を返す。dev では `script-src` に `'unsafe-eval'` を付与する。
 *
 * @param isDev 開発環境かどうか。開発時のみ `script-src` に `'unsafe-eval'` を付与する
 *   （Next.js の開発ツールが eval を利用するため）。本番では付与しない。
 * @returns 1 行に整形した CSP ヘッダ値
 */
export function buildCspHeader(isDev: boolean): string {
  return buildCspHeaderValue({ isDev, withReporting: true });
}
