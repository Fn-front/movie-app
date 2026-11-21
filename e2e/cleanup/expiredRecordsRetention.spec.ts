/**
 * otp_codes / password_reset_tokens の保持期間（#978 / #1300 / #1352）
 *
 * 削除条件は SQL（`delete_expired_otp_codes` /
 * `delete_expired_password_reset_tokens`）にあるため、jest のモックでは
 * 検証できない。実DBに行を仕込み、RPC を1回呼んでどれが残るかを見る。
 * `e2e/rateLimit/rateLimitsRetention.spec.ts` と同じ形。
 *
 * ⛔ **「消えすぎ」を捕まえるのが主目的。** 条件の向きを逆にする
 * （`now() - interval` → `now() + interval`）と、**まだ有効なコードや
 * トークンを消す**実装になるが、jest は1件も落ちない。症状は「正しい
 * コードを入れたのに『確認コードが見つかりません』」で、レート制限や
 * 入力ミスと区別がつかない。
 *
 * ⛔ **本番に向けて流さない。** ヘルパーは保持期間を引数で受けるので、
 * 実利用者の有効なコードまで消える。`.claude/rules/testing.md` の
 * 「E2E はローカルの Supabase で回す」を必ず守ること。
 *
 * ⚠️ ブラウザは使わないが、DBヘルパーが e2e 側にあるためここに置く。
 */

import { test, expect } from '@playwright/test';

import { OTP_CODE_RETENTION_HOURS } from '@/constants/otp';
import { PASSWORD_RESET_TOKEN_RETENTION_HOURS } from '@/constants/passwordReset';
import { DELETE_BATCH_SIZE } from '@/lib/cleanup/batchedDelete';

import {
  cleanupOtpCodes,
  rowExistsById,
  runDeleteExpiredOtpCodes,
  runDeleteExpiredPasswordResetTokens,
  seedOtpCodeRow,
  seedPasswordResetTokenRow,
} from '../helpers/api';
import {
  createVerifiedUser,
  deleteUserByEmail,
} from '../helpers/dedicatedUser';
import { runScopedEmail } from '../helpers/runScope';

const hoursAgo = (hours: number) =>
  new Date(Date.now() - hours * 3600_000).toISOString();
const hoursLater = (hours: number) =>
  new Date(Date.now() + hours * 3600_000).toISOString();

/**
 * 1回で消す上限。**本番と同じ値を実装から取る**（二重管理にしない）
 *
 * ⚠️ 本番の CRON は常に `p_limit` 付きで呼ぶので、省くと**本番が通らない
 * 経路**を検証することになる。
 *
 * ⚠️ 上限は**テーブル全体の候補集合**に掛かり `ORDER BY` も無いため、
 * 期限切れ候補がこの数を超えていると仕込んだ行が選ばれる保証がない。
 * つまりこの spec が成立するのは候補が上限未満の間だけ
 * （`rateLimitsRetention.spec.ts` と同じ前提）。
 *
 * ⚠️ **上限が効いていること自体は固定していない。** 仕込むのは期限切れ
 * 2行だけなので、SQL から `LIMIT p_limit` を外す変異でも緑のまま通る。
 * 件数を絞るテストは「候補がテーブル全体で2行だけ」という前提が要り、
 * 共有DBでは成り立たない。ここで見ているのは**本番と同じ呼び方で
 * 削除条件が正しいこと**まで。
 */
const DELETE_LIMIT = DELETE_BATCH_SIZE;

test.describe('期限切れレコードの保持期間', () => {
  // RPC を1回だけ呼び、その結果を各テストで見る
  test.describe.configure({ mode: 'serial' });

  // 認証を使わないので storageState は空でよい
  test.use({ storageState: { cookies: [], origins: [] } });

  /**
   * ⚠️ ブラウザを使わないので1ブラウザで足りる。
   *
   * ⛔ それ以上に、**3プロジェクトで並走すると壊れる**。identifier は
   * run 単位（`runScopedEmail`）でプロジェクト単位ではないため、先に
   * 終わったプロジェクトの `afterAll`（`cleanupOtpCodes` / ユーザー削除）が、
   * まだ assert 前の別プロジェクトの「残る」はずの行まで消す。
   * CI は chromium だけだが、ローカルの `npm run test:e2e` は
   * firefox / webkit も足す（`playwright.config.ts:181-208`）。
   */
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'DBだけを見るテストなので chromium 1本で足りる（並走すると互いの行を消す）',
  );

  /**
   * 保持期間の下限ガード（#1352 のレビュー）
   *
   * ⛔ ここが**最大の「消えすぎ」経路**。`make_interval(hours => -5)` は
   * `-05:00:00` を返すので `now() - (-5時間)` が**未来**になり、
   * **まだ有効なコードやトークンを全部消す**。SQL 側のコメントが自ら
   * そう書いているのに、検証はどこにも無かった。
   *
   * ⚠️ jest 側は RPC をモックするので、ここは実DBでしか見られない。
   */
  test.describe('引数のガード', () => {
    test('保持期間が0以下なら削除せずに落ちる', async () => {
      await expect(
        runDeleteExpiredOtpCodes(-1, DELETE_LIMIT),
      ).rejects.toThrow();
      await expect(runDeleteExpiredOtpCodes(0, DELETE_LIMIT)).rejects.toThrow();
      await expect(
        runDeleteExpiredPasswordResetTokens(-1, DELETE_LIMIT),
      ).rejects.toThrow();
      await expect(
        runDeleteExpiredPasswordResetTokens(0, DELETE_LIMIT),
      ).rejects.toThrow();
    });

    /**
     * ⚠️ 0 や負数を黙って受けると「1件も消さないのに成功」を返し、
     * 本番のループ（`runBatchedDelete`）が即座に打ち切られる。
     * 滞留に気づけないまま成功扱いになるので、落とすほうが正しい。
     */
    test('上限が0以下なら削除せずに落ちる', async () => {
      await expect(
        runDeleteExpiredOtpCodes(OTP_CODE_RETENTION_HOURS, 0),
      ).rejects.toThrow();
      await expect(
        runDeleteExpiredPasswordResetTokens(
          PASSWORD_RESET_TOKEN_RETENTION_HOURS,
          -1,
        ),
      ).rejects.toThrow();
    });
  });

  test.describe('otp_codes（#978）', () => {
    const EMAIL = runScopedEmail('e2e-otp-retention');

    /** 仕込む4種類の行。削除条件が見るのは `expires_at` だけ */
    const ids = {
      /** 期限切れから保持期間を過ぎた → 消える */
      expired: '',
      /** 同上で検証済み → 消える（`verified_at` は条件に含めない） */
      expiredVerified: '',
      /** 期限切れだが保持期間内 → 残る */
      withinRetention: '',
      /** まだ有効 → 残る */
      valid: '',
    };

    /** RPC が返した削除件数 */
    let deletedCount = 0;

    test.beforeAll(async () => {
      ids.expired = await seedOtpCodeRow({
        email: EMAIL,
        actionType: 'login',
        expiresAt: hoursAgo(OTP_CODE_RETENTION_HOURS + 24),
      });
      ids.expiredVerified = await seedOtpCodeRow({
        email: EMAIL,
        actionType: 'login',
        expiresAt: hoursAgo(OTP_CODE_RETENTION_HOURS + 24),
        verifiedAt: hoursAgo(OTP_CODE_RETENTION_HOURS + 24),
      });
      ids.withinRetention = await seedOtpCodeRow({
        email: EMAIL,
        actionType: 'login',
        expiresAt: hoursAgo(1),
      });
      ids.valid = await seedOtpCodeRow({
        email: EMAIL,
        actionType: 'login',
        expiresAt: hoursLater(1),
      });

      deletedCount = await runDeleteExpiredOtpCodes(
        OTP_CODE_RETENTION_HOURS,
        DELETE_LIMIT,
      );
    });

    test.afterAll(async () => {
      await cleanupOtpCodes(EMAIL);
    });

    /**
     * ⛔ 戻り値は本番の**打ち切り判定そのもの**（`batchedDelete.ts:162`）。
     * `GET DIAGNOSTICS ... ROW_COUNT` が壊れて常に 0 を返すようになると、
     * 行は消えているのに1バッチで `completed: true` となり、**滞留が
     * 無言で残る**。jest 側はモック値を返すだけなので実DBでしか見られない。
     *
     * ⚠️ 共有DBには他の期限切れ候補もありうるので下限で見る。
     */
    test('削除件数を返す', () => {
      expect(deletedCount).toBeGreaterThanOrEqual(2);
    });

    test('保持期間を過ぎた期限切れコードは消える', async () => {
      expect(await rowExistsById('otp_codes', ids.expired)).toBe(false);
    });

    /**
     * ⚠️ `verified_at` を削除条件に足すと、検証済みの行だけが永久に残る。
     * 残す理由は「使い回しを『見つからない』ではなく『使用済み』として
     * 判定するため」だが、それが要るのは有効期限の内側だけ。
     */
    test('検証済みでも保持期間を過ぎていれば消える', async () => {
      expect(await rowExistsById('otp_codes', ids.expiredVerified)).toBe(false);
    });

    /**
     * ⛔ ここが条件の向きを固定する。`now() + interval` にすると、
     * この行も下の `valid` も消える。
     */
    test('期限切れでも保持期間内なら残る', async () => {
      expect(await rowExistsById('otp_codes', ids.withinRetention)).toBe(true);
    });

    test('まだ有効なコードは残る', async () => {
      expect(await rowExistsById('otp_codes', ids.valid)).toBe(true);
    });
  });

  test.describe('password_reset_tokens（#1300）', () => {
    const USER = {
      email: runScopedEmail('e2e-reset-token-retention'),
      password: 'E2eResetRetention1',
    };

    let userId = '';

    const ids = {
      /** 期限切れから保持期間を過ぎた → 消える */
      expired: '',
      /** 同上で使用済み → 消える（`used_at` は条件に含めない） */
      expiredUsed: '',
      /** 期限切れだが保持期間内 → 残る */
      withinRetention: '',
      /** まだ有効 → 残る */
      valid: '',
    };

    /** RPC が返した削除件数 */
    let deletedCount = 0;

    test.beforeAll(async () => {
      userId = await createVerifiedUser(USER);

      ids.expired = await seedPasswordResetTokenRow({
        userId,
        expiresAt: hoursAgo(PASSWORD_RESET_TOKEN_RETENTION_HOURS + 24),
      });
      ids.expiredUsed = await seedPasswordResetTokenRow({
        userId,
        expiresAt: hoursAgo(PASSWORD_RESET_TOKEN_RETENTION_HOURS + 24),
        usedAt: hoursAgo(PASSWORD_RESET_TOKEN_RETENTION_HOURS + 24),
      });
      ids.withinRetention = await seedPasswordResetTokenRow({
        userId,
        expiresAt: hoursAgo(1),
      });
      ids.valid = await seedPasswordResetTokenRow({
        userId,
        expiresAt: hoursLater(1),
      });

      deletedCount = await runDeleteExpiredPasswordResetTokens(
        PASSWORD_RESET_TOKEN_RETENTION_HOURS,
        DELETE_LIMIT,
      );
    });

    test.afterAll(async () => {
      // `password_reset_tokens.user_id` は ON DELETE CASCADE なので、
      // ユーザーを消せば仕込んだ4行も消える（個別削除は要らない）
      await deleteUserByEmail(USER.email);
    });

    /** ⛔ 理由は otp_codes 側と同じ（本番の打ち切り判定） */
    test('削除件数を返す', () => {
      expect(deletedCount).toBeGreaterThanOrEqual(2);
    });

    test('保持期間を過ぎた期限切れトークンは消える', async () => {
      expect(await rowExistsById('password_reset_tokens', ids.expired)).toBe(
        false,
      );
    });

    /**
     * ⚠️ 使用済みの行は `used_at` が入るだけで残る作りなので、`used_at` を
     * 削除条件に足すと**使われたトークンだけが永久に残る**。
     * 個人データの消去という目的からは逆向き。
     */
    test('使用済みでも保持期間を過ぎていれば消える', async () => {
      expect(
        await rowExistsById('password_reset_tokens', ids.expiredUsed),
      ).toBe(false);
    });

    /** ⛔ ここが条件の向きを固定する（otp_codes と同じ） */
    test('期限切れでも保持期間内なら残る', async () => {
      expect(
        await rowExistsById('password_reset_tokens', ids.withinRetention),
      ).toBe(true);
    });

    test('まだ有効なトークンは残る', async () => {
      expect(await rowExistsById('password_reset_tokens', ids.valid)).toBe(
        true,
      );
    });
  });
});
