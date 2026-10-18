/**
 * 公開API用のレート制限ヘルパー
 *
 * 未認証で叩けるルートは `withAuth` を通らないため、レート制限を自前で呼ぶ必要がある。
 * 識別子の決め方と 429 レスポンスの組み立てが毎回ぶれないようここに集約する。
 */

import { NextResponse } from 'next/server';

import type { SupabaseClient } from '@supabase/supabase-js';

import { HTTP_STATUS, ERROR_CODE, CACHE_CONTROL } from '@/constants';
import { AUTH_ERROR_MESSAGES } from '@/constants/auth';
import type { RateLimitActionType } from '@/constants/rateLimit';
import { createServiceRoleClient } from '@/helpers/supabase';
import { getClientIp } from '@/lib/http/getClientIp';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';

interface EnforcePublicRateLimitOptions {
  request: Request;
  action: RateLimitActionType;
  limit: { maxAttempts: number; windowMinutes: number };
  /**
   * 認証済みならユーザーID。
   *
   * 未指定・未認証のときは送信元IPで数える。ログイン中の利用者をIPで数えると、
   * NAT や社内プロキシで同一IPを共有する利用者をまとめて巻き込むため、
   * 特定できるならユーザー単位にする。
   */
  userId?: string | null;
  /** 既に service role クライアントを作っているルートは渡す（二重生成を避ける） */
  supabase?: SupabaseClient | null;
}

/**
 * 公開APIのレート制限を適用する
 *
 * @returns 上限超過なら 429 レスポンス、通ってよければ null
 */
export async function enforcePublicRateLimit({
  request,
  action,
  limit,
  userId,
  supabase,
}: EnforcePublicRateLimitOptions): Promise<NextResponse | null> {
  // rate_limits は service_role 専用のため、anon クライアントでは書けない
  const client = supabase ?? createServiceRoleClient();

  // クライアントを作れない環境（環境変数未設定）では制限を掛けずに通す。
  // ここで止めると設定ミスで全機能が落ちるため、既存の fail-open に揃える。
  if (!client) return null;

  const clientIp = getClientIp(request);

  // 送信元を特定できず認証もされていない場合は制限を掛けない。
  //
  // ここで 'unknown' を識別子にすると、**全ての未認証リクエストが1つの
  // カウンタを共有**し、誰か1人が上限に達した時点で未認証の利用者全員が
  // まとめて 429 になる。ロックされるのが試行した本人だけになるよう
  // 識別子を選ぶという方針（buildLoginIdentifier と同じ考え方）に揃える。
  //
  // Vercel のエッジは x-vercel-forwarded-for を必ず付けるため、本番では
  // この分岐に入らない。入りうるのはローカル起動や、転送ヘッダを付けない
  // リバースプロキシ構成のみ。
  if (!userId && clientIp === 'unknown') return null;

  const identifier = userId || clientIp;

  const result = await checkRateLimit(
    client,
    identifier,
    action,
    limit.maxAttempts,
    limit.windowMinutes,
  );

  if (result.allowed) return null;

  return NextResponse.json(
    {
      success: false,
      error: {
        code: ERROR_CODE.RATE_LIMIT_EXCEEDED,
        message: AUTH_ERROR_MESSAGES.RATE_LIMIT_EXCEEDED,
      },
    },
    {
      status: HTTP_STATUS.TOO_MANY_REQUESTS,
      headers: {
        ...(result.retryAfter
          ? { 'Retry-After': String(result.retryAfter) }
          : {}),
        // CDN に 429 をキャッシュさせない。
        // 公開ルートは通常 public な Cache-Control を返すため、これが無いと
        // 1人分の 429 が無関係の利用者にも配られる
        'Cache-Control': CACHE_CONTROL.NO_STORE,
      },
    },
  );
}
