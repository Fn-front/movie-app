/**
 * @jest-environment node
 */

/**
 * OpenAIクライアント テスト
 */

jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: { completions: { create: jest.fn() } },
  }));
});

const originalClientEnv = process.env;

describe('OpenAI client', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalClientEnv };
  });

  afterAll(() => {
    process.env = originalClientEnv;
  });

  describe('createOpenAIClient', () => {
    it('APIキーが設定されている場合、OpenAIクライアントを返す', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const { createOpenAIClient } = await import('./client');
      const client = createOpenAIClient();

      expect(client).not.toBeNull();
    });

    it('APIキーが未設定の場合、nullを返す', async () => {
      delete process.env.OPENAI_API_KEY;
      const { createOpenAIClient } = await import('./client');
      const client = createOpenAIClient();

      expect(client).toBeNull();
    });

    it('APIキーが空文字の場合、nullを返す', async () => {
      process.env.OPENAI_API_KEY = '';
      const { createOpenAIClient } = await import('./client');
      const client = createOpenAIClient();

      expect(client).toBeNull();
    });
  });

  describe('getOpenAIModel', () => {
    it('環境変数が設定されている場合、その値を返す', async () => {
      process.env.OPENAI_MODEL = 'gpt-4o';
      const { getOpenAIModel } = await import('./client');

      expect(getOpenAIModel()).toBe('gpt-4o');
    });

    it('環境変数が未設定の場合、デフォルト値を返す', async () => {
      delete process.env.OPENAI_MODEL;
      const { getOpenAIModel } = await import('./client');

      expect(getOpenAIModel()).toBe('gpt-4o-mini');
    });
  });
});
