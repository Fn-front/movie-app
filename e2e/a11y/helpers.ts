/**
 * アクセシビリティE2Eの共通ヘルパー
 *
 * axe-core をページ全体に実行し、違反があればテスト名・URL・テーマつきで
 * 読める形に整形して落とす。
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

const THEME_STORAGE_KEY = 'movie-app:theme';

/** 検査するテーマ */
export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

/**
 * 除外するルール
 *
 * ここに足すときは「なぜ現状のままで問題ないか」を必ず書くこと。
 */
const DISABLED_RULES = [
  // Radix UI はオーバーレイ表示中、背景に aria-hidden を付ける（hideOthers）。
  // axe は「aria-hidden の中にフォーカス可能要素がある」として serious を出すが、
  // 実機では FocusScope により Tab が背景へ抜けず、Escape でトリガーへ戻る。
  // 支援技術からも背景は隠れているため、実害のない既知の検出として除外する。
  'aria-hidden-focus',
  // Radix の Portal（ポッパー）は body 直下に描画されるため、
  // ランドマークの外に出る。ポータル自体はダイアログ/メニューとして
  // 適切な role を持っており、ランドマーク所属の要件は満たしている。
  'region',
] as const;

/**
 * テーマを明示指定してページを開く
 *
 * localStorage の設定と prefers-color-scheme の両方を合わせることで、
 * OS 追従のゆらぎを排除する。
 */
export async function gotoWithTheme(
  page: Page,
  path: string,
  theme: Theme,
): Promise<void> {
  await page.emulateMedia({ colorScheme: theme });
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key, value);
    },
    [THEME_STORAGE_KEY, theme] as const,
  );
  await page.goto(path);
  await page.waitForLoadState('domcontentloaded');
  // data-theme が解決されるまで待つ（インラインスクリプト + ThemeProvider）
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  // 本文が描画されるまで待つ。一覧ページはデータ取得後にツールバー（h1）が
  // 出るため、ここで待たないとスケルトン状態のまま検査してしまう。
  await expect(page.locator('h1').first()).toBeAttached({ timeout: 20000 });
}

/** axe の結果（violations / incomplete）を人が読める形に整形する */
function formatResults(
  results: Awaited<ReturnType<AxeBuilder['analyze']>>['violations'],
): string {
  return results
    .map((v) => {
      const nodes = v.nodes
        .map(
          (n) => `      - ${n.target.join(' ')}\n        ${n.failureSummary}`,
        )
        .join('\n');
      return `  [${v.impact}] ${v.id}: ${v.help}\n    ${v.helpUrl}\n${nodes}`;
    })
    .join('\n\n');
}

/**
 * ページ全体に axe-core を実行し、違反および要確認が無いことを検証する
 *
 * `results.violations` だけでなく `results.incomplete`（needs review）も見る。
 * axe は判定しきれないものを incomplete に回すため、violations だけを見ていると
 * 実際の不具合を取りこぼす。たとえば `aria-describedby` が存在しないIDを指す
 * dangling IDREF は `aria-valid-attr-value` の incomplete になり、
 * violations には現れない（#791 がこれで CI をすり抜けていた）。
 *
 * @param label 失敗時に出す識別子（ページ名＋テーマ）
 * @param extraDisabledRules この検査だけ除外するルール。
 *   全体から外すほどではない、画面固有の事情があるときに使う。
 *   追加するときは呼び出し側に理由をコメントで残すこと。
 * @param allowedIncompleteRules この検査だけ incomplete を許容するルール。
 *   「axe が判定できないだけで実害が無い」と確認できたものに限る。
 *   ルールごと無効化する `extraDisabledRules` と違い、violations 側は検出し続ける。
 *   追加するときは呼び出し側に理由をコメントで残すこと。
 */
export async function expectNoA11yViolations(
  page: Page,
  label: string,
  extraDisabledRules: readonly string[] = [],
  allowedIncompleteRules: readonly string[] = [],
): Promise<void> {
  const results = await new AxeBuilder({ page })
    .disableRules([...DISABLED_RULES, ...extraDisabledRules])
    .analyze();

  expect(
    results.violations,
    `${label} (${page.url()}) でアクセシビリティ違反:\n${formatResults(results.violations)}`,
  ).toEqual([]);

  const unexpectedIncomplete = results.incomplete.filter(
    (item) => !allowedIncompleteRules.includes(item.id),
  );

  expect(
    unexpectedIncomplete,
    `${label} (${page.url()}) でアクセシビリティ要確認（incomplete）:\n${formatResults(unexpectedIncomplete)}\n` +
      '実害が無いと確認できたら、呼び出し側の allowedIncompleteRules に理由付きで追加すること。',
  ).toEqual([]);
}
