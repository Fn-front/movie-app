/**
 * 受賞作品の手動同期ページ（admin ロールのみ）
 *
 * アクセス制御は `src/proxy.ts` と各 API Route の `withAdminAuth` が行う。
 * このページ自体はデータを持たず、表示はクライアント側で取得する。
 */

import type { Metadata } from 'next';

import { AwardsSyncPageLoader } from './loader';

export const metadata: Metadata = {
  title: '受賞作品の手動同期 | Movie App',
  description: '管理者が年と賞を指定して受賞作品データを同期する',
  // 管理画面を検索エンジンに拾わせない
  robots: { index: false, follow: false },
};

export default function AdminAwardsPage() {
  return <AwardsSyncPageLoader />;
}
