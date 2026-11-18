/**
 * ログインページ
 */

import type { Metadata } from 'next';

import { SignInContent } from '@/features/auth/signInContent/signInContent';
import { ACCOUNT_SETUP_USERNAME_PARAM } from '@/constants/adminAccount';
import { SIGN_IN_PAGE_ERROR_MESSAGES } from '@/constants/auth';
import { resolveAuthErrorMessage } from '@/utils/authErrorMessage';

export const metadata: Metadata = {
  title: 'ログイン | Movie App',
  description: 'Movie Appにログイン',
};

interface SignInPageProps {
  searchParams: Promise<{
    callbackUrl?: string | string[];
    error?: string | string[];
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

  // ソーシャルログインの失敗（#1242）。Auth.js は `kind = 'signIn'` の
  // エラーを `/auth/error` ではなくここへ戻すが、読んでいなかったため
  // 「押したのに何も起きずログイン画面に戻された」ように見えていた。
  //
  // 配列（?error=a&error=b）は不正として既定の文言に倒す。undefined を
  // 渡せば resolveAuthErrorMessage が DEFAULT を返す
  const { error } = params;
  const errorMessage =
    error === undefined
      ? undefined
      : resolveAuthErrorMessage(
          SIGN_IN_PAGE_ERROR_MESSAGES,
          typeof error === 'string' ? error : undefined,
        );

  return (
    <SignInContent
      callbackUrl={callbackUrlParam}
      initialIdentifier={initialIdentifier}
      initialError={errorMessage}
    />
  );
}
