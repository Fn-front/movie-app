/**
 * パスワード再設定フォーム（メールのリンクから到達する）
 */

'use client';

import { memo } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { Heading } from '@/components/ui/heading/heading';
import { Input } from '@/components/ui/input/input';
import { Button } from '@/components/ui/button/button';
import { ROUTES } from '@/constants';
import { PASSWORD_RESET_MESSAGES } from '@/constants/passwordReset';
import {
  passwordResetConfirmSchema,
  type PasswordResetConfirmFormData,
} from '@/schema/auth';

import { useResetPassword } from './hooks/useResetPassword';
import styles from './resetPasswordForm.module.scss';

interface ResetPasswordFormProps {
  /** メールのリンクに載っていたトークン */
  token?: string;
  /**
   * admin 発行アカウントの設定リンクから来たか
   *
   * 受け取り手は自力で再送できない（合成アドレス宛には届かず、列挙防止で
   * 理由も表示されない）。復旧は admin の再発行だけなので、再送の導線を
   * 出さずにそちらへ案内する
   */
  isIssuedAccount?: boolean;
}

export const ResetPasswordForm = memo<ResetPasswordFormProps>(
  function ResetPasswordForm({ token, isIssuedAccount = false }) {
    const { isSubmitting, error, submit } = useResetPassword({ token });

    const {
      register,
      handleSubmit,
      formState: { errors },
    } = useForm<PasswordResetConfirmFormData>({
      resolver: zodResolver(passwordResetConfirmSchema),
      defaultValues: { password: '', confirmPassword: '' },
    });

    return (
      <div className={styles.c_reset_password}>
        <Heading level={1} align='center'>
          新しいパスワードの設定
        </Heading>

        {token ? (
          <form
            className={styles.c_reset_password__body}
            onSubmit={handleSubmit(submit)}
            noValidate
          >
            <div className={styles.c_reset_password__fields}>
              <Input
                label='新しいパスワード'
                type='password'
                autoComplete='new-password'
                placeholder='12文字以上、大文字・小文字・数字を含む'
                fullWidth
                error={errors.password?.message}
                {...register('password')}
              />

              <Input
                label='新しいパスワード（確認）'
                type='password'
                autoComplete='new-password'
                placeholder='同じパスワードを入力'
                fullWidth
                error={errors.confirmPassword?.message}
                {...register('confirmPassword')}
              />

              {error && (
                <p className={styles.c_reset_password__error} role='alert'>
                  {error}
                </p>
              )}

              <Button
                type='submit'
                variant='primary'
                size='lg'
                fullWidth
                isLoading={isSubmitting}
                aria-label='パスワードを再設定'
              >
                パスワードを再設定
              </Button>
            </div>
          </form>
        ) : (
          // トークンが無い＝リンクを直接開いていない、または欠けている
          <p className={styles.c_reset_password__error} role='alert'>
            {PASSWORD_RESET_MESSAGES.TOKEN_MISSING}
          </p>
        )}

        <p className={styles.c_reset_password__footer}>
          {isIssuedAccount ? (
            PASSWORD_RESET_MESSAGES.ISSUED_ACCOUNT_RESEND
          ) : (
            <Link
              href={ROUTES.FORGOT_PASSWORD}
              className={styles.c_reset_password__link}
            >
              再設定リンクを再送する
            </Link>
          )}
        </p>
      </div>
    );
  },
);

ResetPasswordForm.displayName = 'ResetPasswordForm';
