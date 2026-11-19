/**
 * パスワード設定リンクの再発行 API
 * POST /api/admin/accounts/:id/reissue
 *
 * admin ロール必須（`withAdminAuth` がDBで毎回確認する）。
 *
 * ⚠️ `/api/auth/password-reset/request` は使えない。あれはメールアドレスで
 * ユーザーを引く作りで、発行アカウントが持つのは `.invalid` の合成値のため
 * 到達できず、実送信にも失敗する。
 *
 * 設計: `.claude/documents/admin-account-design.md`
 */

import { NextResponse } from 'next/server';

import { withAdminAuth } from '@/helpers/adminAuth';
import {
  isValidUuid,
  invalidUuidResponse,
  parseAndValidate,
} from '@/helpers/requestValidation';
import { rateLimitExceededResponse } from '@/helpers/apiHelpers';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';
import {
  findReissuableAccount,
  recordReissueAudit,
} from '@/lib/auth/adminAccount';
import {
  invalidateOtherPasswordResetTokens,
  issuePasswordResetToken,
} from '@/lib/auth/passwordResetToken';
import { sendAdminAccountEmail } from '@/lib/auth/sendAdminAccountEmail';
import { buildAccountSetupUrl } from '@/lib/auth/accountSetupUrl';
import { adminAccountReissueSchema } from '@/schema/adminAccount';
import {
  ADMIN_ACCOUNT_CONFIG,
  ADMIN_ACCOUNT_MESSAGES,
} from '@/constants/adminAccount';
import { HTTP_STATUS, ERROR_CODE, RATE_LIMIT_ACTION } from '@/constants';

export const POST = withAdminAuth(
  async ({ session, supabase, request, params }) => {
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

    const { id } = await params!;

    if (!isValidUuid(id)) {
      return invalidUuidResponse(ADMIN_ACCOUNT_MESSAGES.NOT_FOUND);
    }

    const { data: body, error: validationError } = await parseAndValidate(
      request,
      adminAccountReissueSchema,
      ADMIN_ACCOUNT_MESSAGES.INVALID_BODY,
    );

    if (validationError) return validationError;

    // 発行アカウント（username を持つ行）だけを対象にする。
    // メールを持つ通常のアカウントは利用者自身がリセットを使えるため、
    // admin が差し替えられるようにするとバックドアの範囲が全体へ広がる
    const username = await findReissuableAccount(supabase, id);

    if (!username) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.NOT_FOUND,
            message: ADMIN_ACCOUNT_MESSAGES.NOT_ISSUED_ACCOUNT,
          },
        },
        { status: HTTP_STATUS.NOT_FOUND },
      );
    }

    // 新規発行より短い期限にする。既にデータが入っているアカウントを
    // 渡すことになるため、対象を選び間違えたときの窓を狭める
    const token = await issuePasswordResetToken(
      supabase,
      id,
      ADMIN_ACCOUNT_CONFIG.REISSUE_LINK_EXPIRY_MINUTES,
    );

    const sent = await sendAdminAccountEmail({
      email: body.email,
      username,
      setupUrl: buildAccountSetupUrl(token, username),
      expiryMinutes: ADMIN_ACCOUNT_CONFIG.REISSUE_LINK_EXPIRY_MINUTES,
      isReissue: true,
    });

    if (!sent) {
      // ⚠️ 古いリンクはそのまま残す（#1223）。ここで消すと、**相手の手元に
      // あった有効なリンクだけが死に、新しいリンクは誰にも届かない**。
      // admin には送信失敗としか出ないので、壊したことが伝わらない。
      // 新トークンの行は残るが、下の無効化が次の再発行時に掃除する
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

    // 相手に新しいリンクが渡ったので、古いリンクを生かしておく理由がなくなった
    await invalidateOtherPasswordResetTokens(supabase, id, token);

    await recordReissueAudit(supabase, session.user.id, id);

    return NextResponse.json(
      { success: true, message: ADMIN_ACCOUNT_MESSAGES.REISSUED },
      { status: HTTP_STATUS.OK },
    );
  },
  {
    errorLog: 'Admin account reissue error',
    errorMessage: ADMIN_ACCOUNT_MESSAGES.REISSUE_ERROR,
  },
);
