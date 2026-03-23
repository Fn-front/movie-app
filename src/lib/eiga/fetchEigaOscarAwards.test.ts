/**
 * @jest-environment node
 */

/**
 * eiga.com アカデミー賞データ取得テスト
 */

import axios from 'axios';

import {
  fetchEigaOscarAwards,
  extractBestPictureNominees,
  extractPersonCategoryNominees,
  extractOthersPageNominees,
} from './fetchEigaOscarAwards';

jest.mock('axios');

describe('extractBestPictureNominees', () => {
  it('作品賞ページから受賞作品とノミネート作品を抽出する', () => {
    const html = `
      <div class="nominate_ctb">
        <div class="contents_box_half float_r">
          <div class="movie_title">
            <h5 class="h5_link">
              <a href="/movie/100001/"><i class="fa fa-caret-right">&nbsp;</i>テスト映画A</a>
            </h5>
          </div>
        </div>
      </div>
      <div class="nominate_ctb winner">
        <div class="contents_box_half float_r">
          <div class="movie_title">
            <h5 class="h5_link">
              <a href="/movie/100002/"><i class="fa fa-caret-right">&nbsp;</i>テスト映画B</a>
            </h5>
          </div>
        </div>
      </div>
      <div class="nominate_ctb">
        <div class="contents_box_half float_r">
          <div class="movie_title">
            <h5 class="h5_link">
              <a href="/movie/100003/"><i class="fa fa-caret-right">&nbsp;</i>テスト映画C</a>
            </h5>
          </div>
        </div>
      </div>
    `;

    const result = extractBestPictureNominees(html);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ title: 'テスト映画A', isWinner: false });
    expect(result[1]).toEqual({ title: 'テスト映画B', isWinner: true });
    expect(result[2]).toEqual({ title: 'テスト映画C', isWinner: false });
  });

  it('nominate_ctb bb_noneブロックは必要な構造を持たないためマッチしない', () => {
    const html = `
      <div class="nominate_ctb winner">
        <div class="contents_box_half float_r">
          <div class="movie_title">
            <h5 class="h5_link">
              <a href="/movie/100001/"><i class="fa fa-caret-right">&nbsp;</i>受賞作品</a>
            </h5>
          </div>
        </div>
      </div>
      <div class="nominate_ctb bb_none">
        <h5 class="h5_link">
          <a href="/movie/999/">スキップされるべき</a>
        </h5>
      </div>
    `;

    const result = extractBestPictureNominees(html);

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('受賞作品');
  });

  it('数値参照HTMLエンティティをデコードする', () => {
    const html = `
      <div class="nominate_ctb">
        <div class="contents_box_half float_r">
          <div class="movie_title">
            <h5 class="h5_link">
              <a href="/movie/100001/"><i class="fa fa-caret-right">&nbsp;</i>If I Had Legs I&#39;d Kick You</a>
            </h5>
          </div>
        </div>
      </div>
    `;

    const result = extractBestPictureNominees(html);

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("If I Had Legs I'd Kick You");
  });

  it('16進数参照HTMLエンティティをデコードする', () => {
    const html = `
      <div class="nominate_ctb">
        <div class="contents_box_half float_r">
          <div class="movie_title">
            <h5 class="h5_link">
              <a href="/movie/100001/"><i class="fa fa-caret-right">&nbsp;</i>Test&#x26;Movie</a>
            </h5>
          </div>
        </div>
      </div>
    `;

    const result = extractBestPictureNominees(html);

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Test&Movie');
  });

  it('映画「...」ラッピングを除去する', () => {
    const html = `
      <div class="nominate_ctb">
        <div class="contents_box_half float_r">
          <div class="movie_title">
            <h5 class="h5_link">
              <a href="/movie/100001/"><i class="fa fa-caret-right">&nbsp;</i>映画「F1（R） エフワン」</a>
            </h5>
          </div>
        </div>
      </div>
    `;

    const result = extractBestPictureNominees(html);

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('F1 エフワン');
  });

  it('空のHTMLからは空配列を返す', () => {
    expect(extractBestPictureNominees('')).toHaveLength(0);
  });
});

describe('extractPersonCategoryNominees', () => {
  it('演技賞ページから受賞者とノミネート者の映画を抽出する', () => {
    const html = `
      <div class="nominate_ctb">
        <div class="contents_box_two_third">
          <div class="movie_title">
            <h5 class="h5_link"><a href="/person/100/">俳優A</a></h5>
            <p class="h5_link_sub">「<a href="/movie/200001/">映画アルファ</a>」</p>
          </div>
        </div>
      </div>
      <div class="nominate_ctb winner">
        <div class="contents_box_two_third">
          <div class="movie_title">
            <h5 class="h5_link"><a href="/person/200/">俳優B</a></h5>
            <p class="h5_link_sub">「<a href="/movie/200002/">映画ベータ</a>」</p>
          </div>
        </div>
      </div>
    `;

    const result = extractPersonCategoryNominees(html);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      title: '映画アルファ',
      isWinner: false,
      personName: '俳優A',
    });
    expect(result[1]).toEqual({
      title: '映画ベータ',
      isWinner: true,
      personName: '俳優B',
    });
  });

  it('nominate_ctb bb_noneブロックは必要な構造を持たないためマッチしない', () => {
    const html = `
      <div class="nominate_ctb winner">
        <div class="movie_title">
          <h5 class="h5_link"><a href="/person/1/">俳優</a></h5>
          <p class="h5_link_sub">「<a href="/movie/1/">受賞映画</a>」</p>
        </div>
      </div>
      <div class="nominate_ctb bb_none">
        <p class="h5_link_sub">「<a href="/movie/999/">スキップ</a>」</p>
      </div>
    `;

    const result = extractPersonCategoryNominees(html);

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('受賞映画');
  });
});

describe('extractOthersPageNominees', () => {
  it('セクション別にノミネート作品を抽出する', () => {
    const html = `
      <h4 class="underline"><span>助演男優賞</span></h4>
      <div class="nominate_ctb">
        <div class="movie_title">
          <h5 class="h5_link"><a href="/person/1/">俳優A</a></h5>
          <p class="h5_link_sub">「<a href="/movie/1/">映画1</a>」</p>
        </div>
      </div>
      <div class="nominate_ctb winner">
        <div class="movie_title">
          <h5 class="h5_link"><a href="/person/2/">俳優B</a></h5>
          <p class="h5_link_sub">「<a href="/movie/2/">映画2</a>」</p>
        </div>
      </div>
      <h4 class="underline"><span>助演女優賞</span></h4>
      <div class="nominate_ctb winner">
        <div class="movie_title">
          <h5 class="h5_link"><a href="/person/3/">女優C</a></h5>
          <p class="h5_link_sub">「<a href="/movie/3/">映画3</a>」</p>
        </div>
      </div>
      <div class="nominate_ctb">
        <div class="movie_title">
          <h5 class="h5_link"><a href="/person/4/">女優D</a></h5>
          <p class="h5_link_sub">「<a href="/movie/4/">映画4</a>」</p>
        </div>
      </div>
    `;

    const result = extractOthersPageNominees(html);

    expect(result).toHaveLength(2);

    expect(result[0].section).toBe('助演男優賞');
    expect(result[0].nominees).toHaveLength(2);
    expect(result[0].nominees[0]).toEqual({
      title: '映画1',
      isWinner: false,
      personName: '俳優A',
    });
    expect(result[0].nominees[1]).toEqual({
      title: '映画2',
      isWinner: true,
      personName: '俳優B',
    });

    expect(result[1].section).toBe('助演女優賞');
    expect(result[1].nominees).toHaveLength(2);
    expect(result[1].nominees[0]).toEqual({
      title: '映画3',
      isWinner: true,
      personName: '女優C',
    });
    expect(result[1].nominees[1]).toEqual({
      title: '映画4',
      isWinner: false,
      personName: '女優D',
    });
  });

  it('対象外のセクション（脚本賞等）も正しくパースされる', () => {
    const html = `
      <h4 class="underline"><span>助演男優賞</span></h4>
      <div class="nominate_ctb winner">
        <div class="movie_title">
          <h5 class="h5_link"><a href="/person/1/">俳優A</a></h5>
          <p class="h5_link_sub">「<a href="/movie/1/">映画A</a>」</p>
        </div>
      </div>
      <h4 class="underline"><span>脚本賞</span></h4>
      <div class="nominate_ctb winner">
        <div class="movie_title">
          <h5 class="h5_link"><a href="/person/2/">脚本家B</a></h5>
          <p class="h5_link_sub">「<a href="/movie/99/">脚本映画</a>」</p>
        </div>
      </div>
    `;

    const result = extractOthersPageNominees(html);

    expect(result).toHaveLength(2);
    expect(result[0].section).toBe('助演男優賞');
    expect(result[1].section).toBe('脚本賞');
  });
});

describe('fetchEigaOscarAwards', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /** 作品賞ページ用HTML */
  const bestPictureHtml = `
    <div class="nominate_ctb winner">
      <div class="contents_box_half float_r">
        <div class="movie_title">
          <h5 class="h5_link">
            <a href="/movie/1/">受賞作品</a>
          </h5>
        </div>
      </div>
    </div>
  `;

  /** 演技賞ページ用HTML */
  const personPageHtml = `
    <div class="nominate_ctb winner">
      <div class="movie_title">
        <h5 class="h5_link"><a href="/person/1/">テスト俳優</a></h5>
        <p class="h5_link_sub">「<a href="/movie/2/">テスト映画</a>」</p>
      </div>
    </div>
  `;

  /** all-othersページ用HTML */
  const othersPageHtml = `
    <h4 class="underline"><span>助演男優賞</span></h4>
    <div class="nominate_ctb winner">
      <div class="movie_title">
        <h5 class="h5_link"><a href="/person/3/">助演俳優</a></h5>
        <p class="h5_link_sub">「<a href="/movie/3/">助演映画</a>」</p>
      </div>
    </div>
  `;

  it('全ページからデータを取得してOpenAiAwardItem形式で返す', async () => {
    mockedAxios.get
      .mockResolvedValueOnce({ data: bestPictureHtml }) // all.html
      .mockResolvedValueOnce({ data: personPageHtml }) // all-director.html
      .mockResolvedValueOnce({ data: personPageHtml }) // all-actor.html
      .mockResolvedValueOnce({ data: personPageHtml }) // all-actress.html
      .mockResolvedValueOnce({ data: othersPageHtml }); // all-others.html

    const result = await fetchEigaOscarAwards(2026);

    expect(result.length).toBeGreaterThan(0);
    // 作品賞
    const bestPicture = result.find((r) => r.category === 'best_picture');
    expect(bestPicture).toBeDefined();
    expect(bestPicture!.title_ja).toBe('受賞作品');
    expect(bestPicture!.is_winner).toBe(true);
    expect(bestPicture!.year).toBe(2025);
    // 監督賞
    const bestDirector = result.find((r) => r.category === 'best_director');
    expect(bestDirector).toBeDefined();
    expect(bestDirector!.person_name).toBe('テスト俳優');
    // 助演男優賞
    const supportingActor = result.find(
      (r) => r.category === 'best_supporting_actor',
    );
    expect(supportingActor).toBeDefined();
    expect(supportingActor!.title_ja).toBe('助演映画');
  });

  it('ページ取得失敗時はそのページをスキップして他のページを処理する', async () => {
    mockedAxios.get
      .mockRejectedValueOnce(new Error('Network error')) // all.html 失敗
      .mockResolvedValueOnce({ data: personPageHtml }) // all-director.html
      .mockResolvedValueOnce({ data: personPageHtml }) // all-actor.html
      .mockResolvedValueOnce({ data: personPageHtml }) // all-actress.html
      .mockResolvedValueOnce({ data: othersPageHtml }); // all-others.html

    const result = await fetchEigaOscarAwards(2026);

    // 作品賞はスキップされるが他の部門は取得できる
    const bestPicture = result.find((r) => r.category === 'best_picture');
    expect(bestPicture).toBeUndefined();
    expect(result.length).toBeGreaterThan(0);
  });

  it('全ページ取得失敗時は空配列を返す', async () => {
    mockedAxios.get.mockRejectedValue(new Error('Network error'));

    const result = await fetchEigaOscarAwards(2026);

    expect(result).toEqual([]);
  });

  it('all-othersページで対象外セクションのノミネートはスキップされる', async () => {
    const othersWithUnknownSection = `
      <h4 class="underline"><span>脚本賞</span></h4>
      <div class="nominate_ctb winner">
        <div class="movie_title">
          <h5 class="h5_link"><a href="/person/1/">脚本家</a></h5>
          <p class="h5_link_sub">「<a href="/movie/1/">脚本映画</a>」</p>
        </div>
      </div>
    `;

    mockedAxios.get
      .mockResolvedValueOnce({ data: '' }) // all.html
      .mockResolvedValueOnce({ data: '' }) // all-director.html
      .mockResolvedValueOnce({ data: '' }) // all-actor.html
      .mockResolvedValueOnce({ data: '' }) // all-actress.html
      .mockResolvedValueOnce({ data: othersWithUnknownSection }); // all-others.html

    const result = await fetchEigaOscarAwards(2026);

    // 脚本賞はSECTION_TO_CATEGORYに含まれないためスキップ
    expect(result).toEqual([]);
  });

  it('正しいURLパターンでリクエストする', async () => {
    mockedAxios.get.mockResolvedValue({ data: '' });

    await fetchEigaOscarAwards(2025);

    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://eiga.com/official/oscar/2025/all.html',
      expect.anything(),
    );
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://eiga.com/official/oscar/2025/all-others.html',
      expect.anything(),
    );
  });
});
