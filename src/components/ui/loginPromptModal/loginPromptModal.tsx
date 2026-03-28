/**
 * LoginPromptModalコンポーネント
 * 未認証ユーザーにログインを誘導するモーダル
 */

'use client';

import { memo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { IoLogInOutline } from 'react-icons/io5';

import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal/modal';
import { Button } from '@/components/ui/button/button';
import { ROUTES } from '@/constants/common';
import { useLoginPromptStore } from '@/lib/store/useLoginPromptStore';

import styles from './loginPromptModal.module.scss';

/**
 * LoginPromptModalコンポーネント
 * AppLayoutに1つだけ配置し、useLoginPromptStoreで開閉を制御する
 */
export const LoginPromptModal = memo(function LoginPromptModal() {
  const { isOpen, message, close } = useLoginPromptStore();
  const router = useRouter();

  const handleLogin = useCallback(() => {
    close();
    router.push(ROUTES.LOGIN);
  }, [close, router]);

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
        <Button variant='ghost' size='sm' onClick={close}>
          閉じる
        </Button>
        <Button variant='primary' size='sm' onClick={handleLogin}>
          ログイン
        </Button>
      </ModalFooter>
    </Modal>
  );
});

LoginPromptModal.displayName = 'LoginPromptModal';
