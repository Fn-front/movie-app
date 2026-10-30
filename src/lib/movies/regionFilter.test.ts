/**
 * 地域フィルタの原語導出のテスト
 */

import { getExcludedLanguages } from './regionFilter';

describe('getExcludedLanguages', () => {
  it('未指定なら全グループの原語を除外する（一覧の既定）', () => {
    expect(getExcludedLanguages().sort()).toEqual(
      ['hi', 'ko', 'ta', 'te', 'th', 'zh'].sort(),
    );
  });

  it('空配列なら全グループの原語を除外する', () => {
    expect(getExcludedLanguages([]).sort()).toEqual(
      ['hi', 'ko', 'ta', 'te', 'th', 'zh'].sort(),
    );
  });

  it('韓国を含めると ko が除外対象から外れる', () => {
    const excluded = getExcludedLanguages(['korea']);

    expect(excluded).not.toContain('ko');
    expect(excluded.sort()).toEqual(['hi', 'ta', 'te', 'th', 'zh'].sort());
  });

  it('タイ・インドを含めると4言語がまとめて除外対象から外れる', () => {
    const excluded = getExcludedLanguages(['thai_indian']);

    expect(excluded.sort()).toEqual(['ko', 'zh'].sort());
  });

  it('全グループを含めると除外対象が無くなる', () => {
    expect(getExcludedLanguages(['korea', 'chinese', 'thai_indian'])).toEqual(
      [],
    );
  });

  it('広東語（cn）は対象に含まれない', () => {
    expect(getExcludedLanguages()).not.toContain('cn');
  });
});
