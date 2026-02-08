/**
 * アカウント設定ページ
 */

import type { Metadata } from 'next';

import { ChangePasswordForm } from '@/components/features/settings/changePasswordForm/changePasswordForm';

export const metadata: Metadata = {
  title: 'アカウント設定 | Movie App',
  description: 'アカウント設定の管理',
};

export default function SettingsPage() {
  return <ChangePasswordForm />;
}
