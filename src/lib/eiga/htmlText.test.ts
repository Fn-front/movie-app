/**
 * @jest-environment node
 */

/**
 * スクレイピングHTMLのテキスト化 テスト
 */

import { cleanHtmlText, decodeHtmlEntities } from './htmlText';

describe('decodeHtmlEntities', () => {
  it('名前付きエンティティをデコードする', () => {
    expect(decodeHtmlEntities('A&amp;B&lt;C&gt;D&quot;E&apos;F')).toBe(
      'A&B<C>D"E\'F',
    );
  });

  it('10進・16進の数値参照をデコードする', () => {
    expect(decodeHtmlEntities('&#65;&#x42;')).toBe('AB');
  });

  /**
   * 段階的に置換すると `&amp;lt;` が `<` になってしまう。
   * 1回の走査で完結させることで、文字列としての `&lt;` が保たれる。
   */
  it('二重にデコードしない', () => {
    expect(decodeHtmlEntities('&amp;lt;')).toBe('&lt;');
  });

  it('未知の名前付きエンティティはそのまま残す', () => {
    expect(decodeHtmlEntities('&unknown;')).toBe('&unknown;');
  });

  it('範囲外のコードポイントは元の表記を残す', () => {
    expect(decodeHtmlEntities('&#99999999;')).toBe('&#99999999;');
  });
});

describe('cleanHtmlText', () => {
  it('タグを除去してテキストだけ取り出す', () => {
    expect(cleanHtmlText(' <a href="/movie/1/">作品名</a> ')).toBe('作品名');
  });

  it('&nbsp; を落とす', () => {
    expect(cleanHtmlText('&nbsp;')).toBe('');
  });

  /**
   * `[^>]*` が各 `<` から最初の `>` までを消すため、入れ子でもタグは
   * 組み上がらない。
   */
  it('入れ子のタグでもタグが組み上がらない', () => {
    expect(cleanHtmlText('A<<b>script>B')).toBe('Ascript>B');
  });

  /**
   * 正規表現 `/<[^>]*>/g` では閉じ `>` が無い入力に一致せず `<script` が
   * 残っていた（CodeQL `js/incomplete-multi-character-sanitization` の指摘点）。
   * 走査に置き換えたことで `<` は残らない。
   */
  it('閉じられていないタグでも < を残さない', () => {
    expect(cleanHtmlText('a<script')).toBe('ascript');
    expect(cleanHtmlText('<<<a')).toBe('a');
  });

  it('戻り値にタグの開始記号が残らない', () => {
    const inputs = [
      'A<<b>script>B',
      '<scr<a>ipt>alert(1)</script>',
      'X<<<i>i>i>Y',
      'a<script',
      '<',
    ];
    for (const input of inputs) {
      expect(cleanHtmlText(input)).not.toContain('<');
    }
  });

  it('エンティティで表現された < は復号される', () => {
    expect(cleanHtmlText('1 &lt; 2')).toBe('1 < 2');
  });

  it('連続空白は畳まない', () => {
    expect(cleanHtmlText('A  B')).toBe('A  B');
  });
});
