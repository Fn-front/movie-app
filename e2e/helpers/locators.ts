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

/**
 * お気に入りに追加できる最初の映画タイルを、位置で固定して返す
 *
 * お気に入りボタンは**未公開作品のカードには出ない**（#818）。評価とセットで
 * 登録する機能のため、まだ観られない作品では表示しない仕様になっている。
 *
 * 一覧の並びは TMDb 由来のデータで決まり、cron の日次同期で入れ替わる。
 * `movieTiles(page).first()` を決め打ちすると、先頭が未公開作品になった日だけ
 * ボタンが見つからずタイムアウトする（データ依存の不安定なテストになる）。
 *
 * ⚠️ `filter({ has: ... })` で絞ったロケータを使い回してはいけない。
 * Playwright のロケータは遅延評価のため、お気に入り登録でボタンの名前が
 * 「追加」から「編集」へ変わった瞬間にフィルタから外れ、**同じ変数が別のタイルを
 * 指すようになる**。そのため、ここで一度だけ位置を解決して `nth()` を返す。
 *
 * @param page - 対象ページ（タイルの描画が済んでいること）
 * @returns 位置で固定されたタイルのロケータ
 * @throws お気に入りに追加できるタイルが1つも無い場合
 */
export async function firstFavoritableTile(page: Page): Promise<Locator> {
  const tiles = movieTiles(page);
  const total = await tiles.count();

  for (let index = 0; index < total; index += 1) {
    const tile = tiles.nth(index);
    const addButton = tile.getByRole('button', { name: 'お気に入りに追加' });

    if ((await addButton.count()) > 0) {
      return tile;
    }
  }

  throw new Error(
    `お気に入りに追加できるタイルが見つかりません（タイル総数: ${total}）。` +
      '一覧が未公開作品のみになっている可能性があります。',
  );
}
