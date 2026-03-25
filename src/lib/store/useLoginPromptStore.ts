/**
 * ログイン誘導モーダルのグローバル状態管理ストア
 */

import { createStore } from './createStore';

/**
 * ログイン誘導モーダルの状態
 */
interface LoginPromptState {
  /** モーダルの開閉状態 */
  isOpen: boolean;
  /** モーダルに表示するメッセージ */
  message: string;
  /** モーダルを開く */
  open: (message: string) => void;
  /** モーダルを閉じる */
  close: () => void;
}

export const useLoginPromptStore = createStore<LoginPromptState>(
  'loginPrompt',
  (set) => ({
    isOpen: false,
    message: '',
    open: (message: string) => set({ isOpen: true, message }),
    close: () => set({ isOpen: false, message: '' }),
  }),
);
