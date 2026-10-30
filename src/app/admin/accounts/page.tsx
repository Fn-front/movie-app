/**
 * アカウント管理ページ（admin ロールのみ）
 *
 * アクセス制御は `src/proxy.ts` と各 API Route の `withAdminAuth` が行う。
 * このページ自体はユーザーデータを持たず、表示はクライアント側で取得する。
 */

import type { Metadata } from 'next';

import { AdminAccountsPageLoader } from './loader';

export const metadata: Metadata = {
  title: 'アカウント管理 | Movie App',
  description: '管理者が発行したアカウントの管理',
  // 管理画面を検索エンジンに拾わせない
  robots: { index: false, follow: false },
};

export default function AdminAccountsPage() {
  return <AdminAccountsPageLoader />;
}
