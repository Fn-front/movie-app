/**
 * CRON 共通のエラーハンドリング（#979）
 *
 * `handleRouteError` と同じ 500 応答に加えて、**失敗を通知する**。
 * CRON は人が見ていないので、`console.error` だけでは気づけない。
 */

import { NextResponse } from 'next/server';
import { handleRouteError } from '@/helpers/routeError';
import { createServiceRoleClient } from '@/helpers/supabase';
import { notifyCronFailure } from '@/lib/cron/notifyCronFailure';

/**
 * CRON の失敗を記録・通知して 500 を返す
 *
 * ⚠️ **通知の結果でレスポンスを変えない。** 通知が送れなくても CRON の
 * 失敗という事実は変わらないし、ここで分岐すると「通知の失敗」と
 * 「CRON の失敗」が混ざって原因が読めなくなる。
 *
 * ⚠️ `notifyCronFailure` は throw しない契約。await して確実に送り切る
 * （Vercel Function は応答を返した時点で止まりうるので、投げっぱなしにしない）。
 *
 * ⚠️ service role クライアントは**ここで作り直す**。呼び出し元の `supabase` は
 * try の内側にあり catch から見えないし、そもそも「クライアントを作れないこと」
 * 自体が失敗の原因でありうる。作れなければ連投抑止を諦めて送る。
 *
 * @param error - catch した例外
 * @param cronName - CRON の名前。通知の件名と連投抑止の識別子に使う
 * @param message - 利用者向けのメッセージ（レスポンス本文）
 * @returns 500 のレスポンス
 */
export async function handleCronError(
  error: unknown,
  cronName: string,
  message: string,
): Promise<NextResponse> {
  const response = handleRouteError(error, `Cron ${cronName} error`, message);

  await notifyCronFailure(createServiceRoleClient(), {
    cronName,
    reason: error instanceof Error ? error.message : String(error),
  });

  return response;
}
