/**
 * サイドナビゲーション E2Eテスト（認証済み）
 */

import { test, expect } from '../fixtures/auth';

test.describe('サイドナビゲーション', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('サイドナビが表示される', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: '映画ナビゲーション' });
    await expect(nav).toBeVisible();
  });

  test('「公開予定」リンクが存在する', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: '映画ナビゲーション' });
    await expect(nav.getByRole('link', { name: '公開予定' })).toBeVisible();
  });

  test('「公開中」リンクが存在する', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: '映画ナビゲーション' });
    await expect(nav.getByRole('link', { name: '公開中' })).toBeVisible();
  });

  test('「公開予定」リンクをクリックすると遷移する', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: '映画ナビゲーション' });
    await nav.getByRole('link', { name: '公開予定' }).click();

    await expect(page).toHaveURL('/movies/upcoming');
  });

  test('「公開中」リンクをクリックすると遷移する', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: '映画ナビゲーション' });
    await nav.getByRole('link', { name: '公開中' }).click();

    await expect(page).toHaveURL('/movies/now-showing');
  });

  test('アクティブなリンクにaria-current="page"が設定される', async ({
    page,
  }) => {
    await page.goto('/movies/upcoming');

    const nav = page.getByRole('navigation', { name: '映画ナビゲーション' });
    const upcomingLink = nav.getByRole('link', { name: '公開予定' });

    await expect(upcomingLink).toHaveAttribute('aria-current', 'page');
  });
});
