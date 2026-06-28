/**
 * OTPログインフォームコンポーネント
 *
 * メールアドレス入力 → OTP送信 → OTP検証 → ログインのフローを提供する。
 */

'use client';

import { memo, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { Heading } from '@/components/ui/heading/heading';
import { Input } from '@/components/ui/input/input';
import { Button } from '@/components/ui/button/button';
import { otpLoginEmailSchema, type OtpLoginEmailFormData } from '@/schema/auth';
import { OTP_ACTION } from '@/constants/otp';
import { OtpVerification } from '@/features/auth/otpVerification/otpVerification';

import { useOtpLogin } from './hooks/useOtpLogin';
import styles from './otpLoginForm.module.scss';

interface OtpLoginFormProps {
  onPasswordLoginClick?: () => void;
  /** ログイン後の戻り先（callbackUrl） */
  callbackUrl?: string;
}

export const OtpLoginForm = memo<OtpLoginFormProps>(function OtpLoginForm({
  onPasswordLoginClick,
  callbackUrl,
}) {
  const {
    step,
    email,
    isSubmitting,
    apiError,
    handleSendOtp,
    handleOtpVerifySuccess,
    handleBackToEmail,
  } = useOtpLogin(callbackUrl);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OtpLoginEmailFormData>({
    resolver: zodResolver(otpLoginEmailSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = useCallback(
    async (data: OtpLoginEmailFormData) => {
      await handleSendOtp(data.email);
    },
    [handleSendOtp],
  );

  // OTP検証画面
  if (step === 'otp') {
    return (
      <div className={styles.c_otp_login_form}>
        <OtpVerification
          email={email}
          action={OTP_ACTION.LOGIN}
          onVerifySuccess={handleOtpVerifySuccess}
        />

        <p className={styles.c_otp_login_form__footer}>
          <button
            type='button'
            className={styles.c_otp_login_form__link}
            onClick={handleBackToEmail}
          >
            メールアドレスを変更する
          </button>
        </p>
      </div>
    );
  }

  // メールアドレス入力画面
  return (
    <div className={styles.c_otp_login_form}>
      <Heading level={1} align='center'>
        メールでログイン
      </Heading>

      <form
        className={styles.c_otp_login_form__body}
        onSubmit={handleSubmit(onSubmit)}
        noValidate
      >
        <div className={styles.c_otp_login_form__fields}>
          <Input
            label='メールアドレス'
            type='email'
            autoComplete='email'
            placeholder='example@example.com'
            fullWidth
            error={errors.email?.message}
            {...register('email')}
          />

          {apiError && (
            <p className={styles.c_otp_login_form__error} role='alert'>
              {apiError}
            </p>
          )}

          <div className={styles.c_otp_login_form__submit}>
            <Button
              type='submit'
              variant='primary'
              size='lg'
              fullWidth
              isLoading={isSubmitting}
              aria-label='ログインコードを送信'
            >
              ログインコードを送信
            </Button>
          </div>
        </div>
      </form>

      {onPasswordLoginClick && (
        <p className={styles.c_otp_login_form__footer}>
          <button
            type='button'
            className={styles.c_otp_login_form__link}
            onClick={onPasswordLoginClick}
          >
            パスワードでログイン
          </button>
        </p>
      )}
    </div>
  );
});

OtpLoginForm.displayName = 'OtpLoginForm';
