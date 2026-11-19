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
 * ローカルの Supabase（`supabase start`）へ向けるかどうか（#1331）
 *
 * CI はランナー内に Supabase を立てて `e2e.yml` が接続先を渡すため、ここは
 * 素通りする。手元で `npm run test:e2e` を叩くと**本番 Supabase を叩く**ので、
 * 向き先を切り替える口を用意する。
 *
 * 使い方はどちらでもよい:
 *   - `.env.local` に `E2E_USE_LOCAL_SUPABASE=true` を書く（以後ずっとローカル）
 *   - `E2E_USE_LOCAL_SUPABASE=true npm run test:e2e`（その場限り）
 *
 * 事前に `supabase start` が要る。
 *
 * ⚠️ 効くのは **webServer が `npm run dev` のとき**＝ローカルの既定の経路だけ。
 *   `NEXT_PUBLIC_*` はビルド時に静的置換されるため、`CI=true`（`npm start`）で
 *   手元の本番ビルドを使うと **URL だけ `.env.local` の本番のまま**になり、
 *   サーバーはローカルの鍵を本番URLへ送って `Invalid API key` で落ちる。
 *   手元で本番ビルドを使いたいなら build にも同じ値を渡すこと:
 *     E2E_USE_LOCAL_SUPABASE=true NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
 *       NEXT_PUBLIC_SUPABASE_ANON_KEY=<下の anonKey> npm run build
 *   CI は `e2e.yml` が build step に接続先を渡しているので問題ない。
 */
const useLocalSupabase = process.env.E2E_USE_LOCAL_SUPABASE === 'true';

/**
 * ローカル Supabase の接続情報
 *
 * ⚠️ これはシークレットではない。Supabase CLI が**全ユーザー共通の固定値**として
 * 配布しているローカル開発用のデモ鍵で、署名鍵も公開されている。
 * 127.0.0.1 のポートにしか通用せず、本番プロジェクトには一切効かない。
 * `.github/workflows/e2e.yml` が平文で持っているのと同じ値・同じ理由。
 */
const LOCAL_SUPABASE = {
  url: 'http://127.0.0.1:54321',
  anonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
  serviceRoleKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
} as const;

if (useLocalSupabase) {
  // ⚠️ `process.env` を書き換えること。`use` や `webServer.env` に足すだけでは
  //   足りない。Playwright は webServer を `{ ...process.env, ...webServer.env }`
  //   で起動する（playwright/lib/plugins/webServerPlugin.js）ため、ここで
  //   process.env を直せば Next.js 側にも同じ値が渡る。
  //
  //   なお `dotenv.config()` は override を指定していないので、**既に
  //   process.env にある値が .env.local より優先される**。つまり
  //   `E2E_USE_LOCAL_SUPABASE=true npm run test:e2e` のような前置きも効く。
  process.env.NEXT_PUBLIC_SUPABASE_URL = LOCAL_SUPABASE.url;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = LOCAL_SUPABASE.anonKey;
  process.env.SUPABASE_SERVICE_ROLE_KEY = LOCAL_SUPABASE.serviceRoleKey;
} else if (!isCI) {
  // 向き先は `.env.local` にあり gitignore されているため、**外から見えない**。
  // 黙って本番を叩くと、run ごとの利用者作成・削除や
  // `runDeleteExpiredRateLimits()` が本番データに届く（#1331）。
  console.warn(
    [
      '',
      '⚠️  E2E が本番 Supabase を向いています。',
      '    ローカルの Supabase で回すなら:',
      '      1. supabase start',
      '      2. .env.local に E2E_USE_LOCAL_SUPABASE=true を追記',
      '    詳細は .claude/rules/testing.md（#1331）',
      '',
    ].join('\n'),
  );
}

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
  // 同意UIの spec は playwright.ga.config.ts が担当する（#931）。この config の
  // サーバーは下の webServer.env で GA を無効にしており、同意バナーも gtag.js も
  // 描画されないため、ここで拾うと必ず落ちる
  testIgnore: '**/cookieConsent/**',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : undefined,
  // CI は `e2e.yml` が `--shard` で分割するため、シャードごとに部分レポート
  // （blob）を出す。PR のサマリに使う `results.json` は、全シャードの blob を
  // 集めた `Playwright E2E` ジョブが `playwright merge-reports` で1つに
  // まとめて生成する（#834）。
  // ⚠️ ここを `json` に戻すとシャードの数だけ部分 JSON ができ、サマリが
  //   1/4 の結果しか映さなくなる
  reporter: isCI ? [['github'], ['blob']] : 'html',
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
    // NEXT_PUBLIC_GA_ID を空にして同意バナーと GA を無効化する。
    // ⚠️ 効くのは Playwright が dev サーバーを新規起動するときだけ。
    //   - reuseExistingServer: !isCI のため、起動済みサーバーには適用されない
    //   - CI は npm start で、NEXT_PUBLIC_* はビルド時に静的置換済み
    // CI で GA が入らない根拠は e2e.yml の build step に渡していないこと。
    // ローカルでは「GA ID 付きの本番ビルドを確認したらサーバーを落としてから
    // E2E を回す」運用で担保する
    env: {
      E2E_TEST_MODE: 'true',
      OTP_EMAIL_TEST_BYPASS: 'true',
      NEXT_PUBLIC_GA_ID: '',
    },
  },
});
