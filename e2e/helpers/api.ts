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
