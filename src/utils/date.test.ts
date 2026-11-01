import {
  formatDate,
  formatDateTime,
  formatRelativeTime,
  getJstYearRange,
  getYear,
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
