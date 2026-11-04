/**
 * eiga.com 取得層の共通型
 *
 * `fetchEigaGoldenGlobes` と `fetchEigaOscarAwards` が同じ形で返すため、
 * どちらかのモジュールに置くと他方から逆向きに import することになる。
 */

import type { OpenAiAwardItem } from '@/schema/awards';

/**
 * eiga.com からの取得結果
 *
 * **「取得できなかった」と「取得できたが0件」を分ける。** 前者はサイトの一時障害や
 * URLの誤りで、再実行・設定確認が要る。後者はページ構造の変更で、パーサの修正が要る。
 * どちらも0件として畳むと、原因の違いが画面から判別できない（#918 / #956）。
 */
export type EigaFetchOutcome =
  | { type: 'ok'; items: OpenAiAwardItem[] }
  /** ページを取得できなかった（HTTPエラー・タイムアウト） */
  | { type: 'unavailable' }
  /** ページは取得できたが1件も抽出できなかった */
  | { type: 'empty' };
