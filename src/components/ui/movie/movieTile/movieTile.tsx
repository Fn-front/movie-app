/**
 * MovieTileコンポーネント
 * 映画一覧のタイルアイテム
 */

'use client';

import { memo, useCallback, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';

import { Card } from '@/components/ui/card/card';
import { WatchlistAddButton } from '@/features/watchlist/component/watchlistAddButton/watchlistAddButton';
import { FavoriteButton } from '@/features/favorites/component/favoriteButton/favoriteButton';
import { DismissButton } from '@/features/dismissedMovies/component/dismissButton/dismissButton';
import { getTMDbPosterUrl } from '@/utils/image';
import { shouldLetBrowserHandle } from '@/utils/linkClick';
import {
  IMAGE_SIZES,
  RATING_THRESHOLDS,
  DISPLAY_LIMITS,
  ROUTES,
} from '@/constants';
import { formatDate } from '@/utils/date';
import { isMovieReleased } from '@/utils/movie';
import { cn } from '@/utils/cn';
import {
  DEFAULT_MOVIE_VIEW_MODE,
  type MovieViewMode,
} from '@/hooks/useMovieViewMode';
import type { MovieCacheItem } from '@/lib/api/movies/movies';
import type { MovieFavoriteInfo } from '@/lib/api/favorites/favorites';

import styles from './movieTile.module.scss';

/**
 * MovieTileコンポーネントのプロパティ
 */
export interface MovieTileProps {
  /** 映画データ */
  movie: MovieCacheItem;
  /** ジャンルマップ */
  genres?: Record<number, string>;
  /**
   * タイトルが押されたことを記録するコールバック（計測用）
   *
   * **遷移には使わない。** 新しいタブで開かれたときも含め、押されれば必ず
   * 呼ぶ（レコメンドのクリック計測が取りこぼさないようにするため）。
   */
  onClick?: (movieId: number) => void;
  /**
   * タイトルを「その場で開く」ときのコールバック
   *
   * 渡すと、**修飾キーなしの左クリックだけ**を横取りして遷移を止め、
   * 代わりにこれを呼ぶ。呼び出し側は一覧の URL に `?movie_id=<id>` を足して
   * モーダルを重ねる（#1033）。
   *
   * 渡さなければ素のリンクとして `/movies/<id>` へ遷移する。
   *
   * ⚠️ Ctrl・⌘・中クリック・Shift は横取りしない。新しいタブ／ウィンドウで
   * 開く操作を奪うと、リンクである意味が無くなる。
   */
  onSelect?: (movieId: number) => void;
  /** ウォッチリストに追加済みかどうか */
  isInWatchlist?: boolean;
  /** ウォッチリストボタンクリック時のコールバック */
  onWatchlistToggle?: (movie: MovieCacheItem) => void;
  /** ウォッチリストボタン無効化 */
  watchlistDisabled?: boolean;
  /** お気に入りボタンクリック時のコールバック */
  onFavoriteToggle?: (
    movie: MovieCacheItem,
    favorite: MovieFavoriteInfo | null,
  ) => void;
  /** お気に入りボタン無効化 */
  favoriteDisabled?: boolean;
  /** 興味なしボタンクリック時のコールバック */
  onDismiss?: (movie: MovieCacheItem) => void;
  /** 興味なしボタン無効化 */
  dismissDisabled?: boolean;
  /**
   * タイトルの見出しレベル
   * 置かれるセクションの階層に合わせる（見出しレベルを飛ばさないため）
   */
  headingLevel?: 2 | 3 | 4;
  /**
   * 日付としてデジタル（配信）公開日を優先表示するか（既定: false）
   *
   * 配信予定タブ専用。`release_date` は作品につき実質1つの代表日で多くは
   * 劇場公開日が入るため、配信予定の文脈では過去日が出てしまう。
   * 劇場公開タブ・配信中タブ・他画面の表示を変えないよう、
   * 呼び出し側が明示的に有効化する
   */
  preferDigitalReleaseDate?: boolean;
  /**
   * ポスターを遅延せず即時読み込みするか（既定: false）
   *
   * フォールド上のタイルは LCP 要素になりうるため、遅延読み込みのままだと
   * 表示開始が遅れる。グリッドは `auto-fill` で列数がビューポート幅により
   * 変わり、どのタイルが LCP になるかが一意に定まらないため、`preload`
   * ではなく `loading="eager"` を使う（next/image のドキュメントが
   * 「LCP 候補が複数あるときは preload を使わない」と明示している）。
   *
   * 後続タイルの遅延読み込みを潰さないよう、**先頭数件にだけ**渡すこと。
   */
  eager?: boolean;
  /**
   * 表示モード（既定: グリッド）
   *
   * `list` では横並びへ組み替え、ジャンルタグを落とし、操作ボタンを
   * タイトルの後ろへ移す（視覚順と DOM 順を揃えるため）。
   * タイトルリンクの ::after によるカード全面の当たり判定（#719）と、
   * ボタンを入れ子にしない構造はそのまま保つ。
   */
  viewMode?: MovieViewMode;
}

/**
 * MovieTileコンポーネント
 */
export const MovieTile = memo<MovieTileProps>(function MovieTile({
  movie,
  genres,
  onClick,
  onSelect,
  isInWatchlist = false,
  onWatchlistToggle,
  watchlistDisabled = false,
  onFavoriteToggle,
  favoriteDisabled = false,
  onDismiss,
  dismissDisabled = false,
  headingLevel = 3,
  preferDigitalReleaseDate = false,
  eager = false,
  viewMode = DEFAULT_MOVIE_VIEW_MODE,
}) {
  const Title = `h${headingLevel}` as const;

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      // 計測は遷移の仕方によらず走らせる（新しいタブで開かれた分も数える）
      onClick?.(movie.id);

      if (!onSelect) return;

      // 新しいタブ・ウィンドウで開く操作と、既に止められたイベントには触らない
      if (shouldLetBrowserHandle(event)) return;

      event.preventDefault();
      onSelect(movie.id);
    },
    [movie.id, onClick, onSelect],
  );

  const handleWatchlistToggle = useCallback(() => {
    onWatchlistToggle?.(movie);
  }, [movie, onWatchlistToggle]);

  const handleFavoriteToggle = useCallback(() => {
    onFavoriteToggle?.(movie, movie.favorite ?? null);
  }, [movie, onFavoriteToggle]);

  const handleDismiss = useCallback(() => {
    onDismiss?.(movie);
  }, [movie, onDismiss]);

  // お気に入りは1〜10の評価とセットで登録する機能なので、まだ観られない作品では出さない。
  // ウォッチリストと興味なしは公開前でも使うため、ここでは絞らない。
  //
  // リバイバル上映は除外する。カードが持つ release_date は「日本での再上映日」で
  // 未来になるが、作品自体は過去に公開済み（詳細モーダルは元の公開日を表示する）。
  const canFavorite = useMemo(
    () => movie.is_revival || isMovieReleased(movie.release_date, new Date()),
    [movie.is_revival, movie.release_date],
  );

  const posterUrl = getTMDbPosterUrl(movie.poster_path);

  // デジタル公開日を優先する場合でも、未登録なら従来どおり release_date を出す
  const displayDate =
    (preferDigitalReleaseDate ? movie.digital_release_date : null) ??
    movie.release_date;
  const formattedDate = displayDate ? formatDate(displayDate) : null;

  const ratingClassName = useMemo(() => {
    if (movie.vote_average == null || movie.vote_average <= 0) return '';
    if (movie.vote_average >= RATING_THRESHOLDS.HIGH)
      return styles.c_movie_tile__rating__high;
    if (movie.vote_average >= RATING_THRESHOLDS.MID)
      return styles.c_movie_tile__rating__mid;
    return styles.c_movie_tile__rating__low;
  }, [movie.vote_average]);

  const genreNames = useMemo(() => {
    // リスト行はジャンルタグが2行に折り返すと行の高さが揃わず、
    // 1画面に入る件数が1件ぶん減る。リストでは出さない（#1014）
    if (viewMode === 'list') return [];
    if (!genres || !movie.genre_ids || movie.genre_ids.length === 0) {
      return [];
    }
    return movie.genre_ids
      .slice(0, DISPLAY_LIMITS.GENRE_MAX)
      .map((id) => genres[id])
      .filter(Boolean);
  }, [genres, movie.genre_ids, viewMode]);

  const isList = viewMode === 'list';

  /**
   * 操作ボタン群
   *
   * グリッドはポスターに重ねるので `__poster` の中、リストは行の右端に置くので
   * `__info` の後ろに出す。**視覚順と DOM 順（＝ Tab 順・読み上げ順）を
   * 揃えるため**で、リストでも `__poster` の中に置くと「右端のボタン →
   * 左のタイトル」と毎行逆走する（WCAG 1.3.2 / 2.4.3）
   */
  const actionButtons = (
    <>
      {onDismiss && (
        <div className={styles.c_movie_tile__dismiss_button}>
          <DismissButton onClick={handleDismiss} disabled={dismissDisabled} />
        </div>
      )}
      {onFavoriteToggle && canFavorite && (
        <div className={styles.c_movie_tile__favorite_button}>
          <FavoriteButton
            favorite={movie.favorite ?? null}
            onClick={handleFavoriteToggle}
            disabled={favoriteDisabled}
          />
        </div>
      )}
      {onWatchlistToggle && (
        <div className={styles.c_movie_tile__watchlist_button}>
          <WatchlistAddButton
            isInWatchlist={isInWatchlist}
            onClick={handleWatchlistToggle}
            disabled={watchlistDisabled}
          />
        </div>
      )}
    </>
  );

  const hasActions = Boolean(
    onDismiss || (onFavoriteToggle && canFavorite) || onWatchlistToggle,
  );

  return (
    // カード全体を role="button" にすると、内側のお気に入り等のボタンが
    // インタラクティブ要素の入れ子になり ARIA 上不正になる（axe: nested-interactive）。
    // 代わりにタイトルを本物のリンクにし、::after でカード全面を当たり判定にする（#719）。
    <Card
      hoverable
      noPadding
      className={cn(
        styles.c_movie_tile,
        isList && styles['c_movie_tile--list'],
      )}
    >
      <div className={styles.c_movie_tile__poster}>
        {posterUrl ? (
          <Image
            src={posterUrl}
            alt={`${movie.title}のポスター`}
            width={IMAGE_SIZES.POSTER.WIDTH}
            height={IMAGE_SIZES.POSTER.HEIGHT}
            // リストの枠は 56px しかない。グリッド用の 190px のままだと
            // 3倍以上大きい候補を取りに行く（#982 で sizes を入れた意図）
            sizes={
              isList
                ? `${IMAGE_SIZES.CALENDAR_POSTER.WIDTH}px`
                : IMAGE_SIZES.POSTER.SIZES
            }
            loading={eager ? 'eager' : 'lazy'}
            className={styles.c_movie_tile__image}
          />
        ) : (
          <div className={styles.c_movie_tile__no_image}>No Image</div>
        )}
        {movie.is_revival && (
          <span className={styles.c_movie_tile__revival}>リバイバル</span>
        )}
        {!isList && actionButtons}
      </div>
      <div className={styles.c_movie_tile__info}>
        <Title className={styles.c_movie_tile__title}>
          <Link
            href={ROUTES.MOVIE_DETAIL(movie.id)}
            className={styles.c_movie_tile__title_link}
            onClick={handleClick}
          >
            {movie.title}
          </Link>
        </Title>
        {genreNames.length > 0 && (
          <div className={styles.c_movie_tile__genres}>
            {genreNames.map((name) => (
              <span key={name} className={styles.c_movie_tile__genre_tag}>
                {name}
              </span>
            ))}
          </div>
        )}
        <div className={styles.c_movie_tile__footer}>
          {formattedDate && (
            <p className={styles.c_movie_tile__date}>{formattedDate}</p>
          )}
          {movie.vote_average != null && movie.vote_average > 0 && (
            <span
              className={`${styles.c_movie_tile__rating} ${ratingClassName}`}
            >
              {movie.vote_average.toFixed(1)}
            </span>
          )}
        </div>
      </div>
      {isList && hasActions && (
        <div className={styles.c_movie_tile__list_actions}>{actionButtons}</div>
      )}
    </Card>
  );
});

MovieTile.displayName = 'MovieTile';
