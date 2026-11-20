/**
 * CRON認証ヘルパー
 * Vercel Cron用のBearer認証を共通化
 */

import { timingSafeEqual } from 'crypto';

import { NextResponse } from 'next/server';

import { HTTP_STATUS, ERROR_CODE, AUTH_ERROR_MESSAGES } from '@/constants';
import { createServiceRoleClient } from '@/helpers/supabase';
import { notifyCronFailure } from '@/lib/cron/notifyCronFailure';

/**
 * CRON_SECRET Bearerトークン認証（タイミングセーフ比較）
 *
 * ⚠️ **`CRON_SECRET` 未設定のときだけ通知する**（#979）。
 *
 * Issue が主要シナリオに挙げていた「`CRON_SECRET` 不一致で全 CRON が 401 で
 * 素通りする」は、401 がここで `return` されて catch に入らないため
 * 通知に乗っていなかった。
 *
 * ⛔ **ただし「不一致」では通知しない。** `/api/cron/*` は未認証で誰でも
 *   叩けるので、不一致で通知すると**外部から通知を誘発できる**。
 *   連投抑止は1日1通なので、攻撃者が毎日9本を叩くだけで**その日の通知枠を
 *   使い切らせ、本物の失敗を埋もれさせられる**（アラートの無力化）。
 *
 * 未設定のほうは外部の入力に依存しない**こちら側の設定ミス**なので、
 * 誘発されることがなく、通知して安全。
 *
 * ⚠️ 「正しい秘密鍵が設定されているが Vercel 側が古い値を送っている」は
 *   ここでは検知できない。沈黙では区別がつかないため、**定期実行が一定期間
 *   成功していないこと**を見る仕組み（ハートビート）が別途要る。残件。
 *
 * @param request - 受け取ったリクエスト
 * @param cronName - CRON の名前。通知に使う
 * @returns 認証失敗時はエラーレスポンス、成功時はnull
 */
export async function verifyCronAuth(
  request: Request,
  cronName: string,
): Promise<NextResponse | null> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  if (!cronSecret) {
    // 外部からは誘発できない。こちら側の設定ミスなので通知する
    await notifyCronFailure(createServiceRoleClient(), {
      cronName,
      reason:
        'CRON_SECRET が設定されていません。すべての CRON が 401 で素通りします',
    });
  }

  if (!cronSecret || !authHeader) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.UNAUTHORIZED,
          message: AUTH_ERROR_MESSAGES.AUTH_FAILED,
        },
      },
      { status: HTTP_STATUS.UNAUTHORIZED },
    );
  }

  const expected = Buffer.from(`Bearer ${cronSecret}`);
  const actual = Buffer.from(authHeader);

  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.UNAUTHORIZED,
          message: AUTH_ERROR_MESSAGES.AUTH_FAILED,
        },
      },
      { status: HTTP_STATUS.UNAUTHORIZED },
    );
  }

  return null;
}
