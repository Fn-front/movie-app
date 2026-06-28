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
import { useSession } from 'next-auth/react';
import type { MouseEvent } from 'react';

import {
  AUTH_REQUIRED_ROUTES,
  NAV_AUTH_PROMPT_MESSAGES,
  NAV_AUTH_PROMPT_DEFAULT_MESSAGE,
} from '@/constants';
import { useLoginPromptStore } from '@/lib/store/useLoginPromptStore';

/**
 * @returns handleProtectedNavClick - ナビリンクの href を受け取り、onClick ハンドラを返す
 */
export function useNavAuthGuard() {
  const { status } = useSession();
  const isAuthenticated = status === 'authenticated';
  const openLoginPrompt = useLoginPromptStore((s) => s.open);

  const handleProtectedNavClick = useCallback(
    (href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
      // 認証済みは通常遷移
      if (isAuthenticated) {
        return;
      }
      // 「保護対象か」は middleware と共通の AUTH_REQUIRED_ROUTES を真実源に判定する
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
    [isAuthenticated, openLoginPrompt],
  );

  return { handleProtectedNavClick };
}
