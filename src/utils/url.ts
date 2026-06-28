/**
 * URL関連ユーティリティ
 */

import { ROUTES } from '@/constants/common';

/**
 * ログイン後のリダイレクト先（callbackUrl）を安全に解決する。
 *
 * オープンリダイレクト対策として、同一オリジンの相対パスのみを許可する。
 * 不正・未指定の場合はホームを返す。
 *
 * 許可しない例:
 * - 外部URL（`https://evil.com`）
 * - プロトコル相対URL（`//evil.com`）
 * - バックスラッシュを含むURL（`/\evil.com` 等の回避策）
 * - 認証ページ自身（リダイレクトループ防止）
 *
 * @param raw - クエリ等から受け取った callbackUrl 文字列
 * @returns 安全な遷移先パス。不正なら ROUTES.HOME
 */
export function resolveSafeCallbackUrl(raw: string | null | undefined): string {
  if (!raw) {
    return ROUTES.HOME;
  }

  // 相対パス（'/' 始まり）のみ許可。'//' はプロトコル相対URLのため拒否
  if (!raw.startsWith('/') || raw.startsWith('//')) {
    return ROUTES.HOME;
  }

  // バックスラッシュによる回避（'/\evil.com' 等）を拒否
  if (raw.includes('\\')) {
    return ROUTES.HOME;
  }

  // 認証ページへ戻すとループするため拒否
  if (raw.startsWith(ROUTES.LOGIN) || raw.startsWith(ROUTES.REGISTER)) {
    return ROUTES.HOME;
  }

  return raw;
}
