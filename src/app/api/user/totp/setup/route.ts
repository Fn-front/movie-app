/**
 * 二段階認証の設定開始API
 * POST /api/user/totp/setup
 *
 * 共有鍵を生成して保存し、QRコードと手入力用の鍵を返す。
 * この時点ではまだ有効化しない（初回コードの入力を待つ）。
 */

import { NextResponse } from 'next/server';
import { renderSVG } from 'uqr';

import { getAuthSession, unauthorizedResponse } from '@/helpers/auth';
import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import { startTotpSetup } from '@/lib/auth/totpSetup';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';
import { HTTP_STATUS, ERROR_CODE, RATE_LIMIT_ACTION } from '@/constants';
import { AUTH_ERROR_MESSAGES } from '@/constants/auth';
import { TOTP_ERROR_MESSAGES, TOTP_SETTINGS_LIMIT } from '@/constants/totp';

export async function POST() {
  try {
    const session = await getAuthSession();
    if (!session) return unauthorizedResponse();

    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    // 鍵の生成と保存を繰り返させない
    const limitResult = await checkRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.TOTP_VERIFY,
      TOTP_SETTINGS_LIMIT.maxAttempts,
      TOTP_SETTINGS_LIMIT.windowMinutes,
    );

    if (!limitResult.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.RATE_LIMIT_EXCEEDED,
            message: AUTH_ERROR_MESSAGES.RATE_LIMIT_EXCEEDED,
          },
        },
        { status: HTTP_STATUS.TOO_MANY_REQUESTS },
      );
    }

    const { data: user } = await supabase
      .from('users')
      .select('email')
      .eq('id', session.user.id)
      .single();

    if (!user) return unauthorizedResponse();

    let setup;
    try {
      setup = await startTotpSetup(supabase, session.user.id, user.email);
    } catch {
      // 既に有効化済み。やり直させず、まず無効化してもらう
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.BAD_REQUEST,
            message: TOTP_ERROR_MESSAGES.ALREADY_ENABLED,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    // QRはサーバーで描き、data URI にして `<img>` で表示させる。
    //
    // SVG文字列のまま渡すと受け取り側で dangerouslySetInnerHTML が必要になり、
    // XSSのsinkを1つ増やすことになる。`<img>` のSVGはスクリプトも外部読み込みも
    // 実行されない文脈なので、その心配がない。
    // CSP の img-src には既に data: が入っている（cspDirectives.mjs:82）。
    const qrCodeDataUri = `data:image/svg+xml;base64,${Buffer.from(
      renderSVG(setup.otpauthUri),
    ).toString('base64')}`;

    return NextResponse.json(
      {
        success: true,
        data: { qrCodeDataUri, secret: setup.secret },
      },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    console.error('TOTP setup error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.SERVER_ERROR,
          message: TOTP_ERROR_MESSAGES.OPERATION_FAILED,
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}
