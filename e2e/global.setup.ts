/**
 * Playwrightグローバルセットアップ
 * setupプロジェクトとして実行され、認証済みstorageStateを生成する
 */

import { test as setup } from '@playwright/test';

import { globalAuthSetup } from './fixtures/auth';

setup('認証セッションを生成', async ({ page }) => {
  await globalAuthSetup(page);
});
