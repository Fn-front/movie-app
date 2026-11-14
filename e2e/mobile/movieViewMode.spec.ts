/**
 * 映画一覧のグリッド／リスト表示切替 E2Eテスト（認証済み・SP幅）
 *
 * デスクトップ幅のプロジェクトでは SP の一覧性は検証できないため、
 * `e2e/mobile/` に置く（#1014）
 */

import type { Page } from '@playwright/test';

import { ARIA_LABELS } from '@/constants';
import { test, expect } from '../fixtures/auth';
import { expectTapAreaAtLeast } from '../helpers/tapTarget';

/** SP 表示幅 */
const SP_VIEWPORT_WIDTH = 375;

/** SP 表示高さ（iPhone X 相当） */
const SP_VIEWPORT_HEIGHT = 812;

/** リスト表示で1画面に収めたい最低件数（#1014 の完了条件） */
const MIN_VISIBLE_ROWS = 6;

/**
 * 映画タイルの実体
 *
 * `movie_tile` の部分一致だけだとスケルトン（`c_movie_tile_skeleton`）にも
 * `__poster` などの子要素にも当たり、件数の判定が成立しない。
 * カード直下だけを引く（`e2e/search/search.spec.ts` と同じ絞り方）
 */
const TILE_SELECTOR =
  '[class*="c_card"][class*="c_movie_tile"]:not([class*="c_movie_tile_skeleton"])';

/** リスト表示のタイル。`c_movie_tile_skeleton--list` には当たらない */
const LIST_TILE_SELECTOR = `${TILE_SELECTOR}[class*="movie_tile--list"]`;

test.use({
  viewport: { width: SP_VIEWPORT_WIDTH, height: SP_VIEWPORT_HEIGHT },
});

/** 一覧にタイルが何件描画されたか（スケルトンは数えない） */
const waitForTiles = async (page: Page) => {
  const tiles = page.locator(TILE_SELECTOR);
  const appeared = await tiles
    .first()
    .waitFor({ state: 'visible', timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  return appeared ? tiles.count() : 0;
};

/** 表示切替のトグル */
const viewToggle = (page: Page) =>
  page.getByRole('button', { name: ARIA_LABELS.LIST_VIEW });

/**
 * ビューポート内に全体が収まっているタイルの数
 *
 * 「1画面に何件入るか」は高さの実測でしか分からない。件数ではなく
 * 矩形で数える
 */
const countFullyVisibleTiles = (page: Page) =>
  page.evaluate((selector) => {
    const viewportHeight = window.innerHeight;
    return Array.from(document.querySelectorAll(selector)).filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= viewportHeight;
    }).length;
  }, LIST_TILE_SELECTOR);

test.describe('映画一覧の表示モード切替', () => {
  test('グリッドとリストを行き来できる', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/movies/now-showing');
    test.skip((await waitForTiles(page)) === 0, '映画データが無いためスキップ');

    // 既定はグリッド
    await expect(page.locator(LIST_TILE_SELECTOR)).toHaveCount(0);
    await expect(viewToggle(page)).toHaveAttribute('aria-pressed', 'false');

    await viewToggle(page).click();

    await expect(page.locator(LIST_TILE_SELECTOR).first()).toBeVisible();
    await expect(viewToggle(page)).toHaveAttribute('aria-pressed', 'true');

    // 戻せないと片道トグルになる
    await viewToggle(page).click();

    await expect(page.locator(LIST_TILE_SELECTOR)).toHaveCount(0);
    await expect(viewToggle(page)).toHaveAttribute('aria-pressed', 'false');
  });

  test('リスト表示では1画面に6件以上が収まる', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/movies/now-showing');

    const tileCount = await waitForTiles(page);
    test.skip(
      tileCount < MIN_VISIBLE_ROWS,
      `映画が${MIN_VISIBLE_ROWS}件未満（${tileCount}件）のためスキップ`,
    );

    await viewToggle(page).click();
    await expect(page.locator(LIST_TILE_SELECTOR).first()).toBeVisible();

    // グリッドは1画面に2件しか入らない（#1014 の実測）。
    // リストで 6 件以上入ることがこの機能の目的そのもの。
    //
    // 行は 86px（ポスター 56px ÷ 2 × 3 ＋ 枠線）＋ 間隔 8px。
    // 一覧より上（ヘッダー・タブ・ツールバー）が 207px を大きく超えると
    // 5件に落ちるので、ツールバーに要素を足すときはこのテストを見ること
    expect(await countFullyVisibleTiles(page)).toBeGreaterThanOrEqual(
      MIN_VISIBLE_ROWS,
    );
  });

  test('切替状態がリロード後も保持される', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/movies/now-showing');
    test.skip((await waitForTiles(page)) === 0, '映画データが無いためスキップ');

    await viewToggle(page).click();
    await expect(page.locator(LIST_TILE_SELECTOR).first()).toBeVisible();

    await page.reload();

    await expect(page.locator(LIST_TILE_SELECTOR).first()).toBeVisible();
  });

  test('切替は画面をまたいで共通に効く', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/movies/now-showing');
    test.skip((await waitForTiles(page)) === 0, '映画データが無いためスキップ');

    await viewToggle(page).click();
    await expect(page.locator(LIST_TILE_SELECTOR).first()).toBeVisible();

    // 設定は localStorage に1つだけ持つ。他の対象画面にもそのまま効く
    for (const path of ['/search?query=mission', '/person/500']) {
      await page.goto(path);
      const count = await waitForTiles(page);
      if (count === 0) continue;

      await expect(page.locator(LIST_TILE_SELECTOR).first()).toBeVisible();
    }
  });

  test('切替ボタンのタップ領域が44×44以上ある', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/movies/now-showing');

    const toggle = viewToggle(page);
    await expect(toggle).toBeVisible();

    // #1017 の基準。新しく足す操作要素で下回らせない
    const box = await toggle.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test('リスト行は視覚の並びどおりにタブ移動できる', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/movies/now-showing');
    test.skip((await waitForTiles(page)) === 0, '映画データが無いためスキップ');

    await viewToggle(page).click();

    const listTile = page.locator(LIST_TILE_SELECTOR).first();
    await expect(listTile).toBeVisible();

    // DOM 順（＝タブ順）が視覚の左右と食い違うと、1行ごとに
    // 右端のボタンから左のタイトルへ逆走する（WCAG 1.3.2 / 2.4.3）
    const lefts = await listTile.evaluate((tile) =>
      Array.from(tile.querySelectorAll('button')).map(
        (el) => el.getBoundingClientRect().left,
      ),
    );

    expect(lefts.length).toBeGreaterThan(1);
    for (let i = 1; i < lefts.length; i += 1) {
      expect(lefts[i]).toBeGreaterThanOrEqual(lefts[i - 1]);
    }
  });

  /**
   * ポスターから行の右端へ移したときに重ねてしまうと誤爆する（#1017）。
   *
   * ⚠️ **間隔だけでは重なりを検知できない。** 8px しか見ていなかったため、
   * `$spacing-4` がスマホで 12px に下がっても通り続けていた（#1119）。
   * 実際に押したら何に当たるかを `expectTapAreaAtLeast` で併せて見る
   */
  test('リスト行の操作ボタンが重ならず16px以上空く', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/movies/now-showing');
    test.skip((await waitForTiles(page)) === 0, '映画データが無いためスキップ');

    await viewToggle(page).click();

    const listTile = page.locator(LIST_TILE_SELECTOR).first();
    await expect(listTile).toBeVisible();

    const actionButtons = listTile.locator(
      '[class*="c_movie_tile__list_actions"] button',
    );
    const actionCount = await actionButtons.count();
    expect(actionCount).toBeGreaterThan(0);

    for (let index = 0; index < actionCount; index += 1) {
      const button = actionButtons.nth(index);
      await expectTapAreaAtLeast(
        button,
        `リスト行の操作ボタン ${await button.getAttribute('aria-label')}`,
      );
    }

    const gaps = await listTile.evaluate((tile) => {
      const buttons = Array.from(tile.querySelectorAll('button'))
        .map((el) => el.getBoundingClientRect())
        // タイトルの button はカード全面の当たり判定なので除く（#719）
        .filter((rect) => rect.width > 0 && rect.width <= 44)
        .sort((a, b) => a.left - b.left);

      return buttons
        .slice(1)
        .map((rect, index) => rect.left - buttons[index].right);
    });

    // 44px のヒット領域は見た目 28px の左右へ 8px ずつはみ出す。
    // 16px 空けないと領域が重なり、DOM で後ろのボタンが手前を食う
    for (const gap of gaps) {
      expect(gap).toBeGreaterThanOrEqual(44 - 28);
    }
  });

  /**
   * 間隔を広げたぶん右の列が 4px 広がる。最狭幅で横へ溢れないことを見る
   * （タイトルは省略されるので、溢れるとしたら操作列）
   */
  test('最狭幅でもリスト行が横に溢れない', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: 320, height: SP_VIEWPORT_HEIGHT });
    await page.goto('/movies/now-showing');
    test.skip((await waitForTiles(page)) === 0, '映画データが無いためスキップ');

    await viewToggle(page).click();
    await expect(page.locator(LIST_TILE_SELECTOR).first()).toBeVisible();

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));

    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  });
});
