import { AppLayout } from '@/components/layout/appLayout/appLayout';

export default function AwardsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AppLayout>{children}</AppLayout>;
}
