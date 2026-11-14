/**
 * 認証状態の単一の判定口
 *
 * `useSession()` から「認証済みか」を導く処理は13箇所にコピーされており、
 * しかも基準が2種類あった（#1131 / #1134）。ここに集約する。
 *
 * ## `isResolving` を分けている理由
 *
 * `useSession()` の `status` は `'loading' | 'authenticated' | 'unauthenticated'`
 * の3値だが、呼び出し側は `status === 'authenticated'` の真偽しか見ておらず、
 * **まだ分からない状態を「未ログイン」として描いていた**。フルロードのたびに
 * `/api/auth/session` の応答を待つ窓（本番実測で300ms以上）が開くため、
 * ログイン済みの利用者に未ログインUIが見え、その間の操作がログイン誘導で
 * 弾かれていた。
 *
 * 真偽値1つに畳まず `isResolving` を返すことで、呼び出し側が
 * 「未確定のときどう振る舞うか」を明示的に決められるようにする。
 *
 * ## このフックを使わない箇所
 *
 * `sessionExpiryHandler` と `useConsentServerSync` は **3値の生の `status`**
 * を見る必要がある。前者は `loading → unauthenticated`（リロード）と
 * `authenticated → unauthenticated`（期限切れ）を区別して誤ログアウトを
 * 防いでおり、真偽値2つに畳むとその区別が消える。
 */

'use client';

import { useMemo } from 'react';
import { useSession } from 'next-auth/react';

/** 認証状態 */
export interface AuthStatus {
  /** 認証済みと**確定している** */
  isAuthenticated: boolean;
  /** まだ確定していない。未ログインと断定してはいけない */
  isResolving: boolean;
}

/**
 * 認証状態を返す
 *
 * @example
 * ```tsx
 * const { isAuthenticated, isResolving } = useAuthStatus();
 *
 * // 未確定のうちはログイン誘導を出さない
 * if (!isAuthenticated && !isResolving) {
 *   openLoginPrompt();
 * }
 * ```
 */
export function useAuthStatus(): AuthStatus {
  const { data: session, status } = useSession();
  // 無効化済みセッション（パスワード変更・絶対期限切れ）は user が空文字で
  // 埋められたオブジェクトとして返るため、存在確認では判定できない。
  // id の有無で見る（`getAuthSession` / `proxy.ts` と同じ基準 / #699）
  const userId = session?.user?.id;

  return useMemo(
    () => ({
      isAuthenticated: status === 'authenticated' && !!userId,
      isResolving: status === 'loading',
    }),
    [status, userId],
  );
}
