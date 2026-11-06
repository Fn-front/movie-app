/**
 * プライバシーポリシーページ
 */

import type { Metadata } from 'next';

import { PrivacyPage as PrivacyPageContent } from '@/features/privacy/privacyPage/privacyPage';

export const metadata: Metadata = {
  title: 'プライバシーポリシー | Movie App',
  description: '利用目的・外部送信先・開示等のご請求について',
};

export default function PrivacyPage() {
  return <PrivacyPageContent />;
}
