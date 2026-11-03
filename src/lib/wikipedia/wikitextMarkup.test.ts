/**
 * @jest-environment node
 */

/**
 * wikitext マークアップ処理 テスト
 */

import {
  flattenMarkup,
  normalizeEnTitle,
  parseKariLink,
  resolveLink,
  stripAnnotations,
  stripEmphasis,
} from './wikitextMarkup';

describe('stripAnnotations', () => {
  it('自己完結形の ref を落とす', () => {
    expect(stripAnnotations('作品<ref name="x" />')).toBe('作品');
  });

  it('開閉のある ref を中身ごと落とす', () => {
    expect(stripAnnotations('作品<ref>出典テキスト</ref>')).toBe('作品');
  });

  it('small とコメントを落とす', () => {
    expect(stripAnnotations('作品 <small>(死後)</small>')).toBe('作品 ');
    expect(stripAnnotations('作品<!-- メモ -->')).toBe('作品');
  });

  it('国旗テンプレートと国名略号テンプレートを落とす', () => {
    expect(stripAnnotations('作品{{FRA}}')).toBe('作品');
    expect(stripAnnotations('作品{{flagicon|JPN}}')).toBe('作品');
  });

  /**
   * 正規表現 `/<!--[\s\S]*?-->/g` では閉じ忘れの `<!--` が残っていた
   * （CodeQL `js/incomplete-multi-character-sanitization` の指摘点）。
   * 走査に置き換え、MediaWiki と同じく以降をすべて隠すようにした。
   */
  it('閉じ忘れのコメントは以降をすべて隠す', () => {
    expect(stripAnnotations('作品<!-- 閉じ忘れ')).toBe('作品');
    expect(stripAnnotations('A<!--x-->B<!--閉じ忘れ')).toBe('AB');
  });

  it('戻り値にコメントの開始記号が残らない', () => {
    const inputs = [
      '作品<!-- メモ -->',
      '作品<!-- 閉じ忘れ',
      '<!--',
      '<!--<!--',
    ];
    for (const input of inputs) {
      expect(stripAnnotations(input)).not.toContain('<!--');
    }
  });

  it('対象外のテキストは変えない', () => {
    expect(stripAnnotations('『落下の解剖学』')).toBe('『落下の解剖学』');
  });
});

describe('stripEmphasis', () => {
  it('太字と斜体のマークアップを落とす', () => {
    expect(stripEmphasis("'''太字'''と''斜体''")).toBe('太字と斜体');
  });

  it('アポストロフィ1つは残す', () => {
    expect(stripEmphasis("It's")).toBe("It's");
  });
});

describe('resolveLink', () => {
  it('表示テキストがあればそれを返す', () => {
    expect(resolveLink('オッペンハイマー (映画)|オッペンハイマー')).toBe(
      'オッペンハイマー',
    );
  });

  it('セクション指定は記事名に倒す', () => {
    expect(resolveLink('爆弾 (小説)#映画')).toBe('爆弾 (小説)');
  });

  it('装飾の無いリンクはそのまま返す', () => {
    expect(resolveLink('落下の解剖学')).toBe('落下の解剖学');
  });
});

describe('parseKariLink', () => {
  it('label= があればそれを表示テキストにする', () => {
    expect(
      parseKariLink('ブラックドッグ (映画)|label=ブラックドッグ|en|Black Dog'),
    ).toEqual({ display: 'ブラックドッグ', en: 'Black Dog' });
  });

  it('label= が無ければ第1引数を表示テキストにする', () => {
    expect(parseKariLink('二つの季節しかない村|en|About Dry Grasses')).toEqual({
      display: '二つの季節しかない村',
      en: 'About Dry Grasses',
    });
  });

  /** 記事では `|label=` が空のまま置かれていることがある */
  it('label= が空なら第1引数に倒す', () => {
    expect(parseKariLink('URCHIN アーチン|en|Urchin|label=')).toEqual({
      display: 'URCHIN アーチン',
      en: 'Urchin',
    });
  });

  it('英語版記事名が無ければ en を持たない', () => {
    expect(parseKariLink('邦題のみ')).toEqual({
      display: '邦題のみ',
      en: undefined,
    });
  });
});

describe('normalizeEnTitle', () => {
  it('曖昧さ回避の括弧を落とす', () => {
    expect(normalizeEnTitle('Black Dog (2024 film)')).toBe('Black Dog');
    expect(normalizeEnTitle('Armand (film)')).toBe('Armand');
    expect(normalizeEnTitle('Ali (2025)')).toBe('Ali');
  });

  it('作品名の一部である括弧は残す', () => {
    expect(normalizeEnTitle('Birdman (or The Unexpected Virtue)')).toBe(
      'Birdman (or The Unexpected Virtue)',
    );
  });
});

describe('flattenMarkup', () => {
  it('リンクを表示テキストに均す', () => {
    expect(
      flattenMarkup('[[オッペンハイマー (映画)|オッペンハイマー]]'),
    ).toEqual({ text: 'オッペンハイマー', en: undefined });
  });

  it('仮リンクから英語タイトルを拾う', () => {
    expect(
      flattenMarkup(
        '{{仮リンク|リトル・シスター 秘密|en|The Little Sister (2025 film)}}',
      ),
    ).toEqual({ text: 'リトル・シスター 秘密', en: 'The Little Sister' });
  });

  it('英語版記事リンクから英語タイトルを拾う', () => {
    expect(flattenMarkup('[[:en:Grand Tour (film)|Grand Tour]]')).toEqual({
      text: 'Grand Tour',
      en: 'Grand Tour',
    });
  });

  it('表示テキストの無い英語版記事リンクは記事名を使う', () => {
    expect(flattenMarkup('[[:en:Pillion]]')).toEqual({
      text: 'Pillion',
      en: 'Pillion',
    });
  });
});
