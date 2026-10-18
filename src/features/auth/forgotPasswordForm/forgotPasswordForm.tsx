/**
 * パスワードを忘れた場合のメール入力フォーム
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
  passwordResetRequestSchema,
  type PasswordResetRequestFormData,
} from '@/schema/auth';

import { useForgotPassword } from './hooks/useForgotPassword';
import styles from './forgotPasswordForm.module.scss';

export const ForgotPasswordForm = memo(function ForgotPasswordForm() {
  const { isSent, isSubmitting, error, submit } = useForgotPassword();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PasswordResetRequestFormData>({
    resolver: zodResolver(passwordResetRequestSchema),
    defaultValues: { email: '' },
  });

  return (
    <div className={styles.c_forgot_password}>
      <Heading level={1} align='center'>
        パスワードの再設定
      </Heading>

      {isSent ? (
        // 登録の有無を明かさないため、送信後は常に同じ案内を出す
        <p className={styles.c_forgot_password__notice} role='status'>
          {PASSWORD_RESET_MESSAGES.REQUEST_ACCEPTED}
        </p>
      ) : (
        <>
          <p className={styles.c_forgot_password__lead}>
            ご登録のメールアドレスを入力してください。パスワード再設定用の
            リンクをお送りします。
          </p>

          <form
            className={styles.c_forgot_password__body}
            onSubmit={handleSubmit(submit)}
            noValidate
          >
            <div className={styles.c_forgot_password__fields}>
              <Input
                label='メールアドレス'
                type='email'
                autoComplete='email'
                placeholder='example@example.com'
                fullWidth
                error={errors.email?.message}
                {...register('email')}
              />

              {error && (
                <p className={styles.c_forgot_password__error} role='alert'>
                  {error}
                </p>
              )}

              <Button
                type='submit'
                variant='primary'
                size='lg'
                fullWidth
                isLoading={isSubmitting}
                aria-label='再設定リンクを送信'
              >
                再設定リンクを送信
              </Button>
            </div>
          </form>
        </>
      )}

      <p className={styles.c_forgot_password__footer}>
        <Link href={ROUTES.LOGIN} className={styles.c_forgot_password__link}>
          ログイン画面に戻る
        </Link>
      </p>
    </div>
  );
});

ForgotPasswordForm.displayName = 'ForgotPasswordForm';
