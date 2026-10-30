/**
 * 認証フォーム バリデーション E2Eテスト（未認証）
 *
 * クライアントバリデーション（送信前に弾かれるエラー表示）を画面操作で検証する。
 * DB/メール送信に非依存。エラー文言の網羅は結合テスト側に委ね、ここでは
 * 「画面操作でバリデーションエラーが表示され遷移しないこと」を確認する。
 */

import { test, expect } from '@playwright/test';

test.describe('認証フォームのバリデーション（未認証）', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.describe('ログイン', () => {
    // 入力欄はメールアドレスとアカウント名を兼用する。`@` を含まない入力は
    // アカウント名として扱われるため、アカウント名の形にも当てはまらない
    // ものだけがエラーになる
    test('メール形式が不正だとエラーが表示され遷移しない', async ({ page }) => {
      await page.goto('/auth/signin');

      await page
        .getByLabel('メールアドレスまたはアカウント名')
        .fill('notanemail');
      await page.getByLabel('パスワード').fill('x');
      await page.getByRole('button', { name: 'ログイン', exact: true }).click();

      await expect(
        page.getByText(
          'メールアドレスまたはアカウント名の形式が正しくありません',
        ),
      ).toBeVisible();
      await expect(page).toHaveURL(/\/auth\/signin/);
    });

    test('未入力だと必須エラーが表示される', async ({ page }) => {
      await page.goto('/auth/signin');

      await page.getByRole('button', { name: 'ログイン', exact: true }).click();

      await expect(
        page.getByText('メールアドレスを入力してください'),
      ).toBeVisible();
      await expect(
        page.getByText('パスワードを入力してください'),
      ).toBeVisible();
    });
  });

  test.describe('新規登録', () => {
    test('メール形式が不正だとエラーが表示される', async ({ page }) => {
      await page.goto('/auth/signup');

      await page.getByLabel('メールアドレス').fill('notanemail');
      await page.getByLabel('パスワード', { exact: true }).fill('Password1234');
      await page.getByLabel('パスワード（確認）').fill('Password1234');
      await page.getByRole('button', { name: '登録する' }).click();

      await expect(
        page.getByText('メールアドレスの形式が正しくありません'),
      ).toBeVisible();
    });

    test('パスワードが12文字未満だとエラーが表示される', async ({ page }) => {
      await page.goto('/auth/signup');

      await page.getByLabel('メールアドレス').fill('valid@example.com');
      // 大文字・小文字・数字は満たすが12文字未満
      await page.getByLabel('パスワード', { exact: true }).fill('Ab1');
      await page.getByLabel('パスワード（確認）').fill('Ab1');
      await page.getByRole('button', { name: '登録する' }).click();

      await expect(
        page.getByText('パスワードは12文字以上で入力してください'),
      ).toBeVisible();
    });

    // bcrypt は72バイトで黙って切り詰めるため、上限を超える入力は受け付けない（#652）
    const byteLimitCases = [
      { title: 'ASCIIで73バイト', password: `Aa1${'x'.repeat(70)}` },
      // 26文字しかないが75バイト。文字数で判定していたら通ってしまう
      { title: '日本語を含み75バイト', password: `Aa1${'あ'.repeat(24)}` },
    ];

    for (const { title, password } of byteLimitCases) {
      test(`パスワードが${title}だとバイト数の理由が表示される`, async ({
        page,
      }) => {
        await page.goto('/auth/signup');

        await page.getByLabel('メールアドレス').fill('valid@example.com');
        await page.getByLabel('パスワード', { exact: true }).fill(password);
        await page.getByLabel('パスワード（確認）').fill(password);
        await page.getByRole('button', { name: '登録する' }).click();

        await expect(
          page.getByText(
            'パスワードは72バイト以内で入力してください（日本語は1文字3バイト）',
          ),
        ).toBeVisible();
      });
    }

    test('パスワードと確認が一致しないとエラーが表示される', async ({
      page,
    }) => {
      await page.goto('/auth/signup');

      await page.getByLabel('メールアドレス').fill('valid@example.com');
      await page.getByLabel('パスワード', { exact: true }).fill('Password1234');
      await page.getByLabel('パスワード（確認）').fill('Password5678');
      await page.getByRole('button', { name: '登録する' }).click();

      await expect(page.getByText('パスワードが一致しません')).toBeVisible();
    });

    // パスワード複雑性（zod検証順: min → バイト数 → 大文字 → 小文字 → 数字 に沿って
    // 直前チェックは通過し対象だけ失敗させる入力を用意）
    const complexityCases = [
      {
        title: '大文字欠落',
        password: 'password1234',
        message: 'パスワードに大文字を含めてください',
      },
      {
        title: '小文字欠落',
        password: 'PASSWORD1234',
        message: 'パスワードに小文字を含めてください',
      },
      {
        title: '数字欠落',
        password: 'PasswordAbcd',
        message: 'パスワードに数字を含めてください',
      },
    ];

    for (const { title, password, message } of complexityCases) {
      test(`パスワードが${title}だと「${message}」が表示される`, async ({
        page,
      }) => {
        await page.goto('/auth/signup');

        await page.getByLabel('メールアドレス').fill('valid@example.com');
        await page.getByLabel('パスワード', { exact: true }).fill(password);
        await page.getByLabel('パスワード（確認）').fill(password);
        await page.getByRole('button', { name: '登録する' }).click();

        await expect(page.getByText(message)).toBeVisible();
      });
    }

    test('メールアドレスが上限長（255文字）を超えるとエラーが表示される', async ({
      page,
    }) => {
      await page.goto('/auth/signup');

      // 形式は有効なまま255文字超にする（ローカル部を長くする）
      const longEmail = `${'a'.repeat(250)}@example.com`;
      await page.getByLabel('メールアドレス').fill(longEmail);
      await page.getByLabel('パスワード', { exact: true }).fill('Password1234');
      await page.getByLabel('パスワード（確認）').fill('Password1234');
      await page.getByRole('button', { name: '登録する' }).click();

      await expect(page.getByText('メールアドレスが長すぎます')).toBeVisible();
    });

    test('ユーザー名が上限長（100文字）を超えるとエラーが表示される', async ({
      page,
    }) => {
      await page.goto('/auth/signup');

      await page.getByLabel('メールアドレス').fill('valid@example.com');
      await page.getByLabel('ユーザー名（任意）').fill('あ'.repeat(101));
      await page.getByLabel('パスワード', { exact: true }).fill('Password1234');
      await page.getByLabel('パスワード（確認）').fill('Password1234');
      await page.getByRole('button', { name: '登録する' }).click();

      await expect(
        page.getByText('ユーザー名は100文字以内で入力してください'),
      ).toBeVisible();
    });
  });
});
