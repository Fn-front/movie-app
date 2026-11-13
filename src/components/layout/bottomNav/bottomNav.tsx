/**
 * BottomNavコンポーネント
 * SP 幅だけに出す主要導線のボトムナビゲーション（#1028）
 *
 * 従来 SP の移動手段はドロワーだけで、どこへ行くにも「≡ を押す → 項目を押す」の
 * 2タップが要り、しかも ≡ は画面最上部の左端＝片手で最も届きにくい位置にある。
 * 往復の多い主要導線だけを親指の届く下端へ出し、残りはドロワーに置いたままにする。
 *
 * **検索は出さない。** ヘッダー右上の検索トグルが、押すとその場で入力欄を開いて
 * 送信で `/search?query=` へ飛ぶ（`searchBar.tsx`）。すでに1タップで到達できるので、
 * `/search` ページへ行くだけの項目を並べても枠を1つ食うだけの重複導線になる。
 */

'use client';

import { memo, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';

import {
  ARIA_LABELS,
  AUTH_REQUIRED_ROUTES,
  ICON_SIZES,
  NAV_ICON_MAP,
  NAV_ITEMS,
  ROUTES,
} from '@/constants';
import type { NavIconRoute } from '@/constants';
import { cn } from '@/utils/cn';

import styles from './bottomNav.module.scss';
import { useBottomNavHeight } from './useBottomNavHeight';

/**
 * ボトムナビに出す行き先（表示順）
 *
 * **このファイルが持つのは「どれをこの順で出すか」だけ。** ラベルは
 * `NAV_ITEMS`、アイコンは `NAV_ICON_MAP`、保護対象かどうかは
 * `AUTH_REQUIRED_ROUTES`（proxy と共通の真実源。`useNavAuthGuard.ts` 参照）
 * から引く。ここで再宣言すると、ドロワーがラベルを変えたときに同じ SP 画面の
 * 2箇所で呼び名が食い違い、どちらのテストも自分の文字列を見ているので
 * 検知できない。
 */
// 型は NavIconRoute。アイコンのある行き先しか出せないので、
// アイコン未定義のルートを足すとここでコンパイルエラーになる（#1020）
const BOTTOM_NAV_HREFS: readonly NavIconRoute[] = [
  ROUTES.HOME,
  ROUTES.NOW_SHOWING,
  ROUTES.WATCHLIST,
  ROUTES.FAVORITES,
];

/**
 * `NAV_ITEMS` に無い行き先のラベル
 *
 * ホームはサイドナビ／ドロワーの共通項目ではないため引けない。
 * ここだけがボトムナビ固有のベタ書きになる
 */
const OWN_LABELS: Record<string, string> = {
  [ROUTES.HOME]: 'ホーム',
};

/** ボトムナビの項目（共通定数から組み立てた結果） */
interface BottomNavItem {
  label: string;
  /** アイコンのある行き先に限る（`NAV_ICON_MAP` の引き当てに使う / #1020） */
  href: NavIconRoute;
  /**
   * 未認証では出さない項目
   *
   * 押しても `LoginPromptModal` が出るだけの導線を、限られた枠に常設しない。
   * 未認証は2件まで減る。少ないのは承知のうえで、保護項目を隠す方針を優先する
   * （ログイン誘導はドロワーが持つ）
   */
  requiresAuth: boolean;
}

const BOTTOM_NAV_ITEMS: BottomNavItem[] = BOTTOM_NAV_HREFS.map((href) => ({
  href,
  label:
    NAV_ITEMS.find((item) => item.href === href)?.label ?? OWN_LABELS[href],
  requiresAuth: AUTH_REQUIRED_ROUTES.some((route) => route === href),
}));

/**
 * BottomNavコンポーネント
 *
 * @example
 * ```tsx
 * <BottomNav />
 * ```
 */
export const BottomNav = memo(function BottomNav() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const navRef = useBottomNavHeight();

  /**
   * `loading` の間は未認証と同じ2件にする。
   *
   * セッションが確定した瞬間に横の並びが 2→4 へ変わる。高さは変わらないので
   * 本文が縦にずれることは無いが、押そうとしていた項目の位置は動きうる。
   * 「先に5件出して未認証なら減らす」ほうが損失が大きい（押せる導線が消える）
   * ため、増える側に倒す。#1028 で承認済みのトレードオフ。
   *
   * 無効化済みセッション（パスワード変更・絶対期限切れ）は user が空文字で
   * 埋められたオブジェクトとして返るため、存在確認では判定できない。id の
   * 有無で見る（`mobileDrawer.tsx` / `getAuthSession` と同じ基準）。ドロワーと
   * 揃えないと、同じ SP 画面でドロワーは保護導線を隠しボトムナビは出す、
   * という食い違いが起きる
   */
  const isAuthenticated = status === 'authenticated' && !!session?.user?.id;

  const navItems = useMemo(
    () =>
      BOTTOM_NAV_ITEMS.filter(
        (item) => !item.requiresAuth || isAuthenticated,
      ).map((item) => ({ ...item, isActive: pathname === item.href })),
    [isAuthenticated, pathname],
  );

  return (
    <nav
      ref={navRef}
      className={styles.c_bottom_nav}
      aria-label={ARIA_LABELS.PRIMARY_NAV}
    >
      <ul className={styles.c_bottom_nav__list}>
        {navItems.map((item) => {
          const Icon = NAV_ICON_MAP[item.href];

          return (
            <li key={item.href} className={styles.c_bottom_nav__item}>
              {/*
                現在地は aria-current だけで伝える。aria-label に「（現在のページ）」を
                足すと読み上げが二重になる（#1046 と同じ問題）
              */}
              <Link
                href={item.href}
                className={cn(
                  styles.c_bottom_nav__link,
                  item.isActive && styles['c_bottom_nav__link--active'],
                )}
                aria-current={item.isActive ? 'page' : undefined}
              >
                <span className={styles.c_bottom_nav__icon} aria-hidden='true'>
                  {Icon ? <Icon size={ICON_SIZES.SM} /> : null}
                </span>
                <span className={styles.c_bottom_nav__label}>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
});

BottomNav.displayName = 'BottomNav';
