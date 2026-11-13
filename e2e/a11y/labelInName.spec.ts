/**
 * WCAG 2.5.3 Label in Name の回帰テスト（#1085）
 *
 * `label-content-name-mismatch` は「`aria-label` を持つ要素の中に、その
 * `aria-label` に含まれない可視テキストがある」ことを検出する。音声入力で
 * 見えている文字を読み上げて操作する利用者が、見えているとおりに言っても
 * 反応しなくなる。
 *
 * ## ⚠️ ここでしか検出できない
 *
 * 既存の a11y spec は**その状態まで辿り着いていない**ので緑だった。
 *
 * | 箇所 | 既存 spec が通っていた理由 |
 * | --- | --- |
 * | 二段階認証の2つのボタン | 共有テストユーザーは 2FA 無効。画面が描かれない |
 * | 公開カレンダーの作品ボタン | 共有ユーザーのウォッチリストが空でセルも一覧も0件。さらに `overlays.spec.ts` はルールごと除外していた |
 * | ウォッチリストの削除（✕） | 一覧が空で行もタイルも描かれない |
 *
 * **データを入れてから検査する**のがこの spec の役割。
 */

import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';

import {
  openDedicatedSession,
  type DedicatedSession,
} from '../fixtures/dedicatedSession';
import { runScopedEmail } from '../helpers/runScope';
import { addMovieToWatchlist } from '../helpers/watchlistFlows';
import { totpCodeFromSecret, getTotpSecret } from '../helpers/totp';

/** このルールだけを検査する */
const RULE = 'label-content-name-mismatch';

/**
 * 対象のルールだけを実行し、violations と incomplete の両方を見る
 *
 * ⚠️ **incomplete も見る。** `✕` のような1文字の非数字は
 * `isHumanInterpretable` が0を返すため violation ではなく incomplete に落ちる。
 * 共通ヘルパー（`expectNoA11yViolations`）も incomplete で落とすので、
 * ここで見ておかないと**データを入れた瞬間に他の spec が落ちる**。
 */
type AxeResults = Awaited<ReturnType<AxeBuilder['analyze']>>;

/** 評価されたノードの総数 */
function countNodes(results: AxeResults): number {
  return [
    ...results.violations,
    ...results.incomplete,
    ...results.passes,
  ].flatMap((r) => r.nodes).length;
}

async function expectNoLabelMismatch(
  page: Page,
  label: string,
  /*
    対象ノードが1件も無いことを許すか。

    ⚠️ **既定は false（1件以上を要求する）。** 直した結果 `aria-label` 自体が
    無くなった画面では、このルールの対象が0件になるのが正常なので、
    そこだけ true にして**別の形で**固定すること（カレンダーがその例）
  */
  options: { allowNoTarget?: boolean } = {},
): Promise<void> {
  let results: AxeResults | null = null;

  /*
    ⚠️ **1ノードでも評価されるまで待つ（positive control）。**

    レイアウトが落ち着く前に掛けると、ルールごと inapplicable になって
    **何も見ずに緑**になる。実測で踏んだ: ダイアログを開いた直後は
    `inapplicable=1 / viol=0` だったものが、落ち着いてから掛けると
    `viol=1` になった（ボタンの寸法も 276×96 → 287×100 と動いていた）。

    `label-content-name-mismatch` の matches は `widget-not-inline-matches`
    （`isInTextBlock` を含む）で、計算済みレイアウトに依存する。
    件数が0のまま進ませないこと。
  */
  await expect
    .poll(
      async () => {
        results = await new AxeBuilder({ page }).withRules([RULE]).analyze();
        return countNodes(results);
      },
      {
        message:
          `${label} で ${RULE} の対象が1件も評価されなかった。` +
          '検査が成立していないので、0件を根拠にできない',
        timeout: 20000,
      },
    )
    .toBeGreaterThanOrEqual(options.allowNoTarget === true ? 0 : 1);

  const evaluated = results as unknown as AxeResults;

  const format = (items: AxeResults['violations']) =>
    items
      .flatMap((v) =>
        v.nodes.map((n) => `  ${n.target.join(' ')}\n    ${n.failureSummary}`),
      )
      .join('\n');

  expect(
    evaluated.violations,
    `${label} で ${RULE} の違反:\n${format(evaluated.violations)}`,
  ).toEqual([]);

  expect(
    evaluated.incomplete,
    `${label} で ${RULE} の要確認:\n${format(evaluated.incomplete)}`,
  ).toEqual([]);
}

test.describe('Label in Name（データを入れた状態）', () => {
  test.describe.configure({ mode: 'serial', timeout: 180000 });

  const USER = {
    email: runScopedEmail('e2e-label-in-name'),
    password: 'LabelInNameE2e1',
  } as const;

  let session: DedicatedSession;
  let page: Page;

  /**
   * ⚠️ **共有の TEST_USER を使わない。** 二段階認証を有効化し、ウォッチリストに
   * 作品を入れるため、同じユーザーを使う他の spec を並列実行時に壊す
   */
  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(180000);
    session = await openDedicatedSession(browser, USER);
    page = session.page;
  });

  test.afterAll(async () => {
    await session.close();
  });

  /**
   * 1・2: `twoFactorSettings` の2つのボタン
   *
   * - 再発行: `リカバリーコードを10個再発行する` / 可視は `リカバリーコードを再発行`
   * - 控えた: `リカバリーコードを控えた` / 可視は `控えました`
   *
   * **有効化の直後にリカバリーコード画面が出る**ので、1回の流れで両方を通る。
   */
  test('二段階認証の設定画面', async () => {
    await page.goto('/settings');

    await page.getByRole('button', { name: '二段階認証を設定する' }).click();
    await expect(
      page.getByRole('img', { name: '二段階認証のQRコード' }),
    ).toBeVisible({ timeout: 30000 });

    const secret = await getTotpSecret(USER.email);
    expect(secret).not.toBeNull();

    await page.getByLabel('認証コード').fill(totpCodeFromSecret(secret!));
    await page.getByRole('button', { name: '二段階認証を有効にする' }).click();

    // リカバリーコード画面（「控えました」ボタンがある）
    await expect(
      page.getByRole('list', { name: 'リカバリーコード' }),
    ).toBeVisible({ timeout: 30000 });
    await expectNoLabelMismatch(page, 'リカバリーコード画面');

    await page.getByRole('button', { name: '控えました' }).click();

    // 有効な状態（「リカバリーコードを再発行」ボタンがある）
    await expect(
      page.getByRole('button', { name: 'リカバリーコードを再発行' }),
    ).toBeVisible({ timeout: 30000 });
    await expectNoLabelMismatch(page, '二段階認証が有効な設定画面');
  });

  /**
   * 3: 公開カレンダーの作品ボタン
   *
   * `aria-label={movie.title}` に対し、可視テキストは
   * 作品名 + 公開日 + 公開までの日数。
   *
   * ⚠️ カレンダーは**ウォッチリスト由来**（`/api/watchlist/calendar`）。
   * 実データに公開予定が無いと0件になり検査にならないので、API を差し替える。
   */
  test('公開カレンダー（作品あり）', async () => {
    const today = new Date();
    const target = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 15),
    );
    const dateKey = target.toISOString().slice(0, 10);
    const month = dateKey.slice(0, 7);

    await page.route('**/api/watchlist/calendar**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            month,
            movies_by_date: {
              [dateKey]: [
                {
                  id: 'label-in-name-1',
                  tmdb_movie_id: 550,
                  title: 'ラベル検証用の作品',
                  poster_path: null,
                  release_date: dateKey,
                  added_at: `${dateKey}T00:00:00.000Z`,
                },
              ],
            },
          },
        }),
      }),
    );

    await page.goto('/');
    await page.getByRole('button', { name: /公開カレンダー/ }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 30000 });

    // 月全体の一覧に作品が出るまで待つ（ここが0件だと検査にならない）
    const movieButton = dialog
      .getByRole('button', { name: /ラベル検証用の作品/ })
      .first();
    await expect(movieButton).toBeVisible({ timeout: 30000 });

    /*
      ⚠️ **ここは axe ではなく属性で固定する。**

      直した結果 `aria-label` 自体が無くなったので、このルールの対象が
      0件になる＝axe では「違反が無い」と「検査していない」を区別できない。
      `aria-label` が戻ったら落ちる形にしておけば、
      レイアウトの落ち着き待ちにも左右されない。

      名前は中の可視テキスト（作品名 + 公開日 + 公開までの日数）から作られる。
      作品名だけの `aria-label` を足すと、見えている文字の大半が名前に
      入らず WCAG 2.5.3 に反する
    */
    await expect(movieButton).not.toHaveAttribute('aria-label');
    await expect(movieButton).not.toHaveAttribute('aria-labelledby');

    // 名前が可視テキストを含むこと（属性が無いことの裏返しを実際に確認する）
    const visibleText = (await movieButton.innerText()).replace(/\s+/g, '');
    const accessibleName = await movieButton.evaluate((el) =>
      (el.textContent ?? '').replace(/\s+/g, ''),
    );
    expect(accessibleName).toContain(visibleText);

    // ダイアログの他の要素（閉じる・月送り等）も見る
    await expectNoLabelMismatch(page, '公開カレンダー（作品あり）', {
      allowNoTarget: true,
    });

    await page.unroute('**/api/watchlist/calendar**');
  });

  /**
   * 5: `✕` の削除ボタン（サイドバーと `/watchlist` のタイル）
   *
   * ⚠️ これは violation ではなく **incomplete**。
   * `isHumanInterpretable` が「1文字の非数字」を0と判定するため、axe は
   * 可視テキストを人が解釈できる文字列と見なさず判定を保留する。
   * 共通ヘルパーは incomplete でも落とすので、放置するとデータが入った
   * 瞬間に認証済みの全ページが落ちる（#1056）。
   */
  test('ウォッチリスト（作品あり）', async () => {
    await addMovieToWatchlist(page);

    // サイドバー（complementary）は一覧ページに常設。行の ✕ がここにある
    await expect(
      page
        .getByRole('complementary')
        .getByRole('button', { name: /ウォッチリストから削除$/ })
        .first(),
    ).toBeVisible({ timeout: 30000 });

    await expectNoLabelMismatch(page, 'ウォッチリストのサイドバー');

    // タイル側の ✕ は /watchlist にある
    await page.goto('/watchlist');
    await expect(
      page.getByRole('button', { name: /をウォッチリストから削除$/ }).first(),
    ).toBeVisible({ timeout: 30000 });

    await expectNoLabelMismatch(page, '/watchlist（作品あり）');
  });
});
