import { AppLayout } from '@/components/layout/appLayout/appLayout';

export default function FavoritesLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AppLayout>{children}</AppLayout>;
}
