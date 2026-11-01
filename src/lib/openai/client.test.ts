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

    /**
     * SDK既定（timeout 10分 / maxRetries 2）のままだと1呼び出しが最大30分
     * ブロックしうる。手動同期の失効閾値（AWARD_SYNC_STALE_MINUTES）は
     * 実行時間の上界から導くため、ここが固定されていないと根拠が作れない。
     */
    it('明示的なタイムアウトとリトライ回数を渡す', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const openaiModule = await import('openai');
      const OpenAI = (openaiModule.default ??
        openaiModule) as unknown as jest.Mock;
      const { createOpenAIClient } = await import('./client');

      createOpenAIClient();

      expect(OpenAI).toHaveBeenCalledWith({
        apiKey: 'test-key',
        timeout: 45_000,
        maxRetries: 0,
      });
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
