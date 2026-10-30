'use client';

import dynamic from 'next/dynamic';

const AdminAccountsPage = dynamic(
  () =>
    import('@/features/admin/accountsPage/accountsPage').then((m) => ({
      default: m.AdminAccountsPage,
    })),
  { ssr: false },
);

export function AdminAccountsPageLoader() {
  return <AdminAccountsPage />;
}
