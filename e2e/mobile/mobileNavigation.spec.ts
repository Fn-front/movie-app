/**
 * モバイルナビゲーション E2Eテスト（認証済み）
 * SP表示幅でハンバーガーメニュー → ナビゲーション遷移
 */

import { test, expect } from '../fixtures/auth';

test.use({
  viewport: { width: 375, height: 812 },
});

test.describe('モバイルナビゲーション', () => {
  test('ハンバーガーメニューからナビゲーションリンクで遷移できる', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/');

    // ハンバーガーメニューボタンが表示されている
    const menuButton = page.getByRole('button', { name: 'メニューを開く' });
    await expect(menuButton).toBeVisible();

    // ハンバーガーメニューをクリック
    await menuButton.click();

    // ドロワーが表示される
    await expect(page.getByText('メニュー')).toBeVisible();

    // ナビゲーションリンクが表示される
    await expect(page.getByRole('link', { name: '公開予定' })).toBeVisible();
    await expect(page.getByRole('link', { name: '公開中' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'お気に入り' })).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'ウォッチリスト' }),
    ).toBeVisible();

    // 公開予定ページへ遷移
    await page.getByRole('link', { name: '公開予定' }).click();
    await page.waitForURL('/movies/upcoming');

    // ドロワーが閉じる（ページ遷移で自動的に閉じる）
    await expect(page.getByText('メニュー')).not.toBeVisible();
  });

  test('ドロワーの閉じるボタンでドロワーが閉じる', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'メニューを開く' }).click();
    await expect(page.getByText('メニュー')).toBeVisible();

    // 閉じるボタンをクリック
    await page.getByRole('button', { name: '閉じる' }).click();
    await expect(page.getByText('メニュー')).not.toBeVisible();
  });

  test('ドロワーを開いた状態で戻るとドロワーだけが閉じる', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/movies/upcoming');

    await page.getByRole('button', { name: 'メニューを開く' }).click();
    await expect(page.getByText('メニュー')).toBeVisible();

    // Android の戻るはオーバーレイを閉じる操作として使われる。
    // 履歴に載っていないとページごと離脱してしまう（#1026）
    await page.goBack();

    await expect(page.getByText('メニュー')).not.toBeVisible();
    await expect(page).toHaveURL(/\/movies\/upcoming$/);
  });

  test('映画詳細を開いた状態で戻るとダイアログだけが閉じる', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/movies/now-showing');

    // `movie_tile` だけだとスケルトン（c_movie_tile_skeleton）にも当たるため、
    // 詳細を開く実体のボタンで絞る
    const movieTile = page
      .locator('button[class*="movie_tile__title_button"]')
      .first();
    const isTileVisible = await movieTile
      .waitFor({ state: 'visible', timeout: 10000 })
      .then(() => true)
      .catch(() => false);

    test.skip(!isTileVisible, '映画データが存在しないためスキップ');

    await movieTile.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15000 });

    await page.goBack();

    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/movies\/now-showing$/);
  });

  test('ダイアログを閉じてから戻ると前のページへ遷移する', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/movies/upcoming');
    await page.goto('/movies/now-showing');

    // `movie_tile` だけだとスケルトン（c_movie_tile_skeleton）にも当たるため、
    // 詳細を開く実体のボタンで絞る
    const movieTile = page
      .locator('button[class*="movie_tile__title_button"]')
      .first();
    const isTileVisible = await movieTile
      .waitFor({ state: 'visible', timeout: 10000 })
      .then(() => true)
      .catch(() => false);

    test.skip(!isTileVisible, '映画データが存在しないためスキップ');

    await movieTile.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15000 });

    // × で閉じた場合は、積んだ履歴エントリを自分で畳む必要がある。
    // 残したままだと戻るが1回空振りする（#1026）
    await dialog.getByRole('button', { name: '閉じる' }).click();
    await expect(dialog).toBeHidden();

    await page.goBack();

    await expect(page).toHaveURL(/\/movies\/upcoming$/);
  });

  test('デスクトップ幅ではハンバーガーメニューが非表示になる', async ({
    authenticatedPage: page,
  }) => {
    // デスクトップ幅に変更
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    // ハンバーガーメニューが非表示
    const menuButton = page.getByRole('button', { name: 'メニューを開く' });
    await expect(menuButton).not.toBeVisible();

    // サイドバーが表示されている
    await expect(
      page.getByRole('navigation', { name: '映画ナビゲーション' }),
    ).toBeVisible();
  });
});

/**
 * SP 幅ではドキュメントをスクロールさせる（#1027）。
 *
 * `main` の内部スクロールだと、ブラウザも Next.js も履歴のスクロール位置を
 * 復元できない（復元対象はルートスクローラーのため）。1ページ20件で
 * 約5画面分あるので、戻るたびに先頭へ飛ぶと探し直しになる。
 */
test.describe('SP幅のスクロール', () => {
  const SCROLL_TARGET = 1200;

  test('スクロールしてもヘッダーが画面内に留まる', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/movies/now-showing');
    await page.waitForLoadState('networkidle');

    await page.evaluate((top) => window.scrollTo(0, top), SCROLL_TARGET);
    await expect
      .poll(() => page.evaluate(() => Math.round(window.scrollY)))
      .toBeGreaterThan(0);

    // SP ではハンバーガーと検索がヘッダー専有なので、流れて消えると
    // スクロール中にナビゲーションへ到達できなくなる（#1036 の回帰）
    const headerTop = await page.evaluate(() =>
      Math.round(document.querySelector('header')!.getBoundingClientRect().top),
    );

    expect(headerTop).toBe(0);
  });

  test('スクロール後もメニューボタンを押せる', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/movies/now-showing');
    await page.waitForLoadState('networkidle');
    await page.evaluate((top) => window.scrollTo(0, top), SCROLL_TARGET);

    // ヘッダーが固定されていれば、Playwright の click でも
    // 先頭へ戻されずにそのまま押せる
    await page.getByRole('button', { name: 'メニューを開く' }).click();

    await expect(page.getByText('メニュー')).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => Math.round(window.scrollY)))
      .toBeGreaterThan(0);
  });

  test('一覧がドキュメントスクロールになっている', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/movies/now-showing');
    await page.waitForLoadState('networkidle');

    await page.evaluate((top) => window.scrollTo(0, top), SCROLL_TARGET);

    await expect
      .poll(() => page.evaluate(() => Math.round(window.scrollY)))
      .toBeGreaterThan(0);
  });

  test('ドロワーから別画面へ移動して戻るとスクロール位置が復元される', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/movies/now-showing');
    await page.waitForLoadState('networkidle');
    await page.evaluate((top) => window.scrollTo(0, top), SCROLL_TARGET);
    await expect
      .poll(() => page.evaluate(() => Math.round(window.scrollY)))
      .toBeGreaterThan(0);

    // アプリ内のクライアント遷移で確認する。ハードリロードを挟むと
    // 復元前に本文が揃わず、ブラウザが復元できないため区別すること
    await page.getByRole('button', { name: 'メニューを開く' }).click();
    await page.getByRole('link', { name: '受賞作品' }).click();
    await page.waitForURL('/awards');

    await page.goBack();
    await page.waitForURL('/movies/now-showing');

    // 厳密な一致はレイアウト差で揺れるため、先頭へ戻っていないことを見る
    await expect
      .poll(() => page.evaluate(() => Math.round(window.scrollY)))
      .toBeGreaterThan(SCROLL_TARGET / 2);
  });
});
