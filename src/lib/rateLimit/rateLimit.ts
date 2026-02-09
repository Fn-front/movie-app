/**
 * DB-basedレート制限ユーティリティ
 */

import { SupabaseClient } from '@supabase/supabase-js';

import { SUPABASE_ERROR_CODE } from '@/constants';

/**
 * レート制限チェック結果
 */
export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
}

/**
 * レート制限チェック
 *
 * @param supabase - Supabaseクライアント
 * @param identifier - 識別子（ユーザーIDやIPアドレス）
 * @param actionType - アクション種別
 * @param maxAttempts - 最大試行回数（デフォルト: 3）
 * @param windowMinutes - ロック時間（分）（デフォルト: 30）
 * @returns レート制限チェック結果
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  identifier: string,
  actionType: string,
  maxAttempts: number = 3,
  windowMinutes: number = 30,
): Promise<RateLimitResult> {
  const { data, error } = await supabase
    .from('rate_limits')
    .select('*')
    .eq('identifier', identifier)
    .eq('action_type', actionType)
    .single();

  // レコードが存在しない場合は新規作成
  if (error && error.code === SUPABASE_ERROR_CODE.NOT_FOUND) {
    await supabase.from('rate_limits').insert({
      identifier,
      action_type: actionType,
      attempts: 1,
      last_attempt_at: new Date().toISOString(),
    });
    return { allowed: true };
  }

  if (error) {
    throw error;
  }

  const now = new Date();

  // ロック中かチェック
  if (data.locked_until && new Date(data.locked_until) > now) {
    const retryAfter = Math.ceil(
      (new Date(data.locked_until).getTime() - now.getTime()) / 1000,
    );
    return { allowed: false, retryAfter };
  }

  // ロック期間を過ぎていたらリセット
  if (data.locked_until && new Date(data.locked_until) <= now) {
    await supabase
      .from('rate_limits')
      .update({
        attempts: 1,
        locked_until: null,
        last_attempt_at: now.toISOString(),
      })
      .eq('id', data.id);
    return { allowed: true };
  }

  // 最大試行回数に達した場合はロック
  if (data.attempts >= maxAttempts) {
    const lockedUntil = new Date(now.getTime() + windowMinutes * 60 * 1000);
    await supabase
      .from('rate_limits')
      .update({
        locked_until: lockedUntil.toISOString(),
        attempts: data.attempts + 1,
        last_attempt_at: now.toISOString(),
      })
      .eq('id', data.id);
    return { allowed: false, retryAfter: windowMinutes * 60 };
  }

  // 試行回数をインクリメント
  await supabase
    .from('rate_limits')
    .update({
      attempts: data.attempts + 1,
      last_attempt_at: now.toISOString(),
    })
    .eq('id', data.id);

  return { allowed: true };
}

/**
 * レート制限リセット（成功時に呼び出す）
 *
 * @param supabase - Supabaseクライアント
 * @param identifier - 識別子
 * @param actionType - アクション種別
 */
export async function resetRateLimit(
  supabase: SupabaseClient,
  identifier: string,
  actionType: string,
): Promise<void> {
  await supabase
    .from('rate_limits')
    .delete()
    .eq('identifier', identifier)
    .eq('action_type', actionType);
}
