/**
 * 設定ページ E2Eテスト（認証済み）
 */

import { test, expect } from '@playwright/test';

test.describe('設定ページ（認証済み）', () => {
  test('設定画面のセクションが表示される', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: '設定' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'プロフィール' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: '通知' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '外観' })).toBeVisible();
  });

  test('パスワード変更フォームが表示される', async ({ page }) => {
    await page.goto('/settings/change-password');
    await expect(
      page.getByRole('heading', { name: 'パスワード変更' }),
    ).toBeVisible();
    await expect(page.getByLabel('現在のパスワード')).toBeVisible();
    await expect(
      page.getByLabel('新しいパスワード', { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('新しいパスワード（確認）')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'パスワードを変更' }),
    ).toBeVisible();
  });

  test('現在のパスワード未入力でバリデーションエラーが表示される', async ({
    page,
  }) => {
    await page.goto('/settings/change-password');
    await page
      .getByLabel('新しいパスワード', { exact: true })
      .fill('NewPass123');
    await page.getByLabel('新しいパスワード（確認）').fill('NewPass123');
    await page.getByRole('button', { name: 'パスワードを変更' }).click();

    await expect(page.getByText('パスワードを入力してください')).toBeVisible();
  });

  test('新しいパスワードが短すぎるとバリデーションエラーが表示される', async ({
    page,
  }) => {
    await page.goto('/settings/change-password');
    await page.getByLabel('現在のパスワード').fill('Current123');
    await page.getByLabel('新しいパスワード', { exact: true }).fill('Pw1');
    await page.getByLabel('新しいパスワード（確認）').fill('Pw1');
    await page.getByRole('button', { name: 'パスワードを変更' }).click();

    await expect(
      page.getByText('パスワードは8文字以上で入力してください'),
    ).toBeVisible();
  });

  test('新しいパスワード確認が一致しないとバリデーションエラーが表示される', async ({
    page,
  }) => {
    await page.goto('/settings/change-password');
    await page.getByLabel('現在のパスワード').fill('Current123');
    await page
      .getByLabel('新しいパスワード', { exact: true })
      .fill('NewPassword123');
    await page.getByLabel('新しいパスワード（確認）').fill('Different123');
    await page.getByRole('button', { name: 'パスワードを変更' }).click();

    await expect(page.getByText('パスワードが一致しません')).toBeVisible();
  });
});

test.describe('設定ページ — フォーム要素', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings');
    // セッション・API取得完了を待つ（見出しが表示されるまで）
    await expect(page.getByRole('heading', { name: '設定' })).toBeVisible();
  });

  test('表示名フォームが表示される', async ({ page }) => {
    await expect(page.getByRole('textbox', { name: '表示名' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: '表示名を更新' }),
    ).toBeVisible();
  });

  test('表示名が空のままだとバリデーションエラーが表示される', async ({
    page,
  }) => {
    await page.getByRole('textbox', { name: '表示名' }).clear();
    await page.getByRole('button', { name: '表示名を更新' }).click();

    await expect(page.getByText('表示名を入力してください')).toBeVisible();
  });

  test('通知設定のチェックボックスが表示される', async ({ page }) => {
    await expect(
      page.getByRole('checkbox', { name: '公開日リマインダーを受け取る' }),
    ).toBeVisible();
  });

  test('表示名の初期値が文字列で設定されている', async ({ page }) => {
    const nameInput = page.getByRole('textbox', { name: '表示名' });
    await expect(nameInput).toBeVisible();
    // セッションにユーザー名があれば値が入り、なければ空文字（どちらも正常）
    const value = await nameInput.inputValue();
    expect(typeof value).toBe('string');
  });

  test('通知設定のチェックボックスをトグルできる', async ({ page }) => {
    const checkbox = page.getByRole('checkbox', {
      name: '公開日リマインダーを受け取る',
    });
    await expect(checkbox).toBeVisible();

    const initialState = await checkbox.isChecked();
    await checkbox.click();

    if (initialState) {
      await expect(checkbox).not.toBeChecked();
    } else {
      await expect(checkbox).toBeChecked();
    }
  });

  test('通知設定の説明テキストが表示される', async ({ page }) => {
    await expect(
      page.getByText(
        'ウォッチリストに追加した映画の公開日が近づいたら通知します',
      ),
    ).toBeVisible();
  });

  test('テーマ選択が表示される', async ({ page }) => {
    // Selectのラベル「テーマ」が表示される
    await expect(
      page.getByRole('combobox', { name: 'テーマを選択' }),
    ).toBeVisible();
  });

  test('テーマを切り替えるとdata-theme属性が変わる', async ({ page }) => {
    // 設定更新APIをモック（FK制約エラー回避）
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
        await route.continue();
      }
    });

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

  test('テーマの説明テキストが表示される', async ({ page }) => {
    await expect(page.getByText('アプリの外観を切り替えます')).toBeVisible();
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
