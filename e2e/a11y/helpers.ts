/**
 * アクセシビリティE2Eの共通ヘルパー
 *
 * axe-core をページ全体に実行し、違反があればテスト名・URL・テーマつきで
 * 読める形に整形して落とす。
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page } from '@playwright/test';

import {
  filterUnexpectedIncomplete,
  type AllowedIncomplete,
} from './allowedIncomplete';

export type { AllowedIncomplete };

const THEME_STORAGE_KEY = 'movie-app:theme';

/** 検査するテーマ */
export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

/**
 * ホームで許容する incomplete
 *
 * 横スクロールのカルーセルには、表示幅の右端で切れるカードが必ず1枚できる
 * （カード幅196pxに対し表示幅は割り切れない）。その切れたカードのタイトルが
 * 2行に折り返すと、axe は要素がクリップ境界をまたぐために背景色を決定できず
 * color-contrast を incomplete に回す。コントラスト自体は正常で、スクロールして
 * 全体が見える位置に来ると消える。右端にどの作品が来るかは TMDb のデータ次第
 * なので、日によって出たり消えたりする。
 *
 * messageKey と対象セレクタの両方で絞っているため、カルーセル外（画像の上の
 * 文字など）の「背景色を決定できない」は従来どおり落ちる。
 *
 * ホームは未認証（`publicPages.spec.ts`）・認証済み（`authenticatedPages.spec.ts`）
 * × デスクトップ／SP の4通りで検査し、どれも同じカルーセルを見るためここで共有する。
 */
export const HOME_ALLOWED_INCOMPLETE: readonly AllowedIncomplete[] = [
  {
    id: 'color-contrast',
    messageKey: 'elmPartiallyObscuring',
    targetIncludes: 'movie_list__item',
  },
];

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
  // ページの骨格が出るまで待つ。
  //
  // ⚠️ **h1 はデータ取得より先に出る。** 一覧ページのツールバーはスケルトン段階で
  // 既に描かれているので、ここを抜けてもタイルは0枚のことがある。
  // 一覧の中身まで検査したいときは `waitForMovieTiles()` を併用すること（#1071）
  await expect(page.locator('h1').first()).toBeAttached({ timeout: 20000 });
}

/**
 * 映画タイルが描画されるまで待つ
 *
 * `gotoWithTheme()` だけでは**スケルトンを検査して緑になる**（#1071）。
 * h1 到達が約160ms、axe の完了が約543msで、タイルの出現がちょうどその前後に
 * 来るため、結果が実行環境の速度で決まっていた。
 *
 * タイルの実体だけを引く（スケルトンと子要素を除く）のは
 * `e2e/helpers/locators.ts` の `movieTiles()` と同じ条件。
 */
export async function waitForMovieTiles(page: Page): Promise<void> {
  await page
    .locator(
      '[class*="c_card"][class*="c_movie_tile"]:not([class*="c_movie_tile_skeleton"])',
    )
    .first()
    .waitFor({ state: 'visible', timeout: 20000 });
}

/** axe が返す結果の1件（violations / incomplete / passes で同じ形） */
type AxeResult = Awaited<
  ReturnType<AxeBuilder['analyze']>
>['violations'][number];

/**
 * ページ内でスクロールする領域の情報
 *
 * `index` は `document.querySelectorAll('*')` の順。ページを跨がないので、
 * 1回の検査の中だけで有効
 */
interface ScrollRegion {
  index: number;
  /** 1段あたりの送り幅（px）。領域の表示高さ（＝`clientHeight`） */
  stepPx: number;
  /** 列挙時の `scrollHeight`。同じ要素を指しているかの確認に使う */
  scrollHeight: number;
  /** 何段に分けて送るか（1なら送らなくても全部見えている） */
  steps: number;
}

/**
 * スクロールする領域を列挙する
 *
 * ⚠️ `overflow: hidden` は**対象にしない**。利用者が自力で送れない領域なので、
 * そこに操作要素があること自体が別の不具合であり、スクロールして検査すると
 * 「見えないが検査は通る」という誤った安心を作る。見るのは `auto` / `scroll`
 * だけに絞る。
 */
async function findScrollRegions(page: Page): Promise<ScrollRegion[]> {
  return page.evaluate(() => {
    const regions: {
      index: number;
      stepPx: number;
      scrollHeight: number;
      steps: number;
    }[] = [];

    document.querySelectorAll('*').forEach((el, index) => {
      const element = el as HTMLElement;
      const overflowY = getComputedStyle(element).overflowY;
      if (overflowY !== 'auto' && overflowY !== 'scroll') return;

      const stepPx = element.clientHeight;
      const scrollHeight = element.scrollHeight;
      const hidden = scrollHeight - stepPx;
      // 1px の端数は丸め差。実際には送れない
      if (hidden <= 1 || stepPx === 0) return;

      // 表示高さぶんずつ送る。境界にまたがる要素はどちらの段でも一部が
      // 見えており、axe の可視判定は矩形の**重なり**を見るので取りこぼさない
      regions.push({
        index,
        stepPx,
        scrollHeight,
        steps: Math.ceil(hidden / stepPx) + 1,
      });
    });

    return regions;
  });
}

/**
 * 指定した領域の `scrollTop` を設定し、意図どおり動いたかを返す
 *
 * ⚠️ 番号は `querySelectorAll('*')` の順なので、**検査の途中で再描画が入ると
 * 別の要素を指す**。黙って別の場所を送ると、検査の範囲が静かに狭まる。
 * 送る前に `scrollHeight` / `clientHeight` が列挙時と一致するかを見て、
 * 違っていたら何もせず false を返す。
 */
async function setScrollTop(
  page: Page,
  region: ScrollRegion,
  top: number,
): Promise<boolean> {
  return page.evaluate(
    ([{ index, stepPx, scrollHeight }, value]) => {
      const el = document.querySelectorAll('*')[index] as
        | HTMLElement
        | undefined;
      if (!el) return false;
      if (el.clientHeight !== stepPx || el.scrollHeight !== scrollHeight) {
        return false;
      }
      el.scrollTop = value;
      return true;
    },
    [region, top] as const,
  );
}

/** 結果のノードを「ルールID + セレクタ」で一意にする */
function nodeKey(ruleId: string, target: readonly unknown[]): string {
  return `${ruleId}|${target.join(' ')}`;
}

/**
 * 複数回の axe 実行の結果を、ノード単位で重複を除いて1つにまとめる
 *
 * 同じ要素が複数のスクロール位置で評価されるため、素朴に連結すると
 * 同じ違反が何度も並んで読みにくくなる。
 */
function mergeResults(runs: readonly AxeResult[][]): AxeResult[] {
  const byRule = new Map<string, AxeResult>();
  const seen = new Set<string>();

  for (const run of runs) {
    for (const result of run) {
      const merged = byRule.get(result.id) ?? { ...result, nodes: [] };

      for (const node of result.nodes) {
        const key = nodeKey(result.id, node.target);
        if (seen.has(key)) continue;
        seen.add(key);
        merged.nodes.push(node);
      }

      if (merged.nodes.length > 0) byRule.set(result.id, merged);
    }
  }

  return [...byRule.values()];
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
 *   ルールIDだけでなく `{ id, messageKey, targetIncludes }` で条件を絞れる。
 *   同じルールでも事情の違うものを取りこぼさないよう、可能な限り絞ること。
 *   追加するときは呼び出し側に理由をコメントで残すこと。
 */
export async function expectNoA11yViolations(
  page: Page,
  label: string,
  extraDisabledRules: readonly string[] = [],
  allowedIncompleteRules: readonly AllowedIncomplete[] = [],
): Promise<void> {
  const { violations, incomplete } = await analyzeAcrossScrollRegions(
    page,
    extraDisabledRules,
  );

  expect(
    violations,
    `${label} (${page.url()}) でアクセシビリティ違反:\n${formatResults(violations)}`,
  ).toEqual([]);

  const unexpectedIncomplete = filterUnexpectedIncomplete(
    incomplete,
    allowedIncompleteRules,
  );

  expect(
    unexpectedIncomplete,
    `${label} (${page.url()}) でアクセシビリティ要確認（incomplete）:\n${formatResults(unexpectedIncomplete)}\n` +
      '実害が無いと確認できたら、呼び出し側の allowedIncompleteRules に理由付きで追加すること。',
  ).toEqual([]);
}

/**
 * スクロール領域を送りながら axe を繰り返し実行し、結果をまとめる
 *
 * ## なぜ1回では足りないか（#1107）
 *
 * axe の可視判定は、`overflow` を持つ祖先の矩形と重なるかを見る
 * （`label-content-name-mismatch-matches` などが使う `visibleVirtual()`）。
 * **スクロールしないと見えない要素は「見えていない」扱いで評価されない。**
 *
 * 実測した例: 映画詳細モーダルでキャストのリンクの矩形が 937–1038、
 * モーダル本体が 74–647。`label-content-name-mismatch` の評価ノードは **0件**
 * だった。それでも結果は緑になるので、**「検査した」と「違反が無い」を
 * 取り違える**のがいちばんの危険だった。
 *
 * ## なぜ「下までスクロールして1回」では足りないか
 *
 * 下端まで送ると、今度は**上にあった要素**が見えなくなる。盲点が移るだけ。
 * 表示高さぶんずつ送って毎回検査し、結果を足し合わせる。
 *
 * ## 取りこぼしが残る場合
 *
 * 横スクロール・入れ子のスクロール領域の組み合わせ・スクロールで内容が
 * 変わる領域（仮想リスト）は、これでも全部は見られない。**狙った要素が
 * 評価されたことを確かめたいときは `expectAxeEvaluated()` を併用する**こと。
 *
 * @param extraDisabledRules この検査だけ除外するルール
 * @param onlyRules 指定するとこのルールだけを実行する（positive control 用）
 */
async function analyzeAcrossScrollRegions(
  page: Page,
  extraDisabledRules: readonly string[] = [],
  onlyRules?: readonly string[],
): Promise<{
  violations: AxeResult[];
  incomplete: AxeResult[];
  /** 評価されたノードのセレクタ（passes も含む）。検査の成立確認に使う */
  evaluatedTargets: string[];
}> {
  const analyze = () => {
    const builder = new AxeBuilder({ page });
    return onlyRules?.length
      ? builder.withRules([...onlyRules]).analyze()
      : builder
          .disableRules([...DISABLED_RULES, ...extraDisabledRules])
          .analyze();
  };

  const violationRuns: AxeResult[][] = [];
  const incompleteRuns: AxeResult[][] = [];
  const evaluatedTargets = new Set<string>();

  const runOnce = async () => {
    const results = await analyze();
    violationRuns.push(results.violations);
    incompleteRuns.push(results.incomplete);
    for (const result of [
      ...results.violations,
      ...results.incomplete,
      ...results.passes,
    ]) {
      for (const node of result.nodes) {
        evaluatedTargets.add(node.target.join(' '));
      }
    }
  };

  const regions = await findScrollRegions(page);
  await runOnce();

  for (const region of regions) {
    // 1段目は上の初回実行と同じ位置なので、2段目から送る
    for (let step = 1; step < region.steps; step += 1) {
      // 送れなかった（再描画で別要素を指している）ならこの領域は諦める。
      // 無理に続けると、別の場所を送った状態を検査することになる
      if (!(await setScrollTop(page, region, step * region.stepPx))) break;
      await runOnce();
    }
    // 次の領域を見るときに、前の領域は元の位置へ戻しておく。
    // そうしないと「複数の領域を同時に送った状態」という、実際には
    // 誰も見ない配置を検査することになる
    await setScrollTop(page, region, 0);
  }

  return {
    violations: mergeResults(violationRuns),
    incomplete: mergeResults(incompleteRuns),
    evaluatedTargets: [...evaluatedTargets],
  };
}

/**
 * 狙った要素が axe の評価対象に入ったことを検証する（positive control）
 *
 * ⚠️ **「違反0件」だけでは意味を持たない場合がある。** 要素がルールの対象から
 * 外れていれば、何も見ずに緑になる（#1107 はこれで「緑だがキャストは
 * 1件も評価されていない」状態だった）。
 *
 * `expectNoA11yViolations()` はスクロール領域を送るようにしたが、
 * 横スクロールや仮想リストまでは見られない。**ここで検査されてほしい要素**が
 * あるテストでは、これを併用すること。
 *
 * ⚠️ **`expectNoA11yViolations()` と同じ掃引を通す。** 単に今の位置で axe を
 * 走らせるだけだと、掃引が終わって領域が先頭に戻った状態を見ることになり、
 * 「掃引が効いているか」を確かめられない。
 *
 * @param target 評価されたことを確認したい要素
 * @param label 失敗時に出す識別子
 * @param rules 実行するルール。省略すると既定のルールセット全部
 */
export async function expectAxeEvaluated(
  page: Page,
  target: Locator,
  label: string,
  rules?: readonly string[],
): Promise<void> {
  await expect
    .poll(
      async () => {
        const { evaluatedTargets } = await analyzeAcrossScrollRegions(
          page,
          [],
          rules,
        );

        // axe が返すのはセレクタ文字列。引いた要素と同じ実体かを見る
        // （クラス名の部分一致だと、ハッシュ付きの別要素に当たりうる）
        return target.evaluate(
          (el, list) =>
            list.some((selector) => {
              try {
                return document.querySelector(selector) === el;
              } catch {
                return false;
              }
            }),
          evaluatedTargets,
        );
      },
      {
        message:
          `${label} が axe の評価対象にならなかった。検査が成立していないので、` +
          '違反0件を根拠にできない',
        timeout: 30000,
      },
    )
    .toBe(true);
}
