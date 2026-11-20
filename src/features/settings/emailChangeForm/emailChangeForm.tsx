/**
 * メールアドレス変更フォーム（#1359）
 *
 * ⚠️ **ログイン識別子が変わる操作。** 新しいアドレスの所有を確認してから
 * 差し替える（確認コード）。旧アドレスには通知が届く。
 */

'use client';

import { memo, useCallback, useId, useState } from 'react';

import { Button } from '@/components/ui/button/button';
import { Input } from '@/components/ui/input/input';
import {
  EMAIL_CHANGE_MESSAGES,
  EMAIL_CHANGE_VIEW,
} from '@/constants/emailChange';
import { SECOND_FACTOR_METHOD } from '@/constants/secondFactor';

import { useEmailChange } from './hooks/useEmailChange';

import styles from './emailChangeForm.module.scss';

export interface EmailChangeFormProps {
  /** 現在のアドレス。見出しに出す */
  email: string;
  /**
   * パスワードを持っているか
   *
   * ⚠️ ソーシャル連携のみの利用者は対象外。provider 側のアドレスと
   * 食い違うため、サーバーも 400 で弾く。
   */
  hasPassword: boolean;
}

/**
 * メールアドレス変更
 */
export const EmailChangeForm = memo(function EmailChangeForm({
  email,
  hasPassword,
}: EmailChangeFormProps) {
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [code, setCode] = useState('');
  const [secondFactorCode, setSecondFactorCode] = useState('');
  const {
    view,
    pendingEmail,
    isSubmitting,
    error,
    notice,
    secondFactorMethod,
    requestCode,
    confirmCode,
    sendSecondFactorCode,
    reset,
  } = useEmailChange();

  const newEmailId = useId();
  const passwordId = useId();
  const codeId = useId();
  const secondFactorId = useId();

  /**
   * 第2要素の入力欄を出すか
   *
   * ⚠️ **`undefined`（判定前）では出さないが、送信もさせない。** 設定済みの
   * 利用者に入力欄の無い画面を見せて送らせると、確認コードだけ焼けて
   * 400 になる（#1359 の2回目レビュー）。
   */
  const needsSecondFactor = Boolean(secondFactorMethod);
  const isSecondFactorUnknown = secondFactorMethod === undefined;

  const handleNewEmailChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setNewEmail(event.target.value),
    [],
  );

  const handlePasswordChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setCurrentPassword(event.target.value),
    [],
  );

  const handleCodeChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => setCode(event.target.value),
    [],
  );

  const handleRequest = useCallback(async () => {
    await requestCode(newEmail, currentPassword);
    // ⚠️ パスワードは画面に残さない。送信後に消す
    setCurrentPassword('');
  }, [currentPassword, newEmail, requestCode]);

  const handleSecondFactorCodeChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setSecondFactorCode(event.target.value),
    [],
  );

  const handleConfirm = useCallback(async () => {
    await confirmCode(code, secondFactorCode || undefined);
    setCode('');
    setSecondFactorCode('');
    setNewEmail('');
  }, [code, confirmCode, secondFactorCode]);

  const handleBack = useCallback(() => {
    setCode('');
    setSecondFactorCode('');
    reset();
  }, [reset]);

  if (!hasPassword) {
    return (
      <p className={styles.c_email_change_form__description}>
        {EMAIL_CHANGE_MESSAGES.PASSWORD_REQUIRED}
      </p>
    );
  }

  return (
    <div className={styles.c_email_change_form}>
      <p className={styles.c_email_change_form__description}>
        {EMAIL_CHANGE_MESSAGES.DESCRIPTION}
      </p>

      <p className={styles.c_email_change_form__current}>
        現在のメールアドレス: {email}
      </p>

      {view === EMAIL_CHANGE_VIEW.INPUT ? (
        <>
          <Input
            id={newEmailId}
            type='email'
            label='新しいメールアドレス'
            autoComplete='email'
            value={newEmail}
            onChange={handleNewEmailChange}
            fullWidth
          />
          <Input
            id={passwordId}
            type='password'
            label='現在のパスワード'
            autoComplete='current-password'
            value={currentPassword}
            onChange={handlePasswordChange}
            fullWidth
          />
          <Button
            onClick={handleRequest}
            disabled={
              isSubmitting ||
              newEmail.length === 0 ||
              currentPassword.length === 0
            }
          >
            {isSubmitting ? '送信しています…' : '確認コードを送る'}
          </Button>
        </>
      ) : (
        <>
          <p className={styles.c_email_change_form__pending}>
            {pendingEmail} に確認コードを送りました。
          </p>
          <Input
            id={codeId}
            type='text'
            inputMode='numeric'
            label='確認コード'
            autoComplete='one-time-code'
            value={code}
            onChange={handleCodeChange}
            fullWidth
          />

          {needsSecondFactor && (
            <>
              <Input
                id={secondFactorId}
                type='text'
                label='二段階認証のコード'
                autoComplete='one-time-code'
                value={secondFactorCode}
                onChange={handleSecondFactorCodeChange}
                fullWidth
              />
              {/*
                ⚠️ メールOTP の利用者は手元でコードを作れない。この導線が
                無いと、二段階認証を有効にした時点でアドレスを変更できなくなる
              */}
              {secondFactorMethod === SECOND_FACTOR_METHOD.EMAIL_OTP && (
                <Button
                  variant='secondary'
                  onClick={sendSecondFactorCode}
                  disabled={isSubmitting}
                >
                  二段階認証のコードを送る
                </Button>
              )}
            </>
          )}

          <div className={styles.c_email_change_form__actions}>
            <Button
              variant='secondary'
              onClick={handleBack}
              disabled={isSubmitting}
            >
              やり直す
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={
                isSubmitting ||
                code.length === 0 ||
                // 判定前は押させない。入力欄の無いまま送ると確認コードだけ焼ける
                isSecondFactorUnknown ||
                (needsSecondFactor && secondFactorCode.length === 0)
              }
            >
              {isSubmitting ? '変更しています…' : 'メールアドレスを変更'}
            </Button>
          </div>
        </>
      )}

      {notice && (
        <p role='status' className={styles.c_email_change_form__notice}>
          {notice}
        </p>
      )}

      {error && (
        <p role='alert' className={styles.c_email_change_form__error}>
          {error}
        </p>
      )}
    </div>
  );
});

EmailChangeForm.displayName = 'EmailChangeForm';
