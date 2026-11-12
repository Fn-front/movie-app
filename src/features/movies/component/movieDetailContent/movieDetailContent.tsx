/**
 * MovieDetailContentコンポーネント
 * 映画詳細モーダルの内容部分
 */

'use client';

import { memo, useCallback, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { IoPlayOutline, IoShareOutline } from 'react-icons/io5';
import { Loading } from '@/components/ui/loading/loading';
import { useModalNavigation } from '@/components/ui/modal/modal';
import { WatchlistAddButton } from '@/features/watchlist/component/watchlistAddButton/watchlistAddButton';
import { FavoriteButton } from '@/features/favorites/component/favoriteButton/favoriteButton';
import { FavoriteRatingModal } from '@/features/favorites/component/favoriteRatingModal/favoriteRatingModal';
import { VideoDialog } from '@/features/movies/component/videoDialog/videoDialog';
import { useWatchlistToggle } from '@/features/watchlist/hooks/useWatchlistToggle';
import { useFavoriteToggle } from '@/features/favorites/hooks/useFavoriteToggle';
import { useShareMovie } from '@/features/movies/hooks/useShareMovie';
import { isMovieReleased } from '@/utils/movie';
import {
  getTMDbPosterUrl,
  getTMDbBackdropUrl,
  getTMDbProfileUrl,
  getTMDbProviderLogoUrl,
} from '@/utils/image';
import {
  ANALYTICS_EVENTS,
  ARIA_LABELS,
  DISPLAY_LIMITS,
  EXCHANGE_RATE,
  ICON_SIZES,
  IMAGE_SIZES,
  ROUTES,
  UI_ERROR_MESSAGES,
} from '@/constants';
import { sendEvent } from '@/utils/analytics';
import { cn } from '@/utils/cn';
import { formatDate } from '@/utils/date';
import { useMovieDetail } from '@/features/movies/hooks/useMovieDetail';
import { selectTrailerVideos } from '@/features/movies/utils/selectTrailerVideos';
import type { WatchProvider } from '@/lib/types';

import styles from './movieDetailContent.module.scss';

/**
 * MovieDetailContentコンポーネントのプロパティ
 */
export interface MovieDetailContentProps {
  /** 映画ID */
  movieId: number;
  /** 予算・興行収入を表示するか */
  showFinancialInfo?: boolean;
  /**
   * 置かれる器（既定: モーダル）
   *
   * `page` は `/movies/[id]` の全画面ページ用。
   *
   * - 見出しレベルを1つ上げる。モーダルは Radix の Dialog.Title（h2）が
   *   上にあるので h3/h4 で始めるが、ページでは作品名が h1 になる。
   *   ここをずらさないと h1 が無いページか、h1 → h3 の飛びになる
   * - あらすじ以降の内部スクロール（300px）を外す。器の高さが決まっている
   *   モーダルのための制約で、ページでは二重スクロールになるだけ（#1023）
   */
  variant?: 'modal' | 'page';
  /** 動画ダイアログの開閉状態変更コールバック */
  onVideoDialogOpenChange?: (open: boolean) => void;
}

/**
 * 上映時間をフォーマット
 */
function formatRuntime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}分`;
  return `${hours}時間${mins}分`;
}

/** 概算用の固定為替レート（USD→JPY） */
const USD_TO_JPY_RATE = EXCHANGE_RATE.USD_TO_JPY;

/**
 * 日本円を読みやすい単位でフォーマット
 */
function formatJpy(yen: number): string {
  const oku = 100_000_000;
  const man = 10_000;

  if (yen >= oku) {
    const value = yen / oku;
    return Number.isInteger(value) ? `${value}億円` : `${value.toFixed(1)}億円`;
  }
  if (yen >= man) {
    const value = Math.round(yen / man);
    return `${value.toLocaleString('ja-JP')}万円`;
  }
  return `${yen.toLocaleString('ja-JP')}円`;
}

/**
 * 金額をフォーマット（USD + 約日本円）
 */
function formatCurrency(amount: number): string {
  if (amount === 0) return '-';
  const usd = `$${amount.toLocaleString('en-US')}`;
  const jpyAmount = Math.round(amount * USD_TO_JPY_RATE);
  return `${usd}（約${formatJpy(jpyAmount)}）`;
}

/**
 * ProviderCategoryコンポーネントのプロパティ
 */
interface ProviderCategoryProps {
  /** カテゴリラベル */
  label: string;
  /** プロバイダー一覧 */
  providers: WatchProvider[];
}

/**
 * 配信プロバイダーカテゴリコンポーネント
 */
const ProviderCategory = memo<ProviderCategoryProps>(function ProviderCategory({
  label,
  providers,
}) {
  return (
    <div className={styles.c_movie_detail__providers_category}>
      <span className={styles.c_movie_detail__providers_label}>{label}</span>
      <div className={styles.c_movie_detail__providers_list}>
        {providers.map((provider) => {
          const logoUrl = getTMDbProviderLogoUrl(provider.logo_path);
          return logoUrl ? (
            <Image
              key={provider.provider_id}
              src={logoUrl}
              alt={provider.provider_name}
              width={IMAGE_SIZES.PROVIDER_LOGO.WIDTH}
              height={IMAGE_SIZES.PROVIDER_LOGO.HEIGHT}
              className={styles.c_movie_detail__provider_logo}
            />
          ) : null;
        })}
      </div>
    </div>
  );
});

ProviderCategory.displayName = 'ProviderCategory';

/**
 * MovieDetailContentコンポーネント
 */
export const MovieDetailContent = memo<MovieDetailContentProps>(
  function MovieDetailContent({
    movieId,
    showFinancialInfo = false,
    variant = 'modal',
    onVideoDialogOpenChange,
  }) {
    const isPage = variant === 'page';
    const TitleTag = isPage ? 'h1' : 'h3';
    const SectionTag = isPage ? 'h2' : 'h4';
    const { movie, isLoading, isError } = useMovieDetail(movieId);
    const { shouldReplaceNavigation, notifyNavigating } = useModalNavigation();

    /**
     * キャストから人物ページへ出る経路
     *
     * モーダルは遷移で器ごとアンマウントされるので、閉じる指示は要らない。
     * ⚠️ `notifyNavigating()` は必須。これが無いと、履歴を畳む非同期の
     * `history.back()` が遷移を取り消してしまう（#1043）。
     */
    const handleCastClick = useCallback(() => {
      notifyNavigating();
    }, [notifyNavigating]);
    const { isInWatchlist, toggleWatchlist, isToggling } = useWatchlistToggle();
    const { shareMovie } = useShareMovie();
    const [isVideoDialogOpen, setIsVideoDialogOpen] = useState(false);

    const handleVideoDialogOpenChange = useCallback(
      (open: boolean) => {
        setIsVideoDialogOpen(open);
        onVideoDialogOpenChange?.(open);
      },
      [onVideoDialogOpenChange],
    );
    const {
      modalState: favoriteModalState,
      handleFavoriteToggle,
      closeModal: closeFavoriteModal,
      handleModalSubmit: handleFavoriteModalSubmit,
      handleDelete: handleFavoriteDelete,
      isProcessing: isFavoriteProcessing,
    } = useFavoriteToggle();

    const inWatchlist = useMemo(
      () => isInWatchlist(movieId),
      [isInWatchlist, movieId],
    );

    const handleWatchlistToggle = useCallback(() => {
      if (!movie) return;
      toggleWatchlist({
        id: movieId,
        title: movie.title,
        poster_path: movie.poster_path ?? null,
        release_date: movie.release_date ?? null,
      });
    }, [movie, movieId, toggleWatchlist]);

    /**
     * 共有するのは全画面ページの URL（`/movies/<id>`）。
     * モーダルは一覧の URL にクエリを足した状態なので、そのまま渡すと
     * 「どの一覧をどう絞り込んで開いたか」まで共有してしまう
     */
    const handleShare = useCallback(() => {
      if (!movie) return;
      void shareMovie(movieId, movie.title);
    }, [movie, movieId, shareMovie]);

    const handleFavoriteClick = useCallback(() => {
      if (!movie) return;
      handleFavoriteToggle(
        {
          id: movieId,
          title: movie.title,
          poster_path: movie.poster_path ?? null,
          release_date: movie.release_date ?? null,
        },
        movie.favorite ?? null,
      );
    }, [movie, movieId, handleFavoriteToggle]);

    const posterUrl = useMemo(
      () => getTMDbPosterUrl(movie?.poster_path),
      [movie?.poster_path],
    );

    const backdropUrl = useMemo(
      () => getTMDbBackdropUrl(movie?.backdrop_path),
      [movie?.backdrop_path],
    );

    const formattedDate = useMemo(
      () => formatDate(movie?.release_date),
      [movie?.release_date],
    );

    // カード（MovieTile）と同じ判定。詳細モーダルから登録できてしまうと
    // 制限が見た目だけになるため揃える
    const canFavorite = useMemo(
      () => isMovieReleased(movie?.release_date, new Date()),
      [movie?.release_date],
    );

    const trailerVideos = useMemo(
      () => selectTrailerVideos(movie?.videos?.results),
      [movie],
    );

    const handleOpenVideoDialog = useCallback(() => {
      handleVideoDialogOpenChange(true);
      // 計測は「開いた」まで。予告編は YouTube IFrame API を使わない素の
      // iframe 埋め込みなので、実際に再生したかは検知できない。
      // handleVideoDialogOpenChange ではなくこちらに置くのは、前者が
      // 閉じるときにも呼ばれるため
      sendEvent(ANALYTICS_EVENTS.TRAILER_OPEN, { movie_id: movieId });
    }, [handleVideoDialogOpenChange, movieId]);

    const jpProviders = useMemo(
      () => movie?.['watch/providers']?.results?.JP ?? null,
      [movie],
    );

    const runtime = movie?.runtime ?? null;
    const formattedRuntime = useMemo(
      () => (runtime ? formatRuntime(runtime) : null),
      [runtime],
    );

    if (isLoading) {
      return (
        <div className={styles.c_movie_detail__loading}>
          <Loading size='md' label='読み込み中...' />
        </div>
      );
    }

    if (isError || !movie) {
      return (
        <div className={styles.c_movie_detail__error}>
          <p className={styles.c_movie_detail__error_text}>
            {UI_ERROR_MESSAGES.MOVIE_DETAIL_FETCH_FAILED}
          </p>
        </div>
      );
    }

    return (
      <div
        className={cn(
          styles.c_movie_detail,
          isPage && styles['c_movie_detail--page'],
        )}
      >
        {backdropUrl && (
          <div className={styles.c_movie_detail__backdrop}>
            <Image
              src={backdropUrl}
              alt=''
              fill
              sizes='(max-width: 900px) 100vw, 900px'
              className={styles.c_movie_detail__backdrop_image}
            />
            <div className={styles.c_movie_detail__backdrop_overlay} />
            {trailerVideos.length > 0 && (
              <button
                type='button'
                className={styles.c_movie_detail__play_button}
                onClick={handleOpenVideoDialog}
                aria-label={ARIA_LABELS.PLAY_TRAILER}
              >
                <IoPlayOutline size={ICON_SIZES.LG} />
              </button>
            )}
          </div>
        )}

        <div className={styles.c_movie_detail__body}>
          <div className={styles.c_movie_detail__main}>
            {posterUrl && (
              <div className={styles.c_movie_detail__poster}>
                <Image
                  src={posterUrl}
                  alt={`${movie.title}のポスター`}
                  width={IMAGE_SIZES.POSTER_DETAIL.WIDTH}
                  height={IMAGE_SIZES.POSTER_DETAIL.HEIGHT}
                  className={styles.c_movie_detail__poster_image}
                />
              </div>
            )}

            <div className={styles.c_movie_detail__info}>
              <div className={styles.c_movie_detail__title_row}>
                <TitleTag className={styles.c_movie_detail__title}>
                  {movie.title}
                </TitleTag>
                <div className={styles.c_movie_detail__action_buttons}>
                  <button
                    type='button'
                    className={styles.c_movie_detail__share_button}
                    onClick={handleShare}
                    aria-label={ARIA_LABELS.SHARE_MOVIE(movie.title)}
                  >
                    <IoShareOutline aria-hidden='true' />
                  </button>
                  {canFavorite && (
                    <FavoriteButton
                      favorite={movie.favorite ?? null}
                      onClick={handleFavoriteClick}
                      disabled={isFavoriteProcessing}
                      size='md'
                    />
                  )}
                  <WatchlistAddButton
                    isInWatchlist={inWatchlist}
                    onClick={handleWatchlistToggle}
                    disabled={isToggling}
                    size='md'
                  />
                </div>
              </div>
              {movie.original_title !== movie.title && (
                <p className={styles.c_movie_detail__original_title}>
                  {movie.original_title}
                </p>
              )}

              <div className={styles.c_movie_detail__meta}>
                {formattedDate && (
                  <span className={styles.c_movie_detail__meta_item}>
                    {formattedDate}
                  </span>
                )}
                {formattedRuntime && (
                  <span className={styles.c_movie_detail__meta_item}>
                    {formattedRuntime}
                  </span>
                )}
                {movie.vote_average > 0 && (
                  <span className={styles.c_movie_detail__rating}>
                    {movie.vote_average.toFixed(1)}
                  </span>
                )}
              </div>

              {movie.genres.length > 0 && (
                <div className={styles.c_movie_detail__genres}>
                  {movie.genres.map((genre) => (
                    <span
                      key={genre.id}
                      className={styles.c_movie_detail__genre_tag}
                    >
                      {genre.name}
                    </span>
                  ))}
                </div>
              )}

              {jpProviders &&
                (jpProviders.flatrate ||
                  jpProviders.rent ||
                  jpProviders.buy) && (
                  <div className={styles.c_movie_detail__providers}>
                    {jpProviders.flatrate &&
                      jpProviders.flatrate.length > 0 && (
                        <ProviderCategory
                          label='配信'
                          providers={jpProviders.flatrate}
                        />
                      )}
                    {jpProviders.rent && jpProviders.rent.length > 0 && (
                      <ProviderCategory
                        label='レンタル'
                        providers={jpProviders.rent}
                      />
                    )}
                    {jpProviders.buy && jpProviders.buy.length > 0 && (
                      <ProviderCategory
                        label='購入'
                        providers={jpProviders.buy}
                      />
                    )}
                  </div>
                )}
            </div>
          </div>

          {/*
            max-height 固定のスクロール領域。フォーカス可能な子孫はキャストの
            リンクだけなので、キャスト情報が無い作品ではゼロになり、
            キーボードでスクロールできなくなる（axe: scrollable-region-focusable）。
            領域自体にタブストップを置いて到達できるようにする。

            ページ版はこの領域がスクロールしないので、タブストップは置かない
            （到達する理由が無いのにタブ順へ割り込むだけになる）。
          */}
          <div
            className={styles.c_movie_detail__scrollable}
            role='region'
            aria-label={ARIA_LABELS.MOVIE_DETAIL_INFO}
            tabIndex={isPage ? undefined : 0}
          >
            {movie.overview && (
              <div className={styles.c_movie_detail__overview}>
                <SectionTag className={styles.c_movie_detail__section_title}>
                  あらすじ
                </SectionTag>
                <p className={styles.c_movie_detail__overview_text}>
                  {movie.overview}
                </p>
              </div>
            )}
            <div className={styles.c_movie_detail__additional}>
              <SectionTag className={styles.c_movie_detail__section_title}>
                詳細情報
              </SectionTag>
              <dl className={styles.c_movie_detail__info_list}>
                {movie.production_companies.length > 0 && (
                  <>
                    <dt className={styles.c_movie_detail__info_label}>
                      制作会社
                    </dt>
                    <dd className={styles.c_movie_detail__info_value}>
                      {movie.production_companies
                        .map((company) => company.name)
                        .join('、')}
                    </dd>
                  </>
                )}

                {movie.production_countries.length > 0 && (
                  <>
                    <dt className={styles.c_movie_detail__info_label}>
                      制作国
                    </dt>
                    <dd className={styles.c_movie_detail__info_value}>
                      {movie.production_countries
                        .map((country) => country.name)
                        .join('、')}
                    </dd>
                  </>
                )}

                <dt className={styles.c_movie_detail__info_label}>人気度</dt>
                <dd className={styles.c_movie_detail__info_value}>
                  {movie.popularity.toFixed(1)}
                </dd>

                {showFinancialInfo && (
                  <>
                    <dt className={styles.c_movie_detail__info_label}>
                      制作予算
                    </dt>
                    <dd className={styles.c_movie_detail__info_value}>
                      {formatCurrency(movie.budget)}
                    </dd>

                    <dt className={styles.c_movie_detail__info_label}>
                      興行収入
                    </dt>
                    <dd className={styles.c_movie_detail__info_value}>
                      {formatCurrency(movie.revenue)}
                    </dd>
                  </>
                )}
              </dl>
            </div>

            {movie.credits && movie.credits.cast.length > 0 && (
              <div className={styles.c_movie_detail__cast}>
                <SectionTag className={styles.c_movie_detail__section_title}>
                  キャスト
                </SectionTag>
                <div className={styles.c_movie_detail__cast_list}>
                  {movie.credits.cast
                    .slice(0, DISPLAY_LIMITS.CAST_MAX)
                    .map((actor) => {
                      const profileUrl = getTMDbProfileUrl(actor.profile_path);
                      return (
                        <Link
                          key={actor.id}
                          href={ROUTES.PERSON_DETAIL(actor.id)}
                          className={styles.c_movie_detail__cast_item}
                          aria-label={`${actor.name}のプロフィール`}
                          replace={shouldReplaceNavigation}
                          onClick={handleCastClick}
                        >
                          {profileUrl ? (
                            <Image
                              src={profileUrl}
                              alt={actor.name}
                              width={IMAGE_SIZES.CAST.WIDTH}
                              height={IMAGE_SIZES.CAST.HEIGHT}
                              className={styles.c_movie_detail__cast_image}
                            />
                          ) : (
                            <div
                              className={
                                styles.c_movie_detail__cast_placeholder
                              }
                            >
                              {actor.name.charAt(0)}
                            </div>
                          )}
                          <div className={styles.c_movie_detail__cast_info}>
                            <span className={styles.c_movie_detail__cast_name}>
                              {actor.name}
                            </span>
                            {actor.character && (
                              <span
                                className={
                                  styles.c_movie_detail__cast_character
                                }
                              >
                                {actor.character}
                              </span>
                            )}
                          </div>
                        </Link>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        </div>

        {trailerVideos.length > 0 && (
          <VideoDialog
            open={isVideoDialogOpen}
            onOpenChange={handleVideoDialogOpenChange}
            videos={trailerVideos}
            movieTitle={movie.title}
          />
        )}

        <FavoriteRatingModal
          isOpen={favoriteModalState.isOpen}
          onClose={closeFavoriteModal}
          movieTitle={favoriteModalState.movie?.title ?? ''}
          currentFavorite={favoriteModalState.currentFavorite}
          onSubmit={handleFavoriteModalSubmit}
          onDelete={handleFavoriteDelete}
        />
      </div>
    );
  },
);

MovieDetailContent.displayName = 'MovieDetailContent';
