/**
 * WatchlistItemコンポーネント
 * ウォッチリストの個別アイテム表示（小ポスター + タイトル + 削除ボタン）
 */

'use client';

import { memo, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { IoCloseOutline } from 'react-icons/io5';

import { IMAGE_SIZES, ROUTES } from '@/constants';
import { formatDate } from '@/utils/date';
import { getTMDbImageUrl } from '@/utils/image';
import { shouldLetBrowserHandle } from '@/utils/linkClick';
import type { WatchlistItem as WatchlistItemType } from '@/lib/api/watchlist/watchlist';

import styles from './watchlistItem.module.scss';

/**
 * WatchlistItemコンポーネントのプロパティ
 */
export interface WatchlistItemProps {
  /** ウォッチリストアイテムデータ */
  item: WatchlistItemType;
  /** アイテムクリック時のコールバック（映画詳細モーダル表示用） */
  onClick: (tmdbMovieId: number) => void;
  /** 削除ボタンクリック時のコールバック */
  onDelete: (id: string) => void;
}

/**
 * WatchlistItemコンポーネント
 */
export const WatchlistItem = memo<WatchlistItemProps>(function WatchlistItem({
  item,
  onClick,
  onDelete,
}) {
  // タイトルのリンクを行全面の当たり判定にするので、左クリックだけ
  // 横取りしてモーダルで開く。修飾キー付き・中クリックは既定動作に任せる
  const handleTitleClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (shouldLetBrowserHandle(event)) {
        return;
      }

      event.preventDefault();
      onClick(item.tmdb_movie_id);
    },
    [onClick, item.tmdb_movie_id],
  );

  const handleDelete = useCallback(() => {
    onDelete(item.id);
  }, [onDelete, item.id]);

  const posterUrl = getTMDbImageUrl(item.poster_path, 'w92');
  // 整形後の値でガードする。`item.release_date` で判定すると、`formatDate` が
  // null を返す値（不正な日付）のときに中身の無い `<p>` が残る（#1091）。
  // `MovieTile` / `WatchlistTile` も同じ形
  const formattedDate = formatDate(item.release_date);

  return (
    // 行全体を role="button" にすると、内側の削除ボタンが
    // インタラクティブ要素の入れ子になり ARIA 上不正になる
    // （axe: nested-interactive / #1064）。タイトルを本物のリンクにし、
    // ::after で行全面を当たり判定にする（#719 の MovieTile と同じ）
    <div className={styles.c_watchlist_item}>
      {posterUrl ? (
        <Image
          className={styles.c_watchlist_item__poster}
          src={posterUrl}
          alt={`${item.title}のポスター`}
          width={IMAGE_SIZES.THUMBNAIL.WIDTH}
          height={IMAGE_SIZES.THUMBNAIL.HEIGHT}
        />
      ) : (
        <div
          className={styles.c_watchlist_item__poster_fallback}
          aria-hidden='true'
        >
          🎬
        </div>
      )}

      <div className={styles.c_watchlist_item__info}>
        <p className={styles.c_watchlist_item__title} title={item.title}>
          <Link
            href={ROUTES.MOVIE_DETAIL(item.tmdb_movie_id)}
            className={styles.c_watchlist_item__title_link}
            onClick={handleTitleClick}
          >
            {item.title}
          </Link>
        </p>
        {formattedDate && (
          <p className={styles.c_watchlist_item__release_date}>
            {formattedDate}
          </p>
        )}
      </div>

      <button
        className={styles.c_watchlist_item__delete}
        onClick={handleDelete}
        aria-label={`${item.title}をウォッチリストから削除`}
        type='button'
      >
        {/*
          ⚠️ 文字の ✕ を置かない（#1085）。axe の
          label-content-name-mismatch は可視テキストを
          screenReader=false で取るため aria-hidden が効かず、
          「1文字の非数字」は人が解釈できる文字列と見なされないので
          incomplete（要確認）に落ちる。アイコンにすればテキスト
          ノードそのものが無くなる
        */}
        <IoCloseOutline aria-hidden='true' />
      </button>
    </div>
  );
});

WatchlistItem.displayName = 'WatchlistItem';
