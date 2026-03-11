/**
 * フィルター条件のリロード永続化 E2Eテスト（認証済み）
 */

import { test, expect } from '../fixtures/auth';
import { resetFilters } from '../helpers/api';

test.describe('フィルター条件がリロード後も保持される', () => {
  test.afterEach(async ({ request }) => {
    await resetFilters(request);
  });

  test('リバイバル除外 → リロード → APIレスポンスと復元を確認', async ({
    page,
  }) => {
    await page.goto('/movies/upcoming');
    await page
      .locator('[class*="movie_tile"]')
      .first()
      .or(page.getByText(/映画が見つかりませんでした/))
      .waitFor({ timeout: 15000 });

    // フィルターモーダルを開いてリバイバル除外を設定
    await page.getByRole('button', { name: /フィルター/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByText('リバイバル除外').click();

    // 適用してPUTリクエストの内容を確認
    const putPromise = page.waitForResponse(
      (res) =>
        res.url().includes('/api/filters') && res.request().method() === 'PUT',
    );
    await dialog.getByRole('button', { name: '適用' }).click();
    const putResponse = await putPromise;
    const putBody = putResponse.request().postDataJSON();

    // PUTにis_revival: falseが含まれていることを確認
    expect(putBody.is_revival).toBe(false);

    // リロードしてGETレスポンスを確認
    const getPromise = page.waitForResponse(
      (res) =>
        res.url().includes('/api/filters') &&
        res.request().method() === 'GET' &&
        res.status() === 200,
    );
    await page.reload();
    const getResponse = await getPromise;
    const getBody = await getResponse.json();

    // GETにis_revival: falseが含まれていることを確認
    expect(getBody.data.filter_conditions.is_revival).toBe(false);

    // 映画読み込み待ち
    await page
      .locator('[class*="movie_tile"]')
      .first()
      .or(page.getByText(/映画が見つかりませんでした/))
      .waitFor({ timeout: 15000 });

    // フィルターモーダルを開いてUIに反映されているか確認
    await page.getByRole('button', { name: /フィルター/ }).click();
    const dialogAfter = page.getByRole('dialog');
    await expect(dialogAfter).toBeVisible();
    await expect(
      dialogAfter.locator('input[name="revival"][value="false"]'),
    ).toBeChecked();
  });
});
