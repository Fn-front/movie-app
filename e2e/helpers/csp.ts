/**
 * CSP 違反の収集ヘルパー
 *
 * ## なぜイベントで測るのか
 *
 * `page.on('console')` で数えてはいけない。別オリジンの iframe が出した違反も
 * コンソールには流れてくるので、本体ドキュメントの違反と区別できない。
 * #973 はそれで「メインフレームが i.ytimg.com を要求している」と誤認していた。
 *
 * **本体ドキュメントの CSP が実際に発火したかは
 * `securitypolicyviolation` イベントが正解。** CSP3 では違反した文書の
 * Document（または違反要素）でだけ発火するため、別オリジンの iframe で
 * 起きた違反は混ざらない。
 *
 * ⚠️ `request.frame()` も `page.on('console')` と同様に本体と iframe を
 * 区別する用途には使えない（#973 の計測がこれ）。ただし**帰属がぶれる条件は
 * 未特定**。#973 の再調査では全件が正しく iframe 側に出ており、ぶれを
 * 再現できていない。
 *
 * ## 制約
 *
 * - **ページ遷移をまたがない。** `addInitScript` は新しい document ごとに
 *   収集用の配列を作り直すので、`readCspViolations()` は**いま開いている文書の
 *   分しか返さない**。複数ページを渡るフローでは遷移ごとに読み出すこと
 * - **同一オリジンの子 iframe で起きた違反は取りこぼす。** 読み出しが
 *   メインフレームの `page.evaluate` のため。いまのところ同一オリジンの
 *   iframe は無い
 * - `addInitScript` は子フレームでも評価されるので、別オリジンの iframe 内にも
 *   リスナ自体は仕掛かる。読み出さないので結果には影響しない
 */

import type { Page } from '@playwright/test';

/** 1件の違反。`disposition` は 'enforce'（遮断した）か 'report'（報告のみ）*/
export interface CspViolation {
  disposition: string;
  effectiveDirective: string;
  blockedURI: string;
  sourceFile: string;
  /** どの文書で発火したか。本体か iframe かを失敗時に即断するために持つ */
  documentURI: string;
}

const COLLECTOR_KEY = '__cspViolations';

/**
 * 本体ドキュメントの CSP 違反を集め始める
 *
 * `addInitScript` なので、**ページを開く前に呼ぶこと**。
 */
export async function collectCspViolations(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    const store: unknown[] = [];
    (window as unknown as Record<string, unknown>)[key] = store;
    document.addEventListener('securitypolicyviolation', (event) => {
      store.push({
        disposition: event.disposition,
        effectiveDirective: event.effectiveDirective,
        blockedURI: event.blockedURI,
        sourceFile: event.sourceFile ?? '',
        documentURI: event.documentURI ?? '',
      });
    });
  }, COLLECTOR_KEY);
}

/** 集めた違反を取り出す（いま開いている文書の分だけ） */
export async function readCspViolations(page: Page): Promise<CspViolation[]> {
  return page.evaluate(
    (key) =>
      ((window as unknown as Record<string, unknown>)[key] ??
        []) as CspViolation[],
    COLLECTOR_KEY,
  );
}
