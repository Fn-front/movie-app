/**
 * StreamingSortHintコンポーネント
 * ウォッチリストの並び順の理由と、設定の存在を知らせる
 */

'use client';

import { memo, useEffect, useState } from 'react';
import Link from 'next/link';
import { IoInformationCircleOutline } from 'react-icons/io5';

import { Tooltip } from '@/components/ui/tooltip/tooltip';
import {
  ROUTES,
  STREAMING_SCOPE_DEFAULT,
  WATCHLIST_STREAMING_HINT_LABELS,
} from '@/constants';
import type { StreamingScope } from '@/constants';
import { getSettings } from '@/lib/api/user/user';

import styles from './streamingSortHint.module.scss';

/**
 * StreamingSortHintコンポーネント
 *
 * 配信中の作品が先頭に来る理由と、その対象範囲を設定で変えられることを伝える。
 * 設定ページに項目を置くだけでは気づかれないため、並びを見ている場で知らせる。
 */
export const StreamingSortHint = memo(function StreamingSortHint() {
  const [scope, setScope] = useState<StreamingScope>(STREAMING_SCOPE_DEFAULT);

  useEffect(() => {
    let cancelled = false;

    const fetchSettings = async () => {
      try {
        const settings = await getSettings();
        if (!cancelled) {
          setScope(settings.streamingNoticeScope);
        }
      } catch {
        // 既定値のまま表示する。説明文が少しずれるだけで実害が無い
      }
    };

    fetchSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  const description =
    scope === 'flatrate'
      ? WATCHLIST_STREAMING_HINT_LABELS.FLATRATE
      : WATCHLIST_STREAMING_HINT_LABELS.ANY;

  return (
    <Tooltip
      // ⓘ 自体をリンクにする。ツールチップの中身にリンクを置くと
      // キーボード・スクリーンリーダーで操作できなくなるため
      // （Radix Tooltip の仕様。操作可能な要素は Popover 等に置く）
      trigger={
        <Link
          href={ROUTES.SETTINGS}
          className={styles.c_streaming_sort_hint__trigger}
          aria-label={WATCHLIST_STREAMING_HINT_LABELS.TRIGGER_ARIA}
        >
          <IoInformationCircleOutline aria-hidden='true' />
        </Link>
      }
    >
      <span className={styles.c_streaming_sort_hint__body}>{description}</span>
    </Tooltip>
  );
});

StreamingSortHint.displayName = 'StreamingSortHint';
