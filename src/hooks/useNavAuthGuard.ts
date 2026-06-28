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

import { NAV_AUTH_PROMPT_MESSAGES } from '@/constants';
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
      // 認証済み、または保護対象でないルートは通常遷移
      if (isAuthenticated) {
        return;
      }
      const message = NAV_AUTH_PROMPT_MESSAGES[href];
      if (!message) {
        return;
      }
      // 未認証 かつ 保護ルート → 遷移をキャンセルしてログイン誘導
      event.preventDefault();
      openLoginPrompt(message);
    },
    [isAuthenticated, openLoginPrompt],
  );

  return { handleProtectedNavClick };
}
