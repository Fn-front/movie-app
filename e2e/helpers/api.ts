/**
 * E2Eテスト用APIヘルパー
 * テストデータのクリーンアップに使用
 * ウォッチリストはSupabase REST APIで物理削除、フィルターはアプリAPIでリセット
 */

import type { APIRequestContext } from '@playwright/test';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseHeaders = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
};

let cachedTestUserId: string | null = null;

/**
 * テストユーザーのIDをusersテーブルから取得（キャッシュあり）
 */
async function getTestUserId(): Promise<string | null> {
  if (cachedTestUserId) return cachedTestUserId;

  const email = process.env.E2E_TEST_USER_EMAIL;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/users?email=eq.${email}&select=id`,
    { headers: supabaseHeaders },
  );
  const data = await res.json();
  cachedTestUserId = data[0]?.id ?? null;
  return cachedTestUserId;
}

/**
 * テストユーザーのウォッチリストを物理削除する
 */
export async function cleanupWatchlist(): Promise<void> {
  const userId = await getTestUserId();
  if (!userId) return;

  await fetch(`${SUPABASE_URL}/rest/v1/watchlist?user_id=eq.${userId}`, {
    method: 'DELETE',
    headers: supabaseHeaders,
  });
}

/**
 * テストユーザーのお気に入りを物理削除する
 */
export async function cleanupFavorites(): Promise<void> {
  const userId = await getTestUserId();
  if (!userId) return;

  await fetch(`${SUPABASE_URL}/rest/v1/favorites?user_id=eq.${userId}`, {
    method: 'DELETE',
    headers: supabaseHeaders,
  });
}

/**
 * おすすめセクションを表示させるため、テストユーザーに
 * お気に入り1件＋おすすめ2件をシードする（refresh E2E用）。
 * おすすめは SSR で表示されるため、ページ遷移前に投入する。
 */
export async function seedRecommendations(): Promise<void> {
  const userId = await getTestUserId();
  if (!userId) return;

  const post = (path: string, body: unknown) =>
    fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method: 'POST',
      headers: {
        ...supabaseHeaders,
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates',
      },
      body: JSON.stringify(body),
    });

  // hasFavorites=true にする
  await post('favorites', {
    user_id: userId,
    tmdb_movie_id: 999001,
    title: 'E2Eお気に入り',
    rating: 8,
  });
  // recommendations を2件
  await post('recommendations', [
    {
      user_id: userId,
      tmdb_movie_id: 999101,
      title: 'E2Eおすすめ1',
      reason: 'E2E用の理由1',
      display_order: 1,
    },
    {
      user_id: userId,
      tmdb_movie_id: 999102,
      title: 'E2Eおすすめ2',
      reason: 'E2E用の理由2',
      display_order: 2,
    },
  ]);
}

/**
 * テストユーザーのおすすめを物理削除する（refresh E2Eの後始末用）。
 */
export async function cleanupRecommendations(): Promise<void> {
  const userId = await getTestUserId();
  if (!userId) return;

  await fetch(`${SUPABASE_URL}/rest/v1/recommendations?user_id=eq.${userId}`, {
    method: 'DELETE',
    headers: supabaseHeaders,
  });
}

/**
 * テストユーザーの興味なし映画を物理削除する
 */
export async function cleanupDismissedMovies(): Promise<void> {
  const userId = await getTestUserId();
  if (!userId) return;

  await fetch(`${SUPABASE_URL}/rest/v1/dismissed_movies?user_id=eq.${userId}`, {
    method: 'DELETE',
    headers: supabaseHeaders,
  });
}

/**
 * テストユーザーのフィルター条件をデフォルト状態にリセットする
 */
export async function resetFilters(request: APIRequestContext): Promise<void> {
  await request.put('/api/filters', {
    data: {},
  });
}

/**
 * 指定メール・アクションの最新の未検証OTPコードをDBから取得する。
 * メール実送信に依存せずOTPフローを検証するために使用（OTP_EMAIL_TEST_BYPASS前提）。
 */
export async function getLatestOtpCode(
  email: string,
  action: 'registration' | 'login' | 'password_change',
): Promise<string | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/otp_codes?email=eq.${encodeURIComponent(email)}` +
      `&action_type=eq.${action}&verified_at=is.null` +
      `&order=created_at.desc&limit=1&select=code`,
    { headers: supabaseHeaders },
  );
  const data = await res.json();
  return data[0]?.code ?? null;
}

/** otp_codes の未検証レコードを PATCH するための内部ヘルパー */
async function patchUnverifiedOtp(
  email: string,
  action: string,
  body: Record<string, unknown>,
): Promise<void> {
  const enc = encodeURIComponent(email);
  await fetch(
    `${SUPABASE_URL}/rest/v1/otp_codes?email=eq.${enc}` +
      `&action_type=eq.${action}&verified_at=is.null`,
    {
      method: 'PATCH',
      headers: { ...supabaseHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
}

/**
 * 最新の未検証OTPを期限切れにする（異常系E2E用）。
 */
export async function expireOtpCode(
  email: string,
  action: 'registration' | 'login' | 'password_change',
): Promise<void> {
  await patchUnverifiedOtp(email, action, {
    expires_at: new Date(Date.now() - 60_000).toISOString(),
  });
}

/**
 * 未検証OTPの試行回数を上限まで引き上げる（異常系E2E用）。
 */
export async function maxOutOtpAttempts(
  email: string,
  action: 'registration' | 'login' | 'password_change',
  maxAttempts = 5,
): Promise<void> {
  await patchUnverifiedOtp(email, action, { attempts: maxAttempts });
}

/**
 * 指定識別子（メール等）のレート制限レコードを物理削除してリセットする。
 * OTP日次送信上限（action_type='otp_send_daily'）はメール単位で24h/5通のため、
 * CI/ローカルの繰り返し実行で累積し他テストと衝突する。OTP系テストの前に
 * これを呼んで自テストが累積に寄与せず・干渉されないようにする。
 */
export async function cleanupRateLimit(
  identifier: string,
  actionType = 'otp_send_daily',
): Promise<void> {
  const enc = encodeURIComponent(identifier);
  await fetch(
    `${SUPABASE_URL}/rest/v1/rate_limits?identifier=eq.${enc}&action_type=eq.${actionType}`,
    { method: 'DELETE', headers: supabaseHeaders },
  );
}

/**
 * 指定メール（+任意でアクション種別）のOTPコードのみを物理削除する。
 * ユーザーは削除しないため、既存テストユーザーの後始末に安全に使える。
 */
export async function cleanupOtpCodes(
  email: string,
  action?: 'registration' | 'login' | 'password_change',
): Promise<void> {
  const enc = encodeURIComponent(email);
  const actionFilter = action ? `&action_type=eq.${action}` : '';
  await fetch(
    `${SUPABASE_URL}/rest/v1/otp_codes?email=eq.${enc}${actionFilter}`,
    { method: 'DELETE', headers: supabaseHeaders },
  );
}

/**
 * 指定メールのユーザーとOTPコードを物理削除する（signupテストの後始末用）。
 */
export async function cleanupAuthUser(email: string): Promise<void> {
  const enc = encodeURIComponent(email);
  await fetch(`${SUPABASE_URL}/rest/v1/otp_codes?email=eq.${enc}`, {
    method: 'DELETE',
    headers: supabaseHeaders,
  });
  await fetch(`${SUPABASE_URL}/rest/v1/users?email=eq.${enc}`, {
    method: 'DELETE',
    headers: supabaseHeaders,
  });
}
