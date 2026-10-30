/**
 * 管理者発行アカウント API
 * GET  /api/admin/accounts - 発行済みアカウントの一覧
 * POST /api/admin/accounts - アカウントを発行して設定リンクを送信
 *
 * admin ロール必須（`withAdminAuth` がDBで毎回確認する）。
 * 設計: `.claude/documents/admin-account-design.md`
 */

import { NextResponse } from 'next/server';

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
  CACHE_CONTROL,
} from '@/constants';

export const GET = withAdminAuth(
  async ({ supabase }) => {
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

    const token = await issuePasswordResetToken(
      supabase,
      userId,
      ADMIN_ACCOUNT_CONFIG.CREATE_LINK_EXPIRY_MINUTES,
    );

    const sent = await sendAdminAccountEmail({
      email,
      username,
      setupUrl: buildAccountSetupUrl(token),
      expiryMinutes: ADMIN_ACCOUNT_CONFIG.CREATE_LINK_EXPIRY_MINUTES,
      isReissue: false,
    });

    if (!sent) {
      // 作成したアカウントは残す。削除すると、送信だけ失敗した場合に
      // 「誰にも渡っていないアカウント」の有無が分からなくなる。
      // 一覧に「パスワード未設定」として出るため、再発行で復旧できる
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.SERVER_ERROR,
            message: ADMIN_ACCOUNT_MESSAGES.EMAIL_SEND_FAILED,
          },
          data: { username },
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
