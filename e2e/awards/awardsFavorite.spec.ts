/**
 * 受賞作品ページのお気に入り E2Eテスト（認証済み）
 *
 * クリティカルユーザージャーニー:
 * - カードのお気に入りボタンから登録 → 登録済み表示（ハート点灯）に変わる
 * - 続けて同じカードから評価を変更できる（新規登録ではなく更新経路に入る）
 * - 続けて同じカードから解除できる
 *
 * 受賞作品APIは公開API＋共有キャッシュのためお気に入りを返せず、
 * クライアント側で結合している。結合が外れると「登録済みでも未登録表示」になり、
 * そこから押すと重複（409）で何もできなくなる（#830）。
 * 既存の `awards.spec.ts` は未認証専用でこの経路を通らない。
 *
 * 共有テストユーザーのお気に入りを汚さないよう専用セッションで完結させる。
 */

import { test, expect, type Page } from '@playwright/test';

import {
  openDedicatedSession,
  type DedicatedSession,
} from '../fixtures/dedicatedSession';
import { runScopedEmail } from '../helpers/runScope';
import { movieTiles } from '../helpers/locators';
import { waitForWriteResponse } from '../helpers/writeResponse';

test.describe.configure({ mode: 'serial' });

const USER = {
  email: runScopedEmail('awards-favorite'),
  password: 'AwardsFavPassw0rd!',
};

/** お気に入りの書き込みレスポンスを待つ */
function waitForFavoritesResponse(page: Page) {
  return waitForWriteResponse(page, {
    urlPart: '/api/favorites',
    methods: ['POST', 'PATCH', 'DELETE'],
    label: 'お気に入り書き込み',
  });
}

/**
 * お気に入りに追加できる最初のカードを、位置で固定して返す
 *
 * ロケータを `filter` で絞って使い回すと、登録でボタン名が
 * 「追加」→「編集」に変わった瞬間に別のカードを指し始めるため、
 * ここで一度だけ解決する（`firstFavoritableTile` と同じ理由）。
 */
async function firstFavoritableAwardTile(page: Page) {
  const tiles = movieTiles(page);
  await tiles.first().waitFor({ timeout: 30000 });

  const total = await tiles.count();

  for (let index = 0; index < total; index += 1) {
    const tile = tiles.nth(index);
    const addButton = tile.getByRole('button', { name: 'お気に入りに追加' });

    if ((await addButton.count()) > 0) return tile;
  }

  throw new Error(
    `お気に入りに追加できる受賞作品カードが見つかりません（カード総数: ${total}）。`,
  );
}

test.describe('受賞作品 — カードからお気に入りを操作する', () => {
  let session: DedicatedSession;

  test.beforeAll(async ({ browser }, testInfo) => {
    // ユーザー作成（bcrypt）と初回アクセスのコンパイル待ちは既定30秒に収まらない
    testInfo.setTimeout(120000);
    session = await openDedicatedSession(browser, USER);
  });

  test.afterAll(async () => {
    await session?.close();
  });

  test('登録 → 登録済み表示 → 評価変更 → 解除まで1枚のカードで完結する', async () => {
    const { page } = session;
    test.setTimeout(120000);

    await page.goto('/awards');

    const tile = await firstFavoritableAwardTile(page);

    // --- 登録 ---
    await tile.getByRole('button', { name: 'お気に入りに追加' }).click();

    const addDialog = page.getByRole('dialog');
    await expect(addDialog).toBeVisible();
    // 未登録なので新規登録の体裁（削除ボタンが無い）
    await expect(
      addDialog.getByRole('button', { name: '削除' }),
    ).toHaveCount(0);

    await addDialog.getByRole('radio', { name: '8点' }).click();
    const added = waitForFavoritesResponse(page);
    await addDialog.getByRole('button', { name: '登録' }).click();
    await added;

    // 結合が効いていればカードのハートが登録済みに変わる
    await expect(
      tile.getByRole('button', { name: 'お気に入りを編集' }),
    ).toBeVisible({ timeout: 15000 });

    // --- 評価変更（登録済みなので POST ではなく PATCH に入る） ---
    await tile.getByRole('button', { name: 'お気に入りを編集' }).click();

    const editDialog = page.getByRole('dialog');
    await expect(editDialog).toBeVisible();
    // 編集モードでは削除ボタンが出る（= currentFavorite が渡っている）
    await expect(
      editDialog.getByRole('button', { name: '削除' }),
    ).toBeVisible();

    await editDialog.getByRole('radio', { name: '5点' }).click();
    const updated = waitForFavoritesResponse(page);
    await editDialog.getByRole('button', { name: '更新' }).click();
    const updateResponse = await updated;

    // 409 になっていたら「未登録扱いで再登録しにいった」ということ
    expect(updateResponse.request().method()).toBe('PATCH');
    await expect(
      tile.getByRole('button', { name: 'お気に入りを編集' }),
    ).toBeVisible();

    // --- 解除 ---
    await tile.getByRole('button', { name: 'お気に入りを編集' }).click();

    const deleteDialog = page.getByRole('dialog');
    await expect(deleteDialog).toBeVisible();
    const removed = waitForFavoritesResponse(page);
    await deleteDialog.getByRole('button', { name: '削除' }).click();
    await removed;

    await expect(
      tile.getByRole('button', { name: 'お気に入りに追加' }),
    ).toBeVisible({ timeout: 15000 });
  });

  test('未登録の作品は新規登録モーダルが開く', async () => {
    const { page } = session;
    test.setTimeout(60000);

    await page.goto('/awards');

    const tile = await firstFavoritableAwardTile(page);
    await tile.getByRole('button', { name: 'お気に入りに追加' }).click();

    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByRole('heading', { name: 'お気に入りに追加' }),
    ).toBeVisible();
    await expect(dialog.getByRole('button', { name: '削除' })).toHaveCount(0);
  });
});
