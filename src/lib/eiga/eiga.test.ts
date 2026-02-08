/**
 * 映画.com iCalフィード取得・パース処理のテスト
 */

import { parseIcal, type EigaMovie } from './eiga';

/**
 * テスト用iCalデータ
 */
const MOCK_ICAL = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//eiga.com//Movie Calendar//JA
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260301
SUMMARY:テスト映画A
DESCRIPTION:作品紹介ページ：https://eiga.com/movie/12345/
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260415
SUMMARY:テスト映画B
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260520
SUMMARY:テスト映画C
DESCRIPTION:概要のみ
END:VEVENT
END:VCALENDAR`;

describe('parseIcal', () => {
  it('VEVENTからタイトルと公開日を正しく抽出する', () => {
    const result = parseIcal(MOCK_ICAL);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual<EigaMovie>({
      title: 'テスト映画A',
      releaseDate: '2026-03-01',
      eigaUrl: 'https://eiga.com/movie/12345/',
    });
    expect(result[1]).toEqual<EigaMovie>({
      title: 'テスト映画B',
      releaseDate: '2026-04-15',
      eigaUrl: null,
    });
    expect(result[2]).toEqual<EigaMovie>({
      title: 'テスト映画C',
      releaseDate: '2026-05-20',
      eigaUrl: null,
    });
  });

  it('SUMMARYがないイベントはスキップする', () => {
    const ical = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260301
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260415
SUMMARY:有効な映画
END:VEVENT
END:VCALENDAR`;

    const result = parseIcal(ical);

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('有効な映画');
  });

  it('VEVENTがない場合は空配列を返す', () => {
    const ical = `BEGIN:VCALENDAR
VERSION:2.0
END:VCALENDAR`;

    const result = parseIcal(ical);

    expect(result).toHaveLength(0);
  });

  it('日付が1桁月・日の場合も0埋めされる', () => {
    const ical = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260105
SUMMARY:1月の映画
END:VEVENT
END:VCALENDAR`;

    const result = parseIcal(ical);

    expect(result[0].releaseDate).toBe('2026-01-05');
  });

  it('descriptionから映画.comのURLを抽出する', () => {
    const ical = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260213
SUMMARY:私のすべて
DESCRIPTION:フランス発のドラマ。\\n作品紹介ページ：https://eiga.com/movie/103415/
END:VEVENT
END:VCALENDAR`;

    const result = parseIcal(ical);

    expect(result[0].eigaUrl).toBe('https://eiga.com/movie/103415/');
  });

  it('descriptionにURLがない場合eigaUrlはnull', () => {
    const ical = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260301
SUMMARY:テスト映画
DESCRIPTION:URLなしの説明文
END:VEVENT
END:VCALENDAR`;

    const result = parseIcal(ical);

    expect(result[0].eigaUrl).toBeNull();
  });
});
