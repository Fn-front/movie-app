import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

/**
 * .env.localから環境変数を読み込む
 */
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const isCI = !!process.env.CI;

/**
 * storageStateの保存先パス
 */
export const STORAGE_STATE = path.join(
  __dirname,
  'e2e/.auth/storageState.json',
);

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : undefined,
  reporter: isCI
    ? [['github'], ['json', { outputFile: 'playwright-report/results.json' }]]
    : 'html',
  timeout: 30000,
  expect: {
    timeout: 10000,
  },
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    /**
     * setupプロジェクト: 認証セッションを事前生成
     */
    {
      name: 'setup',
      testMatch: /global\.setup\.ts/,
    },

    /**
     * Chromium（CI・ローカル共通）
     */
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: STORAGE_STATE,
      },
      dependencies: ['setup'],
    },

    /**
     * Firefox（ローカルのみ）
     */
    ...(isCI
      ? []
      : [
          {
            name: 'firefox',
            use: {
              ...devices['Desktop Firefox'],
              storageState: STORAGE_STATE,
            },
            dependencies: ['setup'],
          },
        ]),

    /**
     * WebKit（ローカルのみ）
     */
    ...(isCI
      ? []
      : [
          {
            name: 'webkit',
            use: {
              ...devices['Desktop Safari'],
              storageState: STORAGE_STATE,
            },
            dependencies: ['setup'],
          },
        ]),
  ],

  webServer: {
    command: isCI ? 'npm start' : 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !isCI,
    timeout: 120000,
    // OTPフローE2E用: メール実送信をスキップ（コードはDBから取得して検証）。
    // ローカルで reuseExistingServer 時は、起動済みdevサーバーにも同フラグが必要。
    env: { OTP_EMAIL_TEST_BYPASS: 'true' },
  },
});
