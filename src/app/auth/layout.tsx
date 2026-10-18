/**
 * 認証ページ共通レイアウト
 */

import styles from './layout.module.scss';

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // div のままだと本文がどのランドマークにも属さず、支援技術の
  // ランドマークナビゲーションで本文へ飛べない（axe: landmark-one-main / region）
  return <main className={styles.l_auth}>{children}</main>;
}
