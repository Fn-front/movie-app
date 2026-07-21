/**
 * ダークモード / テーマ切り替え E2Eテスト
 *
 * 既存の `e2e/settings/settings.spec.ts`（設定RadioGroupでの基本切替）と重複させず、
 * 以下を追補する:
 * - ユーザーメニューのトグルスイッチでの切替・状態保持・キーボード操作
 * - デフォルトの OS 追従（prefers-color-scheme）と明示設定の優先
 */

import { test, expect, type Page } from '@playwright/test';

const THEME_STORAGE_KEY = 'movie-app:theme';

/** 設定API（GET/PUT）をモックする */
async function mockSettingsApi(page: Page): Promise<void> {
  await page.route('**/api/user/settings', async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: '設定を更新しました' }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { theme: 'system', notificationEnabled: false },
        }),
      });
    }
  });
}

test.describe('テーマ切り替え（認証済み・ユーザーメニュー）', () => {
  test.beforeEach(async ({ page }) => {
    await mockSettingsApi(page);
    // OS=ライトを前提にする（明示設定が無ければ light 表示）
    await page.emulateMedia({ colorScheme: 'light' });
  });

  /** 明示設定をクリアし OS(light) 追従の初期状態にする（reload毎には実行しない） */
  async function startFromLight(page: Page): Promise<void> {
    await page.goto('/');
    await page.evaluate(
      (key) => window.localStorage.removeItem(key),
      THEME_STORAGE_KEY,
    );
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  }

  test('ユーザーメニューのスイッチで切り替えでき、リロード後も保持される', async ({
    page,
  }) => {
    await startFromLight(page);

    await page.getByRole('button', { name: /ユーザーメニュー/ }).click();
    const toggle = page.getByRole('menuitemcheckbox', { name: /ダークモード/ });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');

    await toggle.click();

    // ダークへ切り替わり、トグル後もメニューは開いたまま
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(toggle).toBeVisible();

    // リロード後も保持される（localStorage）
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('キーボード（Space）でトグルできる', async ({ page }) => {
    await startFromLight(page);
    await page.getByRole('button', { name: /ユーザーメニュー/ }).click();

    const toggle = page.getByRole('menuitemcheckbox', { name: /ダークモード/ });
    await toggle.focus();
    await page.keyboard.press('Space');

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  });
});

test.describe('テーマのデフォルト（未認証・OS追従）', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('OSがダークかつ未設定なら初回ダーク表示', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/auth/signin');

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('heading', { name: 'ログイン' })).toBeVisible();
  });

  test('OSがライトなら初回ライト表示', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/auth/signin');

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('明示設定はOS設定より優先される', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.addInitScript((key) => {
      window.localStorage.setItem(key, 'dark');
    }, THEME_STORAGE_KEY);
    await page.goto('/auth/signin');

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});
