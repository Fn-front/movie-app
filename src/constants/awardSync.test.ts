import {
  SYNCABLE_AWARD_NAMES,
  SYNCABLE_AWARD_OPTIONS,
  AWARD_SYNC_MIN_YEAR,
  AWARD_SYNC_STALE_MINUTES,
  AWARD_SYNC_POLL_INTERVAL_MS,
  isSyncableYear,
} from './awardSync';
import { OPENAI_CONFIG } from './openai';
import { AWARDS_MAX_RETRIES, AWARD_DEFINITIONS } from './awards';
import { RATE_LIMIT_CONFIG } from './rateLimit';

describe('awardSync constants', () => {
  it('同期対象の賞は AWARDS_EXCLUDED を除いた3賞', () => {
    expect(SYNCABLE_AWARD_NAMES).toEqual([
      'academy_awards',
      'cannes',
      'golden_globes',
    ]);
  });

  it('日本アカデミー賞を含まない', () => {
    expect(SYNCABLE_AWARD_NAMES).not.toContain('japan_academy_awards');
  });

  it('セレクト用の選択肢がラベル付きで並ぶ', () => {
    expect(SYNCABLE_AWARD_OPTIONS).toEqual([
      { value: 'academy_awards', label: 'アカデミー賞' },
      { value: 'cannes', label: 'カンヌ映画祭' },
      { value: 'golden_globes', label: 'ゴールデングローブ賞' },
    ]);
  });

  it('賞ごとに取得可能な最小年を持つ', () => {
    expect(AWARD_SYNC_MIN_YEAR.academy_awards).toBe(1928);
    expect(AWARD_SYNC_MIN_YEAR.golden_globes).toBe(1943);
    // カンヌは1948・1950の中止で回数と開催年の差が一定にならない。
    // 差が1947で固定されるのは第4回（1951年）以降
    expect(AWARD_SYNC_MIN_YEAR.cannes).toBe(1951);
  });

  /**
   * 失効閾値は OpenAI のタイムアウトから導出している。片方だけ変えると
   * 「正常に走っている処理を強制失効できてしまう」状態に戻るため、
   * 関係が崩れていないことをテストで固定する。
   */
  it('失効閾値が実行時間の上界を上回る', () => {
    const maxCategories = Math.max(
      ...Object.values(AWARD_DEFINITIONS).map((d) => d.categories.length),
    );
    const upperBoundMs =
      maxCategories * AWARDS_MAX_RETRIES * OPENAI_CONFIG.REQUEST_TIMEOUT_MS;

    expect(AWARD_SYNC_STALE_MINUTES * 60_000).toBeGreaterThan(upperBoundMs);
  });

  describe('isSyncableYear', () => {
    const currentYear = new Date().getFullYear();

    it('賞ごとの下限と当年+1の範囲を判定する', () => {
      expect(isSyncableYear('cannes', 1951)).toBe(true);
      expect(isSyncableYear('cannes', 1950)).toBe(false);
      expect(isSyncableYear('cannes', currentYear + 1)).toBe(true);
      expect(isSyncableYear('cannes', currentYear + 2)).toBe(false);
    });

    it('賞ごとに下限が違う', () => {
      expect(isSyncableYear('academy_awards', 1930)).toBe(true);
      expect(isSyncableYear('cannes', 1930)).toBe(false);
    });

    it('同期対象外・不明な賞は false', () => {
      expect(isSyncableYear('japan_academy_awards', 2024)).toBe(false);
      expect(isSyncableYear('oscar', 2024)).toBe(false);
    });

    // 入力途中の「20」や NaN で問い合わせないための判定
    it('整数でない年は false', () => {
      expect(isSyncableYear('cannes', 2024.5)).toBe(false);
      expect(isSyncableYear('cannes', Number('abc'))).toBe(false);
    });
  });

  /** ポーリング回数がレート制限の上限に収まることを保証する */
  it('閾値いっぱいまでポーリングしても上限を超えない', () => {
    const maxPolls =
      (AWARD_SYNC_STALE_MINUTES * 60_000) / AWARD_SYNC_POLL_INTERVAL_MS;

    expect(maxPolls).toBeLessThanOrEqual(
      RATE_LIMIT_CONFIG.ADMIN_AWARD_SYNC_STATUS.maxAttempts,
    );
  });
});
