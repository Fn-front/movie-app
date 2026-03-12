/**
 * ログインページ
 */

import type { Metadata } from 'next';

import { SignInContent } from '@/features/auth/signInContent/signInContent';

export const metadata: Metadata = {
  title: 'ログイン | Movie App',
  description: 'Movie Appにログイン',
};

export default function SignInPage() {
  return <SignInContent />;
}
