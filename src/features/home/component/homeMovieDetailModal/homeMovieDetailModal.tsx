/**
 * HomeMovieDetailModalコンポーネント
 * ホームの映画詳細モーダル（ページに1つだけ）
 */

'use client';

import { memo, useMemo } from 'react';

import { MovieDetailModal } from '@/components/ui/movie/detailModal/movieDetailModal';
import { useMovieDetailQuery } from '@/features/movies/hooks/useMovieDetailQuery';
import { useRecommendations } from '@/features/recommendations/hooks/useRecommendations';
import type { NowShowingMovie } from '@/lib/types';

/**
 * HomeMovieDetailModalコンポーネントのプロパティ
 */
export interface HomeMovieDetailModalProps {
  /** 劇場公開中の人気映画一覧 */
  nowShowingMovies: NowShowingMovie[];
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
 * タイトル（ダイアログのアクセシブル名）は公開中一覧とレコメンドから引く。
 * レコメンドは `RecommendationSection` と**同じ react-query のキャッシュ**を
 * 読むので（#1115）、手動更新で差し替わった作品でも名前が付く。
 *
 * ⚠️ `nowShowingMovies` は props のまま。サーバーで取った静的な一覧であり、
 * ここでクライアント取得に変えるとホームの初期HTMLから公開中セクションが
 * 消える（SEO・ファーストビューの劣化）。
 */
export const HomeMovieDetailModal = memo<HomeMovieDetailModalProps>(
  function HomeMovieDetailModal({ nowShowingMovies }) {
    const { selectedMovieId, closeMovieDetail } = useMovieDetailQuery();
    const { recommendations } = useRecommendations();

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
