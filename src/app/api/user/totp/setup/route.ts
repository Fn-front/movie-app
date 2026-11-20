/**
 * 二段階認証の設定開始API
 * POST /api/user/totp/setup
 *
 * 方式に応じて、共有鍵を生成して QR を返す（TOTP）か、本人のメールアドレスへ
 * 確認コードを送る（メールOTP）。この時点ではまだ有効化しない
 * （初回コードの入力を待つ）。
 */

import { NextResponse } from 'next/server';
import { renderSVG } from 'uqr';

import { getAuthSession, unauthorizedResponse } from '@/helpers/auth';
import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import { errorResponse } from '@/helpers/secondFactorGuard';
import {
  startSecondFactorSetup,
  TotpAlreadyEnabledError,
} from '@/lib/auth/totpSetup';
import { SEND_SECOND_FACTOR_RESULT } from '@/lib/auth/sendSecondFactorCode';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';
import { secondFactorSetupSchema } from '@/schema/totp';
import { HTTP_STATUS, ERROR_CODE, RATE_LIMIT_ACTION } from '@/constants';
import { AUTH_ERROR_MESSAGES } from '@/constants/auth';
import { TOTP_ERROR_MESSAGES, TOTP_SETTINGS_LIMIT } from '@/constants/totp';
import {
  SECOND_FACTOR_MESSAGES,
  SECOND_FACTOR_METHOD,
} from '@/constants/secondFactor';

export async function POST(request: Request) {
  try {
    const session = await getAuthSession();
    if (!session) return unauthorizedResponse();

    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    // ⚠️ **方式によらず・検証より前に**消費する（原則どおり）。
    //
    // 一度これを `method === 'totp'` の分岐だけに移したが、それは後退だった。
    // メールOTP 側で唯一効くはずの `TWO_FACTOR_SEND` は
    // `sendSecondFactorCode` の中にあり、**再送間隔に当たると
    // `checkRateLimit` へ到達しない**（`sendSecondFactorCode.ts` の
    // THROTTLED は枠の消費より前にある）。結果、60秒以内の連打が
    // 1件もカウントされないまま `user_totp` の DELETE + INSERT を
    // 繰り返せる状態になっていた。
    //
    // 鍵の生成と保存を繰り返させない、という本来の目的は方式に依存しない。
    const limitResult = await checkRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.TOTP_SETTINGS_VERIFY,
      TOTP_SETTINGS_LIMIT.maxAttempts,
      TOTP_SETTINGS_LIMIT.windowMinutes,
    );

    if (!limitResult.allowed) {
      return errorResponse(
        ERROR_CODE.RATE_LIMIT_EXCEEDED,
        AUTH_ERROR_MESSAGES.RATE_LIMIT_EXCEEDED,
        HTTP_STATUS.TOO_MANY_REQUESTS,
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = secondFactorSetupSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.VALIDATION_ERROR,
            message: AUTH_ERROR_MESSAGES.VALIDATION_ERROR,
            details: parsed.error.flatten().fieldErrors,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    const { method } = parsed.data;

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('email, username')
      .eq('id', session.user.id)
      .single();

    // 読み取りに失敗しただけで 401 を返さない。axios のインターセプタが
    // 401 を「未認証」と解釈して強制ログアウトへ倒すため、DB の不調で
    // セッションごと破棄されてしまう。下の catch で 500 にする
    if (userError) throw userError;

    if (!user) return unauthorizedResponse();

    // ⚠️ admin が発行したアカウントにメールOTP を選ばせない。
    //
    // `users.email` は `generateSyntheticEmail()` の `.invalid` TLD
    // （RFC 2606、絶対に名前解決されない）なので、コードが永久に届かず
    // 設定途中のまま詰む。画面側でも選択肢を出さないが、ここでも拒否する
    // （画面だけの制限はAPIを直接叩けば抜けられる）
    if (method === SECOND_FACTOR_METHOD.EMAIL_OTP && user.username) {
      return errorResponse(
        ERROR_CODE.BAD_REQUEST,
        SECOND_FACTOR_MESSAGES.EMAIL_OTP_UNAVAILABLE,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    let setup;
    try {
      setup = await startSecondFactorSetup(
        supabase,
        session.user.id,
        method,
        user.email,
        user.email,
      );
    } catch (error) {
      // ⚠️ 例外をすべてここで潰さないこと。DB の接続断も INSERT 失敗も
      // 「もう有効です」と表示され、障害の切り分けができなくなる
      if (!(error instanceof TotpAlreadyEnabledError)) throw error;

      // 既に有効化済み。やり直させず、まず無効化してもらう
      return errorResponse(
        ERROR_CODE.BAD_REQUEST,
        TOTP_ERROR_MESSAGES.ALREADY_ENABLED,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    if (method === SECOND_FACTOR_METHOD.EMAIL_OTP) {
      // ⚠️ 送信できなかったことを「送った」と同じ応答にしない。
      // 1通も届かないのにコードを待たせることになる
      if (setup.sendResult === SEND_SECOND_FACTOR_RESULT.SEND_FAILED) {
        return errorResponse(
          ERROR_CODE.SERVER_ERROR,
          SECOND_FACTOR_MESSAGES.SEND_FAILED,
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
        );
      }

      if (setup.sendResult === SEND_SECOND_FACTOR_RESULT.LIMIT_EXCEEDED) {
        return errorResponse(
          ERROR_CODE.RATE_LIMIT_EXCEEDED,
          // まだ有効化していないのでリカバリーコードは存在しない
          SECOND_FACTOR_MESSAGES.SEND_LIMIT_EXCEEDED_SETUP,
          HTTP_STATUS.TOO_MANY_REQUESTS,
        );
      }

      // SENT / THROTTLED。THROTTLED は直前に送ったコードがまだ生きている。
      //
      // ⚠️ **どちらも 200 だが、文言を同じにしない（#1285）。**
      //
      // THROTTLED でも `CODE_SENT`（「確認コードをメールに送信しました。」）を
      // 返していたため、再送間隔に当たった利用者には**新しいコードが届かない
      // のに「送信しました」と出ていた**。受信箱の古いコードを試しても
      // 試行回数を使い切っていれば弾かれ続けるので、利用者は自分の入力が
      // 悪いと誤解する。
      //
      // 429 にはしない。直前のコードは**まだ有効**で、利用者がやることは
      // 「受信箱を見る」であって「待つ」ではない。失敗として扱うと
      // 設定画面が先へ進めなくなる。
      const throttled =
        setup.sendResult === SEND_SECOND_FACTOR_RESULT.THROTTLED;

      return NextResponse.json(
        {
          success: true,
          data: { method, throttled },
          message: throttled
            ? SECOND_FACTOR_MESSAGES.CODE_ALREADY_SENT
            : SECOND_FACTOR_MESSAGES.CODE_SENT,
        },
        { status: HTTP_STATUS.OK },
      );
    }

    // QRはサーバーで描き、data URI にして `<img>` で表示させる。
    //
    // SVG文字列のまま渡すと受け取り側で dangerouslySetInnerHTML が必要になり、
    // XSSのsinkを1つ増やすことになる。`<img>` のSVGはスクリプトも外部読み込みも
    // 実行されない文脈なので、その心配がない。
    // CSP の img-src には既に data: が入っている（cspDirectives.mjs:82）。
    const qrCodeDataUri = `data:image/svg+xml;base64,${Buffer.from(
      renderSVG(setup.otpauthUri as string),
    ).toString('base64')}`;

    return NextResponse.json(
      {
        success: true,
        data: { method, qrCodeDataUri, secret: setup.secret },
      },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    console.error('TOTP setup error:', error);

    return errorResponse(
      ERROR_CODE.SERVER_ERROR,
      TOTP_ERROR_MESSAGES.OPERATION_FAILED,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
}
