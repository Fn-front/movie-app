/**
 * MovieDetailPageコンポーネント
 * `/movies/[id]` を直接開いたとき（共有リンク・リロード）の全画面表示
 */

'use client';

import { memo } from 'react';

import { MovieDetailContent } from '@/features/movies/component/movieDetailContent/movieDetailContent';
import { useShowFinancialInfo } from '@/features/movies/hooks/useShowFinancialInfo';

import styles from './movieDetailPage.module.scss';

/**
 * MovieDetailPageコンポーネントのプロパティ
 */
export interface MovieDetailPageProps {
  /** 映画ID */
  movieId: number;
}

/**
 * MovieDetailPageコンポーネント
 *
 * 中身はモーダルと同じ `MovieDetailContent` を使う。器が違うだけなので、
 * 表示する情報が画面によってずれないようにするため。
 */
export const MovieDetailPage = memo<MovieDetailPageProps>(
  function MovieDetailPage({ movieId }) {
    const showFinancialInfo = useShowFinancialInfo(movieId);

    return (
      <div className={styles.c_movie_detail_page}>
        <MovieDetailContent
          movieId={movieId}
          showFinancialInfo={showFinancialInfo}
          variant='page'
        />
      </div>
    );
  },
);

MovieDetailPage.displayName = 'MovieDetailPage';
