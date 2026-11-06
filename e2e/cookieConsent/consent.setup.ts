/**
 * GA 有効 E2E のセットアップ（#931）
 *
 * 共有テストユーザーと storageState は作らない（`global.setup.ts` との違い）。
 * この config の spec は未認証で動くか、`openDedicatedSession` で専用ユーザーを
 * 作るかのどちらかで、共有ユーザーを使うものが無いため。
 *
 * レート制限カウンタだけ、この run の分をリセットして確定的な初期状態から始める。
 */

import { test as setup } from '@playwright/test';

import { cleanupRunRateLimits } from '../helpers/api';

setup('レート制限カウンタをリセット', async () => {
  await cleanupRunRateLimits();
});
