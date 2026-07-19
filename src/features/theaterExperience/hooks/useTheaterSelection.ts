/**
 * 劇場選択フック
 *
 * 選択中の劇場slugを保持し、変更時にURLクエリ(?theater=<slug>)へ反映する。
 * 初期値はサーバーがURLから解決して渡す initialSlug。
 * router.replace でURLを更新することで、リロード・共有時に選択が保持される。
 */

'use client';

import { useCallback, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { THEATER_QUERY_PARAM } from '@/constants';

export function useTheaterSelection(initialSlug: string) {
  const router = useRouter();
  const pathname = usePathname();
  const [slug, setSlug] = useState(initialSlug);

  const selectTheater = useCallback(
    (nextSlug: string) => {
      if (nextSlug === slug) return;
      setSlug(nextSlug);
      // 既存のクエリを保持したまま theater だけ更新する
      const params = new URLSearchParams(
        typeof window !== 'undefined' ? window.location.search : '',
      );
      params.set(THEATER_QUERY_PARAM, nextSlug);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, slug],
  );

  return { slug, selectTheater };
}
