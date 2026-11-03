/**
 * プライバシーポリシーページ
 */

import type { Metadata } from 'next';

import { PrivacyPage as PrivacyPageContent } from '@/features/privacy/privacyPage/privacyPage';

export const metadata: Metadata = {
  title: 'プライバシーポリシー | Movie App',
  description: '取得する情報・利用目的・外部送信先について',
};

export default function PrivacyPage() {
  return <PrivacyPageContent />;
}
