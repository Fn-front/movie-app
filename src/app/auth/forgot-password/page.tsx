/**
 * パスワードを忘れた場合のページ
 */

import type { Metadata } from 'next';

import { ForgotPasswordForm } from '@/features/auth/forgotPasswordForm/forgotPasswordForm';

export const metadata: Metadata = {
  title: 'パスワードの再設定 | Movie App',
  description: 'パスワード再設定用のリンクをメールで受け取ります',
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
