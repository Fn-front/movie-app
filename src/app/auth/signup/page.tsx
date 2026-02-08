/**
 * 新規登録ページ
 */

import type { Metadata } from 'next';

import { RegisterForm } from '@/features/auth/registerForm/registerForm';

export const metadata: Metadata = {
  title: '新規登録 | Movie App',
  description: 'Movie Appの新規アカウント登録',
};

export default function SignUpPage() {
  return <RegisterForm />;
}
