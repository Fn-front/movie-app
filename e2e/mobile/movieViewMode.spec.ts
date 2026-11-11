/**
 * 映画一覧のグリッド／リスト表示切替 E2Eテスト（認証済み・SP幅）
 *
 * デスクトップ幅のプロジェクトでは SP の一覧性は検証できないため、
 * `e2e/mobile/` に置く（#1014）
 */

import { ARIA_LABELS } from '@/constants';
import { test, expect } from '../fixtures/auth';

/** SP 表示幅 */
const SP_VIEWPORT_WIDTH = 375;

/** SP 表示高さ（iPhone X 相当） */
const SP_VIEWPORT_HEIGHT = 812;

/** リスト表示で1画面に収めたい最低件数（#1014 の完了条件） */
const MIN_VISIBLE_ROWS = 6;

/** CSS Modules でハッシュが付くため部分一致で引く */
const TILE_SELECTOR = '[class*="movie_tile"]';
const LIST_TILE_SELECTOR = '[class*="movie_tile--list"]';

test.use({
  viewport: { width: SP_VIEWPORT_WIDTH, height: SP_VIEWPORT_HEIGHT },
});

/**
 * ビューポート内に全体が収まっているタイルの数
 *
 * 「1画面に何件入るか」は高さの実測でしか分からない。件数ではなく
 * 矩形で数える
 */
const countFullyVisibleTiles = (page: import('@playwright/test').Page) =>
  page.evaluate((selector) => {
    const viewportHeight = window.innerHeight;
    return Array.from(document.querySelectorAll(selector)).filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= viewportHeight;
    }).length;
  }, LIST_TILE_SELECTOR);

test.describe('映画一覧の表示モード切替', () => {
  test('グリッドからリストへ切り替えられる', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/movies/now-showing');

    const firstTile = page.locator(TILE_SELECTOR).first();
    const hasTile = await firstTile
      .waitFor({ state: 'visible', timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!hasTile, '映画データが存在しないためスキップ');

    // 既定はグリッド
    await expect(page.locator(LIST_TILE_SELECTOR).first()).toHaveCount(0);

    await page
      .getByRole('button', { name: ARIA_LABELS.SWITCH_TO_LIST_VIEW })
      .click();

    await expect(page.locator(LIST_TILE_SELECTOR).first()).toBeVisible();

    // 押下状態がトグルに反映される（アイコンだけでは今どちらか伝わらない）
    await expect(
      page.getByRole('button', { name: ARIA_LABELS.SWITCH_TO_GRID_VIEW }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  test('リスト表示では1画面に6件以上が収まる', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/movies/now-showing');

    const tiles = page.locator(TILE_SELECTOR);
    const hasTile = await tiles
      .first()
      .waitFor({ state: 'visible', timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!hasTile, '映画データが存在しないためスキップ');

    const tileCount = await tiles.count();
    test.skip(
      tileCount < MIN_VISIBLE_ROWS,
      `映画が${MIN_VISIBLE_ROWS}件未満のためスキップ`,
    );

    await page
      .getByRole('button', { name: ARIA_LABELS.SWITCH_TO_LIST_VIEW })
      .click();
    await expect(page.locator(LIST_TILE_SELECTOR).first()).toBeVisible();

    // グリッドは1画面に2件しか入らない（#1014 の実測）。
    // リストで 6 件以上入ることがこの機能の目的そのもの
    expect(await countFullyVisibleTiles(page)).toBeGreaterThanOrEqual(
      MIN_VISIBLE_ROWS,
    );
  });

  test('切替状態がリロード後も保持される', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/movies/now-showing');

    const firstTile = page.locator(TILE_SELECTOR).first();
    const hasTile = await firstTile
      .waitFor({ state: 'visible', timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!hasTile, '映画データが存在しないためスキップ');

    await page
      .getByRole('button', { name: ARIA_LABELS.SWITCH_TO_LIST_VIEW })
      .click();
    await expect(page.locator(LIST_TILE_SELECTOR).first()).toBeVisible();

    await page.reload();

    await expect(page.locator(LIST_TILE_SELECTOR).first()).toBeVisible();
  });

  test('切替は画面をまたいで共通に効く', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/movies/now-showing');

    const firstTile = page.locator(TILE_SELECTOR).first();
    const hasTile = await firstTile
      .waitFor({ state: 'visible', timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!hasTile, '映画データが存在しないためスキップ');

    await page
      .getByRole('button', { name: ARIA_LABELS.SWITCH_TO_LIST_VIEW })
      .click();
    await expect(page.locator(LIST_TILE_SELECTOR).first()).toBeVisible();

    // 設定は localStorage に1つだけ持つ。検索結果にもそのまま効く
    await page.goto('/search?query=mission');

    const searchTile = page.locator(TILE_SELECTOR).first();
    const hasSearchTile = await searchTile
      .waitFor({ state: 'visible', timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!hasSearchTile, '検索結果が0件のためスキップ');

    await expect(page.locator(LIST_TILE_SELECTOR).first()).toBeVisible();
  });

  test('切替ボタンのタップ領域が44×44以上ある', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/movies/now-showing');

    const toggle = page.getByRole('button', {
      name: ARIA_LABELS.SWITCH_TO_LIST_VIEW,
    });
    await expect(toggle).toBeVisible();

    // #1017 の基準。新しく足す操作要素で下回らせない
    const box = await toggle.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test('リスト行の操作ボタンが重ならず8px以上空く', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/movies/now-showing');

    const firstTile = page.locator(TILE_SELECTOR).first();
    const hasTile = await firstTile
      .waitFor({ state: 'visible', timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!hasTile, '映画データが存在しないためスキップ');

    await page
      .getByRole('button', { name: ARIA_LABELS.SWITCH_TO_LIST_VIEW })
      .click();

    const listTile = page.locator(LIST_TILE_SELECTOR).first();
    await expect(listTile).toBeVisible();

    // ポスターから行の右端へ移したときに重ねてしまうと誤爆する（#1017）
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

    expect(gaps.length).toBeGreaterThan(0);
    for (const gap of gaps) {
      expect(gap).toBeGreaterThanOrEqual(8);
    }
  });
});
