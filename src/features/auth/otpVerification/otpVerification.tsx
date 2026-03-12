/**
 * OTP検証コンポーネント
 */

'use client';

import { memo, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { Input } from '@/components/ui/input/input';
import { Button } from '@/components/ui/button/button';
import { Heading } from '@/components/ui/heading/heading';
import { otpFormSchema, type OtpFormData } from '@/schema/otp';
import type { OtpAction } from '@/constants/otp';

import { useOtpVerification } from './hooks/useOtpVerification';
import styles from './otpVerification.module.scss';

interface OtpVerificationProps {
  email: string;
  action: OtpAction;
  onVerifySuccess?: () => void;
}

export const OtpVerification = memo<OtpVerificationProps>(
  function OtpVerification({ email, action, onVerifySuccess }) {
    const {
      isSubmitting,
      isResending,
      resendCountdown,
      canResend,
      apiError,
      remainingAttempts,
      handleVerify,
      handleResend,
    } = useOtpVerification({ email, action, onVerifySuccess });

    const {
      register,
      handleSubmit,
      formState: { errors },
    } = useForm<OtpFormData>({
      resolver: zodResolver(otpFormSchema),
      defaultValues: { otp: '' },
    });

    const onSubmit = useCallback(
      async (data: OtpFormData) => {
        await handleVerify(data.otp);
      },
      [handleVerify],
    );

    const onResendClick = useCallback(async () => {
      await handleResend();
    }, [handleResend]);

    return (
      <div className={styles.c_otp_verification}>
        <Heading level={2} align='center'>
          確認コードを入力
        </Heading>

        <p className={styles.c_otp_verification__description}>
          <span className={styles.c_otp_verification__email}>{email}</span>{' '}
          に確認コードを送信しました
        </p>

        <form
          className={styles.c_otp_verification__form}
          onSubmit={handleSubmit(onSubmit)}
          noValidate
        >
          <div className={styles.c_otp_verification__input_wrapper}>
            <Input
              type='text'
              inputMode='numeric'
              maxLength={6}
              pattern='[0-9]{6}'
              placeholder='123456'
              autoFocus
              autoComplete='one-time-code'
              fullWidth
              aria-label='確認コード'
              error={errors.otp?.message}
              {...register('otp')}
            />
          </div>

          {apiError && (
            <p className={styles.c_otp_verification__error} role='alert'>
              {apiError}
            </p>
          )}

          {remainingAttempts !== null && remainingAttempts > 0 && (
            <p className={styles.c_otp_verification__attempts} role='status'>
              残り{remainingAttempts}回入力できます
            </p>
          )}

          <div className={styles.c_otp_verification__actions}>
            <Button
              type='submit'
              variant='primary'
              size='lg'
              fullWidth
              isLoading={isSubmitting}
              aria-label='確認コードを検証'
            >
              確認
            </Button>
          </div>
        </form>

        <div className={styles.c_otp_verification__resend}>
          {canResend ? (
            <Button
              variant='ghost'
              size='sm'
              onClick={onResendClick}
              isLoading={isResending}
              aria-label='確認コードを再送信'
            >
              コードを再送信
            </Button>
          ) : (
            <p className={styles.c_otp_verification__countdown}>
              再送信まで {resendCountdown}秒
            </p>
          )}
        </div>
      </div>
    );
  },
);

OtpVerification.displayName = 'OtpVerification';
