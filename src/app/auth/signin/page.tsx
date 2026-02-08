/**
 * ログインページ
 */

import type { Metadata } from 'next';

import { LoginForm } from '@/features/auth/loginForm/loginForm';

export const metadata: Metadata = {
  title: 'ログイン | Movie App',
  description: 'Movie Appにログイン',
};

export default function SignInPage() {
  return <LoginForm />;
}
