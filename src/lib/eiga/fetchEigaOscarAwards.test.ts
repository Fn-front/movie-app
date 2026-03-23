/**
 * @jest-environment node
 */

/**
 * eiga.com アカデミー賞データ取得テスト
 */

import {
  extractBestPictureNominees,
  extractPersonCategoryNominees,
  extractOthersPageNominees,
} from './fetchEigaOscarAwards';

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

  it('nominate_ctb bb_noneブロックはスキップする', () => {
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

  it('HTMLエンティティをデコードする', () => {
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
    expect(result[0]).toEqual({ title: '映画アルファ', isWinner: false });
    expect(result[1]).toEqual({ title: '映画ベータ', isWinner: true });
  });

  it('nominate_ctb bb_noneブロックはスキップする', () => {
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
    expect(result[0].nominees[0]).toEqual({ title: '映画1', isWinner: false });
    expect(result[0].nominees[1]).toEqual({ title: '映画2', isWinner: true });

    expect(result[1].section).toBe('助演女優賞');
    expect(result[1].nominees).toHaveLength(2);
    expect(result[1].nominees[0]).toEqual({ title: '映画3', isWinner: true });
    expect(result[1].nominees[1]).toEqual({ title: '映画4', isWinner: false });
  });

  it('対象外のセクション（脚本賞等）も正しくパースされる', () => {
    const html = `
      <h4 class="underline"><span>助演男優賞</span></h4>
      <div class="nominate_ctb winner">
        <div class="movie_title">
          <p class="h5_link_sub">「<a href="/movie/1/">映画A</a>」</p>
        </div>
      </div>
      <h4 class="underline"><span>脚本賞</span></h4>
      <div class="nominate_ctb winner">
        <div class="movie_title">
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
