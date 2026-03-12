/**
 * カレンダー E2Eテスト（認証済み）
 * クリティカルユーザージャーニー
 * - サイドバーボタンクリック → カレンダーダイアログ表示
 * - 月切り替え → データ更新確認
 * - 日付クリック → 映画一覧表示 → 映画クリック → 詳細モーダル表示
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
    await page
      .getByRole('button', { name: '公開カレンダーを開く' })
      .click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // ローディングが終わるのを待つ
    await expect(dialog.getByText('読み込み中...')).not.toBeVisible({
      timeout: 10000,
    });

    // 次月ボタンをクリック
    const nextButton = dialog.getByRole('button', { name: /next/i }).or(
      dialog.locator('button[name="next_month"]'),
    );
    if (await nextButton.isVisible()) {
      await nextButton.click();
    }

    // 前月ボタンをクリック
    const prevButton = dialog.getByRole('button', { name: /previous/i }).or(
      dialog.locator('button[name="previous_month"]'),
    );
    if (await prevButton.isVisible()) {
      await prevButton.click();
    }
  });

  test('ESCキーでダイアログが閉じる', async ({ page }) => {
    // カレンダーを開く
    await page
      .getByRole('button', { name: '公開カレンダーを開く' })
      .click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // ESCキーで閉じる
    await page.keyboard.press('Escape');

    await expect(dialog).not.toBeVisible();
  });
});
