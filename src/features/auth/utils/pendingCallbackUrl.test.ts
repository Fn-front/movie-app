/**
 * @jest-environment jsdom
 */

import {
  PENDING_CALLBACK_URL_KEY as KEY,
  clearPendingCallbackUrl,
  savePendingCallbackUrl,
  takePendingCallbackUrl,
} from './pendingCallbackUrl';

describe('pendingCallbackUrl', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    jest.restoreAllMocks();
  });

  describe('savePendingCallbackUrl', () => {
    it('戻り先を sessionStorage に預ける', () => {
      savePendingCallbackUrl('/watchlist');

      expect(window.sessionStorage.getItem(KEY)).toBe('/watchlist');
    });

    it('undefined なら何も書かない', () => {
      savePendingCallbackUrl(undefined);

      expect(window.sessionStorage.getItem(KEY)).toBeNull();
    });

    it('空文字なら何も書かない', () => {
      savePendingCallbackUrl('');

      expect(window.sessionStorage.getItem(KEY)).toBeNull();
    });

    it.each([
      ['https://evil.com'],
      ['//evil.com'],
      ['/\\evil.com'],
      ['/auth/signin?next=/watchlist'],
    ])('%s のような危険な値は預けない', (unsafe) => {
      // 取り出す側が1箇所でも検証を忘れた瞬間にオープンリダイレクトになる。
      // sessionStorage は同一オリジンのスクリプトなら誰でも書ける
      savePendingCallbackUrl(unsafe);

      expect(window.sessionStorage.getItem(KEY)).toBeNull();
    });

    it('sessionStorage が例外を投げても呼び出し側へ伝播しない', () => {
      // プライベートブラウジングや容量超過で起きる。戻り先はあれば嬉しい
      // 程度のものなので、ログインを止めてはいけない
      jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

      expect(() => savePendingCallbackUrl('/watchlist')).not.toThrow();
    });
  });

  describe('takePendingCallbackUrl', () => {
    it('預けた戻り先を返す', () => {
      window.sessionStorage.setItem(KEY, '/watchlist');

      expect(takePendingCallbackUrl()).toBe('/watchlist');
    });

    it('読み出したら消す（2回目は undefined）', () => {
      // 残すと、次に別の経路でログイン画面へ来た人が身に覚えのない場所へ飛ぶ
      window.sessionStorage.setItem(KEY, '/watchlist');

      expect(takePendingCallbackUrl()).toBe('/watchlist');
      expect(takePendingCallbackUrl()).toBeUndefined();
      expect(window.sessionStorage.getItem(KEY)).toBeNull();
    });

    it('預けていなければ undefined', () => {
      expect(takePendingCallbackUrl()).toBeUndefined();
    });

    it('sessionStorage が例外を投げたら undefined', () => {
      jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });

      expect(takePendingCallbackUrl()).toBeUndefined();
    });
  });

  /**
   * ソーシャルログインを始められなかったときの巻き戻し（#1292）
   */
  describe('clearPendingCallbackUrl', () => {
    it('預けた戻り先を消す', () => {
      savePendingCallbackUrl('/watchlist');

      clearPendingCallbackUrl();

      expect(takePendingCallbackUrl()).toBeUndefined();
    });

    it('預けていなくても落ちない', () => {
      expect(() => clearPendingCallbackUrl()).not.toThrow();
    });

    it('sessionStorage が例外を投げても呼び出し側へ伝播しない', () => {
      // 消せなくても「始められなかった」こと自体はトーストで伝わる
      jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });

      expect(() => clearPendingCallbackUrl()).not.toThrow();
    });
  });
});
