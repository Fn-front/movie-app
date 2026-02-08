/**
 * アカウント設定ページ共通レイアウト
 */

import styles from './layout.module.scss';

export default function SettingsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div className={styles.l_settings}>{children}</div>;
}
