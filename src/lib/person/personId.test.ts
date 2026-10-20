/**
 * 人物IDパースのテスト
 */

import { parsePersonId } from './personId';

describe('parsePersonId', () => {
  it('10進の正の整数をそのまま数値にする', () => {
    expect(parsePersonId('500')).toBe(500);
    expect(parsePersonId('1')).toBe(1);
  });

  it.each([
    ['非数値', 'abc'],
    ['空文字', ''],
    ['負数', '-1'],
    ['ゼロ', '0'],
    ['小数', '1.5'],
    ['前後の空白', ' 5 '],
    ['指数表記', '1e3'],
    ['先頭ゼロ', '0123'],
    ['16進表記', '0x10'],
    ['全角数字', '５００'],
    ['記号混じり', '12+3'],
  ])('%s は null を返す', (_label, input) => {
    expect(parsePersonId(input)).toBeNull();
  });

  it('安全な整数の範囲を超えるIDは null を返す', () => {
    expect(parsePersonId('9007199254740993')).toBeNull();
  });
});
