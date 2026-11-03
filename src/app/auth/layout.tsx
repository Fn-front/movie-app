/**
 * 認証ページ共通レイアウト
 */

import Link from 'next/link';

import { ROUTES } from '@/constants';

import styles from './layout.module.scss';

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // div のままだと本文がどのランドマークにも属さず、支援技術の
  // ランドマークナビゲーションで本文へ飛べない（axe: landmark-one-main / region）
  return (
    <main className={styles.l_auth}>
      {children}
      {/*
        このレイアウトは AppLayout を通らないのでフッターが無い。
        個人情報を取得するまさにこの画面（特に新規登録）から利用目的へ
        到達できるよう、ポリシーへのリンクを置く。
        <main> の外に出すとどのランドマークにも属さないコンテンツになる
      */}
      <p className={styles.l_auth__privacy}>
        <Link href={ROUTES.PRIVACY}>プライバシーポリシー</Link>
      </p>
    </main>
  );
}
