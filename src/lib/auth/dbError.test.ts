/**
 * @jest-environment node
 */

/**
 * toDbError のテスト
 *
 * 肝は「`Error` のインスタンスであること」。PostgREST の素のオブジェクトを
 * そのまま throw すると、NextAuth の `AuthError` が `cause` へ保存せず
 * ログイン経路で原因が消える
 */

import { toDbError } from './dbError';

const POSTGREST_ERROR = {
  message: 'connection terminated unexpectedly',
  code: '57P01',
};

describe('toDbError', () => {
  it('Error のインスタンスを返す', () => {
    // ここが素のオブジェクトだと NextAuth に握り潰される
    expect(toDbError(POSTGREST_ERROR, 'read user_totp')).toBeInstanceOf(Error);
  });

  it('どの操作で失敗したかとコードをメッセージに残す', () => {
    const error = toDbError(POSTGREST_ERROR, 'read user_totp');

    expect(error.message).toContain('read user_totp');
    expect(error.message).toContain('connection terminated unexpectedly');
    expect(error.message).toContain('57P01');
  });

  it('元のエラーを cause に残す', () => {
    const error = toDbError(POSTGREST_ERROR, 'read user_totp');

    expect(error.cause).toBe(POSTGREST_ERROR);
  });

  it('コードが無くても壊れない', () => {
    const error = toDbError({ message: 'boom' }, 'delete recovery codes');

    expect(error.message).toBe('delete recovery codes: boom');
  });
});
