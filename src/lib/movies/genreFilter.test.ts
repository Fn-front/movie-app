/**
 * ジャンル一覧フィルタのテスト
 */

import { EXCLUDED_GENRE_IDS } from '@/constants';

import {
  hasExcludedGenre,
  toDisplayGenres,
  toSelectableGenres,
} from './genreFilter';

/** TMDbのジャンル一覧を模した入力 */
const GENRES = [
  { id: 28, name: 'アクション' },
  { id: 18, name: 'ドラマ' },
  { id: 10402, name: '音楽' },
  { id: 99, name: 'ドキュメンタリー' },
  { id: 10770, name: 'テレビ映画' },
];

describe('toSelectableGenres', () => {
  it('除外ジャンルを選択肢から取り除くこと', () => {
    const result = toSelectableGenres(GENRES);

    expect(result.map((genre) => genre.id)).not.toContain(10770);
  });

  it('除外対象以外のジャンルをすべて残すこと', () => {
    const result = toSelectableGenres(GENRES);

    expect(result.map((genre) => genre.id)).toEqual([28, 18, 10402, 99]);
  });

  it('EXCLUDED_GENRE_IDS のすべてが取り除かれること', () => {
    const allExcluded = EXCLUDED_GENRE_IDS.map((id) => ({
      id,
      name: `ジャンル${id}`,
    }));

    expect(toSelectableGenres(allExcluded)).toEqual([]);
  });

  it('空配列を渡しても落ちないこと', () => {
    expect(toSelectableGenres([])).toEqual([]);
  });

  it('name 以外のプロパティを保持すること', () => {
    const withExtra = [{ id: 28, name: 'アクション', extra: 'keep' }];

    expect(toSelectableGenres(withExtra)).toEqual(withExtra);
  });
});

describe('hasExcludedGenre', () => {
  it('除外ジャンルを含む場合 true を返すこと', () => {
    expect(hasExcludedGenre([35, 10751, 10770])).toBe(true);
  });

  it('除外ジャンル単体でも true を返すこと', () => {
    expect(hasExcludedGenre([10770])).toBe(true);
  });

  it('除外ジャンルを含まない場合 false を返すこと', () => {
    expect(hasExcludedGenre([28, 18, 10402])).toBe(false);
  });

  it('空配列の場合 false を返すこと', () => {
    expect(hasExcludedGenre([])).toBe(false);
  });
});

describe('toDisplayGenres', () => {
  it('除外ジャンルを落として表示名を置き換えること', () => {
    expect(
      toDisplayGenres([
        { id: 28, name: 'アクション' },
        { id: 36, name: '履歴' },
        { id: 10770, name: 'TVムービー' },
      ]),
    ).toEqual([
      { id: 28, name: 'アクション' },
      { id: 36, name: '歴史' },
    ]);
  });

  it('上書き対象でない名前はそのまま残ること', () => {
    expect(toDisplayGenres([{ id: 35, name: 'コメディ' }])).toEqual([
      { id: 35, name: 'コメディ' },
    ]);
  });

  // 呼び出し元（/api/movies と /api/movies/genres）が同じ配列を共有するので、
  // 破壊的に書き換えると片方の変更がもう片方に漏れる
  it('入力を破壊しないこと', () => {
    const input = [{ id: 36, name: '履歴' }];

    toDisplayGenres(input);

    expect(input).toEqual([{ id: 36, name: '履歴' }]);
  });

  it('空配列を渡しても空配列を返すこと', () => {
    expect(toDisplayGenres([])).toEqual([]);
  });
});
