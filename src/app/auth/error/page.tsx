/**
 * ログインエラーページ
 *
 * Auth.js の `pages.error`（`src/lib/auth/auth.ts`）が指す先。指定して
 * いながらページが無く 404 になっていた（#1231）。
 */

import type { Metadata } from 'next';

import { AuthErrorNotice } from '@/features/auth/authErrorNotice/authErrorNotice';

export const metadata: Metadata = {
  title: 'ログインできませんでした | Movie App',
  description: 'ログイン処理中にエラーが発生しました',
  // エラーの種類が URL に載る。検索結果に出す意味も無い
  robots: { index: false, follow: false },
};

interface AuthErrorPageProps {
  searchParams: Promise<{ error?: string | string[] }>;
}

export default async function AuthErrorPage({
  searchParams,
}: AuthErrorPageProps) {
  const { error } = await searchParams;
  // 重複指定で配列になった場合は不正として扱い、既定の文言に倒す
  const code = typeof error === 'string' ? error : undefined;

  return <AuthErrorNotice code={code} />;
}
