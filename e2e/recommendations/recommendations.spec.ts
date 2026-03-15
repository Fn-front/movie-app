/**
 * レコメンドセクション E2Eテスト（認証済み）
 *
 * ホームページでレコメンドセクション表示確認
 * レコメンド映画タイルクリック → 詳細モーダル表示
 */

import { test, expect } from '../fixtures/auth';

test.describe('レコメンドセクション — ホームページ表示', () => {
  test('ホームページにレコメンドセクションが表示される', async ({ page }) => {
    await page.goto('/');

    // 「あなたへのおすすめ」セクションが表示される
    const section = page.getByRole('region', { name: 'あなたへのおすすめ' });
    await expect(section).toBeVisible({ timeout: 15000 });
    await expect(
      section.getByRole('heading', { name: 'あなたへのおすすめ' }),
    ).toBeVisible();
  });

  test('レコメンド映画タイルクリックで詳細モーダルが表示される', async ({
    page,
  }) => {
    await page.goto('/');

    const section = page.getByRole('region', { name: 'あなたへのおすすめ' });
    await expect(section).toBeVisible({ timeout: 15000 });

    // レコメンドが存在する場合のみタイル操作をテスト
    const tiles = section.getByRole('listitem');
    const tileCount = await tiles.count();

    if (tileCount === 0) {
      // レコメンド未生成の場合は準備中メッセージを確認
      await expect(
        section.getByText(/お気に入り|準備中/),
      ).toBeVisible();
      return;
    }

    // 最初のタイルの詳細ボタンをクリック
    const firstDetailButton = section
      .getByRole('button', { name: /の詳細を表示/ })
      .first();
    await firstDetailButton.click();

    // 詳細モーダルが表示される
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15000 });
    await expect(dialog.getByText('詳細情報')).toBeVisible({ timeout: 15000 });

    // モーダルを閉じる
    await dialog.getByRole('button', { name: '閉じる' }).click();
    await expect(dialog).not.toBeVisible();
  });
});
