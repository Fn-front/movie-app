/**
 * Auth.js のエラーコード変換のテスト
 */

import { resolveAuthErrorMessage } from './authErrorMessage';

const MESSAGES = {
  Known: '知っているコードの文言',
  DEFAULT: '既定の文言',
} as const;

describe('resolveAuthErrorMessage', () => {
  it('自前で定義したキーはその文言を返す', () => {
    expect(resolveAuthErrorMessage(MESSAGES, 'Known')).toBe(
      '知っているコードの文言',
    );
  });

  it('知らないコードは DEFAULT を返す', () => {
    expect(resolveAuthErrorMessage(MESSAGES, 'Unknown')).toBe('既定の文言');
  });

  it('undefined は DEFAULT を返す', () => {
    expect(resolveAuthErrorMessage(MESSAGES, undefined)).toBe('既定の文言');
  });

  /**
   * プロトタイプ経由の値を返さない（#1240）
   *
   * `in` や素の添字参照だと `Object.prototype` まで辿り、`__proto__` で
   * オブジェクトが、`toString` で関数が返る。React に渡すと
   * 「Objects are not valid as a React child」で描画ごと落ちる。
   * `?error=` の値はそのまま渡るので URL だけで誰でも踏める。
   *
   * ⚠️ `toBe(MESSAGES.DEFAULT)` だけでなく**文字列であること**も見る。
   * 文字列化してから比較する実装に変えられると、前者は素通りする
   */
  it.each([['__proto__'], ['toString'], ['constructor'], ['hasOwnProperty']])(
    '%s は DEFAULT の文字列を返す',
    (code) => {
      const result = resolveAuthErrorMessage(MESSAGES, code);

      expect(typeof result).toBe('string');
      expect(result).toBe('既定の文言');
    },
  );

  it('空文字は DEFAULT を返す', () => {
    expect(resolveAuthErrorMessage(MESSAGES, '')).toBe('既定の文言');
  });
});
