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
