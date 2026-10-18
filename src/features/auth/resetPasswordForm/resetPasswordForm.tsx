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
}

export const ResetPasswordForm = memo<ResetPasswordFormProps>(
  function ResetPasswordForm({ token }) {
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
                placeholder='8文字以上、大文字・小文字・数字を含む'
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
          <Link
            href={ROUTES.FORGOT_PASSWORD}
            className={styles.c_reset_password__link}
          >
            再設定リンクを再送する
          </Link>
        </p>
      </div>
    );
  },
);

ResetPasswordForm.displayName = 'ResetPasswordForm';
