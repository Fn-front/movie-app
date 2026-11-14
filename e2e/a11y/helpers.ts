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
 * ページ内でスクロールする領域の識別子
 *
 * ⚠️ **番号は `querySelectorAll('*')` の順ではない。** そちらは
 * **再描画が入ると別の要素を指す**（実測で `LI` や SVG の `line` を指していた）。
 * ページ側に要素の参照そのものを置き（`window.__a11ySweepRegions`）、
 * その配列の添字で指す。
 */
interface ScrollRegion {
  index: number;
  /** 失敗時に読めるようにする要素名 */
  label: string;
  /** 掃引前の `scrollTop`。終わったらここへ戻す */
  initialTop: number;
  /** 送る位置（`scrollTop` の絶対値）。列挙時に確定させる */
  stops: number[];
}

/**
 * 1つの領域を送る段数の上限（異常検知用）
 *
 * 送る位置は**列挙時の高さから先に確定させる**ので、普通はここに当たらない。
 * 当たったら領域の取り方が壊れているので、黙って打ち切らず落とす。
 */
const MAX_SCROLL_STEPS = 24;

declare global {
  interface Window {
    __a11ySweepRegions?: HTMLElement[];
  }
}

/**
 * スクロールする領域を列挙し、ページ側に参照を残す
 *
 * ## 何を対象にするか
 *
 * **利用者が自分で送れる縦スクロール領域**だけ。判定は2つ。
 *
 * 1. `overflow-y` が `auto` / `scroll`
 * 2. ドキュメント自身（`html` / `body`）の場合は、**スクロールロックが
 *    掛かっていないこと**
 *
 * ⚠️ 2 が要る。オーバーレイ表示中、Radix は `body` に `overflow: hidden` と
 * `data-scroll-locked` を付けるが、**`html` の `overflow-y` は `auto` のまま**。
 * 1 だけだと `html` を対象にしてしまい、**利用者がホイールで1pxも動かせない
 * 背景**をプログラムから送ることになる。実測ではそこで背景の一覧が
 * 無限スクロールし（`scrollHeight` 4103 → 7741）、固定されたドロワーの
 * メールアドレスが新しく読み込まれた要素と重なって `color-contrast` が
 * `elmPartiallyObscuring` で incomplete になり、**CI が落ちた**。
 *
 * ## `overflow: hidden` を対象にしない理由
 *
 * ⚠️ 「送れないから」ではない。実測では**プログラムからもキーボードの
 * フォーカス移動からも送れる**。見ているのは**利用者が自分の意思で
 * 送れるか**で、`hidden` はスクロールバーもホイールも効かない。
 *
 * なお「`hidden` かつ中身がはみ出す＝不具合」でもない。`/search` の
 * `c_movie_tile__title` は 2行クランプ（`text-truncate-multiline(2)`）で
 * 意図どおり。クランプされた文字は axe の可視判定でも対象外になる。
 */
async function findScrollRegions(page: Page): Promise<ScrollRegion[]> {
  return page.evaluate(() => {
    /** ドキュメントのスクロールがロックされているか */
    const isDocumentScrollLocked = (): boolean =>
      getComputedStyle(document.body).overflowY === 'hidden' ||
      document.body.hasAttribute('data-scroll-locked');

    const regions: HTMLElement[] = [];

    document.querySelectorAll('*').forEach((el) => {
      const element = el as HTMLElement;
      const overflowY = getComputedStyle(element).overflowY;
      if (overflowY !== 'auto' && overflowY !== 'scroll') return;

      // 1px の端数は丸め差。実際には送れない
      if (element.scrollHeight - element.clientHeight <= 1) return;
      if (element.clientHeight === 0) return;

      const isDocumentScroller =
        element === document.documentElement || element === document.body;
      if (isDocumentScroller && isDocumentScrollLocked()) return;

      regions.push(element);
    });

    window.__a11ySweepRegions = regions;

    return regions.map((element, index) => {
      const step = element.clientHeight;
      /*
        ⚠️ **送る位置は列挙時の高さから先に確定させる。**

        毎回「いま送れるか」で判断すると、一覧の無限スクロールが読み込むたびに
        `scrollHeight` が伸びて終わらない。上限で打ち切ると、**どこまで見たかが
        日によって変わる**（TMDb のデータ量次第）うえ、打ち切ったことが
        誰にも伝わらない。検査の範囲は**テスト開始時点の中身**に固定する。
      */
      const maxTop = Math.max(element.scrollHeight - step, 0);
      const stops: number[] = [];
      for (let top = element.scrollTop + step; top < maxTop; top += step) {
        stops.push(top);
      }
      if (maxTop > element.scrollTop) stops.push(maxTop);

      return {
        index,
        label: `${element.tagName}${
          typeof element.className === 'string' && element.className
            ? `.${element.className.split(' ')[0]}`
            : ''
        }`,
        initialTop: element.scrollTop,
        stops,
      };
    });
  });
}

/**
 * 領域を指定の位置へ送る
 *
 * @returns 要素が生きていて送れたか
 */
async function scrollRegionTo(
  page: Page,
  index: number,
  top: number,
): Promise<boolean> {
  return page.evaluate(
    ([i, value]) => {
      const element = window.__a11ySweepRegions?.[i];
      if (!element || !element.isConnected) return false;

      element.scrollTop = value;
      return true;
    },
    [index, top] as const,
  );
}

/**
 * 領域を掃引前の位置へ戻す
 *
 * ⚠️ **0 に戻すのではなく、元の位置に戻す。** 掃引より前にスクロール済みの
 * 状態で呼ばれると、0 に倒すのは「戻す」ではなく「動かす」になり、
 * 後続のアサーションが見る画面が変わる。
 *
 * ⚠️ **大きさが変わっていても無条件に戻す。** 掃引で無限スクロールが発火して
 * `scrollHeight` が変わるのは普通に起きる。そこで戻すのをやめると、
 * 検査のあと画面が下端に取り残される（実測でそうなっていた）。
 */
async function restoreScrollRegion(
  page: Page,
  index: number,
  top: number,
): Promise<void> {
  await page.evaluate(
    ([i, value]) => {
      const element = window.__a11ySweepRegions?.[i];
      if (element?.isConnected) element.scrollTop = value;
    },
    [index, top] as const,
  );
}

/**
 * 結果のノードを「ルールID + セレクタ」で一意にする
 *
 * ⚠️ `join(' ')` にしないこと。iframe の中は入れ子配列で返るため、
 * `['#a', 'b c']` と `['#a b', 'c']` が同じ鍵になって別のノードが潰れる。
 * 同じ目的の `allowedIncomplete.ts` に合わせて `JSON.stringify` で取る。
 */
function nodeKey(ruleId: string, target: readonly unknown[]): string {
  return `${ruleId}|${JSON.stringify(target)}`;
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
 * 変わる領域（仮想リスト）は、これでも全部は見られない。1領域あたりの段数も
 * `MAX_SCROLL_STEPS` で打ち切る。**狙った要素が評価されたことを
 * 確かめたいときは `expectAxeEvaluated()` を併用する**こと。
 *
 * ## ⚠️ ページを変える副作用がある
 *
 * 一覧の無限スクロールは下端へ送ると次のページを読む。**検査する範囲は
 * テスト開始時点の中身に固定している**ので結果は変わらないが、TMDb への
 * 追加リクエストは起きるし、戻したあとも読み込まれたタイルは残る。
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
  /*
    ⚠️ **空配列を「指定なし」に倒さないこと。** `onlyRules?.length` で
    分岐すると `[]` が既定のルールセット全部へフォールバックする。
    positive control は「可視判定を使うルールで評価されたか」を見るものなので、
    黙って全ルールに広がると**掃引が壊れていても通る**（いちばん危険な方向）。
  */
  if (onlyRules && onlyRules.length === 0) {
    throw new Error(
      'onlyRules に空配列を渡さないこと。全ルールで検査したいなら undefined を渡す',
    );
  }

  const analyze = () => {
    const builder = new AxeBuilder({ page });
    return onlyRules
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
  // 掃引前の位置で1回。各領域の1段目はここで見ている
  await runOnce();

  for (const region of regions) {
    /*
      ⚠️ **黙って打ち切らない。** 送る位置は列挙時に確定しているので、
      ここに当たるのは領域の取り方が壊れているとき。打ち切りを握りつぶすと
      「検査したつもりで見ていない範囲」が静かに生まれる（このPRが
      潰そうとしているものそのもの）
    */
    if (region.stops.length > MAX_SCROLL_STEPS) {
      throw new Error(
        `${region.label} の送り位置が ${region.stops.length} 段と多すぎる` +
          `（上限 ${MAX_SCROLL_STEPS}）。領域の取り方を見直すこと`,
      );
    }

    for (const top of region.stops) {
      if (!(await scrollRegionTo(page, region.index, top))) break;
      await runOnce();
    }

    /*
      次の領域を見る前に、この領域を**掃引前の位置へ**戻す。
      戻さないと「複数の領域を同時に送った状態」という、実際には誰も見ない
      配置を検査することになる。検査のあと画面が下端に取り残されるのも防ぐ。
    */
    await restoreScrollRegion(page, region.index, region.initialTop);
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
