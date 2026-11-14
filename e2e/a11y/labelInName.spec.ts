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
import { test, expect, type Locator, type Page } from '@playwright/test';

import {
  openDedicatedSession,
  type DedicatedSession,
} from '../fixtures/dedicatedSession';
import { MOVIE_ID, mockMovieDetail } from '../helpers/movieDetail';
import { runScopedEmail } from '../helpers/runScope';
import { addMovieToWatchlist } from '../helpers/watchlistFlows';
import { totpCodeFromSecret, getTotpSecret } from '../helpers/totp';

/** カレンダーに必ず1件出すための作品名 */
const CALENDAR_MOVIE_TITLE = 'ラベル検証用の作品';

/** このルールだけを検査する */
const RULE = 'label-content-name-mismatch';

type AxeResults = Awaited<ReturnType<AxeBuilder['analyze']>>;

/** 評価されたノード（セレクタの文字列）を集める */
function evaluatedTargets(results: AxeResults): string[] {
  return [...results.violations, ...results.incomplete, ...results.passes]
    .flatMap((r) => r.nodes)
    .map((n) => n.target.join(' '));
}

/**
 * 対象のルールだけを実行し、violations と incomplete の両方を見る
 *
 * ⚠️ **incomplete も見る。** `✕` のような1文字の非数字は
 * `isHumanInterpretable` が0を返すため violation ではなく incomplete に落ちる。
 * 共通ヘルパー（`expectNoA11yViolations`）も incomplete で落とすので、
 * ここで見ておかないと**データを入れた瞬間に他の spec が落ちる**。
 *
 * @param target 評価されたことを確認したい要素。
 *   ⚠️ **省略できない**（理由は下記の positive control）
 */
async function expectNoLabelMismatch(
  page: Page,
  label: string,
  target: Locator,
): Promise<void> {
  let results: AxeResults | null = null;

  /*
    ⚠️ **狙った要素が評価されるまで待つ（positive control）。**

    レイアウトが落ち着く前に掛けると、その要素がルールの対象から外れて
    **何も見ずに緑**になる。実測で踏んだ: カレンダーのダイアログを開いた
    直後は `inapplicable=1 / viol=0` だったものが、落ち着いてから掛けると
    `viol=1` になった。

    ⚠️ **「1件以上」では足りない**（レビュー指摘）。認証済みページには
    ユーザーメニューのトリガー（`aria-label` + 可視の表示名）が常設されていて、
    それだけで件数条件を満たしてしまう。**狙った要素そのもの**を見ること。

    対象から外れる仕組みは `label-content-name-mismatch-matches` が
    `visibleVirtual()` で可視テキストを取るところ。**可視判定は
    `overflow: hidden` の祖先の矩形と重なるかを見る**ので、スクロール領域の
    外にある要素は「見えていない」扱いで評価されない（実測: 映画詳細モーダルの
    キャストは矩形 937–1038 に対しモーダルが 74–647 で、評価ノード0件だった）。
  */
  await expect
    .poll(
      async () => {
        results = await new AxeBuilder({ page }).withRules([RULE]).analyze();
        // axe が返すのはセレクタ文字列。引いた要素が狙ったものと同じかを見る
        // （クラス名の部分一致だと、ハッシュ付きの別要素に当たりうる）
        return target.evaluate(
          (el, selectors) =>
            selectors.some((selector) => {
              try {
                return document.querySelector(selector) === el;
              } catch {
                return false;
              }
            }),
          evaluatedTargets(results),
        );
      },
      {
        message:
          `${label} で狙った要素が ${RULE} の対象にならなかった。` +
          '検査が成立していないので、違反0件を根拠にできない',
        timeout: 20000,
      },
    )
    .toBe(true);

  const evaluated: AxeResults = results!;

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

/**
 * 可視テキストを持たない（アイコンだけの）ボタンであることを確認する
 *
 * ⚠️ **axe では固定できない。** テキストノードを消した結果、このルールの
 * 対象から外れる（matches が可視テキストの有無を見るため）。
 * 「違反が無い」と「検査していない」を区別できないので、構造で見る。
 *
 * 文字の `✕` に戻すと、`isHumanInterpretable` が「1文字の非数字」を0と
 * 判定するため **incomplete**（要確認）に落ちる。共通ヘルパー
 * （`expectNoA11yViolations`）は incomplete でも落とすので、
 * データが入った瞬間に認証済みの全ページが落ちる（#1056）。
 *
 * ⚠️ `aria-hidden` では直らない。このルールは `screenReader = false` で
 * 可視テキストを取るため、隠しても可視テキストとしては残る。
 */
async function expectIconOnlyButton(
  target: Locator,
  label: string,
): Promise<void> {
  const text = (await target.innerText()).trim();
  expect(
    text,
    `${label} の削除ボタンに可視テキストがある。アイコン（SVG）で描くこと`,
  ).toBe('');

  // 名前が消えていないこと（テキストを消したぶん aria-label が要る）
  await expect(target).toHaveAccessibleName(/ウォッチリストから削除$/);
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

    const dismissButton = page.getByRole('button', { name: '控えました' });
    await expectNoLabelMismatch(page, 'リカバリーコード画面', dismissButton);

    await dismissButton.click();

    // 有効な状態（「リカバリーコードを再発行」ボタンがある）
    const regenerateButton = page.getByRole('button', {
      name: 'リカバリーコードを再発行',
    });
    await expect(regenerateButton).toBeVisible({ timeout: 30000 });
    await expectNoLabelMismatch(
      page,
      '二段階認証が有効な設定画面',
      regenerateButton,
    );
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
                  title: CALENDAR_MOVIE_TITLE,
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

    // 名前が可視テキストから作られていること
    await expect(movieButton).toHaveAccessibleName(
      new RegExp(CALENDAR_MOVIE_TITLE),
    );
  });

  /**
   * 4: 映画詳細のキャスト
   *
   * `{俳優名}のプロフィール` に対し、可視テキストは
   * （プロフィール画像が無ければ頭文字 +）俳優名 + **役名**。
   *
   * ⚠️ **既存の `overlays.spec.ts`「映画詳細モーダル（キャストあり）」では
   * 検査できていなかった**（レビュー指摘。実測で確認）。
   * キャストはモーダルの可視矩形の外にあり、axe の可視判定
   * （`overflow: hidden` の祖先の矩形との重なり）で落ちるため、
   * ルールの評価ノードが**0件**だった:
   *
   *     キャストリンクの矩形 937–1038 / モーダル 74–647 → 評価ノード0件
   *
   * ここでは**スクロールして可視にしてから**検査する。
   */
  test('映画詳細のキャスト（役名あり）', async () => {
    await mockMovieDetail(page, {
      backdrop_path: '/e2e-backdrop.jpg',
      credits: {
        // 役名があるときだけ可視テキストが名前からはみ出す。
        // 画像を持たせないことで頭文字の placeholder も入る
        cast: [
          {
            id: 1,
            name: 'ラベル検証用の俳優',
            character: 'ラベル検証用の役',
            profile_path: null,
            order: 0,
          },
        ],
        crew: [],
      },
    });

    await page.goto(`/movies/now-showing?movie_id=${MOVIE_ID}`);

    const detail = page.getByRole('dialog');
    await expect(detail).toBeVisible({ timeout: 30000 });

    const castLink = detail
      .getByRole('link', { name: /ラベル検証用の俳優/ })
      .first();
    await castLink.scrollIntoViewIfNeeded();
    await expect(castLink).toBeVisible({ timeout: 20000 });

    /*
      ⚠️ **属性で固定する。** 直した結果 `aria-label` 自体が無くなったので、
      axe では「違反が無い」と「検査していない」を区別できない（カレンダーと同じ）。

      名前は可視テキスト（頭文字 + 俳優名 + 役名）から作られる。
      `{俳優名}のプロフィール` を足すと役名が名前に入らず WCAG 2.5.3 に反する。

      ⚠️ 頭文字を ::before の content へ逃がす手は使えない。button と違って
      **link は children-presentational ではない**ので生成テキストも名前に入る
    */
    await expect(castLink).not.toHaveAttribute('aria-label');
    await expect(castLink).not.toHaveAttribute('aria-labelledby');
    await expect(castLink).toHaveAccessibleName(/ラベル検証用の役/);
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
    const sidebarDelete = page
      .getByRole('complementary')
      .getByRole('button', { name: /ウォッチリストから削除$/ })
      .first();
    await expect(sidebarDelete).toBeVisible({ timeout: 30000 });
    await expectIconOnlyButton(sidebarDelete, 'ウォッチリストのサイドバー');

    // タイル側の ✕ は /watchlist にある。
    // ⚠️ main でスコープすること。同じ名前のボタンがサイドバーにもあるので、
    // 無スコープだとタイルが0枚でも通ってしまう
    await page.goto('/watchlist');
    const tileDelete = page
      .getByRole('main')
      .getByRole('button', { name: /をウォッチリストから削除$/ })
      .first();
    await expect(tileDelete).toBeVisible({ timeout: 30000 });
    await expectIconOnlyButton(tileDelete, '/watchlist のタイル');
  });

  /**
   * 6: シアター体験の周波数セレクター（#1106）
   *
   * `低音（80 Hz）` を `aria-label` に入れていたが、**括弧が効かない**。
   * `curateTokens()` は NFKD 正規化で全角括弧を半角に落としたあと
   * `removeParentheticals()` で括弧内を捨てるため、名前側は `["低音"]`
   * だけになり、可視側の `["低音","80","hz"]` を含まない。
   *
   * ⚠️ 実測では **violation ではなく incomplete**（要確認）に落ちていた。
   * axe 4.14 の `valueTextRoles` に `radio` が含まれており、一致しなかった
   * radio は判定が保留されるため。ただし共通ヘルパー
   * `expectNoA11yViolations` は incomplete でも落とすので、`✕` の削除ボタン
   * （上の5番 / #1056）と同じく、放置すると画面を検査対象に入れた瞬間に赤くなる。
   *
   * ⚠️ 兄弟の `OccupancySelector` / `HeatmapToggle` は同じ書き方に見えるが
   * 問題ない。`客席を満席にする` は `Intl.Segmenter` で
   * `["客席","を","満席","に","する"]` に分かれ、可視の `["満席"]` を
   * **連続部分列として含む**（実測で `passes` に入ることを確認済み）。
   * 括弧を使った本件だけが外れる。
   *
   * ⚠️ **ここも axe では固定できない**（カレンダー・キャストと同じ）。
   * `aria-label` を外すと `label-content-name-mismatch-matches` の
   * 「`aria-label` か `aria-labelledby` を持つこと」で弾かれ、ルールの
   * 対象が0件になる。「違反が無い」と「検査していない」を区別できないので
   * 属性で見る。
   */
  test('シアター体験の周波数セレクター', async () => {
    await page.goto('/theater-experience');

    // サイドバーは WebGL2 の可否に関わらず描かれるが、劇場データの取得は待つ
    const sidebar = page.getByRole('complementary', {
      name: '座席・音響の設定',
    });
    await expect(sidebar).toBeVisible({ timeout: 30000 });

    for (const [label, frequency] of [
      ['低音', '80 Hz'],
      ['中音', '1 kHz'],
      ['高音', '8 kHz'],
    ]) {
      const item = sidebar.getByRole('radio', { name: new RegExp(label) });
      await expect(item).toBeVisible({ timeout: 30000 });

      await expect(item).not.toHaveAttribute('aria-label');
      await expect(item).not.toHaveAttribute('aria-labelledby');

      // 見えている文字がすべて名前に入っている
      await expect(item).toHaveAccessibleName(new RegExp(label));
      await expect(item).toHaveAccessibleName(new RegExp(frequency));
    }
  });
});
