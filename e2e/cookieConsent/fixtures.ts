/**
 * GA 有効 E2E の共通部品（#931）
 *
 * `playwright.ga.config.ts` から実行される spec だけが使う。通常の E2E は
 * GA を無効にしたサーバーで動くため、ここのロケータは何も掴めない。
 */

import {
  test as base,
  expect,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
  type Request,
} from '@playwright/test';

import { ARIA_LABELS } from '@/constants';
import { STORAGE_KEYS } from '@/constants/common';
import { COOKIE_CONSENT_VERSION } from '@/constants/user';

import {
  openDedicatedSession,
  type DedicatedSession,
} from '../fixtures/dedicatedSession';
import type { DedicatedUser } from '../helpers/dedicatedUser';

import { E2E_GA_MEASUREMENT_ID, GA_COOKIE_NAMES } from './constants';

export { E2E_GA_MEASUREMENT_ID, GA_COOKIE_NAMES };

/**
 * 遮断する GA の通信
 *
 * 実測で収集ビーコンは **2ホスト** へ飛ぶ（`www.google-analytics.com/g/collect`
 * と `www.google.com/g/collect`。後者はクエリに `gaf=1` が付く）。ホストを
 * 列挙せずパスで絞ることで、どちらも1つのパターンで捕まる。
 *
 * ⚠️ `googletagmanager.com` ごと遮断してはいけない。`_ga` Cookie を書くのは
 * gtag.js 本体なので、遮断すると Cookie の検証が原理的に成立しなくなる。
 * 逆に `google-analytics.com` は丸ごと止めてよい（Cookie の読み書きはすべて
 * クライアント側の JS で完結するため、計測の送信先を塞いでも検証に影響しない）。
 */
const BLOCKED_PATTERNS = [
  // 計測の送信先はホストごと塞ぐ（region1.* などのリージョン別ホストも含む）
  '**google-analytics.com/**',
  // google.com 側へ飛ぶぶんはパスで絞る
  '**/g/collect*',
  '**/j/collect*',
  '**/ccm/collect*',
] as const;

/** GA の収集エンドポイントのパス */
const COLLECT_PATHS = ['/g/collect', '/j/collect', '/ccm/collect'];

/** gtag.js 本体のURL判定 */
function isGtagScript(url: string): boolean {
  return url.includes('googletagmanager.com/gtag/js');
}

/**
 * 計測の送信とみなす URL かどうか
 *
 * **遮断（glob）とは別経路で判定する。** 同じ定義を使うと「glob の書き方が
 * ずれた」以外の取りこぼしに気づけない。ここではホスト（`google-analytics.com`
 * とそのサブドメイン）と収集パスの**どちらか**に当たれば検知する。
 *
 * `new URL` は `request.url()` が常に絶対URLなので実際には throw しないが、
 * これは EventEmitter のリスナから呼ばれる。例外が出るとテスト失敗ではなく
 * **ワーカープロセスごと落ちる**ため、握りつぶす。
 */
function isAnalyticsBeacon(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url);
    if (/(^|\.)google-analytics\.com$/.test(hostname)) return true;
    return COLLECT_PATHS.includes(pathname);
  } catch {
    return false;
  }
}

/** GA の挙動を観測するためのプローブ */
export interface GaProbe {
  /** 遮断した通信のURL（ネットワークへは出ていない） */
  readonly blockedBeacons: string[];
  /** 遮断をすり抜けて**実際に完了した**計測の送信。常に空であること */
  readonly escapedBeacons: string[];
  /** gtag.js 本体のレスポンス */
  readonly gtagScriptResponses: { url: string; status: number }[];
  /** すり抜けが無かったことを検証する */
  expectNoBeaconEscaped(): void;
}

/**
 * コンテキストに GA のプローブを仕掛ける
 *
 * 既定のコンテキストには `ga` fixture が自動で仕掛ける。`openDedicatedSession`
 * のように自前でコンテキストを作る spec は、最初のナビゲーションより前に
 * これを直接呼ぶこと。
 *
 * @param context - 対象のブラウザコンテキスト
 */
export async function attachGaProbe(context: BrowserContext): Promise<GaProbe> {
  const blockedBeacons: string[] = [];
  const escapedBeacons: string[] = [];
  const gtagScriptResponses: { url: string; status: number }[] = [];

  for (const pattern of BLOCKED_PATTERNS) {
    await context.route(pattern, async (route) => {
      blockedBeacons.push(route.request().url());
      await route.abort();
    });
  }

  // 遮断が取りこぼしたときに気づくための独立した検査。判定を glob ではなく
  // URL の解析で行うことで、パターンの書き方に依存しない網を張る。
  // abort したリクエストは requestfailed になるため、ここには現れない
  context.on('requestfinished', (request: Request) => {
    if (isAnalyticsBeacon(request.url())) escapedBeacons.push(request.url());
  });

  context.on('response', (response) => {
    if (isGtagScript(response.url())) {
      gtagScriptResponses.push({
        url: response.url(),
        status: response.status(),
      });
    }
  });

  return {
    blockedBeacons,
    escapedBeacons,
    gtagScriptResponses,
    expectNoBeaconEscaped() {
      expect(
        escapedBeacons,
        'ダミー測定IDのヒットが実際に Google へ送信されている',
      ).toEqual([]);
    },
  };
}

/**
 * GA 有効 E2E 用の test
 *
 * `ga` は auto fixture なので、spec が受け取らなくても収集ビーコンは遮断される。
 * 「遮断を書き忘れた spec だけが実送信する」事故を防ぐため。
 */
export const test = base.extend<{ ga: GaProbe }>({
  ga: [
    async ({ context }, use) => {
      const probe = await attachGaProbe(context);
      await use(probe);
      probe.expectNoBeaconEscaped();
    },
    { auto: true },
  ],
});

export { expect };

/** プローブ付きの専用ユーザーセッション */
export interface GaDedicatedSession {
  session: DedicatedSession;
  probe: GaProbe;
}

/**
 * 専用ユーザーのセッションを、プローブを仕掛けた状態で開く
 *
 * 認証が要る spec は `openDedicatedSession` を直接呼ばずこちらを使うこと。
 * 素で呼ぶと `attachGaProbe` を忘れたときに**遮断も検知も効かない**まま
 * 通ってしまう（`ga` auto fixture は既定のコンテキストにしか効かない）。
 *
 * 遮断はログインの**前**に張る。ログイン画面でも gtag.js は動くため、
 * ログイン後に張ると最初のページビューを取りこぼす。
 *
 * @param browser - `beforeAll` が受け取る browser
 * @param user - 作成する専用ユーザー。メールは `runScopedEmail()` で作る
 */
export async function openGaDedicatedSession(
  browser: Browser,
  user: DedicatedUser,
): Promise<GaDedicatedSession> {
  let probe: GaProbe | null = null;

  const session = await openDedicatedSession(browser, user, async (context) => {
    probe = await attachGaProbe(context);
  });

  if (probe === null) {
    throw new Error('attachGaProbe が呼ばれませんでした');
  }

  return { session, probe };
}

/** 端末に保存された同意レコード（localStorage の生値） */
export interface StoredConsent {
  state: string | null;
  at: string | null;
  owner: string | null;
  version: string | null;
}

/** 同意レコードの localStorage キー（ブラウザ側へ渡すために平坦化する） */
const CONSENT_KEYS = {
  state: STORAGE_KEYS.COOKIE_CONSENT,
  at: STORAGE_KEYS.COOKIE_CONSENT_AT,
  owner: STORAGE_KEYS.COOKIE_CONSENT_OWNER,
  version: STORAGE_KEYS.COOKIE_CONSENT_VERSION,
} as const;

/** 現行版の文字列表現（localStorage は文字列しか持てない） */
export const CURRENT_CONSENT_VERSION = String(COOKIE_CONSENT_VERSION);

/**
 * 同意レコードを端末へ書き込んでから再読み込みする
 *
 * `<head>` のブートストラップは localStorage を**同期読み**して
 * `consent default` を決めるため、書き込んだだけでは反映されない。
 * 必ずリロードを挟む。
 *
 * `context.addInitScript` を使わないのは、あちらが**全ナビゲーションで再実行**
 * されるため。撤回したあとにページ遷移すると同意が書き戻ってしまう。
 *
 * @param page - 対象ページ（対象オリジンを開いていること）
 * @param record - 書き込む値。`null` はキーを消す
 */
export async function seedStoredConsentAndReload(
  page: Page,
  record: StoredConsent,
): Promise<void> {
  await page.evaluate(
    ({ keys, value }) => {
      const put = (key: string, next: string | null) => {
        if (next === null) {
          localStorage.removeItem(key);
          return;
        }
        localStorage.setItem(key, next);
      };
      put(keys.owner, value.owner);
      put(keys.version, value.version);
      put(keys.at, value.at);
      put(keys.state, value.state);
    },
    { keys: CONSENT_KEYS, value: record },
  );

  await page.reload();
}

/** 端末に保存された同意レコードを読む */
export async function readStoredConsent(page: Page): Promise<StoredConsent> {
  return page.evaluate(
    (keys) => ({
      state: localStorage.getItem(keys.state),
      at: localStorage.getItem(keys.at),
      owner: localStorage.getItem(keys.owner),
      version: localStorage.getItem(keys.version),
    }),
    CONSENT_KEYS,
  );
}

/** dataLayer へ積まれた `consent` コマンド */
export interface ConsentCommand {
  /** `default` か `update` */
  action: string;
  /** パラメータ（値はすべて文字列へ正規化する） */
  params: Record<string, string>;
}

/**
 * dataLayer から `consent` コマンドだけを取り出す
 *
 * dataLayer の要素は Arguments オブジェクトで、gtag.js が内部で積む要素には
 * 循環参照を含むものがある。配列ごと返すと Playwright のシリアライズが
 * 失敗しうるので、**ブラウザ側で文字列へ落としてから**返す。
 */
export async function readConsentCommands(
  page: Page,
): Promise<ConsentCommand[]> {
  return page.evaluate(() => {
    const layer =
      (window as unknown as { dataLayer?: ArrayLike<unknown>[] }).dataLayer ??
      [];

    const commands: { action: string; params: Record<string, string> }[] = [];

    for (const raw of Array.from(layer)) {
      let entry: unknown[];
      try {
        entry = Array.from(raw as ArrayLike<unknown>);
      } catch {
        continue;
      }

      if (entry[0] !== 'consent') continue;

      const params: Record<string, string> = {};
      const source = entry[2];
      if (source !== null && typeof source === 'object') {
        for (const [key, value] of Object.entries(
          source as Record<string, unknown>,
        )) {
          params[key] = String(value);
        }
      }

      commands.push({ action: String(entry[1]), params });
    }

    return commands;
  });
}

/** dataLayer へ積まれた `event` コマンド */
export interface EventCommand {
  /** イベント名（`page_view` / `search` など） */
  name: string;
  /** パラメータ（値はすべて文字列へ正規化する） */
  params: Record<string, string>;
}

/**
 * dataLayer から `event` コマンドだけを取り出す
 *
 * `readConsentCommands` と同じ理由でブラウザ側で文字列へ落としてから返す。
 * gtag.js が内部で積む要素には循環参照を含むものがあるため。
 */
export async function readEventCommands(page: Page): Promise<EventCommand[]> {
  return page.evaluate(() => {
    const layer =
      (window as unknown as { dataLayer?: ArrayLike<unknown>[] }).dataLayer ??
      [];

    const commands: { name: string; params: Record<string, string> }[] = [];

    for (const raw of Array.from(layer)) {
      let entry: unknown[];
      try {
        entry = Array.from(raw as ArrayLike<unknown>);
      } catch {
        continue;
      }

      if (entry[0] !== 'event') continue;

      const params: Record<string, string> = {};
      const source = entry[2];
      if (source !== null && typeof source === 'object') {
        for (const [key, value] of Object.entries(
          source as Record<string, unknown>,
        )) {
          params[key] = String(value);
        }
      }

      commands.push({ name: String(entry[1]), params });
    }

    return commands;
  });
}

/** GA が置いた Cookie の名前を昇順で返す */
export async function gaCookieNames(
  context: BrowserContext,
): Promise<string[]> {
  const cookies = await context.cookies();
  return cookies
    .map((cookie) => cookie.name)
    .filter((name) => name.startsWith('_ga'))
    .sort();
}

/**
 * `--cookie-banner-height` の計算値を読む
 *
 * バナーが無いときは `_theme.scss` の `:root` が持つ `0px` に戻る。
 */
export async function readBannerHeightVar(page: Page): Promise<string> {
  return page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue('--cookie-banner-height')
      .trim(),
  );
}

/** 同意バナー */
export function consentBanner(page: Page): Locator {
  return page.getByRole('region', { name: ARIA_LABELS.COOKIE_BANNER });
}

/** バナーの「同意する」 */
export function grantButton(page: Page): Locator {
  return consentBanner(page).getByRole('button', { name: '同意する' });
}

/** バナーの「同意しない」 */
export function denyButton(page: Page): Locator {
  return consentBanner(page).getByRole('button', { name: '同意しない' });
}

/**
 * 撤回トグルのラジオ（`/privacy` と `/settings` で共有）
 *
 * @param page - 対象ページ
 * @param label - `同意する` / `同意しない`
 */
export function consentToggleRadio(page: Page, label: string): Locator {
  return page
    .getByRole('radiogroup', { name: 'アクセス解析Cookieの利用' })
    .getByRole('radio', { name: label });
}
