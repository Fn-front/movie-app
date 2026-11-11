/**
 * LoginPromptModalコンポーネント
 * 未認証ユーザーにログインを誘導するモーダル
 */

'use client';

import { memo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { IoLogInOutline } from 'react-icons/io5';

import {
  Modal,
  ModalBody,
  ModalFooter,
  useModalNavigation,
} from '@/components/ui/modal/modal';
import { Button } from '@/components/ui/button/button';
import { ROUTES } from '@/constants/common';
import { useLoginPromptStore } from '@/lib/store/useLoginPromptStore';

import styles from './loginPromptModal.module.scss';

/**
 * フッターのボタン
 *
 * `useModalNavigation` は `Modal` の中でしか効かないため、
 * ログインの遷移を申告するにはここを子コンポーネントに切る必要がある
 */
const LoginPromptActions = memo<{ onClose: () => void }>(
  function LoginPromptActions({ onClose }) {
    const router = useRouter();
    const { shouldReplaceNavigation, notifyNavigating } = useModalNavigation();

    const handleLogin = useCallback(() => {
      // 閉じるのと同時に遷移する。申告しないと、履歴を畳む非同期の
      // back がこの遷移を取り消す（#1043）
      notifyNavigating();
      onClose();
      // モーダルが積んだエントリを食わせる。push だとエントリが
      // 遷移の下に埋まり、戻るが空振りする。
      // エントリが無いときに replace すると実ページを消してしまう
      if (shouldReplaceNavigation) {
        router.replace(ROUTES.LOGIN);
        return;
      }
      router.push(ROUTES.LOGIN);
    }, [notifyNavigating, onClose, router, shouldReplaceNavigation]);

    return (
      <>
        {/*
          Modal ヘッダーの × も「閉じる」というアクセシブルネームを持つ。
          同名のボタンが2つ並ぶとスクリーンリーダーのボタン一覧で
          区別できないため、こちらは「キャンセル」にする。
        */}
        <Button variant='ghost' size='sm' onClick={onClose}>
          キャンセル
        </Button>
        <Button variant='primary' size='sm' onClick={handleLogin}>
          ログイン
        </Button>
      </>
    );
  },
);

LoginPromptActions.displayName = 'LoginPromptActions';

/**
 * LoginPromptModalコンポーネント
 * AppLayoutに1つだけ配置し、useLoginPromptStoreで開閉を制御する
 */
export const LoginPromptModal = memo(function LoginPromptModal() {
  const { isOpen, message, close } = useLoginPromptStore();

  return (
    <Modal
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title='ログインが必要です'
      size='sm'
    >
      <ModalBody>
        <div className={styles.c_login_prompt__body}>
          <IoLogInOutline className={styles.c_login_prompt__icon} />
          <p className={styles.c_login_prompt__message}>{message}</p>
        </div>
      </ModalBody>
      <ModalFooter>
        <LoginPromptActions onClose={close} />
      </ModalFooter>
    </Modal>
  );
});

LoginPromptModal.displayName = 'LoginPromptModal';
