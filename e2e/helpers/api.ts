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
 * テストユーザーのフィルター条件をデフォルト状態にリセットする
 */
export async function resetFilters(request: APIRequestContext): Promise<void> {
  await request.put('/api/filters', {
    data: {},
  });
}
