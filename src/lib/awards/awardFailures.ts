/**
 * 賞の同期結果を「失敗」と「まだ公開されていない」に分ける（#1354）
 *
 * ⚠️ **`syncAwardMoviesService` には置かない。** ルートのテストは
 * あのモジュールを丸ごとモックするため、同居させると
 * `countAwardFailures is not a function` でルートが 500 になる
 * （実際にそうなった）。I/O を持たない分類だけを切り出しておく。
 */

import type { SkippedAward } from './syncAwardMoviesService';

/**
 * 「まだ公開されていない」だけの理由
 *
 * ⚠️ **これらは失敗に数えない。** 賞の発表前は Wikipedia に記事そのものが
 * 無い／受賞セクションがまだ無い、という状態が**正常として**続く。
 * 失敗に数えると、発表待ちの時期に毎日通知が出て無視されるようになる。
 */
const NOT_YET_PUBLISHED_REASONS: SkippedAward['reason'][] = [
  'no_article',
  'no_section',
];

/**
 * 同期できなかった賞のうち、人が動かないと直らないものを数える
 *
 * `source_unavailable`（eiga.com / OpenAI へ到達できない）・
 * `openai_not_configured`（キー未設定）・`source_changed`（構造変更）・
 * `article_unavailable`（取得失敗）・`write_failed`・`error` が対象。
 *
 * @param skipped - 同期できなかった賞
 * @returns 失敗と見なす件数
 */
export function countAwardFailures(skipped: SkippedAward[]): number {
  return skipped.filter(
    (award) => !NOT_YET_PUBLISHED_REASONS.includes(award.reason),
  ).length;
}
