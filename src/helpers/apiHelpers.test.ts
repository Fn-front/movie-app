/**
 * @jest-environment node
 */

/**
 * apiHelpers テスト
 */

import { conflictResponse, notFoundResponse } from './apiHelpers';

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
