/**
 * カレンダー E2Eテスト（認証済み）
 * クリティカルユーザージャーニー
 * - サイドバーボタンクリック → カレンダーダイアログ表示
 * - 月切り替え → データ更新確認
 * - ESCキーでダイアログ閉じる
 */

import { test, expect } from '../fixtures/auth';

test.describe('カレンダー', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('サイドバーのカレンダーボタンクリックでダイアログが表示される', async ({
    page,
  }) => {
    // サイドバーのカレンダーボタンをクリック
    const calendarButton = page.getByRole('button', {
      name: '公開カレンダーを開く',
    });
    await calendarButton.click();

    // ダイアログが表示される
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('公開カレンダー')).toBeVisible();
  });

  test('月切り替えが動作する', async ({ page }) => {
    // カレンダーを開く
    await page.getByRole('button', { name: '公開カレンダーを開く' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // ローディングが終わるのを待つ
    await expect(dialog.getByText('読み込み中...')).not.toBeVisible({
      timeout: 10000,
    });

    // カスタムヘッダーのタイトル（月名）を取得
    const nextButton = dialog.getByRole('button', { name: '次月' });
    const prevButton = dialog.getByRole('button', { name: '前月' });

    // 次月・前月ボタンの間にあるタイトルテキストを取得
    const initialTitle = await nextButton
      .locator('..')
      .locator('span')
      .first()
      .textContent();

    // 次月ボタンをクリック
    await nextButton.click();

    // タイトルが変わることを確認
    await expect(
      nextButton.locator('..').locator('span').first(),
    ).not.toHaveText(initialTitle ?? '');

    // 前月ボタンをクリック
    await prevButton.click();

    // 元のタイトルに戻ることを確認
    await expect(nextButton.locator('..').locator('span').first()).toHaveText(
      initialTitle ?? '',
    );
  });

  test('ESCキーでダイアログが閉じる', async ({ page }) => {
    // カレンダーを開く
    await page.getByRole('button', { name: '公開カレンダーを開く' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // ESCキーで閉じる
    await page.keyboard.press('Escape');

    await expect(dialog).not.toBeVisible();
  });
});
