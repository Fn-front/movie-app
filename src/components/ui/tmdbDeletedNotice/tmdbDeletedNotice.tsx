/**
 * TmdbDeletedNoticeコンポーネント
 * TMDb から消えた作品であることを一覧の行で知らせる（#433 案D）
 */

'use client';

import { memo, useCallback } from 'react';

import { SOFT_DELETED_LIST_RETENTION_HOURS } from '@/constants/cleanup';
import { TMDB_DELETED_NOTICE } from '@/constants/strings';
import { MS_PER_DAY } from '@/constants/time';
import { cn } from '@/utils/cn';

import styles from './tmdbDeletedNotice.module.scss';

/**
 * 物理削除までの残り日数を求める
 *
 * ⚠️ 0 や負数を返さない。掃除は日次 CRON なので、期限を過ぎても次の実行まで
 * 行は残る。「あと0日」は「もう消えた」と読めてしまうため 1 で止める。
 *
 * @param tmdbDeletedAt - 404 を検知した時刻（ISO文字列）
 * @returns 残り日数（1以上）
 */
export function getDaysUntilRemoval(tmdbDeletedAt: string): number {
  const removalAt =
    Date.parse(tmdbDeletedAt) +
    SOFT_DELETED_LIST_RETENTION_HOURS * 60 * 60 * 1000;

  return Math.max(1, Math.ceil((removalAt - Date.now()) / MS_PER_DAY));
}

/**
 * TmdbDeletedNoticeコンポーネントのプロパティ
 */
export interface TmdbDeletedNoticeProps {
  /** 404 を検知した時刻（ISO文字列） */
  tmdbDeletedAt: string;
  /** 今すぐ削除するときのコールバック */
  onRemove: () => void;
  /** 削除ボタンを無効化する（処理中） */
  disabled?: boolean;
  /** 作品名。ボタンのアクセシブルネームに含める */
  movieTitle: string;
  /** 追加のクラス名 */
  className?: string;
}

/**
 * TmdbDeletedNoticeコンポーネント
 *
 * 行は消さずにここで知らせる。利用者が自分で登録したものを黙って消さない
 * ための導線で、放置しても猶予後に掃除の CRON が物理削除する。
 *
 * ⚠️ `role="status"` にしている。一覧を開いた時点で既にそこにある情報で、
 * 操作の結果ではないため `alert` だと割り込みが強すぎる。
 */
export const TmdbDeletedNotice = memo<TmdbDeletedNoticeProps>(
  function TmdbDeletedNotice({
    tmdbDeletedAt,
    onRemove,
    disabled = false,
    movieTitle,
    className,
  }) {
    const days = getDaysUntilRemoval(tmdbDeletedAt);

    const handleRemove = useCallback(
      (event: React.MouseEvent<HTMLButtonElement>) => {
        // 行全体がリンクになっている一覧があるため、詳細へ飛ばさない
        event.preventDefault();
        event.stopPropagation();
        onRemove();
      },
      [onRemove],
    );

    return (
      <div className={cn(styles.c_tmdb_deleted_notice, className)}>
        <p className={styles.c_tmdb_deleted_notice__text} role='status'>
          <span className={styles.c_tmdb_deleted_notice__title}>
            {TMDB_DELETED_NOTICE.TITLE}
          </span>
          <span className={styles.c_tmdb_deleted_notice__detail}>
            {TMDB_DELETED_NOTICE.REMAINING(days)}
          </span>
        </p>
        <button
          type='button'
          className={styles.c_tmdb_deleted_notice__button}
          onClick={handleRemove}
          disabled={disabled}
          aria-label={TMDB_DELETED_NOTICE.REMOVE_LABEL(movieTitle)}
        >
          {TMDB_DELETED_NOTICE.REMOVE}
        </button>
      </div>
    );
  },
);

TmdbDeletedNotice.displayName = 'TmdbDeletedNotice';
