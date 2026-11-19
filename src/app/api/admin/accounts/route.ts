/**
 * 管理者発行アカウント API
 * GET  /api/admin/accounts - 発行済みアカウントの一覧
 * POST /api/admin/accounts - アカウントを発行して設定リンクを送信
 *
 * admin ロール必須（`withAdminAuth` がDBで毎回確認する）。
 * 設計: `.claude/documents/admin-account-design.md`
 */

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

import { withAdminAuth } from '@/helpers/adminAuth';
import { parseAndValidate } from '@/helpers/requestValidation';
import { rateLimitExceededResponse } from '@/helpers/apiHelpers';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';
import {
  createIssuedAccount,
  listIssuedAccounts,
} from '@/lib/auth/adminAccount';
import { issuePasswordResetToken } from '@/lib/auth/passwordResetToken';
import { sendAdminAccountEmail } from '@/lib/auth/sendAdminAccountEmail';
import { adminAccountCreateSchema } from '@/schema/adminAccount';
import { buildAccountSetupUrl } from '@/lib/auth/accountSetupUrl';
import {
  ADMIN_ACCOUNT_CONFIG,
  ADMIN_ACCOUNT_LIST_LIMIT,
  ADMIN_ACCOUNT_MESSAGES,
} from '@/constants/adminAccount';
import {
  HTTP_STATUS,
  ERROR_CODE,
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
  CACHE_CONTROL,
} from '@/constants';

export const GET = withAdminAuth(
  async ({ session, supabase }) => {
    // レート制限チェック（#934）。
    // 画面を開いたときの一覧取得で、ポーリングではないため
    // READ_USER_DATA に相乗りさせる（専用カウンタが要るのは
    // `admin/awards/sync/[id]` のような高頻度ポーリングだけ）
    const limitResult = await checkRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.READ_USER_DATA,
      RATE_LIMIT_CONFIG.READ_USER_DATA.maxAttempts,
      RATE_LIMIT_CONFIG.READ_USER_DATA.windowMinutes,
    );

    if (!limitResult.allowed) {
      return rateLimitExceededResponse(limitResult);
    }

    const accounts = await listIssuedAccounts(
      supabase,
      ADMIN_ACCOUNT_LIST_LIMIT,
    );

    return NextResponse.json(
      { success: true, data: { accounts } },
      {
        status: HTTP_STATUS.OK,
        // 管理情報をCDNや共有キャッシュに残さない
        headers: { 'Cache-Control': CACHE_CONTROL.PRIVATE_NO_STORE },
      },
    );
  },
  {
    errorLog: 'Admin account list error',
    errorMessage: ADMIN_ACCOUNT_MESSAGES.FETCH_ERROR,
  },
);

/**
 * 発行したアカウントを取り消す
 *
 * 設定リンクを相手に渡せなかったとき、このアカウントは誰にも使えない。
 *
 * 以前は「一覧にパスワード未設定として出るので再発行で復旧できる」として
 * 残していたが、失敗時の画面は一覧を取り直さないため**その場では出ない**。
 * admin から見えるのは「メールの送信に失敗しました。」だけで、作成された
 * ことに気づけないまま押し直すと、使えないアカウントが毎回1件積まれる。
 * 送信失敗でユーザー行を消す `auth/register` と方針を揃える（あちらは
 * 未検証の既存ユーザーを上書きした経路だけ残す。こちらは常に新規作成）。
 *
 * `password_reset_tokens.user_id`（20261018010000）と
 * `admin_audit_logs.target_user_id`（20261030100000）はどちらも
 * ON DELETE CASCADE なので、users 行を消せば一緒に消える。
 *
 * ⚠️ 監査ログの `account_create` も道連れになる。監査ログは「admin
 * セッションを奪った攻撃者の痕跡を残す」ためのものだが、取り消した発行は
 * アカウントの実体が残らないので記録も残さない扱いにする。試行そのものは
 * `rate_limits` の `admin_account_issue` に残る
 */
async function rollbackIssuedAccount(
  supabase: SupabaseClient,
  userId: string,
  username: string,
): Promise<void> {
  const { error } = await supabase.from('users').delete().eq('id', userId);

  // 消せなければ使えないアカウントが残る。admin は押し直せるので操作は
  // 止めないが、黙って溜まると気づけないのでログには必ず出す
  if (error) {
    console.error(
      `[adminAccount] 発行アカウントのロールバックに失敗しました username='${username}'`,
      error,
    );
  }
}

export const POST = withAdminAuth(
  async ({ session, supabase, request }) => {
    // この機能は「任意の宛先へ自ドメイン名義でメールを送れる」性質を持つ。
    // admin セッションを奪われた場合の被害を上限で抑える（#641 と同じ理屈）
    const limitResult = await checkRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.ADMIN_ACCOUNT_ISSUE,
      ADMIN_ACCOUNT_CONFIG.ISSUE_LIMIT.maxAttempts,
      ADMIN_ACCOUNT_CONFIG.ISSUE_LIMIT.windowMinutes,
    );

    if (!limitResult.allowed) {
      return rateLimitExceededResponse(limitResult);
    }

    const { data: body, error: validationError } = await parseAndValidate(
      request,
      adminAccountCreateSchema,
      ADMIN_ACCOUNT_MESSAGES.INVALID_BODY,
    );

    if (validationError) return validationError;

    // 宛先はここでしか使わない。DB には保存しない
    const { email } = body;

    const { userId, username } = await createIssuedAccount(
      supabase,
      session.user.id,
    );

    // 設定リンクが用意できなければ、発行したアカウントは誰にも使えない。
    // ここで消さないと、下の送信失敗と同じ「気づけないまま残る」状態になる
    //
    // ⚠️ 再発行（`[id]/reissue`）と違い、送信後の
    // `invalidateOtherPasswordResetTokens` は呼ばない。`userId` はこの
    // リクエストで作ったばかりで、無効化すべき古いトークンが存在しえない
    // （#1223）
    let token: string;
    try {
      token = await issuePasswordResetToken(
        supabase,
        userId,
        ADMIN_ACCOUNT_CONFIG.CREATE_LINK_EXPIRY_MINUTES,
      );
    } catch (error) {
      await rollbackIssuedAccount(supabase, userId, username);
      throw error;
    }

    const sent = await sendAdminAccountEmail({
      email,
      username,
      setupUrl: buildAccountSetupUrl(token, username),
      expiryMinutes: ADMIN_ACCOUNT_CONFIG.CREATE_LINK_EXPIRY_MINUTES,
      isReissue: false,
    });

    if (!sent) {
      await rollbackIssuedAccount(supabase, userId, username);

      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.SERVER_ERROR,
            message: ADMIN_ACCOUNT_MESSAGES.EMAIL_SEND_FAILED,
          },
        },
        { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: ADMIN_ACCOUNT_MESSAGES.CREATED,
        data: { username },
      },
      { status: HTTP_STATUS.CREATED },
    );
  },
  {
    errorLog: 'Admin account create error',
    errorMessage: ADMIN_ACCOUNT_MESSAGES.CREATE_ERROR,
  },
);
