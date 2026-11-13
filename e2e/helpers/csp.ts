/**
 * CSP 違反の収集ヘルパー
 *
 * ⚠️ **`page.on('console')` で数えてはいけない。** 別オリジンの iframe が出した
 * 違反もコンソールには流れてくるので、本体ドキュメントの違反と区別できない。
 * #973 はそれで「メインフレームが i.ytimg.com を要求している」と誤認していた。
 *
 * `request.frame()` も当てにならない。ブラウザが initiator を持たない要求
 * （プリロードスキャン由来。CDP で `initiator.type === 'other'`）は
 * 帰属がぶれる。
 *
 * **本体ドキュメントの CSP が実際に発火したかは
 * `securitypolicyviolation` イベントが唯一の正解。** 発火した文書でしか
 * 上がらないので、iframe 内の違反は混ざらない。
 */

import type { Page } from '@playwright/test';

/** 1件の違反。`disposition` は 'enforce'（遮断した）か 'report'（報告のみ）*/
export interface CspViolation {
  disposition: string;
  effectiveDirective: string;
  blockedURI: string;
  sourceFile: string;
}

const COLLECTOR_KEY = '__cspViolations';

/**
 * 本体ドキュメントの CSP 違反を集め始める
 *
 * `addInitScript` なので、**ページを開く前に呼ぶこと**。
 * 以後の遷移でも仕掛け直される。
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
      });
    });
  }, COLLECTOR_KEY);
}

/** 集めた違反を取り出す */
export async function readCspViolations(page: Page): Promise<CspViolation[]> {
  return page.evaluate(
    (key) =>
      ((window as unknown as Record<string, unknown>)[key] ??
        []) as CspViolation[],
    COLLECTOR_KEY,
  );
}
