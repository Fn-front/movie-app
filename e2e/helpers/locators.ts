/**
 * E2E共通ロケータ
 * 2つ以上のspecファイルで使用するロケータを集約
 */

import type { Page, Locator } from '@playwright/test';

/**
 * 映画タイル（カード本体）のロケータを取得
 *
 * カード自体は role を持たない。インタラクティブ要素の入れ子を避けるため、
 * 詳細を開くボタンはタイトル側にあり、::after でカード全面が当たり判定に
 * なっている（クリックはカードのどこを押しても詳細が開く）。
 *
 * `c_card` と `c_movie_tile` の両方を持つのはカードのルート要素だけ。
 * 子要素（`c_movie_tile__poster` 等）を拾わないようにこの条件で絞る。
 * `c_movie_tile_skeleton` も部分一致してしまうため明示的に除外する
 * （読み込み中のスケルトンをクリックしても何も起きない）。
 */
export function movieTiles(page: Page): Locator {
  return page.locator(
    '[class*="c_card"][class*="c_movie_tile"]:not([class*="c_movie_tile_skeleton"])',
  );
}

/** 映画タイルの「詳細を開く」ボタン（タイトル）のロケータを取得 */
export function movieTileDetailButtons(page: Page): Locator {
  return page.locator('[class*="c_movie_tile__title_button"]');
}
