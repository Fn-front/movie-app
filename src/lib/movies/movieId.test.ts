/**
 * 映画IDパースのテスト
 */

import { parseMovieId } from './movieId';

describe('parseMovieId', () => {
  it('10進の正の整数をそのまま数値にする', () => {
    expect(parseMovieId('550')).toBe(550);
    expect(parseMovieId('1')).toBe(1);
  });

  it.each([
    ['非数値', 'abc'],
    ['静的セグメント名', 'now-showing'],
    ['空文字', ''],
    ['負数', '-1'],
    ['ゼロ', '0'],
    ['小数', '1.5'],
    ['前後の空白', ' 5 '],
    ['指数表記', '1e3'],
    ['先頭ゼロ', '0123'],
    ['16進表記', '0x10'],
    ['全角数字', '５５０'],
    ['記号混じり', '12+3'],
  ])('%s は null を返す', (_label, input) => {
    expect(parseMovieId(input)).toBeNull();
  });

  it('安全な整数の範囲を超えるIDは null を返す', () => {
    expect(parseMovieId('9007199254740993')).toBeNull();
  });
});
