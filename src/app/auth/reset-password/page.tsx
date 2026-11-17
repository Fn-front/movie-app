/**
 * パスワード再設定ページ（メールのリンクから到達する）
 */

import type { Metadata } from 'next';

import { ResetPasswordForm } from '@/features/auth/resetPasswordForm/resetPasswordForm';
import { ACCOUNT_SETUP_ISSUED_PARAM } from '@/constants/adminAccount';

export const metadata: Metadata = {
  title: '新しいパスワードの設定 | Movie App',
  description: '新しいパスワードを設定します',
  // トークンがURLに載るため、検索エンジンに拾わせない
  robots: { index: false, follow: false },
};

interface ResetPasswordPageProps {
  searchParams: Promise<{
    token?: string | string[];
    [ACCOUNT_SETUP_ISSUED_PARAM.NAME]?: string | string[];
  }>;
}

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const params = await searchParams;
  const token = params.token;
  // 重複指定（?token=a&token=b）等で配列になった場合は不正として扱う
  const tokenParam = typeof token === 'string' ? token : undefined;

  // admin 発行経由の印（`buildAccountSetupUrl` が付ける）。
  // 案内文言を切り替えるだけで、トークンの検証には一切使わない
  const isIssuedAccount =
    params[ACCOUNT_SETUP_ISSUED_PARAM.NAME] ===
    ACCOUNT_SETUP_ISSUED_PARAM.VALUE;

  return (
    <ResetPasswordForm token={tokenParam} isIssuedAccount={isIssuedAccount} />
  );
}
