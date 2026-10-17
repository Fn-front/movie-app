/**
 * DB-basedレート制限ユーティリティ
 */

import { SupabaseClient } from '@supabase/supabase-js';

import {
  MS_PER_SECOND,
  RATE_LIMIT_DEFAULT,
  SUPABASE_ERROR_CODE,
} from '@/constants';
import type { RateLimitActionType } from '@/constants/rateLimit';

/** Postgres の CHECK 制約違反 */
const CHECK_VIOLATION_CODE = '23514';

/**
 * rate_limits への書き込み失敗を記録する
 *
 * ここが無言で失敗すると「レート制限が有効なつもりで実は素通し」という
 * 最悪の状態になる（fail-open）。特に 23514 は `chk_action_type` の許可リストに
 * action_type が無いことを意味し、マイグレーションの追従漏れを示す。
 */
function logRateLimitWriteFailure(
  operation: string,
  actionType: string,
  error: { code?: string; message?: string } | null,
): void {
  if (!error) return;

  if (error.code === CHECK_VIOLATION_CODE) {
    console.error(
      `[rateLimit] ${operation} failed: action_type '${actionType}' violates chk_action_type. ` +
        'この制限は機能していません。マイグレーションで許可リストに追加してください。',
      error,
    );
    return;
  }

  console.error(`[rateLimit] ${operation} failed for '${actionType}'`, error);
}

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
  actionType: RateLimitActionType,
  maxAttempts: number = RATE_LIMIT_DEFAULT.MAX_ATTEMPTS,
  windowMinutes: number = RATE_LIMIT_DEFAULT.WINDOW_MINUTES,
): Promise<RateLimitResult> {
  const { data, error } = await supabase
    .from('rate_limits')
    .select('*')
    .eq('identifier', identifier)
    .eq('action_type', actionType)
    .single();

  // レコードが存在しない場合は新規作成
  if (error && error.code === SUPABASE_ERROR_CODE.NOT_FOUND) {
    const { error: insertError } = await supabase.from('rate_limits').insert({
      identifier,
      action_type: actionType,
      attempts: 1,
      last_attempt_at: new Date().toISOString(),
    });

    // INSERT が失敗するとカウンタ行が永久に作られず、以降も毎回ここに来て
    // allowed を返し続ける＝その制限が無言で機能しなくなる。
    // 原因の大半は chk_action_type の許可リスト漏れ（23514）なので必ず記録する。
    logRateLimitWriteFailure('insert', actionType, insertError);

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
 * クールダウンチェック（連続呼び出しの間隔制限）
 *
 * checkRateLimit が「N回失敗したらロック」モデルなのに対し、こちらは
 * 「直前の呼び出しから一定時間あけないと通さない」モデル。
 * コストの高い処理（AI生成など）の連打抑止に使う。
 *
 * 呼び出し時点で `last_attempt_at` を更新するため、処理完了前に届いた
 * 多重リクエストもブロックできる。拒否時は時刻を更新しないため、
 * クールダウンが連打で延長されることはない。
 *
 * @param supabase - Supabaseクライアント
 * @param identifier - 識別子（ユーザーIDやIPアドレス）
 * @param actionType - アクション種別
 * @param cooldownSeconds - 必要な間隔（秒）
 * @returns レート制限チェック結果
 */
export async function checkCooldown(
  supabase: SupabaseClient,
  identifier: string,
  actionType: RateLimitActionType,
  cooldownSeconds: number,
): Promise<RateLimitResult> {
  const now = new Date();

  const { data, error } = await supabase
    .from('rate_limits')
    .select('id, last_attempt_at')
    .eq('identifier', identifier)
    .eq('action_type', actionType)
    .single();

  // レコードが存在しない場合は初回とみなして通す
  if (error && error.code === SUPABASE_ERROR_CODE.NOT_FOUND) {
    const { error: insertError } = await supabase.from('rate_limits').insert({
      identifier,
      action_type: actionType,
      attempts: 1,
      last_attempt_at: now.toISOString(),
    });

    // 失敗すると行が作られず、以降も毎回ここに来てクールダウンが効かない
    logRateLimitWriteFailure('insert', actionType, insertError);

    return { allowed: true };
  }

  if (error) {
    throw error;
  }

  const cooldownMs = cooldownSeconds * MS_PER_SECOND;
  const elapsedMs = now.getTime() - new Date(data.last_attempt_at).getTime();

  if (elapsedMs < cooldownMs) {
    return {
      allowed: false,
      retryAfter: Math.ceil((cooldownMs - elapsedMs) / MS_PER_SECOND),
    };
  }

  await supabase
    .from('rate_limits')
    .update({ last_attempt_at: now.toISOString() })
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
  actionType: RateLimitActionType,
): Promise<void> {
  await supabase
    .from('rate_limits')
    .delete()
    .eq('identifier', identifier)
    .eq('action_type', actionType);
}
