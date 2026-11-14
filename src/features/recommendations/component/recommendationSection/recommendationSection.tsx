/**
 * RecommendationSectionコンポーネント
 * AIレコメンド映画のセクション表示
 */

'use client';

import { memo, useCallback, useMemo } from 'react';
import { IoRefreshOutline } from 'react-icons/io5';

import { Button } from '@/components/ui/button/button';
import { Loading } from '@/components/ui/loading/loading';
import { MovieTile } from '@/components/ui/movie/movieTile/movieTile';
import { useOpenMovieDetail } from '@/features/movies/hooks/useMovieDetailQuery';
import { FavoriteRatingModal } from '@/features/favorites/component/favoriteRatingModal/favoriteRatingModal';
import { useFavoriteToggle } from '@/features/favorites/hooks/useFavoriteToggle';
import { useWatchlistToggle } from '@/features/watchlist/hooks/useWatchlistToggle';
import { useDismissMovie } from '@/features/dismissedMovies/hooks/useDismissMovie';
import { useRecommendationEvents } from '@/features/recommendations/hooks/useRecommendationEvents';
import { useRecommendationRefresh } from '@/features/recommendations/hooks/useRecommendationRefresh';
import { useRecommendations } from '@/features/recommendations/hooks/useRecommendations';
import {
  RECOMMENDATIONS_MESSAGES,
  RECOMMENDATION_EVENT_TYPE,
  RECOMMENDATION_REFRESH_MESSAGES,
} from '@/constants';
import type { MovieCacheItem } from '@/lib/api/movies/movies';
import type { Recommendation } from '@/schema/recommendations';
import { recommendationToMovieCacheItem } from '@/utils/toMovieCacheItem';

import styles from './recommendationSection.module.scss';

/**
 * RecommendationSectionコンポーネント
 *
 * ⚠️ **レコメンドを props で受け取らない。** サーバーで取ると cookie を読む
 * ことになり、ホーム（`/`）全体が動的ルートになって遷移のたびにサーバー
 * 往復が起きる（#1115）。
 *
 * ⚠️ **中身を同じコンポーネントに書かないこと。** 認証チェックの early return
 * はフックより後ろにしか置けないため、1つにまとめると**未認証の訪問者でも
 * 中身のフックが動いて API を叩く**。`useRecommendationRefresh` の残回数取得が
 * 401 を返し、axios のインターセプタが強制サインアウトへ倒した（実際に
 * `mobileLoginEntry.spec.ts` が落ちた）。ゲートと中身を分け、未認証では
 * 中身をマウントしない。
 */
export const RecommendationSection = memo(function RecommendationSection() {
  const {
    recommendations,
    hasFavorites,
    isAuthenticated,
    isPending,
    isError,
    setRecommendations,
  } = useRecommendations();

  // 未認証、またはセッション・取得が未確定 → 何も描かない。
  //
  // ⚠️ ここで骨組みを出さないこと。未認証の利用者には出ないセクションなので、
  // 一瞬だけ出して消すとレイアウトが跳ねる（#1048 と同種）
  if (!isAuthenticated || isPending) {
    return null;
  }

  // 取得に失敗 → そのことを出す。
  //
  // ⚠️ **下の `hasFavorites` の分岐に落とさないこと。** 失敗時は false に
  // なるため、お気に入りを登録済みの利用者にまで登録促進の文言が出る（#1115）
  if (isError) {
    return (
      <section
        aria-label={RECOMMENDATIONS_MESSAGES.SECTION_TITLE}
        className={styles.c_recommendation_section}
      >
        <h2 className={styles.c_recommendation_section__title}>
          {RECOMMENDATIONS_MESSAGES.SECTION_TITLE}
        </h2>
        <p className={styles.c_recommendation_section__message}>
          {RECOMMENDATIONS_MESSAGES.FETCH_FAILED}
        </p>
      </section>
    );
  }

  return (
    <RecommendationSectionContent
      recommendations={recommendations}
      hasFavorites={hasFavorites}
      setRecommendations={setRecommendations}
    />
  );
});

RecommendationSection.displayName = 'RecommendationSection';

/**
 * RecommendationSectionContentコンポーネントのプロパティ
 */
interface RecommendationSectionContentProps {
  /** レコメンド一覧 */
  recommendations: Recommendation[];
  /** お気に入りが1件以上あるか */
  hasFavorites: boolean;
  /** 取得したレコメンドでキャッシュを差し替える */
  setRecommendations: (next: Recommendation[]) => void;
}

/**
 * レコメンドセクションの中身（認証済みのときだけマウントされる）
 */
const RecommendationSectionContent = memo<RecommendationSectionContentProps>(
  function RecommendationSectionContent({
    recommendations,
    hasFavorites,
    setRecommendations,
  }) {
    const handleRefreshSuccess = useCallback(
      (newRecommendations: Recommendation[]) => {
        // ローカル state ではなくキャッシュへ書く。詳細モーダルが同じキーを
        // 読むので、更新後の作品でもアクセシブル名が「映画詳細」に落ちない
        setRecommendations(newRecommendations);
      },
      [setRecommendations],
    );

    const {
      refresh,
      isRefreshing,
      isRefreshDisabled,
      remainingCount,
      maxCount,
      isLimitReached,
      isCountLoading,
    } = useRecommendationRefresh(handleRefreshSuccess);

    const {
      modalState: favoriteModalState,
      handleFavoriteToggle,
      closeModal: closeFavoriteModal,
      handleModalSubmit: handleFavoriteModalSubmit,
      handleDelete: handleFavoriteDelete,
      isFavoriteProcessing,
      getFavoriteInfo,
      isFavoriteResolving,
    } = useFavoriteToggle();

    const {
      isInWatchlist,
      toggleWatchlist,
      isMovieToggling,
      isWatchlistResolving,
    } = useWatchlistToggle();

    const { dismissMovie, isDismissingMovie, dismissedIds } = useDismissMovie();

    // 計測はお気に入りがある（＝レコメンドが出る）認証済みユーザーのみ対象
    const { observeTile, trackEvent } = useRecommendationEvents(
      recommendations,
      hasFavorites,
    );

    const handleDismiss = useCallback(
      (movie: MovieCacheItem) => {
        trackEvent(movie.id, RECOMMENDATION_EVENT_TYPE.DISMISS);
        dismissMovie({
          tmdb_movie_id: movie.id,
          title: movie.title,
          poster_path: movie.poster_path ?? null,
          genre_ids: movie.genre_ids ?? null,
        });
      },
      [dismissMovie, trackEvent],
    );

    const movieCacheItems = useMemo(
      () =>
        recommendations
          .filter((rec) => !dismissedIds.has(rec.tmdb_movie_id))
          .map((rec) => ({
            ...recommendationToMovieCacheItem(rec),
            favorite: getFavoriteInfo(rec.tmdb_movie_id),
          })),
      [recommendations, getFavoriteInfo, dismissedIds],
    );

    // タイルのタイトルは /movies/[id] へのリンクになったので、ここでは
    // 遷移させず「押された」ことだけ記録する（レコメンドの精度計測に使う）
    const handleTileClick = useCallback(
      (movieId: number) => {
        trackEvent(movieId, RECOMMENDATION_EVENT_TYPE.CLICK);
      },
      [trackEvent],
    );
    const handleWatchlistToggle = useCallback(
      (movie: MovieCacheItem) => {
        // 追加時のみ計測する（解除は「興味がある」シグナルではない）
        if (!isInWatchlist(movie.id)) {
          trackEvent(movie.id, RECOMMENDATION_EVENT_TYPE.ADD_TO_WATCHLIST);
        }
        toggleWatchlist(movie);
      },
      [isInWatchlist, toggleWatchlist, trackEvent],
    );

    // URL を読まないフックを使う。読むとホームが静的プリレンダから外れる（#1115）
    const openMovieDetail = useOpenMovieDetail();

    const reasonMap = useMemo(
      () => new Map(recommendations.map((r) => [r.tmdb_movie_id, r.reason])),
      [recommendations],
    );

    const handleRefresh = useCallback(() => {
      refresh();
    }, [refresh]);

    // お気に入り0件 → 登録促進テキスト
    if (!hasFavorites) {
      return (
        <section
          aria-label={RECOMMENDATIONS_MESSAGES.SECTION_TITLE}
          className={styles.c_recommendation_section}
        >
          <h2 className={styles.c_recommendation_section__title}>
            {RECOMMENDATIONS_MESSAGES.SECTION_TITLE}
          </h2>
          <p className={styles.c_recommendation_section__message}>
            {RECOMMENDATIONS_MESSAGES.NO_FAVORITES}
          </p>
        </section>
      );
    }

    // レコメンド未生成 → 「準備中」テキスト
    if (recommendations.length === 0 && !isRefreshing) {
      return (
        <section
          aria-label={RECOMMENDATIONS_MESSAGES.SECTION_TITLE}
          className={styles.c_recommendation_section}
        >
          <h2 className={styles.c_recommendation_section__title}>
            {RECOMMENDATIONS_MESSAGES.SECTION_TITLE}
          </h2>
          <p className={styles.c_recommendation_section__message}>
            {RECOMMENDATIONS_MESSAGES.NOT_GENERATED}
          </p>
        </section>
      );
    }

    // レコメンドあり → MovieTileグリッド表示
    return (
      <>
        <section
          aria-label={RECOMMENDATIONS_MESSAGES.SECTION_TITLE}
          className={styles.c_recommendation_section}
        >
          <div className={styles.c_recommendation_section__header}>
            <h2 className={styles.c_recommendation_section__title}>
              {RECOMMENDATIONS_MESSAGES.SECTION_TITLE}
            </h2>
            <div className={styles.c_recommendation_section__refresh}>
              {!isCountLoading && (
                <span className={styles.c_recommendation_section__remaining}>
                  {isLimitReached
                    ? RECOMMENDATION_REFRESH_MESSAGES.RESET_NOTICE
                    : RECOMMENDATION_REFRESH_MESSAGES.REMAINING_LABEL(
                        remainingCount,
                        maxCount,
                      )}
                </span>
              )}
              <Button
                variant='ghost'
                size='sm'
                onClick={handleRefresh}
                disabled={isRefreshDisabled}
                aria-label='おすすめを更新'
              >
                <IoRefreshOutline
                  className={styles.c_recommendation_section__refresh_icon}
                  aria-hidden='true'
                />
                更新
              </Button>
            </div>
          </div>
          <div className={styles.c_recommendation_section__grid_wrapper}>
            {isRefreshing && (
              <div className={styles.c_recommendation_section__overlay}>
                <Loading size='md' label='おすすめを更新中...' />
              </div>
            )}
            <div className={styles.c_recommendation_section__grid} role='list'>
              {movieCacheItems.map((movie) => (
                <div
                  key={movie.id}
                  ref={observeTile(movie.id)}
                  role='listitem'
                  className={styles.c_recommendation_section__item}
                >
                  <MovieTile
                    movie={movie}
                    onClick={handleTileClick}
                    onSelect={openMovieDetail}
                    isInWatchlist={isInWatchlist(movie.id)}
                    onWatchlistToggle={handleWatchlistToggle}
                    watchlistDisabled={isMovieToggling(movie.id)}
                    isWatchlistResolving={isWatchlistResolving}
                    onFavoriteToggle={handleFavoriteToggle}
                    favoriteDisabled={isFavoriteProcessing(movie.id)}
                    isFavoriteResolving={isFavoriteResolving}
                    onDismiss={handleDismiss}
                    dismissDisabled={
                      isDismissingMovie(movie.id) || !!movie.favorite
                    }
                  />
                  <p className={styles.c_recommendation_section__reason}>
                    {reasonMap.get(movie.id)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
        <FavoriteRatingModal
          isOpen={favoriteModalState.isOpen}
          onClose={closeFavoriteModal}
          movieTitle={favoriteModalState.movie?.title ?? ''}
          currentFavorite={favoriteModalState.currentFavorite}
          onSubmit={handleFavoriteModalSubmit}
          onDelete={handleFavoriteDelete}
        />
      </>
    );
  },
);

RecommendationSectionContent.displayName = 'RecommendationSectionContent';
