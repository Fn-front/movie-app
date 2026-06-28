/**
 * おすすめ更新（refresh）E2Eテスト（認証済み）
 *
 * メール送信同様、OpenAI/TMDb の実呼び出しに依存させないため、更新APIは
 * page.route でモックする。おすすめセクションは SSR 表示のため、事前に
 * service role で お気に入り＋おすすめ をシードして表示させる。
 *
 * ユーザーストーリー網羅:
 * - 正常系: 「更新」クリック → 再生成成功（モック）→ 成功トースト＋残り回数更新
 * - 上限到達: 残り0回（モック）→ 「更新」ボタンが無効
 */

import { test, expect } from '../fixtures/auth';
import { seedRecommendations, cleanupRecommendations } from '../helpers/api';

test.describe.configure({ mode: 'serial' });

test.describe('おすすめ更新（認証済み）', () => {
  test.beforeEach(async () => {
    await cleanupRecommendations();
    await seedRecommendations();
  });

  test.afterAll(async () => {
    await cleanupRecommendations();
  });

  test('更新ボタンで再生成が成功し、成功トーストと残り回数が更新される', async ({
    authenticatedPage: page,
  }) => {
    // 更新API（POST）をモック：再生成成功＋残り7回
    await page.route('**/api/recommendations/refresh', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            remainingCount: 7,
            recommendations: [
              {
                id: '00000000-0000-0000-0000-000000000001',
                tmdb_movie_id: 999201,
                title: '更新後おすすめ',
                poster_path: null,
                release_date: null,
                vote_average: null,
                genre_ids: null,
                reason: '更新後の理由',
                display_order: 1,
              },
            ],
          },
        }),
      });
    });

    await page.goto('/');

    const section = page.getByRole('region', { name: 'あなたへのおすすめ' });
    await expect(section).toBeVisible({ timeout: 15000 });

    const refreshButton = page.getByRole('button', { name: 'おすすめを更新' });
    await expect(refreshButton).toBeEnabled();
    await refreshButton.click();

    // 成功トースト＋残り回数の更新（トースト文言は本体とaria-liveで2要素のため first）
    await expect(
      page.getByText('おすすめ映画を更新しました').first(),
    ).toBeVisible();
    await expect(page.getByText('残り7回 / 月10回')).toBeVisible();
  });

  test('今月の更新上限に達している場合は更新ボタンが無効', async ({
    authenticatedPage: page,
  }) => {
    // 残り回数取得（GET）をモック：上限到達（残り0）
    await page.route('**/api/recommendations/refresh-count', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { usedCount: 10, maxCount: 10, remainingCount: 0 },
        }),
      });
    });

    await page.goto('/');

    const section = page.getByRole('region', { name: 'あなたへのおすすめ' });
    await expect(section).toBeVisible({ timeout: 15000 });

    // 上限到達時は残り回数の代わりにリセット予告が表示される
    await expect(page.getByText('来月リセットされます')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'おすすめを更新' }),
    ).toBeDisabled();
  });
});
