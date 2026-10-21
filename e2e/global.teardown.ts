/**
 * Playwrightグローバルティアダウン
 *
 * setupプロジェクトの teardown として実行され、この run が共有DBに作った
 * テストデータを消す（#793）。
 *
 * 各 spec も自分の後片付けをするが、途中で落ちると取りこぼす。run 単位の
 * 識別子（メールアドレス・映画IDの領域・送信元IP）でまとめて回収することで、
 * 残骸が次回以降の run に影響しないようにする。
 */

import { test as teardown } from '@playwright/test';

import { cleanupRunMovieCache, cleanupRunRateLimits } from './helpers/api';
import { deleteRunScopedUsers } from './helpers/dedicatedUser';

teardown('run固有のテストデータを削除', async () => {
  // ユーザーを先に消す。関連テーブルは ON DELETE CASCADE で連鎖削除される
  await deleteRunScopedUsers();
  await Promise.all([cleanupRunMovieCache(), cleanupRunRateLimits()]);
});
