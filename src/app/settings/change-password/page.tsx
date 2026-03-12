/**
 * パスワード変更ページ
 */

import type { Metadata } from 'next';

import { ChangePasswordPageContent } from './changePasswordPageContent';

export const metadata: Metadata = {
  title: 'パスワード変更 | Movie App',
  description: 'パスワードの変更',
};

export default function ChangePasswordPage() {
  return <ChangePasswordPageContent />;
}
