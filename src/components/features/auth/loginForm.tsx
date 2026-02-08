/**
 * ログインフォームコンポーネント
 */

'use client';

import { memo, useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { zodResolver } from '@hookform/resolvers/zod';

import { Input } from '@/components/ui/input/input';
import { Button } from '@/components/ui/button/button';
import { loginSchema, type LoginFormData } from '@/schema/auth';
import { ROUTES } from '@/constants';
import styles from './loginForm.module.scss';

/**
 * ログインフォーム
 */
export const LoginForm = memo(function LoginForm() {
  const router = useRouter();
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = useCallback(
    async (data: LoginFormData) => {
      setApiError(null);

      try {
        const result = await signIn('credentials', {
          redirect: false,
          email: data.email,
          password: data.password,
        });

        if (result?.error) {
          setApiError('メールアドレスまたはパスワードが正しくありません。');
          return;
        }

        router.push(ROUTES.HOME);
      } catch {
        setApiError('ネットワークエラーが発生しました。');
      }
    },
    [router],
  );

  return (
    <div className={styles.c_login_form}>
      <h1 className={styles.c_login_form__title}>ログイン</h1>

      <form className={styles.c_login_form__body} onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className={styles.c_login_form__fields}>
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
            label='パスワード'
            type='password'
            autoComplete='current-password'
            placeholder='パスワードを入力'
            fullWidth
            error={errors.password?.message}
            {...register('password')}
          />

          {apiError && (
            <p className={styles.c_login_form__error} role='alert'>
              {apiError}
            </p>
          )}

          <div className={styles.c_login_form__submit}>
            <Button
              type='submit'
              variant='primary'
              size='lg'
              fullWidth
              isLoading={isSubmitting}
              aria-label='ログイン'
            >
              ログイン
            </Button>
          </div>
        </div>
      </form>

      <p className={styles.c_login_form__footer}>
        アカウントをお持ちでない方は{' '}
        <Link
          href={ROUTES.REGISTER}
          className={styles.c_login_form__link}
        >
          新規登録
        </Link>
      </p>
    </div>
  );
});

LoginForm.displayName = 'LoginForm';
