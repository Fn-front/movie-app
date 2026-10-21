import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

import { E2E_RUN_ID, RUN_CLIENT_IP } from './e2e/helpers/runScope';

/**
 * .env.localから環境変数を読み込む
 */
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const isCI = !!process.env.CI;

/**
 * storageStateの保存先パス
 *
 * ログインするユーザーが run ごとに変わるため、保存先も run 単位にする（#793）。
 * 同じチェックアウトで2つの run を同時に流しても、互いのセッションを
 * 上書きしない。
 */
export const STORAGE_STATE = path.join(
  __dirname,
  `e2e/.auth/storageState-${E2E_RUN_ID}.json`,
);

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',
  // E2Eのテスト本体は `*.spec.ts` に限定する。ヘルパーの単体テスト
  // （`*.test.ts`）は Jest が担当するため、Playwright の既定（spec/test 両方を
  // テスト扱い）のままだと両方のランナーが同じファイルを拾ってしまう
  testMatch: '**/*.spec.ts',
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
    // 送信元IP単位のレート制限を run ごとに分ける（#793）。
    // Next.js は x-forwarded-for が無いとソケットの remoteAddress を補うため
    // （node_modules/next/dist/server/base-server.js）、E2Eでは全 run が同じ
    // `::1` になり、共有DB上でカウンタを食い合う。
    extraHTTPHeaders: { 'x-forwarded-for': RUN_CLIENT_IP },
  },

  projects: [
    /**
     * setupプロジェクト: 認証セッションを事前生成
     * 全プロジェクト終了後に cleanup（run固有データの削除）が走る
     */
    {
      name: 'setup',
      testMatch: /global\.setup\.ts/,
      teardown: 'cleanup',
    },

    /**
     * cleanupプロジェクト: この run が共有DBに作ったデータを削除
     */
    {
      name: 'cleanup',
      testMatch: /global\.teardown\.ts/,
    },

    /**
     * Chromium（CI・ローカル共通）
     */
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: STORAGE_STATE,
        // ヘッドレスChromiumでWebGL2を安定して有効化する。
        // CI（GPUなし）では ANGLE + SwiftShader でソフトウェアレンダリングにフォールバックさせ、
        // シアター体験ページ（three.js / WebGL2）の isWebGL2Support ゲートが
        // 安定して true になるようにする（flaky対策）。
        launchOptions: {
          args: [
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            '--ignore-gpu-blocklist',
          ],
        },
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
    // E2E_TEST_MODE=true は positive guard の必須シグナル（これが無いとバイパスは無効）。
    // ローカルで reuseExistingServer 時は、起動済みdevサーバーにも同フラグが必要。
    env: { E2E_TEST_MODE: 'true', OTP_EMAIL_TEST_BYPASS: 'true' },
  },
});
