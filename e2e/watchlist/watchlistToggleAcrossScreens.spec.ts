/**
 * ウォッチリストのトグル — 一覧を出す各画面（認証済み / #1056）
 *
 * トグルは `MovieTile` を並べる全画面に出るが、E2E があるのは `/movies/*`
 * （`e2e/movies/watchlistButton.spec.ts`）だけだった。受賞作品・検索・人物・
 * おすすめでは、壊れても誰も気づけない。
 *
 * ⛔ **画面ごとにフックの使われ方が違うので、`/movies/*` が通っても他が
 * 通る保証は無い。**
 *
 * | 画面 | `isInWatchlist` の渡し方 |
 * |---|---|
 * | `awardsPage` | **関数のまま** `memo` した子へ渡す（参照が変わることに依存） |
 * | `searchResults` / `personFilmography` | 真偽値（`isInWatchlist(movie.id)`） |
 * | `recommendationSection` | `useCallback` の依存に持つ |
 *
 * PR #1054 がこの契約を壊したとき（`isInWatchlist` の参照を安定させた）、
 * 落ちたのは `/movies/*` の1本だけだった。受賞作品が同じ壊れ方をしても
 * 検知できない。
 *
 * ⚠️ 共有の `TEST_USER` は使わない（#806 / #793）。ウォッチリストを
 * 書き換えるため、同じユーザーを使う spec を並列実行時に壊す。
 *
 * ⚠️ ボタンは**末尾一致の正規表現**で引く。サイドバーは既に
 * `${作品名}をウォッチリストから削除` という形で、一覧側にも作品名を足す
 * 話が進んでいる（#1047）。完全一致で書くと、そちらが入った瞬間に
 * ここが全部落ちる。
 */

import { test, expect, type Locator, type Page } from '@playwright/test';

import {
  openDedicatedSession,
  type DedicatedSession,
} from '../fixtures/dedicatedSession';
import {
  cleanupWatchlistForUser,
  seedRecommendationsForUser,
} from '../helpers/api';
import { movieTiles } from '../helpers/locators';
import { mockPersonDetail, PERSON_ID } from '../helpers/person';
import { runScopedEmail } from '../helpers/runScope';
import { waitForWriteResponse } from '../helpers/writeResponse';

/** 専用ユーザーの作成（bcrypt）とログイン、4画面の巡回を含む */
test.describe.configure({ mode: 'serial', timeout: 120000 });

const USER = {
  email: runScopedEmail('watchlist-toggle-screens'),
  password: 'WatchlistScreensE2e1',
} as const;

/** 検索語。TMDb に長期間存在する作品が返るもの */
const SEARCH_QUERY = 'バットマン';

/** ウォッチリストAPIレスポンスを待つ */
function waitForWatchlistResponse(page: Page) {
  return waitForWriteResponse(page, {
    urlPart: '/api/watchlist',
    methods: ['POST', 'DELETE'],
    label: 'ウォッチリスト書き込み',
  });
}

/** 追加／削除ボタン（作品名が前に付いても当たるよう末尾一致で引く） */
const addButtonIn = (scope: Locator) =>
  scope.getByRole('button', { name: /ウォッチリストに追加$/ });
const removeButtonIn = (scope: Locator) =>
  scope.getByRole('button', { name: /ウォッチリストから削除$/ });

/**
 * ウォッチリストに追加できる最初のタイルを、位置で固定して返す
 *
 * ⚠️ `filter` で絞ったロケータを使い回さない。追加するとボタン名が
 * 「追加」→「削除」に変わり、**別のタイルを指し始める**
 * （`firstFavoritableTile` / `firstFavoritableAwardTile` と同じ理由）。
 *
 * ⚠️ **1回の走査で決めてはいけない**（#1333 と同じ形）。タイルの枠が出て
 * から操作ボタンが描かれるまでに窓があり、`count()` は待たずに返るので
 * 「タイルはあるがボタンが0件」を掴む。人物ページで実際に踏んだ
 * （失敗時スナップショットにはボタンが写っていた＝描画途中だった）。
 * 走査ごと `expect.poll` で再試行する。
 *
 * ⚠️ 見つからないときは**黙ってスキップしない**。「データが無い」のか
 * 「ボタンが壊れた」のかが区別できなくなる。件数を添えて落とす。
 *
 * ⚠️ ページ全体から探してよい。サイドバー（`watchlistPanel`）の項目は
 * `c_watchlist_item`（`watchlistItem.tsx`）で、`movieTiles` のセレクタ
 * （`c_card` ＋ `c_movie_tile`）に**構造上当たらない**。
 */
async function firstWatchlistableTile(
  page: Page,
  screen: string,
): Promise<Locator> {
  const tiles = movieTiles(page);
  let foundIndex = -1;
  let lastTotal = 0;

  /**
   * ⚠️ **`expect.poll` の `message` に件数を埋め込まない。** オプションは
   * poll が始まる前に組み立てられるので、`lastTotal` は**代入前の 0 のまま
   * 固定される**。常に「総数: 0」と出て、#1333 の「0 件で落ちたのに
   * スクショにはタイルが写っていた」という誤解をそのまま再生産する。
   * 走査を抜けてから、その時点の値で投げる。
   */
  try {
    await expect
      .poll(
        async () => {
          lastTotal = await tiles.count();

          for (let index = 0; index < lastTotal; index += 1) {
            if ((await addButtonIn(tiles.nth(index)).count()) > 0) {
              foundIndex = index;
              return true;
            }
          }

          return false;
        },
        { timeout: 30000 },
      )
      .toBe(true);
  } catch {
    throw new Error(
      `${screen}: ウォッチリストに追加できるタイルが見つかりません` +
        `（最後に数えたタイル総数: ${lastTotal}）。` +
        'データが無いか、ボタンが描画されていません。',
    );
  }

  return tiles.nth(foundIndex);
}

/**
 * 追加 → ラベルが「削除」に変わる → 戻す
 *
 * ⛔ **ラベルの入れ替わりが本題。** 書き込みの成否ではなく、
 * 一覧側のタイルが新しい状態を読み直せているかを見る（#1054 で
 * 詳細モーダルだけが凍ったのがこの経路）。
 */
async function toggleAndExpectLabelSwap(
  page: Page,
  tile: Locator,
  screenshot?: string,
): Promise<void> {
  const added = waitForWatchlistResponse(page);
  await addButtonIn(tile).click();
  await added;

  await expect(removeButtonIn(tile)).toBeVisible({ timeout: 15000 });

  if (screenshot) {
    // ⚠️ ページ全体ではなくタイルだけ撮る。一覧は作品が入れ替わるので、
    //    全体だと毎回ぜんぶ差分になる
    await tile.screenshot({ path: `docs/tmp/e2e-screenshots/${screenshot}` });
  }

  // 片方向だけだと「追加しか効かない」退行に気づけない
  const removed = waitForWatchlistResponse(page);
  await removeButtonIn(tile).click();
  await removed;

  await expect(addButtonIn(tile)).toBeVisible({ timeout: 15000 });
}

test.describe('ウォッチリストのトグル — 一覧を出す各画面', () => {
  /** ログインを1回で済ませるため、spec 全体で1つのページを使い回す */
  let session: DedicatedSession;
  let page: Page;

  test.beforeAll(async ({ browser }, testInfo) => {
    // describe の timeout はテストにしか効かない
    testInfo.setTimeout(120000);

    session = await openDedicatedSession(browser, USER);
    page = session.page;

    // 人物ページは TMDb のレート制限で出演作が揺れる。表示を固定する
    await mockPersonDetail(page);
  });

  test.afterAll(async () => {
    // おすすめ・お気に入りは ON DELETE CASCADE で一緒に消える
    await session?.close();
  });

  test.beforeEach(async () => {
    await cleanupWatchlistForUser(session.userId);
  });

  /**
   * `awardsPage.tsx` は `isInWatchlist` を**関数のまま** `memo` した
   * `AwardSection` へ渡している（他3画面は真偽値）。
   *
   * ⚠️ **ただしこのテストが固定しているのは「関数渡し＋memo の契約」では
   * ない。** `useWatchlistToggle` の `version` 依存を外す変異を入れても
   * 4本とも通る（実測）。`isInWatchlist` の deps には `resolveWatchlistId`
   * があり、`onMutate` が照会キャッシュを同期で書き換えるため、`version`
   * が無くても参照は変わる。
   *
   * ここで守れているのは**各画面でトグルが実際に動くこと**まで。契約
   * そのものを固定したいなら `useWatchlistToggle.test.ts` に awards と
   * 同じ形（関数を memo 化した子へ渡す）を足すのが確実。
   */
  test('受賞作品（関数のまま memo へ渡している）', async () => {
    await page.goto('/awards');

    await toggleAndExpectLabelSwap(
      page,
      await firstWatchlistableTile(page, '/awards'),
      'watchlist-toggle-awards.png',
    );
  });

  test('検索結果（真偽値を渡している）', async () => {
    await page.goto(`/search?query=${encodeURIComponent(SEARCH_QUERY)}`);

    await toggleAndExpectLabelSwap(
      page,
      await firstWatchlistableTile(page, '/search'),
      'watchlist-toggle-search.png',
    );
  });

  test('人物の出演作（真偽値を渡している）', async () => {
    await page.goto(`/person/${PERSON_ID}`);

    await toggleAndExpectLabelSwap(
      page,
      await firstWatchlistableTile(page, `/person/${PERSON_ID}`),
      'watchlist-toggle-person.png',
    );
  });

  /**
   * ⚠️ おすすめは SSR 表示で、お気に入りが1件も無いとセクションごと出ない。
   * 先にシードしてから開く。
   */
  test('おすすめ（useCallback の依存に持っている）', async () => {
    await seedRecommendationsForUser(session.userId);

    await page.goto('/');

    const section = page.getByRole('region', { name: 'あなたへのおすすめ' });
    await expect(section).toBeVisible({ timeout: 15000 });

    const tile = section.getByRole('listitem').first();
    await expect(addButtonIn(tile)).toBeVisible({ timeout: 15000 });

    await toggleAndExpectLabelSwap(
      page,
      tile,
      'watchlist-toggle-recommendations.png',
    );
  });
});
