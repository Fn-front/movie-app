/**
 * パスワード変更ページ Client Component
 */

'use client';

import { memo } from 'react';
import { useSession } from 'next-auth/react';

import { ChangePasswordForm } from '@/features/settings/changePasswordForm/changePasswordForm';

export const ChangePasswordPageContent = memo(
  function ChangePasswordPageContent() {
    const { data: session } = useSession();
    const email = session?.user?.email ?? '';
    // パスワード未設定（ソーシャルログインのみ）のユーザーには
    // 「現在のパスワード」欄を出さない
    const hasPassword = session?.user?.hasPassword ?? true;

    if (!email) return null;

    return <ChangePasswordForm email={email} hasPassword={hasPassword} />;
  },
);

ChangePasswordPageContent.displayName = 'ChangePasswordPageContent';
