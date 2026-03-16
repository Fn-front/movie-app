/**
 * レコメンドセクション E2Eテスト（認証済み）
 *
 * ホームページでレコメンドセクション表示確認
 * レコメンド映画タイルクリック → 詳細モーダル表示
 *
 * レコメンドデータはSSRでDBから取得されるため、
 * テストユーザーのレコメンド有無で分岐する設計。
 * MovieTileは role='button' + aria-label='${title}' で実装されている。
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

    // レコメンドが存在しない場合はスキップ（SSRデータ依存のため）
    const tiles = section.getByRole('listitem');
    const tileCount = await tiles.count();
    test.skip(
      tileCount === 0,
      'レコメンドデータが未生成のためタイルクリックテストをスキップ',
    );

    // 最初のタイルの詳細ボタンをクリック
    const firstDetailButton = section
      .locator('[class*="c_movie_tile"][role="button"]')
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
