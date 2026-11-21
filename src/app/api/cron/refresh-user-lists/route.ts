/**
 * 利用者リストの作品情報 取り直し Cron API
 * GET /api/cron/refresh-user-lists
 *
 * Vercel Cron で毎週月曜 21:00（JST）に自動実行される。
 * CRON_SECRET 環境変数による Bearer 認証が必要。
 *
 * `favorites` / `watchlist` / `dismissed_movies` が持つ TMDb 由来の表示列を
 * 取り直す。TMDb 利用規約 Section 1.C の「6ヶ月を超えてキャッシュしない」
 * への対応（#433）。
 *
 * ⚠️ **日次ではなく週次。** 保持の上限は6ヶ月で、取り直しの閾値は60日
 * （`USER_LIST_REFRESH_STALE_DAYS`）。週次でも十分間に合ううえ、
 * TMDb への問い合わせを他の同期（18:00〜20:00）と重ねたくない。
 */

import { NextRequest, NextResponse } from 'next/server';

import { HTTP_STATUS, CRON_ERROR_MESSAGES } from '@/constants';
import { verifyCronAuth } from '@/helpers/cronAuth';
import { handleCronError } from '@/helpers/cronError';
import { createServiceRoleClient } from '@/helpers/supabase';
import { notifyCronFailure } from '@/lib/cron/notifyCronFailure';
import { notifyIfMostlyFailed } from '@/lib/cron/notifyHighFailureRate';
import { refreshUserListTmdbFields } from '@/lib/sync/refreshUserListTmdbFields';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    const authError = await verifyCronAuth(request, 'refresh-user-lists');
    if (authError) return authError;

    const result = await refreshUserListTmdbFields();

    // ⚠️ **ほぼ全滅でも 200 / `success: true` で返る**（#1354 と同じ形）。
    //   作品単位に catch して処理を続ける設計なので、失敗は `errors` に
    //   積まれるだけ。取り直せていない状態は規約違反が残っている状態なので、
    //   届くかどうかだけを変える
    // ⚠️ **404 の多発は率の判定では拾えない**（#433 レビュー指摘）。
    //   404 は `items.failed` に入らないため、全件404でも失敗率は 0% になる。
    //   印付けを中止したこと自体が異常なので、無条件で通知する
    if (result.abortedByNotFoundRatio) {
      await notifyCronFailure(createServiceRoleClient(), {
        cronName: 'refresh-user-lists',
        reason:
          result.errors[result.errors.length - 1] ?? '404 の比率が高すぎます',
      });
    }

    await notifyIfMostlyFailed(createServiceRoleClient(), {
      cronName: 'refresh-user-lists',
      attempted: result.items.attempted,
      failed: result.items.failed,
      // 抽出段階で落ちると attempted が 0 になり、率では表現できない
      errorCount: result.errors.length,
      detail: result.errors.slice(0, 3).join('\n'),
    });

    return NextResponse.json(
      {
        success: true,
        message: '利用者リストの作品情報を更新しました。',
        data: result,
      },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    return handleCronError(
      error,
      'refresh-user-lists',
      CRON_ERROR_MESSAGES.REFRESH_USER_LISTS,
    );
  }
}
