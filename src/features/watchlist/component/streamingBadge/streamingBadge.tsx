/**
 * StreamingBadgeコンポーネント
 * ウォッチリストのカードに出す配信バッジ（提供形態 + サービスのロゴ）
 */

'use client';

import { memo, useMemo } from 'react';
import Image from 'next/image';

import {
  WATCHLIST_PROVIDER_LOGO_MAX,
  WATCHLIST_STREAMING_LABELS,
} from '@/constants';
import type { WatchlistStreaming } from '@/lib/api/watchlist/watchlist';
import { toDisplayProviders } from '@/utils/watchProvider';

import styles from './streamingBadge.module.scss';

/**
 * StreamingBadgeコンポーネントのプロパティ
 */
export interface StreamingBadgeProps {
  /** 配信情報 */
  streaming: WatchlistStreaming;
}

/** ロゴの表示サイズ（px） */
const LOGO_SIZE = 16;

/**
 * StreamingBadgeコンポーネント
 *
 * 詳細を開かなくても「どこで観られるか」が分かるようにする。
 * 見放題とレンタルの両方で観られる作品は、API 側で見放題に寄せて返ってくる。
 */
export const StreamingBadge = memo<StreamingBadgeProps>(
  function StreamingBadge({ streaming }) {
    const offerLabel =
      streaming.offer_type === 'flatrate'
        ? WATCHLIST_STREAMING_LABELS.FLATRATE
        : WATCHLIST_STREAMING_LABELS.PAID;

    const providers = useMemo(
      () => toDisplayProviders(streaming.provider_ids),
      [streaming.provider_ids],
    );

    const visible = providers.slice(0, WATCHLIST_PROVIDER_LOGO_MAX);
    const overflow = providers.length - visible.length;

    return (
      <span
        className={styles.c_streaming_badge}
        aria-label={WATCHLIST_STREAMING_LABELS.ariaLabel(
          offerLabel,
          providers.map((provider) => provider.name),
        )}
      >
        <span className={styles.c_streaming_badge__label}>{offerLabel}</span>
        {visible.map((provider) => (
          <Image
            key={provider.id}
            className={styles.c_streaming_badge__logo}
            src={provider.logoUrl}
            alt={provider.name}
            width={LOGO_SIZE}
            height={LOGO_SIZE}
          />
        ))}
        {overflow > 0 && (
          <span className={styles.c_streaming_badge__overflow}>
            {WATCHLIST_STREAMING_LABELS.overflow(overflow)}
          </span>
        )}
      </span>
    );
  },
);

StreamingBadge.displayName = 'StreamingBadge';
