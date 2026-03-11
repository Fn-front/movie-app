/**
 * 設定ページ E2Eテスト
 *
 * 結合テストでカバー済みの内容:
 * - セクション表示・フォーム要素表示 → settingsPage.test.tsx
 * - パスワード変更フォーム表示・バリデーション → changePasswordForm.test.tsx
 * - 表示名フォーム表示・バリデーション・初期値 → displayNameForm.test.tsx
 * - 通知チェックボックス表示・トグル・説明テキスト → notificationSettings.test.tsx
 * - テーマ選択表示・説明テキスト・aria-label → themeSettings.test.tsx
 */

import { test, expect } from '@playwright/test';

test.describe('設定ページ（認証済み）— テーマ切り替え', () => {
  test('テーマを切り替えるとdata-theme属性が変わる', async ({ page }) => {
    // 設定APIをモック（GET・PUT両方）
    await page.route('**/api/user/settings', async (route) => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            message: '設定を更新しました',
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: { theme: 'light', notificationEnabled: false },
          }),
        });
      }
    });

    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: '設定' })).toBeVisible();

    const themeTrigger = page.getByRole('combobox', { name: 'テーマを選択' });
    await expect(themeTrigger).toBeVisible();
    await themeTrigger.click();

    // ドロップダウン（listbox）が開くのを待つ
    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();

    // 「ダーク」を選択（listboxスコープ内で検索）
    await listbox.getByText('ダーク').click();

    // data-theme属性がdarkに変わる
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});

test.describe('設定ページ（未認証）', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('未認証アクセスでログインページにリダイレクトされる', async ({
    page,
  }) => {
    await page.goto('/settings');

    await expect(page).toHaveURL(/\/auth\/signin/);
  });
});
