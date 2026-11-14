/**
 * useNavAuthGuard
 * ナビゲーションの保護ルートに対する未認証時のクリック制御フック。
 *
 * 未認証ユーザーが保護ルート（お気に入り・ウォッチリスト・シアター体験）の
 * ナビリンクを押した場合、遷移をキャンセルしてログイン誘導モーダルを表示する。
 * これによりミドルウェアの無言リダイレクトではなく、ボタン操作と同じ体験に統一する。
 */

'use client';

import { useCallback } from 'react';
import type { MouseEvent } from 'react';

import {
  AUTH_REQUIRED_ROUTES,
  NAV_AUTH_PROMPT_MESSAGES,
  NAV_AUTH_PROMPT_DEFAULT_MESSAGE,
} from '@/constants';
import { useAuthStatus } from '@/hooks/useAuthStatus';
import { useLoginPromptStore } from '@/lib/store/useLoginPromptStore';

/**
 * @returns handleProtectedNavClick - ナビリンクの href を受け取り、onClick ハンドラを返す
 */
export function useNavAuthGuard() {
  const { isAuthenticated, isResolving } = useAuthStatus();
  const openLoginPrompt = useLoginPromptStore((s) => s.open);

  const handleProtectedNavClick = useCallback(
    (href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
      // 認証済みは通常遷移。
      //
      // 未確定（セッションの応答待ち）も通す。ここで弾くと、ログイン済みの
      // 利用者がフルロード直後に押したときだけ「ログインが必要です」が出る
      // （#1131）。実際の認可は proxy.ts が担うので、本当に未認証なら
      // 遷移先でサインインへ送られる
      if (isAuthenticated || isResolving) {
        return;
      }
      // 「保護対象か」は proxy と共通の AUTH_REQUIRED_ROUTES を真実源に判定する
      const isProtected = AUTH_REQUIRED_ROUTES.some((route) => route === href);
      if (!isProtected) {
        return;
      }
      // 未認証 かつ 保護ルート → 遷移をキャンセルしてログイン誘導
      event.preventDefault();
      openLoginPrompt(
        NAV_AUTH_PROMPT_MESSAGES[href] ?? NAV_AUTH_PROMPT_DEFAULT_MESSAGE,
      );
    },
    [isAuthenticated, isResolving, openLoginPrompt],
  );

  return { handleProtectedNavClick };
}
