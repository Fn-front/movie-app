/**
 * MovieDetailRouteModalコンポーネント
 * `@modal/(.)movies/[id]` から開く、URL を持つ映画詳細モーダル
 */

'use client';

import { memo, useCallback } from 'react';
import { useRouter } from 'next/navigation';

import { MovieDetailModal } from '@/components/ui/movie/detailModal/movieDetailModal';
import { useMovieDetail } from '@/features/movies/hooks/useMovieDetail';
import { useShowFinancialInfo } from '@/features/movies/hooks/useShowFinancialInfo';

/**
 * MovieDetailRouteModalコンポーネントのプロパティ
 */
export interface MovieDetailRouteModalProps {
  /** 映画ID */
  movieId: number;
}

/**
 * MovieDetailRouteModalコンポーネント
 *
 * 一覧から `/movies/[id]` へソフト遷移したときだけ描画される。開閉は
 * **ルーターが持つ**ので、閉じるは `router.back()` で遷移を1つ戻すだけ。
 * モーダル側で履歴を積まない（`manageHistory={false}`）のはそのため。
 *
 * 直接アクセス・リロードではこのスロットは当たらず、
 * `src/app/movies/[id]/page.tsx` の全画面ページが出る。
 */
export const MovieDetailRouteModal = memo<MovieDetailRouteModalProps>(
  function MovieDetailRouteModal({ movieId }) {
    const router = useRouter();
    const { movie } = useMovieDetail(movieId);
    const showFinancialInfo = useShowFinancialInfo(movieId);

    const handleClose = useCallback(() => {
      router.back();
    }, [router]);

    return (
      <MovieDetailModal
        movieId={movieId}
        title={movie?.title}
        showFinancialInfo={showFinancialInfo}
        onClose={handleClose}
        manageHistory={false}
      />
    );
  },
);

MovieDetailRouteModal.displayName = 'MovieDetailRouteModal';
