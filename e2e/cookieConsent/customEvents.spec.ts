/**
 * カスタムイベントと page_location（#938）
 *
 * 単体テストは `sendEvent` / `buildPageLocation` の入出力しか見ない。
 * 「実際に gtag.js が載った状態で、未同意のまま、設計どおりのパラメータだけが
 * dataLayer へ積まれるか」は実ブラウザでしか確かめられない。
 *
 * 特に `page_location` は、`window.location.href` に戻すだけで検索キーワードと
 * パスワード再設定トークンが Google へ渡る状態に逆戻りする
 * （GHSA-9jxw-39j7-v7j6）。単体テストと二重に張っておく。
 *
 * このファイルは GA を有効にした config（`playwright.ga.config.ts`）でのみ
 * 動く。通常の E2E は `NEXT_PUBLIC_GA_ID` が空で gtag 自体が存在しない。
 */

import type { Page } from '@playwright/test';

import {
  consentBanner,
  expect,
  readConsentCommands,
  readEventCommands,
  test,
  type EventCommand,
} from './fixtures';

/** 検索に使うキーワード。dataLayer のどこにも現れてはいけない */
const SEARCH_KEYWORD = 'バットマン';

/** 指定イベントが dataLayer へ積まれるまで待ち、その1件目を返す */
async function waitForEvent(
  page: Page,
  name: string,
): Promise<EventCommand | undefined> {
  await expect
    .poll(async () =>
      (await readEventCommands(page)).some((event) => event.name === name),
    )
    .toBe(true);

  return (await readEventCommands(page)).find((event) => event.name === name);
}

test.describe('GA4 / カスタムイベント', () => {
  test('未同意のまま search を送り、キーワード本文は含めない', async ({
    page,
  }) => {
    await page.goto(
      `/search?query=${encodeURIComponent(SEARCH_KEYWORD)}&page=abc`,
    );

    // 同意していない状態であることを先に固定する。
    // Consent Mode advanced なので、この状態でもイベントは送られる
    await expect(consentBanner(page)).toBeVisible();
    const consent = await readConsentCommands(page);
    expect(consent[0]?.params).toMatchObject({ analytics_storage: 'denied' });

    const search = await waitForEvent(page, 'search');

    expect(search?.params).toEqual({
      has_query: 'true',
      filter_types: 'none',
      // 件数は TMDb の応答次第なので値は見ない。数値であることだけ見る
      results_count: expect.stringMatching(/^\d+$/),
      // ?page=abc は NaN ではなく 1 に丸める
      result_page: '1',
    });
  });

  test('dataLayer のどこにも検索キーワードが現れない', async ({ page }) => {
    // page_location にクエリ文字列を戻すと、ここが落ちる。
    // search イベントのパラメータだけを見ていると page_view 経由の漏れを
    // 見逃すため、dataLayer 全体を文字列化して検査する
    await page.goto(`/search?query=${encodeURIComponent(SEARCH_KEYWORD)}`);
    await waitForEvent(page, 'page_view');

    const events = await readEventCommands(page);
    expect(JSON.stringify(events)).not.toContain(SEARCH_KEYWORD);
    expect(JSON.stringify(events)).not.toContain(
      encodeURIComponent(SEARCH_KEYWORD),
    );
  });

  test('page_location にクエリ文字列を載せない', async ({ page }) => {
    // /auth/reset-password?token=<トークン> も同じ経路で漏れていた。
    // 認証不要で開けるので、トークンらしき値を付けて確かめる
    await page.goto('/auth/reset-password?token=e2e-should-not-be-sent');

    const pageView = await waitForEvent(page, 'page_view');

    expect(pageView?.params.page_location).not.toContain('?');
    expect(pageView?.params.page_location).not.toContain(
      'e2e-should-not-be-sent',
    );
    expect(pageView?.params.page_location).toMatch(/\/auth\/reset-password$/);
    expect(pageView?.params.page_path).toBe('/auth/reset-password');
  });

  /*
    `trailer_open` はここに置かない。

    予告編ボタンは TMDb に YouTube の予告編がある作品にしか出ず、どの作品に
    あるかは TMDb 側のデータ次第で変わる。実際に「バットマン」の検索結果の
    先頭5件はいずれも予告編を持たなかった。作品を固定しても、検索の並びを
    固定しても、外部データが変われば落ちる。

    条件付き skip にすると、ボタンが出なくなった日から黙って素通りし、
    回帰を検知できなくなる（それなら無いほうがよい）。
    `movieDetailContent.test.tsx` の「GA4 計測」が開閉それぞれの挙動を
    押さえているので、そちらに任せる。
  */

  test('未認証でウォッチリストに追加してもイベントを送らない', async ({
    page,
  }) => {
    // 操作が成立しない（ログイン誘導が出る）ので計上もしない
    await page.goto(`/search?query=${encodeURIComponent(SEARCH_KEYWORD)}`);

    const addButton = page
      .getByRole('button', { name: 'ウォッチリストに追加' })
      .first();
    await expect(addButton).toBeVisible();
    await addButton.click();

    await expect
      .poll(async () =>
        (await readEventCommands(page)).some((e) =>
          e.name.startsWith('watchlist_'),
        ),
      )
      .toBe(false);
  });
});
