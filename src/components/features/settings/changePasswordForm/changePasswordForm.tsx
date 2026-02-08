/**
 * パスワード変更フォームコンポーネント
 */

'use client';

import { memo, useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { Heading } from '@/components/ui/heading/heading';
import { Input } from '@/components/ui/input/input';
import { Button } from '@/components/ui/button/button';
import {
  changePasswordSchema,
  type ChangePasswordFormData,
} from '@/schema/auth';
import { AUTH_ERROR_MESSAGES } from '@/constants';
import { changePassword } from '@/lib/api/auth/auth';
import { useToast } from '@/hooks/useToast';
import { handleApiError } from '@/utils/error';
import styles from './changePasswordForm.module.scss';

/**
 * パスワード変更フォーム
 */
export const ChangePasswordForm = memo(function ChangePasswordForm() {
  const { toast } = useToast();
  const [apiError, setApiError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ChangePasswordFormData>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmNewPassword: '',
    },
  });

  const onSubmit = useCallback(
    async (data: ChangePasswordFormData) => {
      setApiError(null);
      setSuccessMessage(null);

      try {
        const response = await changePassword({
          currentPassword: data.currentPassword,
          newPassword: data.newPassword,
        });

        setSuccessMessage(response.message);
        toast({
          title: 'パスワード変更完了',
          description: response.message,
          variant: 'success',
        });
        reset();
      } catch (error) {
        const { message } = handleApiError(error);
        const errorMessage =
          message ?? AUTH_ERROR_MESSAGES.PASSWORD_CHANGE_FAILED;
        setApiError(errorMessage);
        toast({
          title: 'パスワード変更エラー',
          description: errorMessage,
          variant: 'error',
        });
      }
    },
    [reset, toast],
  );

  return (
    <div className={styles.c_change_password_form}>
      <Heading level={1} align='center'>
        パスワード変更
      </Heading>

      <form
        className={styles.c_change_password_form__body}
        onSubmit={handleSubmit(onSubmit)}
        noValidate
      >
        <div className={styles.c_change_password_form__fields}>
          <Input
            label='現在のパスワード'
            type='password'
            autoComplete='current-password'
            placeholder='現在のパスワード'
            fullWidth
            error={errors.currentPassword?.message}
            {...register('currentPassword')}
          />

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
            <p className={styles.c_change_password_form__error} role='alert'>
              {apiError}
            </p>
          )}

          {successMessage && (
            <p className={styles.c_change_password_form__success} role='status'>
              {successMessage}
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
    </div>
  );
});

ChangePasswordForm.displayName = 'ChangePasswordForm';
