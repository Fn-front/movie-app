/**
 * ログインページ
 */

import type { Metadata } from 'next';

import { SignInContent } from '@/features/auth/signInContent/signInContent';
import { ACCOUNT_SETUP_USERNAME_PARAM } from '@/constants/adminAccount';

export const metadata: Metadata = {
  title: 'ログイン | Movie App',
  description: 'Movie Appにログイン',
};

interface SignInPageProps {
  searchParams: Promise<{
    callbackUrl?: string | string[];
    [ACCOUNT_SETUP_USERNAME_PARAM]?: string | string[];
  }>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const { callbackUrl } = params;
  // 重複指定（?callbackUrl=a&callbackUrl=b）等で配列になった場合は不正として扱い、
  // resolveSafeCallbackUrl と同様にホームへフォールバックさせる（文字列のみ採用）
  const callbackUrlParam =
    typeof callbackUrl === 'string' ? callbackUrl : undefined;

  // パスワード設定の完了画面から渡ってくるアカウント名（#1237）。
  // 入力欄に入れておく。発行アカウントの利用者は自分のメールアドレスを
  // 入れて失敗しがちで、ここまで来たなら値は分かっている
  const account = params[ACCOUNT_SETUP_USERNAME_PARAM];
  const initialIdentifier =
    typeof account === 'string' && account ? account : undefined;

  return (
    <SignInContent
      callbackUrl={callbackUrlParam}
      initialIdentifier={initialIdentifier}
    />
  );
}
