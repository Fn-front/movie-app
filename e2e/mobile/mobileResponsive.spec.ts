/**
 * モバイルレスポンシブ E2Eテスト（認証済み）
 * SP表示幅での主要ページ表示確認
 */

import { ARIA_LABELS, WATCHLIST_CLEANUP_LABELS } from '@/constants';
import { test, expect } from '../fixtures/auth';

/** SP 表示幅。はみ出し判定のしきい値にも使うため定数にする */
const SP_VIEWPORT_WIDTH = 375;

/** 最狭幅（iPhone SE 相当）。SP 幅で収まっても崩れることがあるため別途見る */
const NARROW_VIEWPORT_WIDTH = 320;

test.use({
  viewport: { width: SP_VIEWPORT_WIDTH, height: 812 },
});

test.describe('モバイルレスポンシブ表示', () => {
  test('ホームページがSP幅で横スクロールが発生しない', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/');

    // ページが読み込まれるまで待機
    await page.waitForLoadState('networkidle');

    // 横スクロールが発生していない
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    const clientWidth = await page.evaluate(
      () => document.documentElement.clientWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test('検索ページでフィルタートグルが機能する', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/search?q=test');

    // フィルタートグルボタンが表示される
    const filterToggle = page.getByRole('button', { name: /フィルター/ });
    await expect(filterToggle).toBeVisible();

    // フィルターが初期状態で非表示（CSSによる）
    const filterPanel = page.locator('#search-filter');
    await expect(filterPanel).toBeAttached();

    // フィルタートグルをクリック
    await filterToggle.click();
    expect(await filterToggle.getAttribute('aria-expanded')).toBe('true');
  });

  test('検索ページに検索入力欄が最初から表示される', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/search?query=mission');

    // SP ではヘッダーの検索欄がトグルの中に隠れるため、本文側に置いている。
    // 無いと「別のキーワードで検索してみてください」の案内に従えない（#1016）
    const searchInput = page
      .getByRole('main')
      .getByLabel(ARIA_LABELS.SEARCH_MOVIES);

    await expect(searchInput).toBeVisible();
  });

  test('検索ページの入力欄から検索し直せる', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/search?query=mission');

    const searchInput = page
      .getByRole('main')
      .getByLabel(ARIA_LABELS.SEARCH_MOVIES);
    await expect(searchInput).toBeVisible();

    await searchInput.fill('matrix');
    await searchInput.press('Enter');

    await page.waitForURL(/query=matrix/);
  });

  test('ウォッチリストの「視聴済みを整理」がSP幅で画面内に収まる', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/watchlist');

    const cleanupButton = page.getByRole('button', {
      name: WATCHLIST_CLEANUP_LABELS.OPEN_BUTTON,
    });
    await expect(cleanupButton).toBeVisible();

    // 見出し・並び替え・整理ボタンを1行に並べると SP 幅では収まらず、
    // ページの横スクロールも無いので右側が永久にクリップされる（#1015）
    const box = await cleanupButton.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(SP_VIEWPORT_WIDTH);
  });

  test('SP幅で映画詳細モーダルが表示される', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/');

    // 映画タイルが表示されない場合はスキップ（CIでデータがない可能性）
    const movieTile = page.locator('[class*="movie_tile"]').first();
    const isTileVisible = await movieTile
      .waitFor({ state: 'visible', timeout: 10000 })
      .then(() => true)
      .catch(() => false);

    test.skip(!isTileVisible, '映画データが存在しないためスキップ');

    await movieTile.click();

    // モーダルが表示される（詳細API複数呼び出しのため長めのタイムアウト）
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15000 });

    // モーダルが画面内に収まっている
    const dialogBox = await dialog.boundingBox();
    expect(dialogBox).not.toBeNull();

    if (dialogBox) {
      expect(dialogBox.width).toBeLessThanOrEqual(SP_VIEWPORT_WIDTH);
    }
  });
});

/**
 * 最狭幅（iPhone SE 相当）での崩れを検知する。
 * 375px で収まっても 320px では溢れることがあるため、幅を分けて見る。
 */
test.describe('最狭幅での表示', () => {
  test.use({
    viewport: { width: NARROW_VIEWPORT_WIDTH, height: 812 },
  });

  test('ウォッチリストの「視聴済みを整理」が画面内に収まる', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/watchlist');

    const cleanupButton = page.getByRole('button', {
      name: WATCHLIST_CLEANUP_LABELS.OPEN_BUTTON,
    });
    await expect(cleanupButton).toBeVisible();

    const box = await cleanupButton.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(NARROW_VIEWPORT_WIDTH);
  });
});
