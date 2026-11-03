import { awardSyncCreateSchema } from './awardSync';

describe('awardSyncCreateSchema', () => {
  const currentYear = new Date().getFullYear();

  it('有効な入力を受け付け、force は既定で false', () => {
    const result = awardSyncCreateSchema.safeParse({
      awardName: 'cannes',
      year: 2024,
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data.force).toBe(false);
  });

  it('force を明示できる', () => {
    const result = awardSyncCreateSchema.safeParse({
      awardName: 'cannes',
      year: 2024,
      force: true,
    });

    expect(result.success && result.data.force).toBe(true);
  });

  it('同期対象外の賞を拒否する', () => {
    expect(
      awardSyncCreateSchema.safeParse({
        awardName: 'japan_academy_awards',
        year: 2024,
      }).success,
    ).toBe(false);
  });

  it('存在しない賞キーを拒否する', () => {
    expect(
      awardSyncCreateSchema.safeParse({ awardName: 'oscar', year: 2024 })
        .success,
    ).toBe(false);
  });

  it('賞ごとの下限より前の年を拒否する', () => {
    // カンヌは1948・1950が中止で、回数と開催年の差が一定になるのは
    // 第4回（1951年）以降。それより前は記事タイトルを算出できない
    expect(
      awardSyncCreateSchema.safeParse({ awardName: 'cannes', year: 1950 })
        .success,
    ).toBe(false);
    expect(
      awardSyncCreateSchema.safeParse({ awardName: 'cannes', year: 1951 })
        .success,
    ).toBe(true);
  });

  it('賞ごとに下限が違う', () => {
    // アカデミー賞は1928年から。カンヌでは拒否される年が通る
    expect(
      awardSyncCreateSchema.safeParse({
        awardName: 'academy_awards',
        year: 1930,
      }).success,
    ).toBe(true);
    expect(
      awardSyncCreateSchema.safeParse({ awardName: 'cannes', year: 1930 })
        .success,
    ).toBe(false);
  });

  it('翌年までは許し、その先は拒否する', () => {
    expect(
      awardSyncCreateSchema.safeParse({
        awardName: 'cannes',
        year: currentYear + 1,
      }).success,
    ).toBe(true);
    expect(
      awardSyncCreateSchema.safeParse({
        awardName: 'cannes',
        year: currentYear + 2,
      }).success,
    ).toBe(false);
  });

  it('整数でない年を拒否する', () => {
    expect(
      awardSyncCreateSchema.safeParse({ awardName: 'cannes', year: 2024.5 })
        .success,
    ).toBe(false);
  });

  it('年が未入力なら拒否する', () => {
    expect(
      awardSyncCreateSchema.safeParse({ awardName: 'cannes' }).success,
    ).toBe(false);
  });

  it('年が文字列なら拒否する', () => {
    expect(
      awardSyncCreateSchema.safeParse({ awardName: 'cannes', year: '2024' })
        .success,
    ).toBe(false);
  });
});
