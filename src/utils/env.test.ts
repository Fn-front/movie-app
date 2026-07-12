/**
 * @jest-environment node
 */

/**
 * 環境変数ユーティリティのテスト
 */

import { getRequiredEnv } from './env';

describe('getRequiredEnv', () => {
  const TEST_KEY = 'TEST_REQUIRED_ENV_VALUE';

  afterEach(() => {
    delete process.env[TEST_KEY];
  });

  it('設定済みの環境変数を返す', () => {
    process.env[TEST_KEY] = 'https://example.test';

    expect(getRequiredEnv(TEST_KEY)).toBe('https://example.test');
  });

  it('未設定の場合はエラーを投げる', () => {
    delete process.env[TEST_KEY];

    expect(() => getRequiredEnv(TEST_KEY)).toThrow(
      `Required environment variable "${TEST_KEY}" is not set`,
    );
  });

  it('空文字の場合はエラーを投げる', () => {
    process.env[TEST_KEY] = '';

    expect(() => getRequiredEnv(TEST_KEY)).toThrow(TEST_KEY);
  });
});
