/**
 * 人物API（サーバーサイド用）
 */

import { unstable_cache } from 'next/cache';

import { PERSON_REVALIDATE_SECONDS } from '@/constants';
import { getPersonDetail } from '@/lib/tmdb/tmdb';
import type { PersonDetail } from '@/lib/types';

/**
 * 人物詳細を取得する（Next.jsのデータキャッシュ付き）
 *
 * `generateMetadata`（ページのtitle生成）と `/api/person/[id]`（クライアントの
 * データ取得）の両方から呼ばれる。同じ人物に対する TMDb へのリクエストを
 * 1回に抑えるため、両者で**このキャッシュ済み関数を共有する**。
 * 片方だけ素の `getPersonDetail` を呼ぶと、1回のページ表示で TMDb を2回叩く。
 *
 * 引数は自動的にキャッシュキーへ含まれる。例外はキャッシュされないため、
 * TMDbの一時障害が24時間固定されることはない。
 *
 * ※ Next.js 16 では `use cache` が後継だが、Cache Components（next.config.mjs）が
 *    未有効のため、既存の `nowShowing.server.ts` と同じく `unstable_cache` を使う。
 */
export const getCachedPersonDetail: (
  personId: number,
) => Promise<PersonDetail> = unstable_cache(
  (personId: number) => getPersonDetail(personId),
  ['person-detail'],
  { revalidate: PERSON_REVALIDATE_SECONDS },
);
