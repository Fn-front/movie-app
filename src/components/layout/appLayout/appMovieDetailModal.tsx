/**
 * アプリ全体でただ1つの映画詳細モーダル（#1077）
 *
 * ⛔ **各画面で描かない。** 以前は9箇所が自前で `MovieDetailModal` を描いて
 * おり、#1033 で開閉を URL（`?movie_id=`）へ移したときに実害が出た。
 * サイドバー（`watchlistPanel`）は `AppLayout` を通る**全ページ**に出るので、
 * ページ側のモーダルと**同じ `movie_id` を読んで2枚同時に開く**。
 * 当時はサイドバーだけローカル state に戻して凌いでいたが、その結果
 * サイドバーから開いた詳細だけ URL を持てず、リロードで消えていた。
 *
 * ここに1つ置けば、どこから開いても URL を持つ＝リロードで復元でき、
 * 共有もできる。
 *
 * ⚠️ **`<Suspense>` で包んで使うこと。** `useMovieDetailQuery` は
 * `useSearchParams` を使うため、包まないと `AppLayout` を通る
 * **全ページ**が静的プリレンダから外れる（`missing-suspense-with-csr-bailout`）。
 */

'use client';

import { memo } from 'react';
import { usePathname } from 'next/navigation';

import { MovieDetailModal } from '@/components/ui/movie/detailModal/movieDetailModal';
import { useMovieDetailQuery } from '@/features/movies/hooks/useMovieDetailQuery';
import { useShowFinancialInfo } from '@/features/movies/hooks/useShowFinancialInfo';
import { ROUTES } from '@/constants';

/**
 * 予算・興行収入を出す画面（#1077 で挙動を変えないための一覧）
 *
 * ⚠️ 統合前にこの2つを出していたのは `movieListContent` だけで、
 * それを描くのは `/movies/now-showing` と `/movies/upcoming` の2ルート。
 * モーダルが1つになると「どの画面から開いたか」を modal 側が知らないため、
 * **パスで同じ出し分けを再現する**。
 */
const FINANCIAL_INFO_PATHS: readonly string[] = [
  ROUTES.NOW_SHOWING,
  ROUTES.UPCOMING,
];

/**
 * URL の `movie_id` で開閉する唯一の詳細モーダル
 */
export const AppMovieDetailModal = memo(function AppMovieDetailModal() {
  const pathname = usePathname();
  const { selectedMovieId, closeMovieDetail } = useMovieDetailQuery();

  const canShowFinancialInfo = useShowFinancialInfo(selectedMovieId);

  return (
    <MovieDetailModal
      // 開閉は URL の movie_id が持つ。ここでも履歴を積むと2つ伸びる（#1033）
      manageHistory={false}
      movieId={selectedMovieId}
      // ⚠️ `title` は渡さない。ここには一覧データが無いので、
      //    `MovieDetailModal` が取得済みの詳細から作品名を出す
      showFinancialInfo={
        canShowFinancialInfo && FINANCIAL_INFO_PATHS.includes(pathname)
      }
      onClose={closeMovieDetail}
    />
  );
});

AppMovieDetailModal.displayName = 'AppMovieDetailModal';
