/**
 * アカウント設定ページ
 */

import type { Metadata } from 'next';

import { SettingsPage as SettingsPageContent } from '@/features/settings/settingsPage/settingsPage';

export const metadata: Metadata = {
  title: 'アカウント設定 | Movie App',
  description: 'アカウント設定の管理',
};

export default function SettingsPage() {
  return <SettingsPageContent />;
}
