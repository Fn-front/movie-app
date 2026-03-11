/**
 * @jest-environment node
 */

/**
 * バリデーションヘルパー テスト
 */

import { isValidUuid, invalidUuidResponse } from './validation';

describe('isValidUuid', () => {
  it('有効なUUIDでtrueを返す', () => {
    expect(isValidUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('無効な文字列でfalseを返す', () => {
    expect(isValidUuid('invalid-id')).toBe(false);
  });

  it('空文字でfalseを返す', () => {
    expect(isValidUuid('')).toBe(false);
  });
});

describe('invalidUuidResponse', () => {
  it('400ステータスのエラーレスポンスを返す', async () => {
    const response = invalidUuidResponse('テストメッセージ');
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(json.error.message).toBe('テストメッセージ');
  });
});
