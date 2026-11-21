/**
 * 公開カレンダーの開閉と映画詳細モーダルの状態を束ねるフック
 */

import { useCallback, useMemo, useState } from 'react';

import { useOpenMovieDetail } from '@/features/movies/hooks/useMovieDetailQuery';

/**
 * useCalendarDialogフックの返り値
 */
export interface UseCalendarDialogReturn {
  /** カレンダーダイアログの開閉状態 */
  isOpen: boolean;
  /** カレンダーダイアログを開く */
  openCalendar: () => void;
  /** カレンダーダイアログの開閉を設定する */
  setOpen: (open: boolean) => void;
  /** 映画を選ぶ（カレンダーを閉じて詳細モーダルへ） */
  selectMovie: (tmdbMovieId: number) => void;
}

/**
 * 公開カレンダー用のダイアログ状態フック
 *
 * トリガーはサイドバーとモバイルドロワーの2か所にあるが、ドロワーは開いた瞬間に
 * 閉じてアンマウントされる。ダイアログ本体はトリガーと同じ場所に置けないため、
 * 状態だけを切り出して呼び出し側（AppLayout）が保持できるようにする。
 */
export function useCalendarDialog(): UseCalendarDialogReturn {
  const [isOpen, setIsOpen] = useState(false);

  /**
   * ⛔ 詳細の開閉を**ここで持たない**（#1077）。
   *
   * 以前はローカル state に持ち、`AppLayout` が専用のモーダルを描いていた。
   * その結果カレンダーから開いた詳細だけ URL を持たず、リロードで消え、
   * 共有もできなかった。URL へ寄せれば `AppLayout` の唯一のモーダルが
   * そのまま開く。
   */
  const openMovieDetail = useOpenMovieDetail();

  const openCalendar = useCallback(() => {
    setIsOpen(true);
  }, []);

  const setOpen = useCallback((open: boolean) => {
    setIsOpen(open);
  }, []);

  const selectMovie = useCallback(
    (tmdbMovieId: number) => {
      setIsOpen(false);
      // ⚠️ **置き換える**。カレンダーは自分の履歴エントリを1つ持っており、
      //    push すると閉じる側の畳みと競合して開き直る（#1077 で実測）
      openMovieDetail(tmdbMovieId, { replace: true });
    },
    [openMovieDetail],
  );

  return useMemo(
    () => ({
      isOpen,
      openCalendar,
      setOpen,
      selectMovie,
    }),
    [isOpen, openCalendar, setOpen, selectMovie],
  );
}
