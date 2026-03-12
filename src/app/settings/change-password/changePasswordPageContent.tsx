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

    if (!email) return null;

    return <ChangePasswordForm email={email} />;
  },
);

ChangePasswordPageContent.displayName = 'ChangePasswordPageContent';
