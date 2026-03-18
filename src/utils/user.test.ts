/**
 * ユーザーユーティリティ テスト
 */

import { getInitial } from './user';

describe('getInitial', () => {
  it('名前の先頭文字を大文字で返す', () => {
    expect(getInitial('tanaka')).toBe('T');
  });

  it('既に大文字の場合はそのまま返す', () => {
    expect(getInitial('Yamada')).toBe('Y');
  });

  it('日本語の名前で先頭文字を返す', () => {
    expect(getInitial('太郎')).toBe('太');
  });

  it('空文字の場合は空文字を返す', () => {
    expect(getInitial('')).toBe('');
  });
});
