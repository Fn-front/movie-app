/**
 * VideoDialogコンポーネント
 * 映画の予告動画を表示するダイアログ
 */

'use client';

import { memo, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { IoCloseOutline, IoLogoYoutube } from 'react-icons/io5';

import {
  ICON_SIZES,
  ARIA_LABELS,
  EXTERNAL_URLS,
  VIDEO_DIALOG_LABELS,
} from '@/constants';
import { useOverlayHistory } from '@/hooks/useOverlayHistory';
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
  /** 動画一覧（表示順に並べたもの。絞り込み・並び替えは selectTrailerVideos が担う） */
  videos: Video[];
  /** 映画タイトル */
  movieTitle: string;
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
  // 映画詳細の上に重なるため、戻る1回でこちらだけが閉じる必要がある（#1026）
  const handleHistoryClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  useOverlayHistory(open, handleHistoryClose);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.c_video_dialog__overlay} />
        <Dialog.Content
          className={styles.c_video_dialog__content}
          aria-label={`${movieTitle}の予告動画`}
          /*
            Radix は常に aria-describedby を出すが、ここでは Dialog.Description を
            描画しないため、存在しないIDを指す dangling IDREF になる（#791）。
            動画一覧に補足説明は不要なので属性ごと外す。
          */
          aria-describedby={undefined}
        >
          <Dialog.Title className={styles.c_video_dialog__sr_only}>
            {movieTitle}の予告動画
          </Dialog.Title>

          {/*
            ⚠️ **閉じるボタンは iframe より前に置く**（#1092）。

            このダイアログは Escape で閉じられないことがある。埋め込みが
            別オリジンの iframe（youtube-nocookie.com）なので、プレイヤーに
            フォーカスが移ると keydown はその iframe の document に入り、
            Radix の escape 検知（本体側の document）に届かない。別オリジンで
            ある以上、本体側からキー入力は観測できない。

            実測: フォーカスが閉じるボタンなら Escape で閉じるが、iframe だと
            閉じない。CI の E2E が断続的に落ちて判明した。

            そのため**保証できる脱出路はこのボタン**になる。DOM 上で最初の
            フォーカス可能要素にしておくことで、`FocusScope` の `loop` により
            **最後尾から前方向へ回り込んで戻れる**（動画の件数によらず一定）。

            ⚠️ 逆向き（Shift+Tab）で1回で戻れるのは**先頭の動画からだけ**。
            動画は最大5件並び（`TRAILER_DISPLAY_LIMIT`）、各件が iframe と
            「YouTubeで見る」リンクを持つので、後ろの動画ほど遡る距離が伸びる。

            順番を変えると、プレイヤーを操作したキーボード利用者の出口が
            遠くなる。`e2e/a11y/keyboard.spec.ts` が固定している。
          */}
          <Dialog.Close className={styles.c_video_dialog__close}>
            <IoCloseOutline size={ICON_SIZES.MD} aria-hidden='true' />
            <span className={styles.c_video_dialog__sr_only}>
              {ARIA_LABELS.CLOSE}
            </span>
          </Dialog.Close>

          <div className={styles.c_video_dialog__list}>
            {videos.map((video) => (
              <div key={video.id} className={styles.c_video_dialog__item}>
                <div className={styles.c_video_dialog__video_wrapper}>
                  <iframe
                    src={`${EXTERNAL_URLS.YOUTUBE_EMBED}/${encodeURIComponent(video.key)}`}
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
                  {/*
                    埋め込みが使えないときの代替導線（#980）。
                    クロスオリジンの iframe は onError が発火せず失敗を
                    検知できないため、出し分けずに常時置く
                  */}
                  <a
                    href={`${EXTERNAL_URLS.YOUTUBE_WATCH}?v=${encodeURIComponent(video.key)}`}
                    target='_blank'
                    rel='noopener noreferrer'
                    className={styles.c_video_dialog__youtube_link}
                  >
                    <IoLogoYoutube size={ICON_SIZES.SM} aria-hidden='true' />
                    {VIDEO_DIALOG_LABELS.WATCH_ON_YOUTUBE}
                    <span className={styles.c_video_dialog__sr_only}>
                      {VIDEO_DIALOG_LABELS.WATCH_ON_YOUTUBE_DETAIL(video.name)}
                    </span>
                  </a>
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
