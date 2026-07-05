/**
 * ナビゲーションからのログイン誘導 E2Eテスト（未認証）
 * 保護ルートのナビリンクを未認証で押すと、無言リダイレクトではなく
 * ログイン誘導モーダルが表示されることを確認する。
 */

import { test, expect } from '../fixtures/auth';

test.describe('ナビゲーションからのログイン誘導（未認証）', () => {
  // storageStateを空にして未認証状態にする
  test.use({ storageState: { cookies: [], origins: [] } });

  test('未認証でお気に入りリンクを押すとログイン誘導モーダルが表示される', async ({
    page,
  }) => {
    await page.goto('/');

    await page.getByRole('link', { name: 'お気に入り' }).click();

    // リダイレクトされずモーダルが表示される
    await expect(page).toHaveURL('/');
    const dialog = page.getByRole('dialog', { name: 'ログインが必要です' });
    await expect(dialog).toBeVisible();
    await expect(
      page.getByText('お気に入りを見るにはログインが必要です。'),
    ).toBeVisible();
  });

  test('ログイン誘導モーダルのログインボタンでサインインページへ遷移する', async ({
    page,
  }) => {
    await page.goto('/');

    await page.getByRole('link', { name: 'ウォッチリスト' }).click();

    const dialog = page.getByRole('dialog', { name: 'ログインが必要です' });
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: 'ログイン' }).click();
    await expect(page).toHaveURL(/\/auth\/signin/);
  });

  // 保護ルートごとのモーダル文言（お気に入りは上でカバー済み）
  const protectedRoutes = [
    {
      link: 'ウォッチリスト',
      message: 'ウォッチリストを見るにはログインが必要です。',
    },
    {
      link: 'シアター体験',
      message: 'シアター体験を見るにはログインが必要です。',
    },
  ];

  for (const { link, message } of protectedRoutes) {
    test(`未認証で${link}リンクを押すとルート別メッセージのモーダルが表示される`, async ({
      page,
    }) => {
      await page.goto('/');

      await page.getByRole('link', { name: link }).click();

      // リダイレクトされずモーダルが表示される
      await expect(page).toHaveURL('/');
      const dialog = page.getByRole('dialog', { name: 'ログインが必要です' });
      await expect(dialog).toBeVisible();
      await expect(page.getByText(message)).toBeVisible();
    });
  }
});
