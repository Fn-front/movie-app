/**
 * 映画ユーティリティ テスト
 */

import { isMovieReleased } from './movie';

describe('isMovieReleased', () => {
  const today = new Date(2026, 9, 21); // 2026-10-21

  it('公開日が過去なら公開済みとみなす', () => {
    expect(isMovieReleased('2026-10-20', today)).toBe(true);
  });

  it('公開日が当日なら公開済みとみなす', () => {
    expect(isMovieReleased('2026-10-21', today)).toBe(true);
  });

  it('公開日が未来なら未公開とみなす', () => {
    expect(isMovieReleased('2026-10-22', today)).toBe(false);
  });

  it('基準日の時刻に影響されず日付単位で判定する', () => {
    const lateToday = new Date(2026, 9, 21, 23, 59, 59);
    expect(isMovieReleased('2026-10-21', lateToday)).toBe(true);
    expect(isMovieReleased('2026-10-22', lateToday)).toBe(false);
  });

  it('公開日が不明（null）なら公開済み扱いにする', () => {
    // 未公開である確証が無いのに機能を消さない
    expect(isMovieReleased(null, today)).toBe(true);
  });

  it('公開日が空文字なら公開済み扱いにする', () => {
    expect(isMovieReleased('', today)).toBe(true);
  });

  it('解釈できない日付文字列なら公開済み扱いにする', () => {
    expect(isMovieReleased('not-a-date', today)).toBe(true);
  });

  it('年をまたいでも判定できる', () => {
    expect(isMovieReleased('2027-01-01', today)).toBe(false);
    expect(isMovieReleased('2025-12-31', today)).toBe(true);
  });
});
