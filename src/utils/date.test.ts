import {
  formatDate,
  formatDateTime,
  formatRelativeTime,
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
