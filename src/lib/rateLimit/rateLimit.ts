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

/** Postgres の「関数が存在しない」エラー（RPC 未適用時に返る） */
const UNDEFINED_FUNCTION_CODE = '42883';

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
 * 直近 `windowMinutes` 以内の試行が `maxAttempts` 回に達すると、同じ長さだけ
 * ロックする（スライディングウィンドウ）。最後の試行から windowMinutes 経過すれば
 * カウンタは 1 に戻るため、間隔を空けた通常利用でロックされることはない。
 *
 * @param supabase - Supabaseクライアント
 * @param identifier - 識別子（ユーザーIDやIPアドレス）
 * @param actionType - アクション種別
 * @param maxAttempts - ウィンドウ内の最大試行回数（デフォルト: 3）
 * @param windowMinutes - ウィンドウの長さ兼ロック時間（分）（デフォルト: 30）
 * @returns レート制限チェック結果
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  identifier: string,
  actionType: RateLimitActionType,
  maxAttempts: number = RATE_LIMIT_DEFAULT.MAX_ATTEMPTS,
  windowMinutes: number = RATE_LIMIT_DEFAULT.WINDOW_MINUTES,
): Promise<RateLimitResult> {
  // 判定とカウンタ更新を1ステートメントで行う。SELECT → UPDATE に分けると
  // その間に別リクエストが同じ attempts を読み、全員が「上限未満」と判定して
  // 実効上限を超えられる（#646）。
  const { data, error } = await supabase.rpc('consume_rate_limit', {
    p_identifier: identifier,
    p_action_type: actionType,
    p_max_attempts: maxAttempts,
    p_window_minutes: windowMinutes,
  });

  if (error) {
    // RPC 未適用（マイグレーションより先にコードがデプロイされた）場合は、
    // 素通しにすると「レート制限が有効なつもりで全部無効」という最悪の状態に
    // なる（#546 / #659 と同じ事故）。原子性は失われるが旧実装で判定を続ける。
    // RPC が全環境に行き渡ったらこのフォールバックは削除してよい。
    if (error.code === UNDEFINED_FUNCTION_CODE) {
      console.warn(
        '[rateLimit] consume_rate_limit RPC が存在しないため旧実装で継続します。' +
          'マイグレーション 20261017040000 を適用してください。',
      );
      return checkRateLimitLegacy(
        supabase,
        identifier,
        actionType,
        maxAttempts,
        windowMinutes,
      );
    }

    // 失敗を無言で握り潰すと「レート制限が有効なつもりで実は素通し」になる。
    // 原因の大半は chk_action_type の許可リスト漏れ（23514）。
    logRateLimitWriteFailure('consume_rate_limit', actionType, error);

    // 制限を判定できない場合は通す（既存の挙動を踏襲）。
    // ログイン等を巻き込んで停止させないための fail-open だが、
    // 上のログで検知できるようにしてある。
    return { allowed: true };
  }

  const row = Array.isArray(data) ? data[0] : data;

  if (!row) {
    logRateLimitWriteFailure('consume_rate_limit', actionType, {
      message: 'RPC returned no row',
    });
    return { allowed: true };
  }

  return row.allowed
    ? { allowed: true }
    : { allowed: false, retryAfter: row.retry_after ?? undefined };
}

/**
 * consume_rate_limit RPC が未適用の環境向けフォールバック（旧実装）
 *
 * SELECT → UPDATE の読み取り後書き込みのため並行リクエストで実効上限を
 * 超えられるが、「判定できないから全部通す」よりははるかにマシ。
 * RPC が全環境に行き渡ったら削除してよい。
 *
 * 判定の優先順位は RPC 側の CASE 式と揃えること。食い違うと、RPC の有無で
 * 制限の強さが変わる。
 */
async function checkRateLimitLegacy(
  supabase: SupabaseClient,
  identifier: string,
  actionType: RateLimitActionType,
  maxAttempts: number,
  windowMinutes: number,
): Promise<RateLimitResult> {
  const { data, error } = await supabase
    .from('rate_limits')
    .select('*')
    .eq('identifier', identifier)
    .eq('action_type', actionType)
    .single();

  if (error && error.code === SUPABASE_ERROR_CODE.NOT_FOUND) {
    const { error: insertError } = await supabase.from('rate_limits').insert({
      identifier,
      action_type: actionType,
      attempts: 1,
      last_attempt_at: new Date().toISOString(),
    });

    logRateLimitWriteFailure('insert', actionType, insertError);

    return { allowed: true };
  }

  if (error) {
    throw error;
  }

  const now = new Date();

  if (data.locked_until && new Date(data.locked_until) > now) {
    const retryAfter = Math.ceil(
      (new Date(data.locked_until).getTime() - now.getTime()) / 1000,
    );
    return { allowed: false, retryAfter };
  }

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

  // 直近の試行からウィンドウが経過していればカウンタをリセットする。
  // これが無いと「累計 maxAttempts 回で永続ロック」になる（#758）。RPC 側の
  // CASE 式と同じ優先順位（ロック判定 → ウィンドウ経過 → 上限判定）で並べる。
  const windowStart = new Date(now.getTime() - windowMinutes * 60 * 1000);

  if (new Date(data.last_attempt_at) <= windowStart) {
    await supabase
      .from('rate_limits')
      .update({ attempts: 1, last_attempt_at: now.toISOString() })
      .eq('id', data.id);
    return { allowed: true };
  }

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
 * ⚠️ `rate_limits.last_attempt_at` は TIMESTAMPTZ であることが前提。naive な
 * TIMESTAMP だと PostgREST がオフセット無しで返し、下の `new Date()` が
 * 非UTC環境（ローカルのJST等）でローカル時刻として解釈する。実時刻より
 * 9時間古く見えるため経過時間が常にクールダウンを上回り、この制限が
 * 無言で素通りする（#759 / マイグレーション 20261019012324）。
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
