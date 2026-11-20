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
import {
  ARIA_LABELS,
  BUTTON_LABELS,
  OTP_CONFIG,
  OTP_MESSAGES,
} from '@/constants';
import type { OtpAction } from '@/constants/otp';

import { useOtpVerification } from './hooks/useOtpVerification';
import styles from './otpVerification.module.scss';

interface OtpVerificationProps {
  email: string;
  action: OtpAction;
  /** 検証成功時のコールバック。login / password_change ではワンタイムトークンを受け取る */
  onVerifySuccess?: (verificationToken?: string) => void;
  /**
   * 見出しのレベル（#1249）
   *
   * このコンポーネントは2通りの使われ方をする。
   *
   * - **画面を置き換える**（`registerForm`）
   *   → ページの `<h1>` ごと差し替わるので、ここが `1` でないと
   *     **ページから h1 が消える**
   * - **ステップとして埋め込む**（`changePasswordForm`）
   *   → ページの `<h1>` が残るので `2`
   *
   * 既定は `2`。埋め込み側が多数派ではないが、**誤って h1 を2つ作るより
   * 階層が1段深いほうが害が小さい**ため、明示した側だけ `1` にする
   */
  headingLevel?: 1 | 2;
}

export const OtpVerification = memo<OtpVerificationProps>(
  function OtpVerification({
    email,
    action,
    onVerifySuccess,
    headingLevel = 2,
  }) {
    const {
      isSubmitting,
      isResending,
      resendCountdown,
      canResend,
      apiError,
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
        <Heading level={headingLevel} align='center'>
          {OTP_MESSAGES.HEADING}
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
              maxLength={OTP_CONFIG.CODE_LENGTH}
              pattern={`[0-9]{${OTP_CONFIG.CODE_LENGTH}}`}
              placeholder='123456'
              autoFocus
              autoComplete='one-time-code'
              fullWidth
              aria-label={ARIA_LABELS.OTP_CODE}
              error={errors.otp?.message}
              {...register('otp')}
            />
          </div>

          {apiError && (
            <p className={styles.c_otp_verification__error} role='alert'>
              {apiError}
            </p>
          )}

          <div className={styles.c_otp_verification__actions}>
            <Button
              type='submit'
              variant='primary'
              size='lg'
              fullWidth
              isLoading={isSubmitting}
              aria-label={ARIA_LABELS.VERIFY_OTP}
            >
              {BUTTON_LABELS.CONFIRM}
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
              aria-label={ARIA_LABELS.RESEND_OTP}
            >
              {BUTTON_LABELS.RESEND_CODE}
            </Button>
          ) : (
            <p className={styles.c_otp_verification__countdown}>
              {OTP_MESSAGES.RESEND_COUNTDOWN(resendCountdown)}
            </p>
          )}
        </div>
      </div>
    );
  },
);

OtpVerification.displayName = 'OtpVerification';
