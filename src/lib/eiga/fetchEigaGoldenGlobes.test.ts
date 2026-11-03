/**
 * @jest-environment node
 */

/**
 * eiga.com ゴールデングローブ賞データ取得テスト
 *
 * HTMLは実ページから抜粋している。
 */

import axios from 'axios';

import {
  extractGoldenGlobeEntries,
  fetchEigaGoldenGlobes,
  parseGoldenGlobeRow,
  resolveGoldenGlobeCategoryKey,
} from './fetchEigaGoldenGlobes';

jest.mock('axios');

/** 第82回（2025年）の抜粋。作品賞と演技賞でセルの使い方が入れ替わる */
const HTML_82ND = `<div class="award-wrapper cannes">
<h2><strong>最優秀作品賞（ドラマ）</strong><span>Best Motion Picture - Drama</span></h2>
<table class="_a"> <tr class="prize"> <th scope="row"> <a href="/movie/102150/">ブルータリスト</a> </th> <td> &nbsp; </td> </tr> <tr> <th scope="row"> <a href="/movie/102482/">名もなき者${'　'}A COMPLETE UNKNOWN</a> </th> <td> &nbsp; </td> </tr> </table>
<h2><strong>最優秀作品賞（ミュージカル／コメディ）</strong><span>Best Motion Picture - Musical Or Comedy</span></h2>
<table class="_a"> <tr> <th scope="row"> <a href="/movie/101587/">ANORA アノーラ</a> </th> <td> &nbsp; </td> </tr> <tr class="prize"> <th scope="row"> <a href="/movie/101586/">エミリア・ペレス</a> </th> <td> &nbsp; </td> </tr> </table>
<h2><strong>最優秀主演女優賞（ドラマ）</strong><span>Best Performance by an Actress in a Motion Picture - Drama</span></h2>
<table> <tr> <th scope="row"> <a href="/person/14131/">アンジェリーナ・ジョリー</a> </th> <td> <a href="/movie/102738/">マリア</a> </td> </tr> <tr> <th scope="row"> <a href="/person/54649/">ニコール・キッドマン</a> </th> <td> <a href="/movie/102161/">ベイビーガール</a> </td> </tr> <tr class="prize"> <th scope="row"> <a href="/person/62003/">フェルナンダ・トーレス</a> </th> <td> <a href="/movie/102162/">アイム・スティル・ヒア</a> </td> </tr> </table>
<h2><strong>最優秀主題歌賞</strong><span>Best Original Song - Motion Picture</span></h2>
<table> <tr class="prize"> <th scope="row"> &ldquo;El Mal&rdquo; </th> <td> <a href="/movie/101586/">エミリア・ペレス</a> </td> </tr> </table>
<h2><strong>最優秀長編アニメーション映画賞</strong><span>Best Motion Picture - Animated</span></h2>
<table class="_a"> <tr class="prize"> <th scope="row"> <a href="/movie/102556/">Flow</a> </th> <td> &nbsp; </td> </tr> </table>
</div>`;

/** 第72回（2015年）の抜粋。括弧内の語順が第82回と逆で、受賞クラスが欠けている */
const HTML_72ND = `<div class="award-wrapper cannes">
<h2><strong>最優秀作品賞（コメディ／ミュージカル）</strong><span>Best Motion Picture - Comedy Or Musical</span></h2>
<table class="_a"> <tr class="prize"> <th scope="row"> <a href="/movie/80069/">グランド・ブダペスト・ホテル</a> </th> <td> &nbsp; </td> </tr> </table>
<h2><strong>最優秀主演女優賞（コメディ／ミュージカル）</strong><span>Best Performance by an Actress in a Motion Picture - Comedy Or Musical</span></h2>
<table> <tr> <th scope="row"> <a href="/person/19498/">エイミー・アダムス</a> </th> <td> <a href="/movie/80494/">ビッグ・アイズ</a> </td> </tr> <tr> <th scope="row"> <a href="/person/40141/">エミリー・ブラント</a> </th> <td> <a href="/movie/81238/">イントゥ・ザ・ウッズ</a> </td> </tr> </table>
</div>`;

describe('resolveGoldenGlobeCategoryKey', () => {
  it('括弧なしの部門を解決する', () => {
    expect(resolveGoldenGlobeCategoryKey('最優秀監督賞')).toBe('best_director');
    expect(resolveGoldenGlobeCategoryKey('最優秀助演男優賞')).toBe(
      'best_supporting_actor',
    );
    expect(resolveGoldenGlobeCategoryKey('最優秀助演女優賞')).toBe(
      'best_supporting_actress',
    );
  });

  /**
   * 括弧内の語順が年で入れ替わる。完全一致では引けない。
   *   2025年: 最優秀作品賞（ミュージカル／コメディ）
   *   2015年: 最優秀作品賞（コメディ／ミュージカル）
   */
  it('ミュージカル・コメディの語順が逆でも同じ部門に解決する', () => {
    expect(
      resolveGoldenGlobeCategoryKey('最優秀作品賞（ミュージカル／コメディ）'),
    ).toBe('best_musical_comedy');
    expect(
      resolveGoldenGlobeCategoryKey('最優秀作品賞（コメディ／ミュージカル）'),
    ).toBe('best_musical_comedy');
  });

  it('ドラマ部門とミュージカル・コメディ部門を区別する', () => {
    expect(resolveGoldenGlobeCategoryKey('最優秀主演女優賞（ドラマ）')).toBe(
      'best_actress_drama',
    );
    expect(
      resolveGoldenGlobeCategoryKey(
        '最優秀主演女優賞（コメディ／ミュージカル）',
      ),
    ).toBe('best_actress_musical_comedy');
  });

  it('「最優秀」が無くても解決する', () => {
    expect(resolveGoldenGlobeCategoryKey('作品賞（ドラマ）')).toBe(
      'best_drama',
    );
  });

  it('追跡対象外の部門は null を返す', () => {
    expect(resolveGoldenGlobeCategoryKey('最優秀脚本賞')).toBeNull();
    expect(
      resolveGoldenGlobeCategoryKey('最優秀長編アニメーション映画賞'),
    ).toBeNull();
    expect(resolveGoldenGlobeCategoryKey('最優秀非英語映画賞')).toBeNull();
  });
});

describe('parseGoldenGlobeRow', () => {
  it('作品賞の行（th が作品、td が空）から作品名を取る', () => {
    const row =
      ' <th scope="row"> <a href="/movie/102150/">ブルータリスト</a> </th> <td> &nbsp; </td> ';
    expect(parseGoldenGlobeRow(row)).toEqual({ title: 'ブルータリスト' });
  });

  it('演技賞の行（th が人名、td が作品）から作品名と人名を取る', () => {
    const row =
      ' <th scope="row"> <a href="/person/14131/">アンジェリーナ・ジョリー</a> </th> <td> <a href="/movie/102738/">マリア</a> </td> ';
    expect(parseGoldenGlobeRow(row)).toEqual({
      title: 'マリア',
      personName: 'アンジェリーナ・ジョリー',
    });
  });

  it('HTMLエンティティをデコードし連続空白を畳む', () => {
    const row =
      ' <th scope="row"> <a href="/movie/1/">A&amp;B\n  C</a> </th> <td> &nbsp; </td> ';
    expect(parseGoldenGlobeRow(row)?.title).toBe('A&B C');
  });

  it('リンクの無いセルでもテキストに倒す', () => {
    const row =
      ' <th scope="row"> &ldquo;El Mal&rdquo; </th> <td> <a href="/movie/101586/">エミリア・ペレス</a> </td> ';
    // td に作品があるので td を作品、th を人名扱いにする
    expect(parseGoldenGlobeRow(row)).toEqual({
      title: 'エミリア・ペレス',
      personName: '&ldquo;El Mal&rdquo;',
    });
  });

  it('作品名が取れない行は null を返す', () => {
    expect(
      parseGoldenGlobeRow(' <th scope="row"> </th> <td> &nbsp; </td> '),
    ).toBeNull();
  });
});

describe('extractGoldenGlobeEntries', () => {
  const entries = extractGoldenGlobeEntries(HTML_82ND);

  it('部門ごとに受賞とノミネートを抽出する', () => {
    const drama = entries.filter((e) => e.categoryKey === 'best_drama');
    expect(drama).toEqual([
      { categoryKey: 'best_drama', title: 'ブルータリスト', isWinner: true },
      {
        categoryKey: 'best_drama',
        title: '名もなき者 A COMPLETE UNKNOWN',
        isWinner: false,
      },
    ]);
  });

  it('受賞が先頭に無くても tr.prize で判別する', () => {
    const musical = entries.filter(
      (e) => e.categoryKey === 'best_musical_comedy',
    );
    expect(musical.map((e) => [e.title, e.isWinner])).toEqual([
      ['ANORA アノーラ', false],
      ['エミリア・ペレス', true],
    ]);
  });

  /**
   * 日本語Wikipediaはこの部門で『マリア』を2017年のドキュメンタリーに
   * 誤リンクし、『ベイビーガール』は記事に載せていない。
   */
  it('演技賞で作品名と人名を取り、Wikipediaに無い候補も拾う', () => {
    const actress = entries.filter(
      (e) => e.categoryKey === 'best_actress_drama',
    );
    expect(actress.map((e) => [e.title, e.personName])).toEqual([
      ['マリア', 'アンジェリーナ・ジョリー'],
      ['ベイビーガール', 'ニコール・キッドマン'],
      ['アイム・スティル・ヒア', 'フェルナンダ・トーレス'],
    ]);
  });

  it('追跡対象外の部門は含めない', () => {
    expect(entries.some((e) => e.title === 'Flow')).toBe(false);
    expect(entries.every((e) => e.categoryKey !== 'best_song')).toBe(true);
  });

  it('作品賞では人名を持たない', () => {
    const drama = entries.filter((e) => e.categoryKey === 'best_drama');
    expect(drama.every((e) => e.personName === undefined)).toBe(true);
  });

  /**
   * 第72回の主演女優賞（コメディ／ミュージカル）は実際の受賞者がいるのに
   * eiga.com 側に prize クラスが無い。取りこぼさずノミネートとして取り込む。
   */
  it('受賞クラスが無い部門でもノミネートとして取り込む', () => {
    const old = extractGoldenGlobeEntries(HTML_72ND);
    const actress = old.filter(
      (e) => e.categoryKey === 'best_actress_musical_comedy',
    );
    expect(actress).toHaveLength(2);
    expect(actress.every((e) => !e.isWinner)).toBe(true);
  });

  it('表のないHTMLでは空配列を返す', () => {
    expect(extractGoldenGlobeEntries('<div>本文のみ</div>')).toEqual([]);
  });
});

describe('fetchEigaGoldenGlobes', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>;
  const EIGA_AWARD_BASE_URL = 'https://example.test/award';
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EIGA_AWARD_BASE_URL = EIGA_AWARD_BASE_URL;
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.EIGA_AWARD_BASE_URL;
    warnSpy.mockRestore();
  });

  it('授賞式の年でページを取得し、TMDb解決用の形に変換する', async () => {
    mockedAxios.get.mockResolvedValue({ data: HTML_82ND });

    const result = await fetchEigaGoldenGlobes(2025);

    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${EIGA_AWARD_BASE_URL}/golden-globe/2025/`,
      expect.objectContaining({ responseType: 'text' }),
    );
    expect(result).toContainEqual({
      title_ja: 'ブルータリスト',
      title_en: 'ブルータリスト',
      category: 'best_drama',
      is_winner: true,
      year: 2024,
    });
  });

  it('公開年に授賞式の前年を入れる', async () => {
    mockedAxios.get.mockResolvedValue({ data: HTML_82ND });

    const result = await fetchEigaGoldenGlobes(2025);

    expect(result.every((i) => i.year === 2024)).toBe(true);
  });

  it('演技賞では person_name を持たせる', async () => {
    mockedAxios.get.mockResolvedValue({ data: HTML_82ND });

    const result = await fetchEigaGoldenGlobes(2025);
    const maria = result.find((i) => i.title_ja === 'マリア');

    expect(maria?.person_name).toBe('アンジェリーナ・ジョリー');
    expect(maria?.category).toBe('best_actress_drama');
  });

  /**
   * eiga.com 側で prize クラスが欠ける部門がある（第72回の主演女優賞
   * コメディ／ミュージカル）。取得失敗にはせず警告だけ出す。
   */
  it('受賞が取れなかった部門を警告に出すが、取得は成功させる', async () => {
    mockedAxios.get.mockResolvedValue({ data: HTML_72ND });

    const result = await fetchEigaGoldenGlobes(2015);

    expect(result.length).toBeGreaterThan(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('best_actress_musical_comedy'),
    );
  });

  it('全部門で受賞が取れていれば警告を出さない', async () => {
    mockedAxios.get.mockResolvedValue({ data: HTML_82ND });

    await fetchEigaGoldenGlobes(2025);

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('取得に失敗した場合は空配列を返す', async () => {
    mockedAxios.get.mockRejectedValue(new Error('Network error'));

    await expect(fetchEigaGoldenGlobes(2025)).resolves.toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('環境変数が未設定なら例外を投げる', async () => {
    delete process.env.EIGA_AWARD_BASE_URL;

    await expect(fetchEigaGoldenGlobes(2025)).rejects.toThrow(
      /EIGA_AWARD_BASE_URL/,
    );
  });
});
