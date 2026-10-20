/**
 * 公開カレンダーの開閉と映画詳細モーダルの状態を束ねるフック
 */

import { useCallback, useMemo, useState } from 'react';

/**
 * useCalendarDialogフックの返り値
 */
export interface UseCalendarDialogReturn {
  /** カレンダーダイアログの開閉状態 */
  isOpen: boolean;
  /** 詳細を表示する映画のTMDb ID */
  selectedMovieId: number | null;
  /** カレンダーダイアログを開く */
  openCalendar: () => void;
  /** カレンダーダイアログの開閉を設定する */
  setOpen: (open: boolean) => void;
  /** 映画を選ぶ（カレンダーを閉じて詳細モーダルへ） */
  selectMovie: (tmdbMovieId: number) => void;
  /** 詳細モーダルを閉じる */
  closeMovieDetail: () => void;
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
  const [selectedMovieId, setSelectedMovieId] = useState<number | null>(null);

  const openCalendar = useCallback(() => {
    setIsOpen(true);
  }, []);

  const setOpen = useCallback((open: boolean) => {
    setIsOpen(open);
  }, []);

  const selectMovie = useCallback((tmdbMovieId: number) => {
    setIsOpen(false);
    setSelectedMovieId(tmdbMovieId);
  }, []);

  const closeMovieDetail = useCallback(() => {
    setSelectedMovieId(null);
  }, []);

  return useMemo(
    () => ({
      isOpen,
      selectedMovieId,
      openCalendar,
      setOpen,
      selectMovie,
      closeMovieDetail,
    }),
    [
      isOpen,
      selectedMovieId,
      openCalendar,
      setOpen,
      selectMovie,
      closeMovieDetail,
    ],
  );
}
