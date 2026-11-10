import {
  formatDate,
  formatDateTime,
  formatRelativeTime,
  getJstYearRange,
  getYear,
  isRealCalendarDate,
} from './date';

describe('formatDate', () => {
  it('nullの場合nullを返す', () => {
    expect(formatDate(null)).toBeNull();
  });

  it('undefinedの場合nullを返す', () => {
    expect(formatDate(undefined)).toBeNull();
  });

  it('ISO文字列をデフォルトフォーマットで返す', () => {
    expect(formatDate('2024-01-15')).toBe('2024年01月15日');
  });

  it('DateオブジェクトをフォーマットしてDate返す', () => {
    const date = new Date(2024, 0, 15);
    expect(formatDate(date)).toBe('2024年01月15日');
  });

  it('カスタムフォーマットを適用する', () => {
    expect(formatDate('2024-01-15', 'yyyy/MM/dd')).toBe('2024/01/15');
  });

  it('タイムスタンプ（数値）をフォーマットする', () => {
    const timestamp = new Date(2024, 0, 15).getTime();
    expect(formatDate(timestamp)).toBe('2024年01月15日');
  });

  it('無効な日付文字列の場合nullを返す', () => {
    expect(formatDate('invalid-date')).toBeNull();
  });
});

describe('formatDateTime', () => {
  it('nullの場合nullを返す', () => {
    expect(formatDateTime(null)).toBeNull();
  });

  it('ISO文字列をデフォルトフォーマットで返す', () => {
    expect(formatDateTime('2024-01-15T10:30:00')).toBe('2024年01月15日 10:30');
  });

  it('カスタムフォーマットを適用する', () => {
    expect(formatDateTime('2024-01-15T10:30:45', 'yyyy/MM/dd HH:mm:ss')).toBe(
      '2024/01/15 10:30:45',
    );
  });
});

describe('formatRelativeTime', () => {
  it('nullの場合nullを返す', () => {
    expect(formatRelativeTime(null)).toBeNull();
  });

  it('60秒未満の場合「今」を返す', () => {
    const date = new Date(Date.now() - 1000 * 30);
    expect(formatRelativeTime(date)).toBe('今');
  });

  it('分単位の差分を返す', () => {
    const date = new Date(Date.now() - 1000 * 60 * 5);
    expect(formatRelativeTime(date)).toBe('5分前');
  });

  it('時間単位の差分を返す', () => {
    const date = new Date(Date.now() - 1000 * 60 * 60 * 3);
    expect(formatRelativeTime(date)).toBe('3時間前');
  });

  it('日単位の差分を返す', () => {
    const date = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7);
    expect(formatRelativeTime(date)).toBe('7日前');
  });

  it('月単位の差分を返す', () => {
    const date = new Date(Date.now() - 1000 * 60 * 60 * 24 * 60);
    expect(formatRelativeTime(date)).toBe('2ヶ月前');
  });

  it('年単位の差分を返す', () => {
    const date = new Date(Date.now() - 1000 * 60 * 60 * 24 * 400);
    expect(formatRelativeTime(date)).toBe('1年前');
  });

  it('ISO文字列を受け取り相対時間を返す', () => {
    const dateStr = new Date(Date.now() - 1000 * 60 * 10).toISOString();
    expect(formatRelativeTime(dateStr)).toBe('10分前');
  });
});

describe('getYear', () => {
  it('nullの場合nullを返す', () => {
    expect(getYear(null)).toBeNull();
  });

  it('ISO文字列から年の数値を返す', () => {
    expect(getYear('2024-01-15')).toBe(2024);
  });

  it('Dateオブジェクトから年の数値を返す', () => {
    const date = new Date(2024, 0, 15);
    expect(getYear(date)).toBe(2024);
  });
});

describe('getJstYearRange', () => {
  it('JSTの年初と翌年の年初を返す', () => {
    expect(getJstYearRange(2024)).toEqual({
      start: '2024-01-01T00:00:00+09:00',
      end: '2025-01-01T00:00:00+09:00',
    });
  });

  it('UTCでは前年になる時刻（1/1 05:00 JST）がその年に含まれる', () => {
    const { start, end } = getJstYearRange(2025);
    // UTC では 2024-12-31T20:00:00Z
    const boundary = new Date('2025-01-01T05:00:00+09:00').getTime();

    expect(boundary).toBeGreaterThanOrEqual(new Date(start).getTime());
    expect(boundary).toBeLessThan(new Date(end).getTime());
  });

  it('大晦日 23:59 JST はその年に含まれ、翌年には含まれない', () => {
    const { end } = getJstYearRange(2024);
    const lastMoment = new Date('2024-12-31T23:59:59+09:00').getTime();

    expect(lastMoment).toBeLessThan(new Date(end).getTime());
  });
});

describe('isRealCalendarDate', () => {
  it.each([
    ['通常の日付', '2026-11-10'],
    ['年始', '2026-01-01'],
    ['年末', '2026-12-31'],
    ['うるう年の2月29日', '2024-02-29'],
    ['30日までの月の月末', '2026-04-30'],
  ])('%s（%s）を実在する日付と判定する', (_label, value) => {
    expect(isRealCalendarDate(value)).toBe(true);
  });

  it.each([
    ['月が範囲外', '2026-13-45'],
    ['日が範囲外', '2026-02-30'],
    ['ゼロ日付', '0000-00-00'],
    ['うるう年でない2月29日', '2026-02-29'],
    ['31日の無い月', '2026-04-31'],
    ['0月', '2026-00-10'],
    ['0日', '2026-10-00'],
    ['13月', '2026-13-01'],
    ['32日', '2026-01-32'],
  ])('%s（%s）を実在しない日付と判定する', (_label, value) => {
    expect(isRealCalendarDate(value)).toBe(false);
  });

  it.each([
    ['スラッシュ区切り', '2026/11/10'],
    ['ゼロ埋めなし', '2026-1-5'],
    ['時刻付き', '2026-11-10T00:00:00Z'],
    ['空文字', ''],
    ['日付でない文字列', 'yesterday'],
    ['桁数過多', '20260-11-10'],
  ])('%s（%s）を形式の時点で弾く', (_label, value) => {
    expect(isRealCalendarDate(value)).toBe(false);
  });

  // new Date('2026-02-30') は Invalid Date ではなく 2026-03-02 へ
  // 繰り上がる。パースの成否だけで判定すると取りこぼす
  it('繰り上がる日付をパース成功とみなさない', () => {
    expect(Number.isNaN(new Date('2026-02-30').getTime())).toBe(false);
    expect(isRealCalendarDate('2026-02-30')).toBe(false);
  });
});
