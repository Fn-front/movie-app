import type { Metadata } from 'next';

import { HomePage } from '@/features/home/home';
import { getNowShowingMovies } from '@/lib/api/nowShowing/nowShowing.server';

export const metadata: Metadata = {
  title: 'ホーム | Movie App',
  description: '公開予定の映画一覧を確認できます',
};

/**
 * 再生成の間隔（秒）
 *
 * 静的プリレンダなので、これが無いとビルド時のデータで固定される。
 * 元データは Cron の日次同期なので、`getNowShowingMovies` のキャッシュ
 * （`NOW_SHOWING_REVALIDATE_SECONDS`）と同じ間隔に揃える。
 *
 * ⚠️ **定数を import して代入できない。** Next.js はこの値を静的に解析する
 * ため、`revalidate = 600` は有効だが `revalidate = 60 * 10` や
 * `revalidate = CONST` は `Invalid segment configuration export detected` で
 * ビルドが落ちる（`route-segment-config` のドキュメント）。
 * ずれを防ぐため、定数との一致は `page.test.tsx` で固定している。
 */
export const revalidate = 3600;

/**
 * ホーム
 *
 * ⚠️ **cookie を読む処理（`auth()` など）をここへ戻さないこと。**
 * 1箇所でも呼ぶとルートが動的（ƒ）になり、プリフェッチもクライアント
 * キャッシュも効かなくなって、遷移のたびにサーバー往復が発生する
 * （他の静的タブの約10倍 / #1115）。認証が要る表示はクライアント側へ。
 *
 * `getNowShowingMovies` は cookie に依存しない（`unstable_cache` の内部で
 * 読めない）ので、サーバー取得のまま静的化できる。公開中セクションを
 * 初期HTMLに載せたままにするため、ここはクライアントへ移さない。
 */
export default async function Home() {
  const nowShowingMovies = await getNowShowingMovies();

  return <HomePage nowShowingMovies={nowShowingMovies} />;
}
