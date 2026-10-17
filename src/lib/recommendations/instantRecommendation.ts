/**
 * 初回お気に入り追加時の即時レコメンド生成
 *
 * 新規ユーザーはお気に入りを登録しても、日次CRON（JST 3:00）が回るまで
 * 最大24時間「準備中」のままだった。お気に入り追加をきっかけに、
 * その場で1度だけ生成をキックする。
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { processUserRecommendations } from './generateRecommendationsService';

/**
 * 即時生成の権利を1回だけ確保する
 *
 * 「お気に入り追加 → 削除」を繰り返して何度も OpenAI を叩かれないよう、
 * 使用済みの記録はユーザー単位で生涯1回とする。
 *
 * 権利の確保は `instant_recommendation_used_at IS NULL` を条件にした
 * 条件付きUPDATEで行う。読み取ってから書き込む実装では、
 * 同時にお気に入りを2件追加された場合に両方が権利を得てしまう。
 *
 * @returns 権利を確保できたら true。使用済み・エラー時は false
 */
async function claimInstantGeneration(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('users')
    .update({ instant_recommendation_used_at: new Date().toISOString() })
    .eq('id', userId)
    .is('instant_recommendation_used_at', null)
    .select('id');

  if (error) {
    console.error(
      `Failed to claim instant recommendation for user ${userId}:`,
      error,
    );
    return false;
  }

  return (data?.length ?? 0) > 0;
}

/**
 * 即時生成を行うべきかを判定し、対象なら権利を確保する
 *
 * 発火条件:
 * 1. まだレコメンドが1件も無い（2件目以降のお気に入り追加では発火しない）
 * 2. 即時生成の権利が未使用（生涯1回）
 *
 * レコメンド件数の確認を先に行い、既に表示できるものがあるユーザーの
 * 権利を無駄に消費しないようにする。
 *
 * @returns 生成を実行してよければ true
 */
export async function shouldGenerateInstantly(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { count, error } = await supabase
    .from('recommendations')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) {
    console.error(`Failed to count recommendations for user ${userId}:`, error);
    return false;
  }

  if ((count ?? 0) > 0) {
    return false;
  }

  return claimInstantGeneration(supabase, userId);
}

/**
 * 条件を満たす場合のみ、レコメンドを即時生成する
 *
 * レスポンスを返したあとに `after()` から呼ぶ想定。
 * お気に入り追加そのものは成功させたいので、生成が失敗しても例外は投げない。
 *
 * @param supabase - service role クライアント
 * @param userId - 対象ユーザーID
 */
export async function runInstantRecommendationIfEligible(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  try {
    const eligible = await shouldGenerateInstantly(supabase, userId);
    if (!eligible) {
      return;
    }

    const result = await processUserRecommendations(supabase, userId);
    console.log(
      `Instant recommendation for user ${userId}: ${result.status} (${result.recommendationCount} items)`,
    );
  } catch (error) {
    // バックグラウンド処理。失敗しても次回CRONが拾うので握りつぶす
    console.error(`Instant recommendation failed for user ${userId}:`, error);
  }
}
