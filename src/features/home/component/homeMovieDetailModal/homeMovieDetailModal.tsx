/**
 * HomeMovieDetailModalコンポーネント
 * ホームの映画詳細モーダル（ページに1つだけ）
 */

'use client';

import { memo, useMemo } from 'react';

import { MovieDetailModal } from '@/components/ui/movie/detailModal/movieDetailModal';
import { useMovieDetailQuery } from '@/features/movies/hooks/useMovieDetailQuery';
import type { NowShowingMovie } from '@/lib/types';
import type { Recommendation } from '@/schema/recommendations';

/**
 * HomeMovieDetailModalコンポーネントのプロパティ
 */
export interface HomeMovieDetailModalProps {
  /** 劇場公開中の人気映画一覧 */
  nowShowingMovies: NowShowingMovie[];
  /** レコメンド一覧 */
  recommendations: Recommendation[];
}

/**
 * HomeMovieDetailModalコンポーネント
 *
 * モーダルの開閉は URL の `movie_id` が持つ（`useMovieDetailQuery`）。
 * **同じクエリを読むモーダルを1ページに2つ置くと2枚同時に開く**ため、
 * ホームでは各セクションではなくここに1つだけ置く。
 * `NowShowingMovieList` と `RecommendationSection` はタイルから
 * `openMovieDetail` を呼ぶだけで、モーダル自体は描かない。
 *
 * ⚠️ タイトル（ダイアログのアクセシブル名）はサーバーから渡った一覧からしか
 * 引けない。`RecommendationSection` の「他の作品を見る」で差し替わった
 * レコメンドはここに届かないため、`MovieDetailModal` の既定値
 * 「映画詳細」にフォールバックする。モーダルを `AppLayout` に1つだけ置く
 * （#1077）までは、セクションの state をここへ持ち上げない限り解消しない。
 */
export const HomeMovieDetailModal = memo<HomeMovieDetailModalProps>(
  function HomeMovieDetailModal({ nowShowingMovies, recommendations }) {
    const { selectedMovieId, closeMovieDetail } = useMovieDetailQuery();

    const titleById = useMemo(() => {
      const map = new Map<number, string>();
      for (const movie of nowShowingMovies) {
        map.set(movie.tmdb_movie_id, movie.title);
      }
      for (const rec of recommendations) {
        map.set(rec.tmdb_movie_id, rec.title);
      }
      return map;
    }, [nowShowingMovies, recommendations]);

    const selectedMovieTitle =
      selectedMovieId === null ? undefined : titleById.get(selectedMovieId);

    return (
      <MovieDetailModal
        // 開閉は URL の movie_id が持つ。ここでも履歴を積むと2つ伸びる（#1033）
        manageHistory={false}
        movieId={selectedMovieId}
        title={selectedMovieTitle}
        onClose={closeMovieDetail}
      />
    );
  },
);

HomeMovieDetailModal.displayName = 'HomeMovieDetailModal';
