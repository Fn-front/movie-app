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
 * テストユーザーの rate_limits レコードを物理削除する。
 *
 * 背景: WRITE_FAVORITES / WRITE_WATCHLIST 等の DB-based レート制限は
 * user_id を identifier として 10 attempts / 1min で制限する。E2E は
 * 短時間に多くの POST/PATCH/DELETE を発行するため、テスト毎にリセット
 * しないと後続テストが 429 で失敗する。
 */
export async function cleanupRateLimits(): Promise<void> {
  const userId = await getTestUserId();
  if (!userId) return;

  await fetch(`${SUPABASE_URL}/rest/v1/rate_limits?identifier=eq.${userId}`, {
    method: 'DELETE',
    headers: supabaseHeaders,
  });
}

/**
 * すべての rate_limits レコードを物理削除する（グローバルセットアップ用）。
 *
 * 背景: IP ベースのレート制限（AWARDS_FETCH / READ_THEATERS 等の公開API）は
 * CI ランナーの IP を identifier とするが、実行時までIPが分からないため
 * ユーザーID指定の cleanupRateLimits では消せない。E2E 開始時に一度だけ
 * 全レコードを削除して確定的な初期状態を作る。
 *
 * ※ 本テーブルはユーザー由来の耐障害的なカウンタで、E2E 環境では消して問題ない。
 */
export async function cleanupAllRateLimits(): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/rate_limits?id=not.is.null`, {
    method: 'DELETE',
    headers: supabaseHeaders,
  });
}

/**
 * テストユーザーのウォッチリストを物理削除する（rate_limitsも同時にリセット）
 */
export async function cleanupWatchlist(): Promise<void> {
  const userId = await getTestUserId();
  if (!userId) return;

  await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/watchlist?user_id=eq.${userId}`, {
      method: 'DELETE',
      headers: supabaseHeaders,
    }),
    cleanupRateLimits(),
  ]);
}

/**
 * テストユーザーのお気に入りを物理削除する（rate_limitsも同時にリセット）
 */
export async function cleanupFavorites(): Promise<void> {
  const userId = await getTestUserId();
  if (!userId) return;

  await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/favorites?user_id=eq.${userId}`, {
      method: 'DELETE',
      headers: supabaseHeaders,
    }),
    cleanupRateLimits(),
  ]);
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
 * テストユーザーの興味なし映画を物理削除する（rate_limitsも同時にリセット）
 */
export async function cleanupDismissedMovies(): Promise<void> {
  const userId = await getTestUserId();
  if (!userId) return;

  await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/dismissed_movies?user_id=eq.${userId}`, {
      method: 'DELETE',
      headers: supabaseHeaders,
    }),
    cleanupRateLimits(),
  ]);
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
 * メール（identifier）単位で使われる認証/OTP系のレート制限 action_type 一覧。
 * これらは rate_limits テーブルに email を identifier として蓄積されるため、
 * CI/ローカルの繰り返し実行で累積し、近接実行する他テストと衝突して
 * RATE_LIMIT_EXCEEDED / VERIFY_RATE_LIMIT_EXCEEDED で不安定に失敗する。
 * - otp_send_daily: OTP日次送信上限（src/app/api/auth/otp/send/route.ts）
 * - otp_verify:     OTP検証のバースト上限（src/app/api/auth/otp/verify/route.ts, #416）
 * - login:          メールOTPログインの試行上限（src/lib/auth/auth.ts）
 * - register:       新規登録の試行上限（src/app/api/auth/register/route.ts）
 * - otp_resend:     OTP再送上限（DB制約で許可済み。将来の追従漏れを防ぐため含める）
 * ※ change_password は identifier が user.id（メール以外）かつ DB を叩く E2E で
 *   到達しないため、ここには含めない。
 */
const EMAIL_RATE_LIMIT_ACTION_TYPES = [
  'otp_send_daily',
  'otp_verify',
  'login',
  'register',
  'otp_resend',
] as const;

/**
 * 指定識別子（メール等）のレート制限レコードを物理削除してリセットする。
 * 既定では認証/OTP系の関連 action_type をすべて（{@link EMAIL_RATE_LIMIT_ACTION_TYPES}）
 * まとめてリセットし、テスト間の累積・残留で他テストがレート制限に到達するのを防ぐ。
 * OTP/認証系テストの前（beforeEach 等）に呼んで、自テストが累積に寄与せず・
 * 干渉されないようにする。
 *
 * @param identifier 対象の識別子（通常はメールアドレス）
 * @param actionTypes リセット対象の action_type。未指定なら関連する全種別。
 */
export async function cleanupRateLimit(
  identifier: string,
  actionTypes: readonly string[] = EMAIL_RATE_LIMIT_ACTION_TYPES,
): Promise<void> {
  const enc = encodeURIComponent(identifier);
  const inList = encodeURIComponent(`(${actionTypes.join(',')})`);
  await fetch(
    `${SUPABASE_URL}/rest/v1/rate_limits?identifier=eq.${enc}&action_type=in.${inList}`,
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
