import { redirect } from 'next/navigation';

import { auth } from '@/lib/auth/auth';
import { ROUTES } from '@/constants/common';
import { AppLayout } from '@/components/layout/appLayout/appLayout';

export default async function WatchlistLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  if (!session?.user) {
    redirect(ROUTES.LOGIN);
  }

  return <AppLayout>{children}</AppLayout>;
}
