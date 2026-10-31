/**
 * 原題提案の引き継ぎ E2Eテスト（認証必須）
 *
 * 「0件 → 提案クリック → 別キーワードで0件」の一連を回帰防止する（#824）。
 * 提案クリック時に sessionStorage へ候補を保持する実装が、どのクエリに対する
 * 候補かを持っていなかったため、別キーワードで0件になってもAI提案が再実行されず、
 * 無関係な前回の候補が表示され続けていた。
 *
 * 既存の `search.spec.ts` は未認証固定（提案APIは認証必須）のため、専用ユーザーの
 * セッションを別に用意する。提案APIは `page.route` でスタブし、OpenAI を叩かない。
 */

import { test, expect, type Page } from '@playwright/test';

import { TITLE_SUGGESTION } from '../../src/constants/titleSuggestion';
import {
  openDedicatedSession,
  type DedicatedSession,
} from '../fixtures/dedicatedSession';
import { runScopedEmail } from '../helpers/runScope';

/** 1つのページをログイン済みのまま使い回すため直列で回す */
test.describe.configure({ mode: 'serial', timeout: 120000 });

/** 本 spec 専用のユーザー（run 単位。理由は runScope.ts を参照／#793） */
const USER = {
  email: runScopedEmail('e2e-title-suggestion'),
  password: 'E2eSuggestPass123!',
};

const SUGGEST_ENDPOINT = '**/api/movies/suggest-title*';

/** TMDbで確実に0件になるキーワード */
const NO_HIT_A = 'zzzqqxyz存在しない映画A';
const NO_HIT_B = 'zzzqqxyz存在しない映画B';

/** スタブが返す1件目の候補。クエリから一意に決まるので取り違えを検出できる */
function stubbedSuggestionFor(query: string): string {
  return `ORIGINALOF ${query}`;
}

/** スタブが返す2件目の候補。1件目をクリックした後に残るべきもの */
function altSuggestionFor(query: string): string {
  return `ALTOF ${query}`;
}

/**
 * 原題提案APIをスタブし、呼ばれたクエリを記録する
 *
 * OpenAI を叩かないだけでなく、「どのクエリに対して提案が走ったか」を
 * 直接観測できるようにする。
 *
 * @param page - 対象ページ
 * @param suggestionsFor - クエリに対して返す候補。既定は2件
 */
async function stubSuggestApi(
  page: Page,
  suggestionsFor: (query: string) => string[] = (query) => [
    stubbedSuggestionFor(query),
    altSuggestionFor(query),
  ],
): Promise<{ queries: string[] }> {
  const queries: string[] = [];

  await page.route(SUGGEST_ENDPOINT, async (route) => {
    const query =
      new URL(route.request().url()).searchParams.get('query') ?? '';
    queries.push(query);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { suggestions: suggestionsFor(query), cached: true },
      }),
    });
  });

  return { queries };
}

/** ヘッダーの検索バーから検索する */
async function searchFromHeader(page: Page, query: string): Promise<void> {
  await page.getByLabel('映画を検索').fill(query);
  await page.getByLabel('映画を検索').press('Enter');
  await page.waitForURL(`**/search?query=${encodeURIComponent(query)}`);
}

test.describe('原題提案の引き継ぎ', () => {
  let session: DedicatedSession;
  let page: Page;

  test.beforeAll(async ({ browser }, testInfo) => {
    // describe の timeout はテストにしか効かない。ユーザー作成（bcrypt）と
    // ログイン（初回アクセスのコンパイル待ちを含む）は既定の30秒に収まらない
    testInfo.setTimeout(120000);

    session = await openDedicatedSession(browser, USER);
    page = session.page;
  });

  test.afterAll(async () => {
    await session.close();
  });

  test.beforeEach(async () => {
    // 前のテストが残した引き継ぎ候補を持ち越さない
    await page.goto('/');
    await page.evaluate(() => window.sessionStorage.clear());
  });

  test('提案クリック後に別キーワードで0件になると、そのキーワードの提案が出る', async () => {
    const suggest = await stubSuggestApi(page);

    try {
      // 1. 0件のキーワードAで検索 → Aに対する提案が出る
      await page.goto(`/search?query=${encodeURIComponent(NO_HIT_A)}`);
      const candidateA = page.getByRole('button', {
        name: stubbedSuggestionFor(NO_HIT_A),
      });
      await expect(candidateA).toBeVisible({ timeout: 20000 });
      expect(suggest.queries).toEqual([NO_HIT_A]);

      // 2. 候補をクリック → 遷移先では残りの候補だけを表示し、AIを呼び直さない。
      //    クリック済みの候補は押しても同じURLなので選択肢から外す（#887）
      await candidateA.click();
      await page.waitForURL(
        `**/search?query=${encodeURIComponent(stubbedSuggestionFor(NO_HIT_A))}`,
      );
      await expect(
        page.getByRole('button', { name: altSuggestionFor(NO_HIT_A) }),
      ).toBeVisible();
      await expect(candidateA).toBeHidden();
      expect(suggest.queries).toEqual([NO_HIT_A]);

      // 3. 別のキーワードBで検索 → Bに対する提案が走る（ここが#824の不具合）
      await searchFromHeader(page, NO_HIT_B);

      await expect(
        page.getByRole('button', { name: stubbedSuggestionFor(NO_HIT_B) }),
      ).toBeVisible({ timeout: 20000 });
      expect(suggest.queries).toEqual([NO_HIT_A, NO_HIT_B]);

      // 4. Aの候補は残らない
      await expect(candidateA).toBeHidden();
      await expect(
        page.getByRole('button', { name: altSuggestionFor(NO_HIT_A) }),
      ).toBeHidden();
    } finally {
      await page.unroute(SUGGEST_ENDPOINT);
    }
  });

  test('候補が1件だけで遷移先も0件なら、もしかして自体を表示しない', async () => {
    // 候補1件のみ。クリック済みを外すと表示できる候補が無くなる（#887）
    const suggest = await stubSuggestApi(page, (query) => [
      stubbedSuggestionFor(query),
    ]);

    try {
      await page.goto(`/search?query=${encodeURIComponent(NO_HIT_A)}`);
      const candidateA = page.getByRole('button', {
        name: stubbedSuggestionFor(NO_HIT_A),
      });
      await expect(candidateA).toBeVisible({ timeout: 20000 });

      await candidateA.click();
      await page.waitForURL(
        `**/search?query=${encodeURIComponent(stubbedSuggestionFor(NO_HIT_A))}`,
      );

      await expect(
        page.getByText('検索結果が見つかりませんでした'),
      ).toBeVisible({ timeout: 20000 });
      await expect(candidateA).toBeHidden();
      await expect(page.getByText('もしかして:')).toBeHidden();
      // 遷移先でAIを呼び直さない（#824のコスト抑制を維持する）
      expect(suggest.queries).toEqual([NO_HIT_A]);
    } finally {
      await page.unroute(SUGGEST_ENDPOINT);
    }
  });

  test('旧形式の保存値が残っていても提案が実行される', async () => {
    const suggest = await stubSuggestApi(page);

    try {
      // デプロイをまたいで開かれたままのタブを再現する（裸の配列）
      await page.evaluate(
        (key) =>
          window.sessionStorage.setItem(
            key,
            JSON.stringify(['古い候補1', '古い候補2']),
          ),
        TITLE_SUGGESTION.STORAGE_KEY,
      );

      await page.goto(`/search?query=${encodeURIComponent(NO_HIT_A)}`);

      await expect(
        page.getByRole('button', { name: stubbedSuggestionFor(NO_HIT_A) }),
      ).toBeVisible({ timeout: 20000 });
      expect(suggest.queries).toEqual([NO_HIT_A]);

      // 不正値は自己修復として取り除く
      await expect
        .poll(() =>
          page.evaluate(
            (key) => window.sessionStorage.getItem(key),
            TITLE_SUGGESTION.STORAGE_KEY,
          ),
        )
        .toBeNull();
      await expect(
        page.getByRole('button', { name: '古い候補1' }),
      ).toBeHidden();
    } finally {
      await page.unroute(SUGGEST_ENDPOINT);
    }
  });
});
