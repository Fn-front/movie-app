/**
 * 映画詳細を共有するフック
 */

'use client';

import { useCallback } from 'react';

import { MOVIE_SHARE_MESSAGES, ROUTES } from '@/constants';
import { useToastDispatch } from '@/hooks/useToast';

/** {@link useShareMovie} の戻り値 */
export interface UseShareMovieReturn {
  /** 共有する（OS の共有シート → 無ければクリップボード） */
  shareMovie: (movieId: number, title: string) => Promise<void>;
}

/**
 * 共有する絶対URLを組み立てる
 *
 * 共有するのは**モーダルのURL（`?movie_id=…`）ではなく全画面ページ**。
 * 受け取った人が一覧の絞り込みごと引き継ぐ必要は無いし、クエリ付きURLは
 * 「どのページで開いたか」まで共有してしまう。
 *
 * オリジンは実行中のものを使う。環境ごとに固定値を持つより、
 * プレビュー環境でもそのまま正しく動く
 */
function buildShareUrl(movieId: number): string {
  return new URL(ROUTES.MOVIE_DETAIL(movieId), window.location.origin).href;
}

/**
 * 映画詳細のURLを共有する
 *
 * - `navigator.share` が使えればそれを使う（スマホの共有シート）
 * - 使えなければクリップボードへコピーし、トーストで知らせる
 *
 * 共有シートを利用者が閉じた場合は `AbortError` が飛ぶが、**これは失敗では
 * ないのでトーストを出さない**。出すと「やめた」操作にエラーを返すことになる。
 */
export function useShareMovie(): UseShareMovieReturn {
  const { toast } = useToastDispatch();

  const shareMovie = useCallback(
    async (movieId: number, title: string) => {
      const url = buildShareUrl(movieId);

      if (typeof navigator !== 'undefined' && navigator.share) {
        try {
          await navigator.share({ title, url });
          return;
        } catch {
          // 共有シートを閉じただけのこともあるため、ここでは何も出さない
          return;
        }
      }

      try {
        await navigator.clipboard.writeText(url);
        toast({ title: MOVIE_SHARE_MESSAGES.COPIED, variant: 'success' });
      } catch {
        toast({ title: MOVIE_SHARE_MESSAGES.FAILED, variant: 'error' });
      }
    },
    [toast],
  );

  return { shareMovie };
}
