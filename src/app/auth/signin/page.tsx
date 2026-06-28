/**
 * ログインページ
 */

import type { Metadata } from 'next';

import { SignInContent } from '@/features/auth/signInContent/signInContent';

export const metadata: Metadata = {
  title: 'ログイン | Movie App',
  description: 'Movie Appにログイン',
};

interface SignInPageProps {
  searchParams: Promise<{ callbackUrl?: string | string[] }>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const { callbackUrl } = await searchParams;
  // 重複指定（?callbackUrl=a&callbackUrl=b）等で配列になった場合は不正として扱い、
  // resolveSafeCallbackUrl と同様にホームへフォールバックさせる（文字列のみ採用）
  const callbackUrlParam =
    typeof callbackUrl === 'string' ? callbackUrl : undefined;
  return <SignInContent callbackUrl={callbackUrlParam} />;
}
