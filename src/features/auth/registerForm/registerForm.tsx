/**
 * 新規登録フォームコンポーネント
 */

'use client';

import { memo, useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { zodResolver } from '@hookform/resolvers/zod';

import { Heading } from '@/components/ui/heading/heading';
import { Input } from '@/components/ui/input/input';
import { Button } from '@/components/ui/button/button';
import { registerSchema, type RegisterFormData } from '@/schema/auth';
import {
  AUTH_ERROR_MESSAGES,
  TOAST_TITLES,
  TOAST_MESSAGES,
  ROUTES,
} from '@/constants';
import { registerUser } from '@/lib/api/auth/auth';
import { useToast } from '@/hooks/useToast';
import { handleApiError } from '@/utils/error';
import styles from './registerForm.module.scss';

/**
 * 新規登録フォーム
 */
export const RegisterForm = memo(function RegisterForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
      name: '',
    },
  });

  const onSubmit = useCallback(
    async (data: RegisterFormData) => {
      setApiError(null);

      try {
        await registerUser({
          email: data.email,
          password: data.password,
          name: data.name || undefined,
        });

        toast({
          title: TOAST_TITLES.REGISTER_SUCCESS,
          description: TOAST_MESSAGES.REGISTER_SUCCESS_DESCRIPTION,
          variant: 'success',
        });

        router.push(ROUTES.LOGIN);
      } catch (error) {
        const { message } = handleApiError(error);
        const errorMessage = message ?? AUTH_ERROR_MESSAGES.REGISTER_FAILED;
        setApiError(errorMessage);
        toast({
          title: TOAST_TITLES.REGISTER_ERROR,
          description: errorMessage,
          variant: 'error',
        });
      }
    },
    [router, toast],
  );

  return (
    <div className={styles.c_register_form}>
      <Heading level={1} align='center'>
        新規登録
      </Heading>

      <form
        className={styles.c_register_form__body}
        onSubmit={handleSubmit(onSubmit)}
        noValidate
      >
        <div className={styles.c_register_form__fields}>
          <Input
            label='メールアドレス'
            type='email'
            autoComplete='email'
            placeholder='example@example.com'
            fullWidth
            error={errors.email?.message}
            {...register('email')}
          />

          <Input
            label='ユーザー名（任意）'
            type='text'
            autoComplete='name'
            placeholder='ユーザー名'
            fullWidth
            error={errors.name?.message}
            {...register('name')}
          />

          <Input
            label='パスワード'
            type='password'
            autoComplete='new-password'
            placeholder='8文字以上、英大小文字・数字を含む'
            fullWidth
            error={errors.password?.message}
            {...register('password')}
          />

          <Input
            label='パスワード（確認）'
            type='password'
            autoComplete='new-password'
            placeholder='パスワードを再入力'
            fullWidth
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />

          {apiError && (
            <p className={styles.c_register_form__error} role='alert'>
              {apiError}
            </p>
          )}

          <div className={styles.c_register_form__submit}>
            <Button
              type='submit'
              variant='primary'
              size='lg'
              fullWidth
              isLoading={isSubmitting}
              aria-label='新規登録'
            >
              登録する
            </Button>
          </div>
        </div>
      </form>

      <p className={styles.c_register_form__footer}>
        アカウントをお持ちの方は{' '}
        <Link href={ROUTES.LOGIN} className={styles.c_register_form__link}>
          ログイン
        </Link>
      </p>
    </div>
  );
});

RegisterForm.displayName = 'RegisterForm';
