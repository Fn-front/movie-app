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
   * 閉じ `>` が無い入力はタグ除去の正規表現に一致せず、以前は `<script` が
   * 出力に残っていた（CodeQL `js/incomplete-multi-character-sanitization`）。
   */
  it('閉じられていないタグの残骸を残さない', () => {
    expect(cleanHtmlText('a<script')).toBe('ascript');
    expect(cleanHtmlText('<<<a')).toBe('a');
  });

  /**
   * `<` の除去はエンティティ復号より前に行う。順序が逆だと
   * `&lt;` 由来の正当な `<` まで消える。
   */
  it('&lt; 由来の < は残す', () => {
    expect(cleanHtmlText('1 &lt; 2')).toBe('1 < 2');
  });

  it('連続空白は畳まない', () => {
    expect(cleanHtmlText('A  B')).toBe('A  B');
  });
});
