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
  // 重複指定（?callbackUrl=a&callbackUrl=b）で配列になる場合は先頭を採用
  const normalizedCallbackUrl = Array.isArray(callbackUrl)
    ? callbackUrl[0]
    : callbackUrl;
  return <SignInContent callbackUrl={normalizedCallbackUrl} />;
}
