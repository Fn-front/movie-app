/**
 * アカウント削除API（#932）
 * DELETE /api/user
 *
 * プライバシーポリシー（/privacy）が受け付けると明記している削除請求の
 * セルフサービス窓口。個人情報保護法35条 / GDPR 17条。
 *
 * ⚠️ **物理削除**。論理削除だとポリシーの「消去」と実態が食い違う。
 * 取り消しはできない。
 *
 * ⚠️ **セッションだけでは消させない。** セッションを奪った第三者が
 * そのまま口封じにアカウントを消せてしまう。所持・記憶のいずれかを
 * 改めて要求する（`totp/disable` と同じ考え方）。
 *
 * ⚠️ **どの層にも必ず1つは要求する**（#1362）。照合の材料は3つあり、
 *   持っているものを上から順に使う。
 *
 *   | 持っているもの | 要求するもの |
 *   |---|---|
 *   | パスワード | 現在のパスワード |
 *   | 第2要素 | 認証アプリ / メールOTP / リカバリーコード |
 *   | **どちらも無い（OAuth のみ）** | **登録アドレスへ送る使い捨てコード** |
 *
 *   3つ目が無かった頃は、OAuth のみで登録し二段階認証を設定していない層に
 *   **再確認が1つも掛からず、セッションだけで2クリックで消せた**。
 */

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

import {
  ERROR_CODE,
  HTTP_STATUS,
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
} from '@/constants';
import { ACCOUNT_DELETE_CODE_MESSAGES } from '@/constants/accountDeleteCode';
import {
  ACCOUNT_DELETE_MESSAGES,
  AUTH_ERROR_MESSAGES,
  VALIDATION_MESSAGES,
} from '@/constants/auth';
import { getAuthSession, unauthorizedResponse } from '@/helpers/auth';
import { parseAndValidate } from '@/helpers/requestValidation';
import { requireSecondFactor } from '@/helpers/secondFactorGuard';
import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import {
  ACCOUNT_DELETE_VERIFY_RESULT,
  consumeAccountDeleteCode,
} from '@/lib/auth/accountDeleteCode';
import { getSecondFactorMethod } from '@/lib/auth/secondFactor';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';
import { accountDeleteApiSchema } from '@/schema/auth';

/** 統一エラーレスポンス */
function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status },
  );
}

export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    const session = await getAuthSession();
    if (!session) return unauthorizedResponse();

    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    // レート制限は検証より前。識別子がセッションなのでここで確定している
    // （`.claude/rules/api-route.md`「レート制限と検証の順序」の原則）
    //
    // ⚠️ 成功するとこの行も `delete_user_account` が消す（識別子は利用者ID）。
    //   残しても参照されないが、退会したのに行だけ残るのは気持ちが悪い
    const rateLimitResult = await checkRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.ACCOUNT_DELETE,
      RATE_LIMIT_CONFIG.ACCOUNT_DELETE.maxAttempts,
      RATE_LIMIT_CONFIG.ACCOUNT_DELETE.windowMinutes,
    );

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.RATE_LIMIT_EXCEEDED,
            message: AUTH_ERROR_MESSAGES.RATE_LIMIT_EXCEEDED,
            details: { retryAfter: rateLimitResult.retryAfter },
          },
        },
        { status: HTTP_STATUS.TOO_MANY_REQUESTS },
      );
    }

    // ⚠️ `request.json()` を直接呼ばない。壊れた JSON が例外になり、
    //   catch の 500 に化けて**利用者には「失敗しました」としか出ない**。
    //   `parseAndValidate` は 400 で返す
    const parsed = await parseAndValidate(
      request,
      accountDeleteApiSchema,
      AUTH_ERROR_MESSAGES.VALIDATION_ERROR,
    );

    if (parsed.error) return parsed.error;

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('email, password_hash')
      .eq('id', session.user.id)
      .single();

    if (userError || !user) {
      return errorResponse(
        ERROR_CODE.NOT_FOUND,
        ACCOUNT_DELETE_MESSAGES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND,
      );
    }

    // ⚠️ パスワードを持たない利用者（ソーシャル連携のみ）は照合できない。
    //   必須にすると**永久に退会できなくなる**ので、持っている人にだけ要求する
    if (user.password_hash) {
      if (!parsed.data.currentPassword) {
        return errorResponse(
          ERROR_CODE.VALIDATION_ERROR,
          VALIDATION_MESSAGES.CURRENT_PASSWORD_REQUIRED,
          HTTP_STATUS.BAD_REQUEST,
        );
      }

      const passwordMatches = await bcrypt.compare(
        parsed.data.currentPassword,
        user.password_hash,
      );

      if (!passwordMatches) {
        return errorResponse(
          ERROR_CODE.VALIDATION_ERROR,
          AUTH_ERROR_MESSAGES.CURRENT_PASSWORD_INCORRECT,
          HTTP_STATUS.BAD_REQUEST,
        );
      }
    }

    // ⚠️ `requireSecondFactor` の JSDoc は「呼ぶ前に
    //   `checkSecondFactorRateLimit` を通していること」と書いているが、
    //   **このルートは通さない**。上の `ACCOUNT_DELETE` が同じ利用者IDで
    //   数えており、2つ重ねると退会の試行で第2要素の設定画面まで
    //   巻き添えで 429 になる（`.claude/rules/api-route.md` の
    //   `send-challenge` と同じ判断）。
    //
    // ⚠️ 設定している人にだけ要求する。`requireSecondFactor` は未設定だと
    //   「設定されていません」の 400 を返すため、直接呼ぶと**未設定の利用者が
    //   退会できなくなる**
    const secondFactorMethod = await getSecondFactorMethod(
      supabase,
      session.user.id,
    );

    if (secondFactorMethod) {
      const guardResponse = await requireSecondFactor(
        supabase,
        session.user.id,
        parsed.data.code ?? '',
      );

      if (guardResponse) return guardResponse;
    }

    // ⛔ **ここが #1362 の本体。** パスワードを持たない利用者は上の照合を
    //   通らないため、**再確認が1つも掛からないまま削除へ到達していた**。
    //   登録アドレスへ送った使い捨てコードで受信箱の所持を確かめる。
    //
    // ⛔ **条件に第2要素を含めない**（#1362 の1回目レビューで critical）。
    //
    //   第2要素は**セッションだけで自己登録できる**。`totp/setup` も
    //   `totp/enable` も再認証を要求しないので、セッションを奪った第三者は
    //
    //     1. `POST /api/user/totp/setup {"method":"totp"}` で共有鍵を受け取る
    //     2. `POST /api/user/totp/enable` に自分で計算したコードを入れる
    //     3. `DELETE /api/user` でそのコードを出す
    //
    //   という2手で `requireSecondFactor` を自分で通せる。被害者には
    //   **メールが1通も届かない**。「第2要素を持っている」を独立した
    //   再確認として数えてよいのは**パスワードを持つ利用者だけ**。
    //
    //   根治（`totp/setup` 自体に再認証を課す）は範囲が広いので別Issue。
    //
    // ⚠️ 入力確認フレーズ（"delete" と打たせる等）では代わりにならない。
    //   誤操作にしか効かず、セッションを持つ攻撃者は同じ文字列を打てる。
    //
    // ⚠️ パスワードを持つ利用者には要求しない。あちらは記憶の照合が
    //   済んでおり、メールを待たせる理由が無い
    if (!user.password_hash) {
      if (!parsed.data.deleteCode) {
        return errorResponse(
          ERROR_CODE.VALIDATION_ERROR,
          ACCOUNT_DELETE_CODE_MESSAGES.CODE_REQUIRED,
          HTTP_STATUS.BAD_REQUEST,
        );
      }

      // ⛔ `session.user.id` を渡すこと。外すと、攻撃者が自分のアカウントで
      //   取ったコードを奪った被害者のセッションで使える（#1359 の critical）
      const verifyResult = await consumeAccountDeleteCode(
        supabase,
        session.user.id,
        user.email,
        parsed.data.deleteCode,
      );

      if (verifyResult !== ACCOUNT_DELETE_VERIFY_RESULT.SUCCESS) {
        return errorResponse(
          ERROR_CODE.VALIDATION_ERROR,
          ACCOUNT_DELETE_CODE_MESSAGES.CODE_INVALID,
          HTTP_STATUS.BAD_REQUEST,
        );
      }
    }

    // ⚠️ `rate_limits` は CASCADE で消えない（identifier 文字列で引くため）。
    //   RPC の中で同じトランザクションにまとめてある
    const { error: deleteError } = await supabase.rpc('delete_user_account', {
      p_user_id: session.user.id,
    });

    if (deleteError) throw deleteError;

    return NextResponse.json(
      { success: true, message: ACCOUNT_DELETE_MESSAGES.SUCCESS },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    console.error('Account delete error:', error);

    return errorResponse(
      ERROR_CODE.SERVER_ERROR,
      ACCOUNT_DELETE_MESSAGES.FAILED,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
}
