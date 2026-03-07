/**
 * E2Eテスト用ユーザー情報
 * .env.localまたはCI環境変数から取得
 */
export const TEST_USER = {
  email: process.env.E2E_TEST_USER_EMAIL ?? '',
  password: process.env.E2E_TEST_USER_PASSWORD ?? '',
} as const;
