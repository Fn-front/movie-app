/**
 * アカウント削除セクション（#932）
 *
 * ⚠️ **取り消せない操作**なので、誤操作と乗っ取りの両方を防ぐ。
 *
 *   誤操作   … 確認ダイアログを挟み、消えるものを明記する
 *   乗っ取り … パスワード・第2要素を改めて要求する（サーバー側が判定）
 */

'use client';

import { memo, useCallback, useId, useState } from 'react';

import { Button } from '@/components/ui/button/button';
import { Input } from '@/components/ui/input/input';
import { Modal } from '@/components/ui/modal/modal';
import { ACCOUNT_DELETE_MESSAGES } from '@/constants/auth';
import { useDeleteAccount } from './hooks/useDeleteAccount';

import styles from './deleteAccount.module.scss';

export interface DeleteAccountProps {
  /**
   * パスワードを持っているか
   *
   * ソーシャル連携のみの利用者は `password_hash` が NULL なので
   * 照合できない。入力欄を出すと「正しいのに通らない」ことになる。
   */
  hasPassword: boolean;
}

/**
 * アカウント削除
 */
export const DeleteAccount = memo(function DeleteAccount({
  hasPassword,
}: DeleteAccountProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [code, setCode] = useState('');
  const {
    isSubmitting,
    error,
    secondFactorRequired,
    loadRequirement,
    deleteAccount,
    clearError,
  } = useDeleteAccount();

  const passwordFieldId = useId();
  const codeFieldId = useId();

  const handleOpen = useCallback(() => {
    clearError();
    setCurrentPassword('');
    setCode('');
    setIsOpen(true);
    // 開いてから取りにいく。設定ページの初期表示にリクエストを足さない
    void loadRequirement();
  }, [clearError, loadRequirement]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      // 送信中は閉じさせない。削除が通ったあとに閉じられると、
      // ログアウトの途中で操作できる状態になる
      if (isSubmitting) return;

      setIsOpen(open);
    },
    [isSubmitting],
  );

  const handleSubmit = useCallback(async () => {
    await deleteAccount({
      ...(hasPassword ? { currentPassword } : {}),
      ...(secondFactorRequired ? { code } : {}),
    });
  }, [code, currentPassword, deleteAccount, hasPassword, secondFactorRequired]);

  // ⚠️ 入力が足りないまま送ると 400 が返るだけなので手前で止める。
  //    判定前（null）も止める —— 設定済みの利用者がコード無しで押せてしまう
  const canSubmit =
    secondFactorRequired !== null &&
    (!hasPassword || currentPassword.length > 0) &&
    (!secondFactorRequired || code.length > 0);

  return (
    <div className={styles.c_delete_account}>
      <p className={styles.c_delete_account__description}>
        {ACCOUNT_DELETE_MESSAGES.CONFIRM_DESCRIPTION}
      </p>

      <Button variant='danger' onClick={handleOpen}>
        アカウントを削除する
      </Button>

      <Modal
        open={isOpen}
        onOpenChange={handleOpenChange}
        title='アカウントを削除しますか？'
        description={ACCOUNT_DELETE_MESSAGES.CONFIRM_DESCRIPTION}
        size='sm'
      >
        <div className={styles.c_delete_account__form}>
          {hasPassword && (
            <Input
              id={passwordFieldId}
              type='password'
              label='現在のパスワード'
              autoComplete='current-password'
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              fullWidth
            />
          )}

          {secondFactorRequired && (
            <Input
              id={codeFieldId}
              type='text'
              inputMode='numeric'
              label='認証コード'
              autoComplete='one-time-code'
              value={code}
              onChange={(event) => setCode(event.target.value)}
              fullWidth
            />
          )}

          {error && (
            <p role='alert' className={styles.c_delete_account__error}>
              {error}
            </p>
          )}

          <div className={styles.c_delete_account__actions}>
            <Button
              variant='secondary'
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              キャンセル
            </Button>
            <Button
              variant='danger'
              onClick={handleSubmit}
              disabled={!canSubmit || isSubmitting}
            >
              {isSubmitting ? '削除しています…' : '削除する'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
});

DeleteAccount.displayName = 'DeleteAccount';
