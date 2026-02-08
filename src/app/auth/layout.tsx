/**
 * 認証ページ共通レイアウト
 */

import styles from './layout.module.scss';

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div className={styles.l_auth}>{children}</div>;
}
