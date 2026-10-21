/**
 * E2Eテスト用の共有ユーザー
 *
 * 以前は `E2E_TEST_USER_EMAIL` / `E2E_TEST_USER_PASSWORD` で指定した
 * DB上の固定ユーザーを使い回していた。共有DBに対して複数のCI runが同時に
 * 流れると、ウォッチリスト・お気に入り・フィルター・おすすめを互いに
 * 消し合うため、run ごとに作って run ごとに消すユーザーへ変えた（#793）。
 *
 * 実体の作成は `e2e/global.setup.ts`、削除は `e2e/global.teardown.ts`。
 */

import { runScopedEmail } from './runScope';

/**
 * 共有テストユーザーのパスワード
 *
 * ユーザーは run ごとに作り直すため固定値でよい。作成は Supabase REST 経由で
 * bcryptハッシュを直接入れるため、登録APIのポリシー検証（HIBP照合等）は通らず、
 * ログイン時の `bcrypt.compare` だけが関係する。
 */
const SHARED_USER_PASSWORD = 'E2eSharedUserKx7Qm2';

/** storageState の生成元になる、run 固有の共有テストユーザー */
export const TEST_USER = {
  email: runScopedEmail('e2e-shared'),
  password: SHARED_USER_PASSWORD,
} as const;
