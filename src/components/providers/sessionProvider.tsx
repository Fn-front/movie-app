/**
 * NextAuth.js SessionProviderラッパー
 */

'use client';

import { memo, type ReactNode } from 'react';
import { SessionProvider } from 'next-auth/react';

interface AppSessionProviderProps {
  children: ReactNode;
}

export const AppSessionProvider = memo(function AppSessionProvider({
  children,
}: AppSessionProviderProps) {
  return <SessionProvider>{children}</SessionProvider>;
});

AppSessionProvider.displayName = 'AppSessionProvider';
