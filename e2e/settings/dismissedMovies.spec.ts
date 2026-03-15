/**
 * 興味なし一覧（設定ページ） E2Eテスト（認証済み）
 *
 * 設定ページで興味なし一覧の表示確認
 * 興味なし解除ボタンクリック → 楽観的に一覧から消える
 *
 * dismissed-movies APIをモックして安定したテストを実現
 */

import { test, expect } from '../fixtures/auth';

/** 興味なしAPIモックデータ */
const mockDismissedMovies = [
  {
    id: 'mock-dismissed-1',
    tmdb_movie_id: 99001,
    title: 'テスト映画A',
    poster_path: null,
    genre_ids: [28],
    created_at: '2026-03-01T00:00:00Z',
  },
  {
    id: 'mock-dismissed-2',
    tmdb_movie_id: 99002,
    title: 'テスト映画B',
    poster_path: '/test-poster.jpg',
    genre_ids: [12],
    created_at: '2026-03-02T00:00:00Z',
  },
];

test.describe('設定ページ — 興味なし一覧', () => {
  test('興味なし映画が一覧表示される', async ({ page }) => {
    // dismissed-movies APIをモック
    await page.route('**/api/dismissed-movies*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: mockDismissedMovies,
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/settings');
    await expect(
      page.getByRole('heading', { name: '興味なし一覧' }),
    ).toBeVisible();

    // 映画タイトルが表示される
    await expect(page.getByText('テスト映画A')).toBeVisible();
    await expect(page.getByText('テスト映画B')).toBeVisible();

    // 解除ボタンが表示される
    await expect(
      page.getByRole('button', { name: 'テスト映画Aの興味なしを解除' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'テスト映画Bの興味なしを解除' }),
    ).toBeVisible();
  });

  test('興味なしが0件の場合は空状態メッセージが表示される', async ({
    page,
  }) => {
    await page.route('**/api/dismissed-movies*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: [] }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/settings');
    await expect(
      page.getByRole('heading', { name: '興味なし一覧' }),
    ).toBeVisible();

    await expect(
      page.getByText('興味なしに登録した映画はありません'),
    ).toBeVisible();
  });

  test('解除ボタンクリックで楽観的に一覧から消える', async ({ page }) => {
    // GET: モックデータ返却、DELETE: 成功レスポンス
    await page.route('**/api/dismissed-movies*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: mockDismissedMovies,
          }),
        });
      } else if (route.request().method() === 'DELETE') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            message: '興味なしを解除しました',
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/settings');

    // 2件表示されている
    await expect(page.getByText('テスト映画A')).toBeVisible();
    await expect(page.getByText('テスト映画B')).toBeVisible();

    // テスト映画Aの解除ボタンをクリック
    await page
      .getByRole('button', { name: 'テスト映画Aの興味なしを解除' })
      .click();

    // 楽観的更新でテスト映画Aが消える
    await expect(page.getByText('テスト映画A')).not.toBeVisible();
    // テスト映画Bは残っている
    await expect(page.getByText('テスト映画B')).toBeVisible();
  });
});
