/**
 * ログインページ
 */

import type { Metadata } from 'next';

import { LoginForm } from '@/components/features/auth/loginForm';

export const metadata: Metadata = {
  title: 'ログイン | Movie App',
  description: 'Movie Appにログイン',
};

export default function SignInPage() {
  return <LoginForm />;
}
