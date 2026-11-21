/**
 * WatchlistPanelコンポーネント
 * サイドバー内のウォッチリスト表示（公開日が近い順10件 + すべて見るリンク）
 */

'use client';

import { memo, useCallback } from 'react';
import Link from 'next/link';

import { Loading } from '@/components/ui/loading/loading';
import { useOpenMovieDetail } from '@/features/movies/hooks/useMovieDetailQuery';
import { useWatchlist } from '@/features/watchlist/hooks/useWatchlist';
import { WatchlistItem } from '@/features/watchlist/component/watchlistItem/watchlistItem';
import { ROUTES } from '@/constants';

import styles from './watchlistPanel.module.scss';

/** サイドバーに表示する件数 */
const SIDEBAR_DISPLAY_LIMIT = 10;

/**
 * WatchlistPanelコンポーネント
 */
export const WatchlistPanel = memo(function WatchlistPanel() {
  // 視聴済みは除外する。クライアント側で弾くと上位10件の枠が
  // 視聴済みで埋まって表示件数が減るため、取得の段階で落とす
  const { watchlist, isLoading, removeFromWatchlist } = useWatchlist({
    sort: 'release_date_proximity',
    limit: SIDEBAR_DISPLAY_LIMIT,
    excludeWatched: true,
  });

  /**
   * 詳細は URL（`?movie_id=`）で開く（#1077）
   *
   * ⚠️ 以前はここだけローカル state だった。サイドバーは `AppLayout` を
   * 通る**全ページ**に出るので、ページ側にも同じモーダルがあると
   * **2枚同時に開く**（実測: /watchlist で dialog が2つ）。その回避として
   * URL を手放していたため、ここから開いた詳細だけリロードで消えていた。
   *
   * モーダルが `AppLayout` の1箇所になったので URL へ戻せる。
   *
   * ⚠️ `useOpenMovieDetail` は `useSearchParams` を使わない（`window` から
   * 直接読む）。使うと**サイドバーを含む全ページ**が静的プリレンダから
   * 外れる（#1115）。
   */
  const openMovieDetail = useOpenMovieDetail();

  const handleDelete = useCallback(
    (id: string) => {
      removeFromWatchlist(id);
    },
    [removeFromWatchlist],
  );

  if (isLoading) {
    return (
      <div className={styles.c_watchlist_panel__loading}>
        <Loading size='sm' />
      </div>
    );
  }

  return (
    <div className={styles.c_watchlist_panel}>
      {watchlist.length === 0 ? (
        <div className={styles.c_watchlist_panel__empty}>
          <p className={styles.c_watchlist_panel__empty_text}>
            ウォッチリストに映画を追加しましょう
          </p>
          {/*
            このリンクは空状態の導線であると同時に、
            サイドバーのスクロール領域（.c_sidebar__watchlist_content）に
            フォーカス可能な要素を1つ以上残す役割も持つ。
            無いと axe の scrollable-region-focusable 違反になる（#792）。
          */}
          <Link
            href={ROUTES.UPCOMING}
            className={styles.c_watchlist_panel__empty_link}
          >
            公開予定から探す
          </Link>
        </div>
      ) : (
        <>
          <div className={styles.c_watchlist_panel__list} role='list'>
            {watchlist.map((item) => (
              <div key={item.id} role='listitem'>
                <WatchlistItem
                  item={item}
                  onClick={openMovieDetail}
                  onDelete={handleDelete}
                />
              </div>
            ))}
          </div>

          <Link
            href={ROUTES.WATCHLIST}
            className={styles.c_watchlist_panel__show_all}
          >
            すべて見る
          </Link>
        </>
      )}
    </div>
  );
});

WatchlistPanel.displayName = 'WatchlistPanel';
