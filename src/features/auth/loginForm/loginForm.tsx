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

import { Heading } from '@/components/ui/heading/heading';
import { Input } from '@/components/ui/input/input';
import { Button } from '@/components/ui/button/button';
import { loginSchema, type LoginFormData } from '@/schema/auth';
import {
  AUTH_ERROR_MESSAGES,
  TOAST_TITLES,
  TOAST_MESSAGES,
  ROUTES,
} from '@/constants';
import { useToast } from '@/hooks/useToast';
import { handleApiError } from '@/utils/error';
import { SocialLoginButtons } from '@/features/auth/socialLoginButtons/socialLoginButtons';
import styles from './loginForm.module.scss';

interface LoginFormProps {
  onOtpLoginClick?: () => void;
}

/**
 * ログインフォーム
 */
export const LoginForm = memo<LoginFormProps>(function LoginForm({
  onOtpLoginClick,
}) {
  const router = useRouter();
  const { toast } = useToast();
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
          setApiError(AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS);
          toast({
            title: TOAST_TITLES.LOGIN_ERROR,
            description: AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS,
            variant: 'error',
          });
          return;
        }

        toast({
          title: TOAST_TITLES.LOGIN_SUCCESS,
          description: TOAST_MESSAGES.LOGIN_SUCCESS_DESCRIPTION,
          variant: 'success',
        });

        router.push(ROUTES.HOME);
      } catch (error) {
        const { message } = handleApiError(error);
        setApiError(message);
        toast({
          title: TOAST_TITLES.LOGIN_ERROR,
          description: message ?? AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS,
          variant: 'error',
        });
      }
    },
    [router, toast],
  );

  return (
    <div className={styles.c_login_form}>
      <Heading level={1} align='center'>
        ログイン
      </Heading>

      <form
        className={styles.c_login_form__body}
        onSubmit={handleSubmit(onSubmit)}
        noValidate
      >
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

      <SocialLoginButtons disabled={isSubmitting} />

      {onOtpLoginClick && (
        <p className={styles.c_login_form__footer}>
          <button
            type='button'
            className={styles.c_login_form__link}
            onClick={onOtpLoginClick}
          >
            メールでログイン
          </button>
        </p>
      )}

      <p className={styles.c_login_form__footer}>
        アカウントをお持ちでない方は{' '}
        <Link href={ROUTES.REGISTER} className={styles.c_login_form__link}>
          新規登録
        </Link>
      </p>
    </div>
  );
});

LoginForm.displayName = 'LoginForm';
