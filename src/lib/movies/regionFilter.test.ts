/**
 * 地域フィルタの原語導出のテスト
 */

import { getExcludedLanguages } from './regionFilter';

/** 中華圏グループの全原語 */
const CHINESE = ['zh', 'cn'];
/** タイ・インドグループの全原語 */
const THAI_INDIAN = [
  'th',
  'hi',
  'te',
  'ta',
  'ml',
  'kn',
  'mr',
  'bn',
  'pa',
  'gu',
];
/** 韓国グループの全原語 */
const KOREA = ['ko'];

describe('getExcludedLanguages', () => {
  it('未指定なら全グループの原語を除外する（一覧の既定）', () => {
    expect(getExcludedLanguages().sort()).toEqual(
      [...KOREA, ...CHINESE, ...THAI_INDIAN].sort(),
    );
  });

  it('空配列なら全グループの原語を除外する', () => {
    expect(getExcludedLanguages([]).sort()).toEqual(
      [...KOREA, ...CHINESE, ...THAI_INDIAN].sort(),
    );
  });

  it('韓国を含めると ko が除外対象から外れる', () => {
    const excluded = getExcludedLanguages(['korea']);

    expect(excluded).not.toContain('ko');
    expect(excluded.sort()).toEqual([...CHINESE, ...THAI_INDIAN].sort());
  });

  it('タイ・インドを含めると該当言語がまとめて除外対象から外れる', () => {
    const excluded = getExcludedLanguages(['thai_indian']);

    expect(excluded.sort()).toEqual([...KOREA, ...CHINESE].sort());
  });

  it('全グループを含めると除外対象が無くなる', () => {
    expect(getExcludedLanguages(['korea', 'chinese', 'thai_indian'])).toEqual(
      [],
    );
  });

  // TMDb は広東語を ISO 639-1 の `zh` ではなく独自コード `cn` で返す。
  // 映画.com の iCal 同期は言語で絞らないため `cn` の行が実在し、
  // グループに含めないと中華圏を未チェックでも一覧に出てしまう（#881）
  it('中華圏を未チェックなら広東語（cn）も除外する', () => {
    expect(getExcludedLanguages()).toContain('cn');
  });

  it('中華圏を含めると北京語・広東語がまとめて除外対象から外れる', () => {
    const excluded = getExcludedLanguages(['chinese']);

    expect(excluded).not.toContain('zh');
    expect(excluded).not.toContain('cn');
    expect(excluded.sort()).toEqual([...KOREA, ...THAI_INDIAN].sort());
  });

  // ヒンディー・テルグ・タミル以外のインド諸語も同じ経路で保存されうる
  it.each(['ml', 'kn', 'mr', 'bn', 'pa', 'gu'])(
    'タイ・インドを未チェックなら %s も除外する',
    (language) => {
      expect(getExcludedLanguages()).toContain(language);
    },
  );
});
