/**
 * @jest-environment node
 */

/**
 * 賞の同期結果の分類（#1354）
 *
 * ⚠️ ここが緩むと**発表待ちの時期に毎日通知が出て無視されるようになる**か、
 * 逆に**取得できていないことに気づけなくなる**。理由ごとに期待する分類を
 * 全件固定する。
 */

import type { SkippedAward } from './syncAwardMoviesService';

import { countAwardFailures } from './awardFailures';

// --- Helpers ---

const skipped = (reason: SkippedAward['reason']): SkippedAward => ({
  award_name: `award-${reason}`,
  reason,
});

/**
 * `AwardFetchFailure` の全 `type` ＋ 書き込み失敗・例外
 *
 * ⚠️ **ここに足し忘れると、新しい理由が無言で失敗側に入る。**
 * `countAwardFailures` は除外リスト方式なので、分類の意図を
 * 書き残せるのはこの表だけ。
 */
const CLASSIFICATION: { reason: SkippedAward['reason']; failure: boolean }[] = [
  // まだ発表されていないだけ。毎年必ず通る状態なので失敗に数えない
  { reason: 'no_article', failure: false },
  { reason: 'no_section', failure: false },

  // 取得元へ到達できない・構造が変わった・設定が無い。人が動かないと直らない
  { reason: 'article_unavailable', failure: true },
  { reason: 'source_unavailable', failure: true },
  { reason: 'source_changed', failure: true },
  { reason: 'openai_not_configured', failure: true },

  // 取得はできたが中身が使えない。
  //
  // ⚠️ 発表前と紛らわしいが、**記事やページは取れている**ので状態が違う。
  // 恒常的に出るなら抽出が壊れているので気づけるほうがよい
  { reason: 'all_hallucinated', failure: true },
  { reason: 'no_items', failure: true },
  { reason: 'no_tmdb_match', failure: true },

  // 書き込み失敗・想定外の例外
  { reason: 'write_failed', failure: true },
  { reason: 'error', failure: true },
];

// --- Tests ---

describe('countAwardFailures', () => {
  it('何も無ければ0件', () => {
    expect(countAwardFailures([])).toBe(0);
  });

  it.each(CLASSIFICATION)(
    '$reason は failure=$failure として数える',
    ({ reason, failure }) => {
      expect(countAwardFailures([skipped(reason)])).toBe(failure ? 1 : 0);
    },
  );

  it('失敗だけを数え、発表前は除く', () => {
    const all = CLASSIFICATION.map((c) => skipped(c.reason));
    const expected = CLASSIFICATION.filter((c) => c.failure).length;

    expect(countAwardFailures(all)).toBe(expected);
  });

  /**
   * ⚠️ `AwardFetchFailure` に `type` を足したら、**何もしなければ
   * 失敗側に入る**（除外リスト方式のため）。安全側ではあるが、
   * 上の表に書き足して意図を残すこと。この件数が合わなくなったら
   * 新しい理由が増えている。
   */
  it('分類の表が全理由を網羅している', () => {
    expect(CLASSIFICATION).toHaveLength(11);
    expect(new Set(CLASSIFICATION.map((c) => c.reason)).size).toBe(11);
  });
});
