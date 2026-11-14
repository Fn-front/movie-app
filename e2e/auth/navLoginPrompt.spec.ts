/**
 * ナビゲーションからのログイン誘導 E2Eテスト（未認証）
 * 保護ルートのナビリンクを未認証で押すと、無言リダイレクトではなく
 * ログイン誘導モーダルが表示されることを確認する。
 */

import type { Page } from '@playwright/test';

import { test, expect } from '../fixtures/auth';

test.describe('ナビゲーションからのログイン誘導（未認証）', () => {
  // storageStateを空にして未認証状態にする
  test.use({ storageState: { cookies: [], origins: [] } });

  /**
   * セッションの判定が終わるまで待つ
   *
   * `useNavAuthGuard` は**未確定の間は遷移を通す**（ログイン済みの利用者に
   * 誤ってログイン誘導を出さないため / #1131）。判定前にクリックすると
   * モーダルではなく `/auth/signin` へ飛ぶので、このテストは必ず落ちる。
   *
   * ログイン導線は判定中 `visibility: hidden` で隠れている（#1131）。
   * 見えたら判定が終わっている
   */
  const waitForSessionResolved = async (page: Page) => {
    // サイドバーに限定する。モーダルを開いた後は同名のボタンが増えるため
    await expect(
      page
        .getByRole('complementary', { name: 'サイドバー' })
        .getByRole('button', { name: 'ログイン' }),
    ).toBeVisible();
  };

  test('未認証でお気に入りリンクを押すとログイン誘導モーダルが表示される', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForSessionResolved(page);

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
    await waitForSessionResolved(page);

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
      await waitForSessionResolved(page);

      await page.getByRole('link', { name: link }).click();

      // リダイレクトされずモーダルが表示される
      await expect(page).toHaveURL('/');
      const dialog = page.getByRole('dialog', { name: 'ログインが必要です' });
      await expect(dialog).toBeVisible();
      await expect(page.getByText(message)).toBeVisible();
    });
  }
});
