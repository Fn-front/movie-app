/**
 * スマホ幅のタップ領域 E2Eテスト（#1017）
 *
 * `e2e/a11y/*.spec.ts` では見られない。あちらは viewport 未指定＝デスクトップ幅で
 * 走るので、SP でしか出ない要素（ヘッダーのメニュー・ドロワー）がそもそも無い。
 * `target-size` も axe-core 4.14 では既定で `enabled: false` なので掛からない。
 *
 * 検査は2本立てで、**役割が違う**。
 *
 * ## 1. 個別の実測（このファイルの主役）
 *
 * `boundingBox()` と `elementFromPoint` で、要素ごとに大きさとヒット領域を測る。
 * **本件で直した箇所はすべてこちらが押さえている**（修正前のスタイルに戻すと
 * 6本落ちる）。
 *
 * ## 2. axe の `target-size` による面の検査（取りこぼし用の網）
 *
 * ⚠️ **これだけでは本件を1件も検出できない。** 実測して確かめた:
 *
 * - **`::after` で広げたヒット領域を見ない。** `getBoundingClientRect` しか
 *   使わないので、44px へ広げても 28px のままと判定する
 * - **18×18 だったⓘを拾わない。** `target-size` の `matches` は
 *   `widget-not-inline-matches`（＝`isInTextBlock` を含む）なので、
 *   文章の中に収まる要素は**評価対象から外れる**（`passes` ではなく
 *   inapplicable）。ⓘ は h1 と同じ行にあるため当たらない。
 *   だからⓘは上の実測で個別に押さえている
 * - **孤立した小さい要素も拾わないことがある。** ルールは
 *   `any: [target-size, target-offset]` で、**どちらか一方が通れば pass**。
 *   周囲に他のターゲットが無ければ `target-offset` 側で通る
 *
 * それでも残すのは、**新しく足した要素**が 24px を割ったときに気づけるため。
 * 修正後の実測で、各ページ 12〜80 ノードが実際に評価されている
 * （`/watchlist` 12 / `/settings` 18 / `/movies/now-showing` 74 /
 * `/search` 80）。待たずに走らせると数ノードしか見ないので、
 * 中身が描けるまで待ってから掛けること
 */

import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import {
  ARIA_LABELS,
  MENU_LABELS,
  WATCHLIST_STREAMING_HINT_LABELS,
} from '@/constants';

import { movieTiles } from '../helpers/locators';
import { addMovieToWatchlist } from '../helpers/watchlistFlows';
import { runScopedEmail } from '../helpers/runScope';
import { expectTapAreaAtLeast, TAP_TARGET_MIN } from '../helpers/tapTarget';
import {
  openDedicatedSession,
  type DedicatedSession,
} from '../fixtures/dedicatedSession';
import { test } from '../fixtures/auth';

/** SP 表示幅 */
const SP_VIEWPORT_WIDTH = 375;

/** 最狭幅（iPhone SE 相当） */
const NARROW_VIEWPORT_WIDTH = 320;

/** ウォッチリスト検証用の専用ユーザー（共有ユーザーだと他の spec に消される） */
const USER = {
  email: runScopedEmail('e2e-tap-target'),
  password: 'TapTargetE2e1',
} as const;

test.use({
  viewport: { width: SP_VIEWPORT_WIDTH, height: 812 },
});

/**
 * WCAG 2.5.8 Target Size (Minimum / AA) だけを検査する
 *
 * `withRules` は runOnly として渡るため、既定で無効なルールも実行される
 * （実測: ルールが評価され `passes` に入ることを確認済み）。
 * 他のルールは `e2e/a11y/` が見るのでここでは走らせない（二重に落ちても
 * 原因が分かりにくくなるだけ）。
 *
 * `incomplete` も見る。axe は重なりなどで判定しきれないものをそちらへ回すので、
 * violations だけでは取りこぼす（`e2e/a11y/helpers.ts` と同じ理由）
 */
async function expectNoTargetSizeViolations(
  page: Page,
  label: string,
): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withRules(['target-size'])
    .analyze();

  const format = (items: typeof results.violations) =>
    items
      .flatMap((v) =>
        v.nodes.map((n) => `  ${n.target.join(' ')}\n    ${n.failureSummary}`),
      )
      .join('\n');

  expect(
    results.violations,
    `${label} でタップ領域が WCAG 2.5.8 (AA) を下回る:\n${format(results.violations)}`,
  ).toEqual([]);

  expect(
    results.incomplete,
    `${label} でタップ領域が要確認:\n${format(results.incomplete)}`,
  ).toEqual([]);
}

test.describe('スマホ幅のタップ領域', () => {
  /**
   * ⓘ は 18×18 で、**唯一 WCAG 2.5.8 AA の 24px を下回って**いた（#1017）。
   * ラベル等による拡張も無いので、要素そのものを広げるしかない。
   *
   * ⚠️ **axe は拾わない。** h1 と同じ行にあるため `target-size` の
   * `matches`（`isInTextBlock` を含む）から外れ、評価対象にならない
   * （修正前のビルドで違反0件を確認）。ここで大きさを直に測る
   */
  test('ウォッチリストの並び替えヒント（ⓘ）が AA を満たす', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/watchlist');

    // ⓘ は設定へのリンク（ツールチップの中に操作要素を置けないため）
    const hint = page.getByRole('link', {
      name: WATCHLIST_STREAMING_HINT_LABELS.TRIGGER_ARIA,
    });
    await expect(hint).toBeVisible();

    const box = await hint.boundingBox();
    expect(box).not.toBeNull();
    // 24px は WCAG の下限。ここが 18 に戻ると AA 不適合になる
    expect(box!.width).toBeGreaterThanOrEqual(24);
    expect(box!.height).toBeGreaterThanOrEqual(24);

    // 見た目は小さいままでも、指で押せる広さがあること
    await expectTapAreaAtLeast(hint, 'ⓘ');
  });

  /**
   * ポスター上の操作ボタンは見た目 28px のまま。大きくすると
   * カードの情報量を圧迫するので、ヒット領域だけ広げている（Issue の案A）
   */
  test('一覧タイルのウォッチリストボタンが指で押せる', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/movies/now-showing');

    const tile = movieTiles(page).first();
    await expect(tile).toBeVisible({ timeout: 20000 });

    const button = tile.getByRole('button', { name: /ウォッチリスト/ });
    await expect(button).toBeVisible();

    // 見た目は 28px のままであること（案B＝見た目を大きくする、を採っていない）
    const box = await button.boundingBox();
    expect(box!.width).toBeLessThan(TAP_TARGET_MIN);

    await expectTapAreaAtLeast(button, '一覧タイルのウォッチリストボタン');
  });

  /**
   * カードの角丸（`border-radius` + `overflow: hidden`）の真上に来るので、
   * 広げた領域の角がクリップされやすい。ウォッチリスト（右下）とは
   * 別に見る必要がある
   */
  test('一覧タイルのお気に入りボタンが指で押せる', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/movies/now-showing');

    const tile = movieTiles(page).first();
    await expect(tile).toBeVisible({ timeout: 20000 });

    const button = tile.getByRole('button', { name: /お気に入り/ });
    await expect(button).toBeVisible();

    await expectTapAreaAtLeast(button, '一覧タイルのお気に入りボタン');
  });

  /**
   * 映画詳細の操作列（共有 / お気に入り / ウォッチリスト）は 36px が
   * **4px 間隔**で並んでいた。44px に広げると領域が重なり、DOM で後ろの
   * ウォッチリストが手前を食う＝**ハートのすぐ右を押すとウォッチリストが
   * 反応する**（#1017）。間隔を 8px にして解消した
   */
  test('映画詳細の操作ボタンが食い合わない', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/movies/now-showing');

    await page.locator('[class*="c_movie_tile__title_link"]').first().click();

    const detail = page.getByRole('dialog');
    await expect(detail).toBeVisible({ timeout: 30000 });

    const watchlistButton = detail
      .getByRole('button', { name: /ウォッチリスト/ })
      .first();
    const favoriteButton = detail
      .getByRole('button', { name: /お気に入り/ })
      .first();
    await expect(watchlistButton).toBeVisible({ timeout: 20000 });
    await expect(favoriteButton).toBeVisible();

    // ⚠️ **開くアニメーションの最中に測らないこと。** Radix の
    // `data-state="open"` アニメーションで一時的に縮んで見え（実測 36 → 34.56px）、
    // 必要な間隔が 8px ではなく 9.44px と算出されて落ちる。
    // 固定待ちではなく、条件が満たされるまでリトライする形で待つ
    await expect
      .poll(
        async () => {
          const [watchlistBox, favoriteBox] = await Promise.all([
            watchlistButton.boundingBox(),
            favoriteButton.boundingBox(),
          ]);
          if (!watchlistBox || !favoriteBox) return -1;
          // 見た目 36px なら 8px 空いていれば 44px の領域が重ならない
          const gap = watchlistBox.x - (favoriteBox.x + favoriteBox.width);
          return gap - (TAP_TARGET_MIN - favoriteBox.width);
        },
        {
          message:
            'お気に入りとウォッチリストの間隔が足りず、44px の領域が重なる',
          timeout: 15000,
        },
      )
      .toBeGreaterThanOrEqual(0);

    // ハートのすぐ右（かつてウォッチリストが食っていた位置）を押すと
    // お気に入りに当たる
    const hitsFavorite = await favoriteButton.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.right + 2, r.top + r.height / 2);
      return hit === el || el.contains(hit);
    });
    expect(hitsFavorite, 'お気に入りのすぐ右が別のボタンに食われている').toBe(
      true,
    );
  });

  test('ヘッダーのメニューボタンが指で押せる', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/');

    const menuButton = page.getByRole('button', {
      name: ARIA_LABELS.OPEN_MENU,
    });
    await expect(menuButton).toBeVisible();

    const box = await menuButton.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(TAP_TARGET_MIN);
    expect(box!.height).toBeGreaterThanOrEqual(TAP_TARGET_MIN);
  });

  test('ドロワーのアクション項目が指で押せる', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/');

    await page.getByRole('button', { name: ARIA_LABELS.OPEN_MENU }).click();

    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();

    // 閉じるボタン（36px だった）
    const close = drawer.getByRole('button', { name: ARIA_LABELS.CLOSE });
    const closeBox = await close.boundingBox();
    expect(closeBox!.width).toBeGreaterThanOrEqual(TAP_TARGET_MIN);
    expect(closeBox!.height).toBeGreaterThanOrEqual(TAP_TARGET_MIN);

    // 設定・ログアウト等の行（高さ 37px だった）
    const settings = drawer.getByRole('button', {
      name: MENU_LABELS.SETTINGS,
    });
    const settingsBox = await settings.boundingBox();
    expect(settingsBox).not.toBeNull();
    expect(settingsBox!.height).toBeGreaterThanOrEqual(TAP_TARGET_MIN);
  });

  test('設定のチェックボックス・ラジオの行が指で押せる', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/settings');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 20000 });

    // 行ごと押せる形にしている（丸・四角そのものは 24px のまま）
    for (const role of ['checkbox', 'radio'] as const) {
      const control = page.getByRole(role).first();
      // ⚠️ 見つからなかったら落とす。`continue` で飛ばしていた頃は、
      // 要素が1つも無くてもこのテストが緑だった
      await expect(control, `${role} が見つからない`).toBeVisible({
        timeout: 15000,
      });

      const row = control.locator('xpath=..');
      const rowBox = await row.boundingBox();
      expect(rowBox, `${role} の行が測れない`).not.toBeNull();
      expect(
        rowBox!.height,
        `${role} の行の高さが ${TAP_TARGET_MIN}px 未満`,
      ).toBeGreaterThanOrEqual(TAP_TARGET_MIN);

      // ⚠️ **高さだけでは足りない。** 行を高くしても、ラベルを縦いっぱいに
      // 伸ばしていなければ**押せるのは丸・四角の 24px だけ**で、行の上下は
      // 素通りする。実際に押して効くかを見る
      const label = row.locator('label');
      const labelBox = await label.boundingBox();
      expect(labelBox, `${role} のラベルが測れない`).not.toBeNull();
      expect(
        labelBox!.height,
        `${role} のラベルが行の高さまで伸びていない（align-self: stretch）`,
      ).toBeGreaterThanOrEqual(TAP_TARGET_MIN);

      // ⚠️ `elementFromPoint` は**ビューポート外の座標で null を返す**。
      // 設定のチェックボックスは y=875（高さ 812）にあり、スクロールせずに
      // 測ると「押せない」と誤判定する
      //
      // ⚠️ `scrollIntoViewIfNeeded` ではなく**中央へ寄せる**。前者は最小限しか
      // スクロールしないため要素が画面下端に着地し、そこは固定のボトムナビ
      // （57px）の下になる。ラベル全体がナビに覆われ、3点とも
      // `c_bottom_nav__link` が返って「押せない」と誤判定した。
      // 余白を詰めてページの高さが変われば着地位置も変わるので、
      // レイアウトの寸法に依存しない形にしておく
      await label.evaluate((el) => el.scrollIntoView({ block: 'center' }));

      // スクロールの反映を待つ。並列実行で負荷が高いと、evaluate の時点で
      // まだ画面外にいて elementFromPoint が null を返すことがある
      await expect
        .poll(
          async () =>
            label.evaluate((el) => {
              const r = el.getBoundingClientRect();
              // ラベルの左端・下端寄り。文字の無い余白でも効くこと
              const hit = document.elementFromPoint(r.left + 2, r.bottom - 2);
              return hit === el || el.contains(hit);
            }),
          {
            message: `${role} のラベル下端を押しても当たらない`,
            timeout: 10000,
          },
        )
        .toBe(true);
    }
  });

  /**
   * 新しく足した要素が 24px を割っていないかの網（上のコメントの「2.」）。
   * **本件の修正はここでは検出できない**ので、個別の実測と併せて見ること
   */
  for (const path of [
    '/watchlist',
    '/settings',
    '/movies/now-showing',
    '/search?query=matrix',
  ] as const) {
    test(`${path} に 24px 未満の操作要素が無い`, async ({
      authenticatedPage: page,
    }) => {
      await page.goto(path);
      await expect(page.locator('h1').first()).toBeAttached({ timeout: 20000 });
      // ⚠️ h1 はデータ取得より先に出る。待たずに掛けると数ノードしか
      // 評価されず、緑でも何も見ていないのと同じになる（#1071 と同じ罠）
      await page.waitForLoadState('networkidle');

      await expectNoTargetSizeViolations(page, `${path}（SP幅）`);
    });
  }
});

/**
 * ウォッチリストに作品がある状態でしか見られないもの
 *
 * ⚠️ **共有の TEST_USER を使わない。** 一覧が空だと検証できないので1件入れるが、
 * 同じユーザーのウォッチリストを全消しする spec が複数あり
 * （`overlayHistoryWatchlistModals` / `writeApiRateLimit` /
 * `streamingNoticeSettings`）、並列実行で入れた直後に消される。
 * 実際に3ブラウザ同時実行で落ちた
 */
test.describe('ウォッチリストのタップ領域', () => {
  test.describe.configure({ mode: 'serial', timeout: 120000 });

  let session: DedicatedSession;
  let page: Page;

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(120000);
    session = await openDedicatedSession(browser, USER);
    page = session.page;
    // ⚠️ `browser.newContext()` は config の `use` を引き継がない。
    // Playwright 既定の 1280×720 で開くので SP 幅に直す
    await page.setViewportSize({
      width: SP_VIEWPORT_WIDTH,
      height: 812,
    });
    await addMovieToWatchlist(page);
  });

  test.afterAll(async () => {
    await session.close();
  });

  /**
   * 削除は破壊的操作。視聴済みと 4px 間隔で並んでいたため、
   * ヒット領域を広げると**互いに食い合う**。間隔も空ける必要がある（#1017）
   */
  test('削除と視聴済みが食い合わない', async () => {
    await page.setViewportSize({ width: SP_VIEWPORT_WIDTH, height: 812 });
    await page.goto('/watchlist');

    const deleteButton = page
      .getByRole('button', { name: /をウォッチリストから削除$/ })
      .first();
    const watchedButton = page
      .getByRole('button', { name: /を視聴済みにする$/ })
      .first();

    await expect(deleteButton).toBeVisible({ timeout: 30000 });
    await expect(watchedButton).toBeVisible({ timeout: 30000 });

    const [deleteBox, watchedBox] = await Promise.all([
      deleteButton.boundingBox(),
      watchedButton.boundingBox(),
    ]);
    expect(deleteBox).not.toBeNull();
    expect(watchedBox).not.toBeNull();

    // 見た目どうしの間隔。44px のヒット領域が重ならないためには
    // 「44 - 見た目の幅」以上が要る
    const gap = deleteBox!.x - (watchedBox!.x + watchedBox!.width);
    expect(gap).toBeGreaterThanOrEqual(TAP_TARGET_MIN - watchedBox!.width);

    // 広げた領域の中心寄りは、それぞれ自分のボタンに当たる
    await expectTapAreaAtLeast(deleteButton, '削除');
    await expectTapAreaAtLeast(watchedButton, '視聴済み');
  });

  /**
   * 間隔を 4px → 16px に広げた分は本当に場所を取る。
   * 最狭幅（iPhone SE 相当）でポスターから溢れないことを見る
   */
  test('最狭幅でも操作ボタンがポスターから溢れない', async () => {
    await page.setViewportSize({
      width: NARROW_VIEWPORT_WIDTH,
      height: 812,
    });
    await page.goto('/watchlist');

    const watchedButton = page
      .getByRole('button', { name: /を視聴済みにする$/ })
      .first();
    await expect(watchedButton).toBeVisible({ timeout: 30000 });

    const box = await watchedButton.boundingBox();
    expect(box!.x).toBeGreaterThan(0);

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBe(overflow.clientWidth);
  });
});
