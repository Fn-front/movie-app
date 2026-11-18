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
import { ACCOUNT_SETUP_USERNAME_PARAM } from '@/constants/adminAccount';
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
  /**
   * admin 発行アカウントの設定リンクから来たか
   *
   * 受け取り手は自力で再送できない（合成アドレス宛には届かず、列挙防止で
   * 理由も表示されない）。復旧は admin の再発行だけなので、再送の導線を
   * 出さずにそちらへ案内する
   */
  isIssuedAccount?: boolean;
  /**
   * ログインに使うアカウント名（#1237）
   *
   * 発行アカウントは**ユーザー名でログインする**が、それが伝わるのは発行
   * メールの本文だけだった。メールを閉じた利用者が自分のメールアドレスを
   * 入れてログインに失敗する事故が実際に起きている。
   *
   * 表示にしか使わない。トークンの検証にも認可にも関与しない
   */
  username?: string;
}

export const ResetPasswordForm = memo<ResetPasswordFormProps>(
  function ResetPasswordForm({ token, isIssuedAccount = false, username }) {
    const { isCompleted, isSubmitting, error, submit } = useResetPassword({
      token,
    });

    const {
      register,
      handleSubmit,
      formState: { errors },
    } = useForm<PasswordResetConfirmFormData>({
      resolver: zodResolver(passwordResetConfirmSchema),
      defaultValues: { password: '', confirmPassword: '' },
    });

    // 設定が終わったら完了画面に差し替える（#1237）。
    //
    // 以前は即 `/auth/signin` へ遷移していたため、成功したことも、ログインに
    // 使うアカウント名も伝わらなかった。実際に、設定は成功しているのに自分の
    // メールアドレスでログインを試みて失敗し、リンクを3回踏み直した人がいる
    /** ログインに使う値。設定の前後どちらでも同じ形で見せる */
    const accountName = username ? (
      <p className={styles.c_reset_password__account}>
        {PASSWORD_RESET_MESSAGES.ACCOUNT_NAME_LABEL}
        <strong className={styles.c_reset_password__account_value}>
          {username}
        </strong>
      </p>
    ) : null;

    if (isCompleted) {
      return (
        /*
          ⚠️ `role='status'` を付ける。`isCompleted` でツリーごと差し替わる
          ため、送信ボタンが消えた瞬間フォーカスが `<body>` へ落ち、成功が
          支援技術に一切伝わらない。SPA では `<h1>` の差し替えは読まれない。
          同系統の `forgotPasswordForm` も成功表示をライブリージョンにして
          いる。`aria-atomic` は既定 true なので見出しごとまとめて読まれる
        */
        <div className={styles.c_reset_password} role='status'>
          <Heading level={1} align='center'>
            {PASSWORD_RESET_MESSAGES.RESET_COMPLETED_HEADING}
          </Heading>

          <div className={styles.c_reset_password__body}>
            {accountName}

            {/*
              アカウント名が分かっていれば、ログイン欄に入れた状態で渡す。
              ここまで来た人は値を持っているのに、遷移先で思い出せずに
              メールアドレスを入れて失敗していた（#1237）
            */}
            <Link
              href={
                username
                  ? `${ROUTES.LOGIN}?${ACCOUNT_SETUP_USERNAME_PARAM}=${encodeURIComponent(username)}`
                  : ROUTES.LOGIN
              }
              className={styles.c_reset_password__cta}
            >
              {PASSWORD_RESET_MESSAGES.GO_TO_LOGIN}
            </Link>
          </div>
        </div>
      );
    }

    return (
      <div className={styles.c_reset_password}>
        <Heading level={1} align='center'>
          新しいパスワードの設定
        </Heading>

        {/*
          ログインに使う値を設定の前から見せる（#1237）。メール本文にしか
          無かったため、メールを閉じた利用者がメールアドレスを入れていた
        */}
        {accountName}

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
                placeholder='12文字以上、大文字・小文字・数字を含む'
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
          {isIssuedAccount ? (
            PASSWORD_RESET_MESSAGES.ISSUED_ACCOUNT_RESEND
          ) : (
            <Link
              href={ROUTES.FORGOT_PASSWORD}
              className={styles.c_reset_password__link}
            >
              再設定リンクを再送する
            </Link>
          )}
        </p>
      </div>
    );
  },
);

ResetPasswordForm.displayName = 'ResetPasswordForm';
