import { getByteLength } from './string';

describe('getByteLength', () => {
  it('ASCIIは1文字1バイトになる', () => {
    expect(getByteLength('Password1234')).toBe(12);
  });

  it('空文字は0バイトになる', () => {
    expect(getByteLength('')).toBe(0);
  });

  it('日本語は1文字3バイトになる', () => {
    expect(getByteLength('あいうえお')).toBe(15);
  });

  it('絵文字（サロゲートペア）は4バイトになる', () => {
    // String.length は2を返すが、UTF-8 では4バイト
    expect('🎬'.length).toBe(2);
    expect(getByteLength('🎬')).toBe(4);
  });

  it('ASCIIと日本語の混在を合算する', () => {
    expect(getByteLength('Pass1あ')).toBe(8);
  });
});
