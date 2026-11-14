/**
 * E2E共通ロケータ
 * 2つ以上のspecファイルで使用するロケータを集約
 */

import type { Page, Locator } from '@playwright/test';

/**
 * 映画タイル（カード本体）のロケータを取得
 *
 * カード自体は role を持たない。インタラクティブ要素の入れ子を避けるため、
 * 詳細へのリンクはタイトル側にあり、::after でカード全面が当たり判定に
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

/**
 * 映画タイルの「詳細を開く」リンク（タイトル）のロケータを取得
 *
 * ⚠️ `button[class*=...]` のようにタグで絞らないこと。映画詳細が
 * `/movies/[id]` という URL を持つルートになり、タイトルは `<a>` になった
 * （#1033）。タグ名を書いた spec は一斉に落ちる
 */
export function movieTileDetailLinks(page: Page): Locator {
  return page.locator('[class*="c_movie_tile__title_link"]');
}

/**
 * ウォッチリストの視聴済みトグルを、押下状態で絞って取得
 *
 * ラベルは `${作品名}を視聴済みにする` で固定されており、状態では変わらない。
 * 状態を伝えるのは `aria-pressed` だけ（#1046）。ラベルとの併用は
 * 「○○を未視聴に戻す、オン」のように意味が反転して読まれるため避けている。
 *
 * その結果、**ラベルだけでは視聴済みの行と未視聴の行を区別できない**。
 * どちらを狙うかは必ず `pressed` で指定すること。
 *
 * @param page - 対象ページ
 * @param pressed - true なら視聴済みの行、false なら未視聴の行
 */
export function watchedToggles(page: Page, pressed: boolean): Locator {
  return page.getByRole('button', { name: /を視聴済みにする$/, pressed });
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

/**
 * 一覧ツールバーのフィルターボタン
 *
 * 絞り込み中かどうかは、このボタンの**アクセシブルな説明**に出る
 * （`aria-describedby` →「絞り込み中」）。
 *
 * ⚠️ **青いドットを CSS クラス名で引かないこと**（#1063）。
 * `[class*="filter_count"]` は CSS Modules のハッシュ付きクラス名に
 * 依存するうえ、**支援技術に何も伝わらない状態を前提にしたテスト**になる。
 * ドット自体は `aria-hidden` の装飾で、意味は説明側が持つ。
 *
 * ```ts
 * await expect(filterButton(page)).toHaveAccessibleDescription('絞り込み中');
 * await expect(filterButton(page)).toHaveAccessibleDescription('');
 * ```
 */
export function filterButton(page: Page): Locator {
  return page.getByRole('button', { name: 'フィルター' });
}
