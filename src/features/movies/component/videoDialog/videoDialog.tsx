/**
 * VideoDialogコンポーネント
 * 映画の予告動画を表示するダイアログ
 */

'use client';

import { memo, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { IoCloseOutline } from 'react-icons/io5';

import { ICON_SIZES, ARIA_LABELS } from '@/constants';
import type { Video } from '@/lib/types';

import styles from './videoDialog.module.scss';

/**
 * VideoDialogコンポーネントのプロパティ
 */
export interface VideoDialogProps {
  /** ダイアログの開閉状態 */
  open: boolean;
  /** ダイアログを閉じる時のコールバック */
  onOpenChange: (open: boolean) => void;
  /** 動画一覧 */
  videos: Video[];
  /** 映画タイトル */
  movieTitle: string;
}

/** 優先表示する動画タイプ（順序が優先度） */
const PRIORITY_TYPES = ['Trailer', 'Teaser'];

/**
 * Trailer/Teaserを優先してソート
 */
function sortVideos(videos: Video[]): Video[] {
  return [...videos].sort((a, b) => {
    const aIndex = PRIORITY_TYPES.indexOf(a.type);
    const bIndex = PRIORITY_TYPES.indexOf(b.type);
    const aPriority = aIndex === -1 ? PRIORITY_TYPES.length : aIndex;
    const bPriority = bIndex === -1 ? PRIORITY_TYPES.length : bIndex;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return (
      new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
    );
  });
}

/**
 * VideoDialogコンポーネント
 */
export const VideoDialog = memo<VideoDialogProps>(function VideoDialog({
  open,
  onOpenChange,
  videos,
  movieTitle,
}) {
  const sortedVideos = useMemo(() => sortVideos(videos), [videos]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.c_video_dialog__overlay} />
        <Dialog.Content
          className={styles.c_video_dialog__content}
          aria-label={`${movieTitle}の予告動画`}
        >
          <Dialog.Title className={styles.c_video_dialog__sr_only}>
            {movieTitle}の予告動画
          </Dialog.Title>

          <Dialog.Close className={styles.c_video_dialog__close}>
            <IoCloseOutline size={ICON_SIZES.MD} aria-hidden='true' />
            <span className={styles.c_video_dialog__sr_only}>
              {ARIA_LABELS.CLOSE}
            </span>
          </Dialog.Close>

          <div className={styles.c_video_dialog__list}>
            {sortedVideos.map((video) => (
              <div key={video.id} className={styles.c_video_dialog__item}>
                <div className={styles.c_video_dialog__video_wrapper}>
                  <iframe
                    src={`https://www.youtube.com/embed/${encodeURIComponent(video.key)}`}
                    title={video.name}
                    allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
                    allowFullScreen
                    className={styles.c_video_dialog__iframe}
                  />
                </div>
                <div className={styles.c_video_dialog__video_info}>
                  <span className={styles.c_video_dialog__video_name}>
                    {video.name}
                  </span>
                  <span className={styles.c_video_dialog__video_type}>
                    {video.type}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
});

VideoDialog.displayName = 'VideoDialog';
