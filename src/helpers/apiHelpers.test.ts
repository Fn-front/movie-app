/**
 * @jest-environment node
 */

/**
 * apiHelpers テスト
 */

import {
  conflictResponse,
  isUniqueViolation,
  notFoundResponse,
} from './apiHelpers';

describe('conflictResponse', () => {
  it('409ステータスのレスポンスを返す', async () => {
    const response = conflictResponse('重複エラー');
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('CONFLICT');
    expect(json.error.message).toBe('重複エラー');
  });
});

describe('isUniqueViolation', () => {
  it('SQLSTATE 23505 の error オブジェクトで true を返す', () => {
    expect(isUniqueViolation({ code: '23505', message: 'duplicate' })).toBe(
      true,
    );
  });

  it('別の SQLSTATE では false を返す', () => {
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(isUniqueViolation({ code: 'PGRST116' })).toBe(false);
  });

  it('null / undefined / プリミティブでは false を返す', () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation('23505')).toBe(false);
    expect(isUniqueViolation(23505)).toBe(false);
  });

  it('code プロパティを持たないオブジェクトでは false を返す', () => {
    expect(isUniqueViolation({})).toBe(false);
    expect(isUniqueViolation(new Error('boom'))).toBe(false);
  });
});

describe('notFoundResponse', () => {
  it('404ステータスのレスポンスを返す', async () => {
    const response = notFoundResponse('見つかりません');
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('NOT_FOUND');
    expect(json.error.message).toBe('見つかりません');
  });
});
