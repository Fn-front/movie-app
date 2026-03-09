/**
 * アカウント設定ページ共通レイアウト
 */

import { AppLayout } from '@/components/layout/appLayout/appLayout';

export default function SettingsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AppLayout>{children}</AppLayout>;
}
