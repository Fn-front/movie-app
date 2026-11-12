/**
 * ウォッチリストの前準備フローと、関連オーバーレイのロケータ
 *
 * 「作品を追加する」「視聴済みにする」は複数の spec が必要とする前準備で、
 * 評価モーダル・整理モーダルのロケータも同じものを使う。
 * `e2e/helpers/locators.ts` の方針（2つ以上の spec で使うものは集約する）に
 * 合わせてここへ出している（あちらは純粋なロケータ、こちらは操作を含む）。
 */

import { expect, type Locator, type Page } from '@playwright/test';

import { movieTiles, watchedToggles } from './locators';
import { waitForWriteResponse } from './writeResponse';

/** 評価モーダル。未登録なら「お気に入りに追加」、登録済みなら「お気に入りを編集」 */
export const ratingModal = (page: Page): Locator =>
  page.getByRole('dialog', { name: /お気に入り(に追加|を編集)/ });

/** 視聴済みの一括削除モーダル */
export const cleanupModal = (page: Page): Locator =>
  page.getByRole('dialog', { name: '視聴済みをまとめて削除' });

/**
 * 一覧の先頭の作品をウォッチリストへ追加する（前準備用）
 *
 * 既に入っている場合は何もしない。呼び出し側が事前に
 * `cleanupWatchlistForUser()` する前提だが、そうでない spec から呼んでも
 * 二重追加で落ちないようにしてある。
 *
 * ⚠️ `/movies/now-showing` へ遷移する。履歴の積み方を見る spec から呼ぶときは
 * **この呼び出しより後に**起点のページを開き直すこと
 */
export async function addMovieToWatchlist(page: Page): Promise<void> {
  await page.goto('/movies/now-showing');
  await movieTiles(page).first().waitFor({ timeout: 30000 });

  const firstTile = movieTiles(page).first();
  const addButton = firstTile.getByRole('button', {
    name: 'ウォッチリストに追加',
  });
  const removeButton = firstTile.getByRole('button', {
    name: 'ウォッチリストから削除',
  });

  await expect(addButton.or(removeButton)).toBeVisible({ timeout: 10000 });

  if (await addButton.isVisible().catch(() => false)) {
    const added = waitForWriteResponse(page, {
      urlPart: '/api/watchlist',
      methods: ['POST'],
      label: 'ウォッチリスト追加',
    });
    await addButton.click();
    await added;
    await expect(removeButton).toBeVisible({ timeout: 10000 });
  }
}

/**
 * `/watchlist` を開いている状態で、未視聴の先頭行を視聴済みにする
 *
 * 視聴済みにすると評価モーダルが自動で開くので、開いたところまで待って返す。
 * 閉じ方は呼び出し側で決める（登録・削除・キャンセルで経路が変わるため）。
 *
 * @returns 視聴済みにした作品のタイトル
 */
export async function markWatched(page: Page): Promise<string> {
  const watchButton = watchedToggles(page, false).first();
  await expect(watchButton).toBeVisible({ timeout: 30000 });

  const label = await watchButton.getAttribute('aria-label');
  const title = (label ?? '').replace(/を視聴済みにする$/, '');

  const patched = waitForWriteResponse(page, {
    urlPart: '/api/watchlist/',
    methods: ['PATCH'],
    label: '視聴済みの切り替え',
  });
  await watchButton.click();
  await patched;

  await expect(ratingModal(page)).toBeVisible({ timeout: 15000 });

  return title;
}

/** 評価モーダルで点数を選んでお気に入りに登録する */
export async function registerFavoriteFromRatingModal(
  page: Page,
  score = '8点',
): Promise<void> {
  const modal = ratingModal(page);
  await modal.getByRole('radio', { name: score }).click();

  const registered = waitForWriteResponse(page, {
    urlPart: '/api/favorites',
    methods: ['POST'],
    label: 'お気に入り登録',
  });
  await modal.getByRole('button', { name: '登録' }).click();
  await registered;
  await expect(modal).not.toBeVisible();
}
