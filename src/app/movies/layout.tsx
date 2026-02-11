import { AppLayout } from '@/components/layout/appLayout/appLayout';

export default function MoviesLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AppLayout>{children}</AppLayout>;
}
