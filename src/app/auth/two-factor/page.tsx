/**
 * 二段階認証コードの入力ページ
 *
 * OAuthログイン後、第2要素が未了のときだけ到達する。
 * 到達可否の判定は proxy が行う（`src/proxy.ts`）。
 */

import type { Metadata } from 'next';

import { TwoFactorChallenge } from '@/features/auth/twoFactorChallenge/twoFactorChallenge';

export const metadata: Metadata = {
  title: '二段階認証 | Movie App',
  description: '認証アプリのコードを入力してログインを完了します',
};

interface TwoFactorPageProps {
  searchParams: Promise<{ callbackUrl?: string | string[] }>;
}

export default async function TwoFactorPage({
  searchParams,
}: TwoFactorPageProps) {
  const { callbackUrl } = await searchParams;
  // 重複指定（?callbackUrl=a&callbackUrl=b）等で配列になった場合は不正として扱う
  const callbackUrlParam =
    typeof callbackUrl === 'string' ? callbackUrl : undefined;

  return <TwoFactorChallenge callbackUrl={callbackUrlParam} />;
}
