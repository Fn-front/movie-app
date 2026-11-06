import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

import { E2E_GA_MEASUREMENT_ID } from './e2e/cookieConsent/constants';
import { RUN_CLIENT_IP } from './e2e/helpers/runScope';

/**
 * .env.localから環境変数を読み込む
 */
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const isCI = !!process.env.CI;

/**
 * GA4 を有効にした E2E の設定（#931）
 *
 * 通常の E2E（`playwright.config.ts`）は `NEXT_PUBLIC_GA_ID` を空にして GA と
 * 同意UIをまるごと無効化している。そのため同意バナー・`consent default` /
 * `consent update`・`_ga` Cookie は一度も実ブラウザで検証できていなかった。
 * この config だけが GA を有効にしたサーバーを立て、`e2e/cookieConsent/` の
 * spec を実行する。
 *
 * **config を分ける理由**: `webServer` は config 単位の設定で、project ごとに
 * サーバーの env を変えられない。既存 config に相乗りすると全 project が GA
 * 有効になってしまう。ポートも 3000 と分けて同時に起動できるようにしている。
 *
 * ⚠️ **run スコープを必ず分けること。** `e2e/helpers/runScope.ts` は
 * `E2E_RUN_ID` が無いと CI で `GITHUB_RUN_ID` × `GITHUB_RUN_ATTEMPT` から
 * 導出するが、これは同じ CI run の中の**別ジョブでも同じ値**になる。通常の
 * E2E と run 固有識別子（メールアドレス・送信元IP・`movie_cache` のID領域）を
 * 共有してしまい、片方の teardown がもう片方のユーザーを消す。
 * `npm run test:e2e:ga` が既定値 `ga` を渡し、CI は `e2e.yml` の `e2e-ga`
 * ジョブがジョブ固有の値を渡している。
 */

/**
 * 既存 E2E（3000番）とポートを分ける
 *
 * ⚠️ ポートを分けても、**同一チェックアウトから `next dev` を2つ同時に起動しては
 * いけない。** どちらも同じ `.next` へ書き、Next.js は distDir の中身を随時
 * 削除する（`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/distDir.md:20`）。
 * CI は別ランナーなので無関係。ローカルで両方回すときは順番に流すこと。
 */
const PORT = 3001;

const BASE_URL = `http://localhost:${PORT}`;

/**
 * run スコープが通常の E2E と衝突していないことを保証する
 *
 * `e2e/helpers/runScope.ts` は import 時に `E2E_RUN_ID` を読んで確定させるため、
 * ここで既定値を**入れることはできない**（この config より先に評価される）。
 * 未設定のまま走ると `local` になり、通常のローカル E2E と run 固有の識別子
 * （メールアドレス・送信元IP・`movie_cache` のID領域）が完全に一致して、
 * 片方の teardown がもう片方のユーザーを消す。黙って壊れるより落とす。
 */
if (!process.env.E2E_RUN_ID) {
  throw new Error(
    'playwright.ga.config.ts は E2E_RUN_ID が必要です。' +
      '`npm run test:e2e:ga`（既定値 `ga` を渡す）経由で実行するか、' +
      '`E2E_RUN_ID=<通常のE2Eと異なる値>` を環境変数で渡してください。',
  );
}

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',
  // GA 有効を前提にする spec だけを対象にする。
  // setup / cleanup プロジェクトは各自の testMatch で上書きする
  testMatch: '**/cookieConsent/**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : undefined,
  // 既存 config の成果物と混ざらないよう、1階層掘った場所へ出す
  // （`/playwright-report` と `/test-results` は .gitignore 済み）
  outputDir: 'test-results/ga',
  reporter: isCI
    ? [
        ['github'],
        ['json', { outputFile: 'playwright-report/ga/results.json' }],
      ]
    : [['html', { outputFolder: 'playwright-report/ga' }]],
  // gtag.js の取得が挟まるぶん、既定の30秒では足りないことがある
  timeout: 60000,
  expect: {
    timeout: 15000,
  },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // 送信元IP単位のレート制限を run ごとに分ける（#793）。
    // 詳細は playwright.config.ts の同じ設定を参照
    extraHTTPHeaders: { 'x-forwarded-for': RUN_CLIENT_IP },
  },

  projects: [
    /**
     * setupプロジェクト: レート制限カウンタのリセットのみ
     *
     * 共有テストユーザーと storageState は作らない（`global.setup.ts` との違い）。
     * この config の spec は未認証で動くか、`openDedicatedSession` で専用ユーザーを
     * 作るかのどちらかで、共有ユーザーを使うものが無いため。
     */
    {
      name: 'setup',
      testMatch: /cookieConsent\/consent\.setup\.ts/,
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
     * Chromium のみ
     *
     * 同意UIの挙動はブラウザ差ではなく実装で決まるため、3ブラウザへ広げても
     * 得られる情報が増えない。外部（googletagmanager.com）への依存がある分、
     * 実行回数は絞る。
     *
     * storageState は空で固定する。同意バナーは未決定のときだけ出るので、
     * ログイン済みの状態を既定にすると「誰の意思表示か」を各 spec が
     * 意識しないまま書けてしまう。認証が要る spec は専用ユーザーを作る。
     */
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: { cookies: [], origins: [] },
      },
      dependencies: ['setup'],
    },
  ],

  webServer: {
    command: isCI
      ? `npm start -- --port ${PORT}`
      : `npm run dev -- --port ${PORT}`,
    url: BASE_URL,
    // ⚠️ 既存サーバーを使い回さない。`NEXT_PUBLIC_*` はビルド時／コンパイル時に
    // 静的置換されるため、GA 無効で起動済みのサーバーを拾うと同意UIが
    // 描画されず、全 spec が「バナーが出ない」で落ちる。原因を取り違えやすいので、
    // ポートが塞がっているときは起動失敗にして気づけるようにする
    reuseExistingServer: false,
    // 本番ビルドの起動（CI）と初回コンパイル（ローカル）の両方を見込む
    timeout: 180000,
    env: {
      // OTPフローE2E用。playwright.config.ts と同じ理由（実送信のスキップ）
      E2E_TEST_MODE: 'true',
      OTP_EMAIL_TEST_BYPASS: 'true',
      // この config の存在理由。ローカル（next dev）はこの値でコンパイルされる。
      // CI（next start）はビルド済みバンドルを起動するだけなので効かず、
      // `e2e.yml` の build step に同じ値を渡すことが根拠になる
      NEXT_PUBLIC_GA_ID: E2E_GA_MEASUREMENT_ID,
      // ポートが 3000 ではないため、NextAuth の既定値と食い違わないよう明示する
      NEXTAUTH_URL: BASE_URL,
      AUTH_TRUST_HOST: 'true',
    },
  },
});
