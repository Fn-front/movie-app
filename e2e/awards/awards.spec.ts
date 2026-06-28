/**
 * 受賞作品 E2Eテスト（公開・未認証）
 *
 * ユーザーストーリー網羅:
 * - 正常系: ページ表示（タイトル・カテゴリ・受賞作品一覧）
 * - 詳細遷移: 受賞/ノミネート作品クリック → 詳細モーダル
 * - 年度切替: 年度セレクト変更 → 一覧が更新される
 */

import { test, expect } from '@playwright/test';

test.describe('受賞作品（公開）', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('受賞作品ページが表示される（タイトル・一覧）', async ({ page }) => {
    await page.goto('/awards');

    await expect(
      page.getByRole('heading', { name: '受賞作品', level: 2 }),
    ).toBeVisible();
    await expect(
      page.getByRole('combobox', { name: '年度を選択' }),
    ).toBeVisible();
    await expect(page.locator('[class*="movie_tile"]').first()).toBeVisible({
      timeout: 15000,
    });
  });

  test('作品をクリックすると詳細モーダルが開く', async ({ page }) => {
    await page.goto('/awards');

    const firstTile = page
      .locator('[class*="movie_tile"][role="button"]')
      .first();
    await firstTile.waitFor({ timeout: 15000 });
    await firstTile.click();

    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('年度を切り替えると選択年度と一覧が更新される', async ({ page }) => {
    await page.goto('/awards');
    await expect(page.locator('[class*="movie_tile"]').first()).toBeVisible({
      timeout: 15000,
    });

    const yearSelect = page.getByRole('combobox', { name: '年度を選択' });
    const initialYear = (await yearSelect.textContent())?.trim();

    await yearSelect.click();
    const options = page.getByRole('option');
    await options.first().waitFor({ timeout: 10000 });

    // 現在と異なる年度オプションを選ぶ（無ければ切替不可のためスキップ）
    const count = await options.count();
    let targetYear: string | null = null;
    for (let i = 0; i < count; i++) {
      const text = (await options.nth(i).textContent())?.trim();
      if (text && text !== initialYear) {
        targetYear = text;
        await options.nth(i).click();
        break;
      }
    }
    test.skip(!targetYear, '選択可能な年度が1件のみのため切替をスキップ');

    // 選択年度が実際に変わったことを確認
    await expect(yearSelect).toContainText(targetYear!);
    // 切替後も受賞作品一覧が表示される
    await expect(page.locator('[class*="movie_tile"]').first()).toBeVisible({
      timeout: 15000,
    });
  });
});
