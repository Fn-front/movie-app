/**
 * ビルド結果が静的プリレンダのままかを確かめる
 *
 * ホーム（`/`）は cookie を読む処理が1つ混ざるだけで動的（ƒ）に戻り、
 * 遷移のたびにサーバー往復が発生する（#1115）。**単体テストでは守れない**。
 * `src/app/page.test.tsx` は `page.tsx` の中身しか見ないので、
 * `home.tsx` や配下のセクションに `auth()` を足されると静かに素通りする。
 *
 * ビルド出力（`.next/prerender-manifest.json`）を直接見ることで、
 * どのファイルで戻されても検知できる。
 *
 * 使い方: `node scripts/assert-static-routes.mjs`（`next build` の直後）
 */

import { readFileSync } from 'fs';

/** 静的プリレンダを維持すべきルート */
const STATIC_ROUTES = [
  '/',
  '/movies/now-showing',
  '/movies/upcoming',
  '/search',
  '/watchlist',
  '/favorites',
  '/awards',
];

const manifestPath = '.next/prerender-manifest.json';

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (error) {
  console.error(
    `${manifestPath} を読めませんでした。next build の後に実行してください。`,
    error,
  );
  process.exit(1);
}

const dynamicRoutes = STATIC_ROUTES.filter(
  (route) => manifest.routes?.[route] === undefined,
);

if (dynamicRoutes.length > 0) {
  console.error(
    [
      '静的プリレンダであるべきルートが動的（ƒ）になっています:',
      ...dynamicRoutes.map((route) => `  - ${route}`),
      '',
      'cookie を読む処理（auth() / cookies() / headers()）か、',
      '<Suspense> で包まれていない useSearchParams() が紛れ込んでいないか確認してください（#1115）。',
    ].join('\n'),
  );
  process.exit(1);
}

console.log(`静的プリレンダを確認: ${STATIC_ROUTES.join(', ')}`);
