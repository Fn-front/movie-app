/**
 * releaseProximity テスト
 */

import { formatReleaseProximity } from './releaseProximity';

describe('formatReleaseProximity', () => {
  const today = new Date(2026, 9, 21); // 2026-10-21

  it('公開日が当日なら「本日公開」を返す', () => {
    expect(formatReleaseProximity('2026-10-21', today)).toBe('本日公開');
  });

  it('公開日が未来なら残り日数を返す', () => {
    expect(formatReleaseProximity('2026-10-24', today)).toBe('あと3日');
  });

  it('公開日が翌日なら「あと1日」を返す', () => {
    expect(formatReleaseProximity('2026-10-22', today)).toBe('あと1日');
  });

  it('公開日が過去なら「公開済み」を返す', () => {
    expect(formatReleaseProximity('2026-10-20', today)).toBe('公開済み');
  });

  it('基準日の時刻に影響されず日付単位で判定する', () => {
    const lateToday = new Date(2026, 9, 21, 23, 59, 59);
    expect(formatReleaseProximity('2026-10-22', lateToday)).toBe('あと1日');
  });

  it('月をまたいでも残り日数を返す', () => {
    expect(formatReleaseProximity('2026-11-01', today)).toBe('あと11日');
  });

  it('不正な日付文字列なら null を返す', () => {
    expect(formatReleaseProximity('not-a-date', today)).toBeNull();
  });
});
