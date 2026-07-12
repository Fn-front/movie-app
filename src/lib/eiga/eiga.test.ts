/**
 * 映画.com iCalフィード取得・パース処理のテスト
 */

import axios from 'axios';

import {
  fetchEigaMovies,
  fetchOriginalTitle,
  parseIcal,
  type EigaMovie,
} from './eiga';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

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

  it('DTSTARTがないイベントはスキップする', () => {
    const ical = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
SUMMARY:日付なし映画
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260601
SUMMARY:有効な映画
END:VEVENT
END:VCALENDAR`;

    const result = parseIcal(ical);

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('有効な映画');
  });

  it('descriptionがnullの場合でもエラーにならない', () => {
    const ical = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260701
SUMMARY:description無し映画
END:VEVENT
END:VCALENDAR`;

    const result = parseIcal(ical);

    expect(result).toHaveLength(1);
    expect(result[0].eigaUrl).toBeNull();
  });
});

describe('fetchEigaMovies', () => {
  const EIGA_ICAL_URL = 'https://example.test/coming.ics';

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EIGA_ICAL_URL = EIGA_ICAL_URL;
  });

  afterEach(() => {
    delete process.env.EIGA_ICAL_URL;
  });

  it('iCalフィードを取得してパースした結果を返す', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: MOCK_ICAL });

    const result = await fetchEigaMovies();

    expect(mockedAxios.get).toHaveBeenCalledWith(EIGA_ICAL_URL, {
      responseType: 'text',
      timeout: 30000,
    });
    expect(result).toHaveLength(3);
    expect(result[0].title).toBe('テスト映画A');
    expect(result[0].releaseDate).toBe('2026-03-01');
  });

  it('axiosがエラーを投げた場合そのまま伝播する', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('Network Error'));

    await expect(fetchEigaMovies()).rejects.toThrow('Network Error');
  });

  it('EIGA_ICAL_URL 未設定時はエラーを投げる', async () => {
    delete process.env.EIGA_ICAL_URL;

    await expect(fetchEigaMovies()).rejects.toThrow('EIGA_ICAL_URL');
  });
});

describe('fetchOriginalTitle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('「原題：」パターンから原題を抽出する', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: '<div>原題：The Original Title</div>',
    });

    const result = await fetchOriginalTitle('https://eiga.com/movie/12345/');

    expect(result).toBe('The Original Title');
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://eiga.com/movie/12345/',
      {
        responseType: 'text',
        timeout: 10000,
      },
    );
  });

  it('「原題または英題：」パターンから原題を抽出する', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: '<div>原題または英題：The English Title</div>',
    });

    const result = await fetchOriginalTitle('https://eiga.com/movie/12345/');

    expect(result).toBe('The English Title');
  });

  it('「英題：」パターンから英題を抽出する', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: '<div>英題：The English Only Title</div>',
    });

    const result = await fetchOriginalTitle('https://eiga.com/movie/12345/');

    expect(result).toBe('The English Only Title');
  });

  it('コロンが全角の場合も抽出できる', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: '<div>原題：Full Width Colon Title</div>',
    });

    const result = await fetchOriginalTitle('https://eiga.com/movie/12345/');

    expect(result).toBe('Full Width Colon Title');
  });

  it('半角コロンの場合も抽出できる', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: '<div>原題:Half Width Colon Title</div>',
    });

    const result = await fetchOriginalTitle('https://eiga.com/movie/12345/');

    expect(result).toBe('Half Width Colon Title');
  });

  it('原題が見つからない場合nullを返す', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: '<div>タイトルのみの映画ページ</div>',
    });

    const result = await fetchOriginalTitle('https://eiga.com/movie/12345/');

    expect(result).toBeNull();
  });

  it('axiosがエラーを投げた場合nullを返す', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('Network Error'));

    const result = await fetchOriginalTitle('https://eiga.com/movie/12345/');

    expect(result).toBeNull();
  });

  it('タイムアウトエラーの場合もnullを返す', async () => {
    mockedAxios.get.mockRejectedValueOnce(
      new Error('timeout of 10000ms exceeded'),
    );

    const result = await fetchOriginalTitle('https://eiga.com/movie/12345/');

    expect(result).toBeNull();
  });

  it('原題の前後の空白がトリムされる', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: '<div>原題：  Spaced Title  </div>',
    });

    const result = await fetchOriginalTitle('https://eiga.com/movie/12345/');

    expect(result).toBe('Spaced Title');
  });
});
