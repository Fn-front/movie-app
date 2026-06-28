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
  searchParams: Promise<{ callbackUrl?: string }>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const { callbackUrl } = await searchParams;
  return <SignInContent callbackUrl={callbackUrl} />;
}
