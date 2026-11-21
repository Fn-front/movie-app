/**
 * パスワード変更ページ Client Component
 */

'use client';

import { memo } from 'react';
import { useSession } from 'next-auth/react';

import { Heading } from '@/components/ui/heading/heading';
import { ChangePasswordForm } from '@/features/settings/changePasswordForm/changePasswordForm';
import { useHasPassword } from '@/features/settings/hooks/useHasPassword';

export const ChangePasswordPageContent = memo(
  function ChangePasswordPageContent() {
    const { data: session } = useSession();
    const email = session?.user?.email ?? '';
    /**
     * パスワード未設定（ソーシャルログインのみ）のユーザーには
     * 「現在のパスワード」欄を出さない
     *
     * ⛔ **ここも設定ページと同じ根拠にする（#1388）。** `ChangePasswordForm`
     * の親は2つあり、E2E が叩いているのはこちらの単独ページのほう。
     * セッション単独だと、初回パスワードを設定した直後に確認コードを
     * 1通消費したあとで 400 になる。
     */
    const hasPassword = useHasPassword(session?.user?.hasPassword ?? true);

    if (!email) return null;

    return (
      <>
        <Heading level={1}>パスワード変更</Heading>
        <ChangePasswordForm email={email} hasPassword={hasPassword} />
      </>
    );
  },
);

ChangePasswordPageContent.displayName = 'ChangePasswordPageContent';
