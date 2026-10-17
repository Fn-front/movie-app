/**
 * パスワード変更フォームコンポーネント（OTP検証ベース）
 *
 * ステップ1: 「確認コードを送信」ボタン
 * ステップ2: OTP検証（OtpVerificationコンポーネント）
 * ステップ3: 新パスワード入力フォーム
 */

'use client';

import { memo, useCallback, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { Input } from '@/components/ui/input/input';
import { Button } from '@/components/ui/button/button';
import { OtpVerification } from '@/features/auth/otpVerification/otpVerification';
import {
  buildChangePasswordSchema,
  type ChangePasswordFormData,
} from '@/schema/auth';
import { OTP_ACTION } from '@/constants/otp';
import {
  AUTH_ERROR_MESSAGES,
  TOAST_TITLES,
  VALIDATION_MESSAGES,
} from '@/constants';
import { changePassword, sendOtp } from '@/lib/api/auth/auth';
import { useToast } from '@/hooks/useToast';
import { handleApiError } from '@/utils/error';
import styles from './changePasswordForm.module.scss';

type Step = 'send_otp' | 'verify_otp' | 'new_password';

interface ChangePasswordFormProps {
  email: string;
  /**
   * パスワードが設定済みか。
   *
   * ソーシャルログインのみで登録したユーザーは `password_hash` を持たず
   * 「現在のパスワード」を入力しようがないため、その欄を出さない。
   */
  hasPassword: boolean;
}

/**
 * パスワード変更フォーム（OTP検証ベース）
 */
export const ChangePasswordForm = memo<ChangePasswordFormProps>(
  function ChangePasswordForm({ email, hasPassword }) {
    const { toast } = useToast();
    const [step, setStep] = useState<Step>('send_otp');
    const [isSendingOtp, setIsSendingOtp] = useState(false);
    const [apiError, setApiError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [verificationToken, setVerificationToken] = useState<string | null>(
      null,
    );

    // パスワード未設定のユーザーには「現在のパスワード」を要求しない
    const schema = useMemo(
      () => buildChangePasswordSchema(hasPassword),
      [hasPassword],
    );

    const {
      register,
      handleSubmit,
      formState: { errors, isSubmitting },
      reset,
    } = useForm<ChangePasswordFormData>({
      resolver: zodResolver(schema),
      defaultValues: {
        currentPassword: '',
        newPassword: '',
        confirmNewPassword: '',
      },
    });

    // ステップ1: OTP送信
    const handleSendOtp = useCallback(async () => {
      setIsSendingOtp(true);
      setApiError(null);

      try {
        await sendOtp({ email, action: OTP_ACTION.PASSWORD_CHANGE });
        setStep('verify_otp');
      } catch (error) {
        const { message } = handleApiError(error);
        setApiError(message ?? 'コードの送信に失敗しました。');
      } finally {
        setIsSendingOtp(false);
      }
    }, [email]);

    // ステップ2: OTP検証成功
    // 発行されたワンタイムトークンを保持し、ステップ3の送信時に本人確認として渡す
    const handleOtpVerifySuccess = useCallback((token?: string) => {
      setApiError(null);
      setVerificationToken(token ?? null);
      setStep('new_password');
    }, []);

    // ステップ3: 新パスワード送信
    const onSubmit = useCallback(
      async (data: ChangePasswordFormData) => {
        setApiError(null);
        setSuccessMessage(null);

        if (!verificationToken) {
          setApiError(VALIDATION_MESSAGES.OTP_TOKEN_REQUIRED);
          setStep('send_otp');
          return;
        }

        try {
          const response = await changePassword({
            newPassword: data.newPassword,
            verificationToken,
            currentPassword: data.currentPassword,
          });

          setSuccessMessage(response.message);
          toast({
            title: TOAST_TITLES.PASSWORD_CHANGE_SUCCESS,
            description: response.message,
            variant: 'success',
          });
          reset();
          // トークンはワンタイムのため破棄する
          setVerificationToken(null);
          // 成功後は初期画面に戻り、successMessageをステップ1で表示する
          setStep('send_otp');
        } catch (error) {
          const { message } = handleApiError(error);
          const errorMessage =
            message ?? AUTH_ERROR_MESSAGES.PASSWORD_CHANGE_FAILED;
          setApiError(errorMessage);
          toast({
            title: TOAST_TITLES.PASSWORD_CHANGE_ERROR,
            description: errorMessage,
            variant: 'error',
          });
        }
      },
      [reset, toast, verificationToken],
    );

    return (
      <div className={styles.c_change_password_form}>
        {/* ステップ1: OTP送信 */}
        {step === 'send_otp' && (
          <div className={styles.c_change_password_form__body}>
            <p className={styles.c_change_password_form__description}>
              パスワードを変更するには、メールアドレスに確認コードを送信します。
            </p>

            {apiError && (
              <p className={styles.c_change_password_form__error} role='alert'>
                {apiError}
              </p>
            )}

            {successMessage && (
              <p
                className={styles.c_change_password_form__success}
                role='status'
              >
                {successMessage}
              </p>
            )}

            <div className={styles.c_change_password_form__submit}>
              <Button
                variant='primary'
                size='md'
                isLoading={isSendingOtp}
                onClick={handleSendOtp}
                aria-label='確認コードを送信'
              >
                確認コードを送信
              </Button>
            </div>
          </div>
        )}

        {/* ステップ2: OTP検証 */}
        {step === 'verify_otp' && (
          <OtpVerification
            email={email}
            action={OTP_ACTION.PASSWORD_CHANGE}
            onVerifySuccess={handleOtpVerifySuccess}
          />
        )}

        {/* ステップ3: 新パスワード入力 */}
        {step === 'new_password' && (
          <form
            className={styles.c_change_password_form__body}
            onSubmit={handleSubmit(onSubmit)}
            noValidate
          >
            <div className={styles.c_change_password_form__fields}>
              {hasPassword && (
                <Input
                  label='現在のパスワード'
                  type='password'
                  autoComplete='current-password'
                  placeholder='現在のパスワードを入力'
                  fullWidth
                  error={errors.currentPassword?.message}
                  {...register('currentPassword')}
                />
              )}

              <Input
                label='新しいパスワード'
                type='password'
                autoComplete='new-password'
                placeholder='8文字以上、英大小文字・数字を含む'
                fullWidth
                error={errors.newPassword?.message}
                {...register('newPassword')}
              />

              <Input
                label='新しいパスワード（確認）'
                type='password'
                autoComplete='new-password'
                placeholder='新しいパスワードを再入力'
                fullWidth
                error={errors.confirmNewPassword?.message}
                {...register('confirmNewPassword')}
              />

              {apiError && (
                <p
                  className={styles.c_change_password_form__error}
                  role='alert'
                >
                  {apiError}
                </p>
              )}

              <div className={styles.c_change_password_form__submit}>
                <Button
                  type='submit'
                  variant='primary'
                  size='lg'
                  fullWidth
                  isLoading={isSubmitting}
                  aria-label='パスワードを変更'
                >
                  変更する
                </Button>
              </div>
            </div>
          </form>
        )}
      </div>
    );
  },
);

ChangePasswordForm.displayName = 'ChangePasswordForm';
