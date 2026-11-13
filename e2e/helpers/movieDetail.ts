/**
 * 詳細モーダル用 E2Eヘルパー
 *
 * 詳細モーダルは GET /api/movies/:id（サーバ側で TMDb 取得）に依存するため、
 * TMDb のレート制限/一時障害で「詳細情報」が描画されず E2E が flaky になる。
 * このヘルパーで /api/movies/:id をモックし、TMDb 非依存で安定させる。
 *
 * ※ 一覧API（GET /api/movies?...）は対象外にするため、末尾が数値IDの
 *   パスのみにマッチする正規表現を使う（glob `**​/api/movies**` との衝突回避）。
 */

import type { Page, Route } from '@playwright/test';
import type { MovieDetail } from '@/lib/types';

/** /api/movies/<id> のみにマッチ（一覧 /api/movies?... は除外） */
const MOVIE_DETAIL_URL = /\/api\/movies\/\d+(?:$|\?)/;

/**
 * E2Eで使う映画ID（TMDb: Fight Club）。
 *
 * `/movies/[id]` ページの存在確認と `<title>` 生成はサーバ側で TMDb を
 * 直接呼ぶため route モックが効かない。長期間存在しているIDを使う
 * （`e2e/helpers/person.ts` の `PERSON_ID` と同じ理由）。
 */
export const MOVIE_ID = 550;

/**
 * {@link MOVIE_ID} の邦題。
 *
 * `<title>` の検証に使う。**接尾辞だけ（`/\| Movie App$/`）では検証にならない**。
 * アプリのどのページもその形なので、404 でも未検出でも通ってしまう。
 * ID を固定している以上、作品名も固定して完全一致で見る。
 *
 * ⚠️ TMDb 側で邦題が変わったらここも直すこと（その場合このテストが落ちる）。
 */
export const MOVIE_TITLE = 'ファイト・クラブ';

/** TMDb に存在しない映画ID（404ページの検証用） */
export const MISSING_MOVIE_ID = 999999999;

/**
 * 「詳細情報」セクションが確実に描画される、型を満たした完全な MovieDetail を返す。
 * 配列は空配列、数値は数値で埋め、favorite は null（お気に入り未登録）。
 */
function buildMovieDetail(
  id: number,
  overrides: Partial<MovieDetail>,
): MovieDetail {
  return {
    id,
    title: 'E2E詳細映画',
    original_title: 'E2E Detail Movie',
    overview: 'E2E用の概要テキスト',
    poster_path: null,
    backdrop_path: null,
    release_date: '2026-01-01',
    vote_average: 7.5,
    vote_count: 100,
    popularity: 12.3,
    adult: false,
    original_language: 'ja',
    runtime: 120,
    genres: [{ id: 28, name: 'アクション' }],
    production_companies: [],
    production_countries: [],
    spoken_languages: [],
    budget: 0,
    revenue: 0,
    tagline: '',
    status: 'Released',
    homepage: null,
    favorite: null,
    ...overrides,
  };
}

/**
 * 詳細モーダルの取得API（GET /api/movies/:id）をモックする。
 * URL からリクエストされた ID を読み取り、その ID の詳細を返す。
 *
 * @param page Playwright Page
 * @param overrides 返す MovieDetail の一部を上書き（例: { favorite: {...} }）
 */
export async function mockMovieDetail(
  page: Page,
  overrides: Partial<MovieDetail> = {},
): Promise<void> {
  await page.route(MOVIE_DETAIL_URL, async (route: Route) => {
    const match = route
      .request()
      .url()
      .match(/\/api\/movies\/(\d+)/);
    const id = match ? Number(match[1]) : 0;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: buildMovieDetail(id, overrides),
      }),
    });
  });
}

/**
 * 予告編の埋め込み（youtube-nocookie.com）を空のページに差し替える
 *
 * 予告編ダイアログは別オリジンの iframe を読み込む。**実物を読ませると
 * プレイヤーがフォーカスを奪い、その瞬間に Escape が効かなくなる**
 * （keydown が iframe 側の document に入り、Radix の検知に届かない / #1092）。
 * 読み込み時間は環境依存なので、Escape を使うテストは CI で断続的に落ちる
 * （#1093 で実測）。
 *
 * ここで中身を潰しておけば、フォーカスを奪う主体がいなくなり決定的になる。
 * あわせて E2E から外部ネットワーク依存も消える。
 *
 * ⚠️ URL は差し替えないので**別オリジンのままである性質は保たれる**。
 * 「iframe にフォーカスがあると Escape が効かない」こと自体を確かめたい
 * テストは、この後で明示的にフォーカスを移すこと。
 */
export async function stubTrailerEmbed(page: Page): Promise<void> {
  await page.route('**://*.youtube-nocookie.com/**', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><title>stub</title>',
    }),
  );
}
