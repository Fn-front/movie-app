/**
 * パスワード再設定ページ（メールのリンクから到達する）
 */

import type { Metadata } from 'next';

import { ResetPasswordForm } from '@/features/auth/resetPasswordForm/resetPasswordForm';

export const metadata: Metadata = {
  title: '新しいパスワードの設定 | Movie App',
  description: '新しいパスワードを設定します',
  // トークンがURLに載るため、検索エンジンに拾わせない
  robots: { index: false, follow: false },
};

interface ResetPasswordPageProps {
  searchParams: Promise<{ token?: string | string[] }>;
}

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const { token } = await searchParams;
  // 重複指定（?token=a&token=b）等で配列になった場合は不正として扱う
  const tokenParam = typeof token === 'string' ? token : undefined;

  return <ResetPasswordForm token={tokenParam} />;
}
