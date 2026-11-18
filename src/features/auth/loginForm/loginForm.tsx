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
  AUTH_ERROR_CODE,
  AUTH_ERROR_MESSAGES,
  AUTH_HINTS,
  TOAST_TITLES,
  TOAST_MESSAGES,
  ROUTES,
} from '@/constants';
import { useToastDispatch } from '@/hooks/useToast';
import { handleApiError } from '@/utils/error';
import { resolveSafeCallbackUrl } from '@/utils/url';
import { SocialLoginButtons } from '@/features/auth/socialLoginButtons/socialLoginButtons';
import styles from './loginForm.module.scss';

/**
 * `signIn` が返した code を、利用者に見せるメッセージに変換する
 *
 * 判別できないものはすべて「メールアドレスまたはパスワードが正しくありません」に
 * 丸める。どのアカウントが存在するかを推測させないため。
 *
 * ここで個別の文言を返すものは、いずれも**パスワード照合に成功した相手にしか
 * 返らない**（`src/lib/auth/auth.ts` の `authorize`）。丸めをやめてよいのは
 * その前提があるときだけ。
 */
const resolveErrorMessage = (code: string | undefined): string => {
  switch (code) {
    case AUTH_ERROR_CODE.TOTP_INVALID:
      return AUTH_ERROR_MESSAGES.TOTP_INVALID;
    case AUTH_ERROR_CODE.TOTP_REUSED:
      return AUTH_ERROR_MESSAGES.TOTP_REUSED;
    case AUTH_ERROR_CODE.RATE_LIMITED:
      return AUTH_ERROR_MESSAGES.RATE_LIMIT_EXCEEDED;
    case AUTH_ERROR_CODE.EMAIL_NOT_VERIFIED:
      // 確認コードを入れる前に離脱した人（#1247）。丸めると、パスワードは
      // 正しいのに「違う」と言われ続けて復帰できない
      return AUTH_ERROR_MESSAGES.EMAIL_NOT_VERIFIED;
    default:
      return AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS;
  }
};

interface LoginFormProps {
  onOtpLoginClick?: () => void;
  /** ログイン後の戻り先（callbackUrl） */
  callbackUrl?: string;
  /**
   * 入力欄の初期値（#1237）
   *
   * パスワード設定の完了画面から渡ってくるアカウント名。発行アカウントの
   * 利用者はここで自分のメールアドレスを入れて失敗しがちで、実際に
   * 起きている。設定を終えた直後なら値は分かっているので入れておく
   */
  initialIdentifier?: string;
  /**
   * 最初から出しておくエラー文言（#1242）
   *
   * ソーシャルログインの失敗は `/auth/signin?error=<コード>` への
   * リダイレクトとして戻ってくる。ページごと再読み込みされるため
   * コンポーネントの state には残らず、サーバー側で文言に変換して渡す。
   *
   * 送信して失敗したときと同じ場所に出す。表示位置が増えると、
   * どちらを読めばよいのか分からなくなる
   */
  initialError?: string;
}

/**
 * ログインフォーム
 */
export const LoginForm = memo<LoginFormProps>(function LoginForm({
  onOtpLoginClick,
  callbackUrl,
  initialIdentifier,
  initialError,
}) {
  const router = useRouter();
  const { toast } = useToastDispatch();
  const [apiError, setApiError] = useState<string | null>(initialError ?? null);
  /**
   * 第2要素の入力欄を出すか。
   *
   * 最初から出さないのは、二段階認証を使っているアカウントかどうかを
   * パスワードを知らない相手に見せないため。パスワードが正しかったときだけ
   * サーバーが totp_required を返し、そこで初めて表示する。
   */
  const [totpRequired, setTotpRequired] = useState(false);
  const [totpCode, setTotpCode] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: initialIdentifier ?? '',
      password: '',
    },
  });

  const handleTotpCodeChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setTotpCode(event.target.value);
    },
    [],
  );

  const onSubmit = useCallback(
    async (data: LoginFormData) => {
      setApiError(null);

      try {
        const result = await signIn('credentials', {
          redirect: false,
          email: data.email,
          password: data.password,
          // 入力欄を出していないうちは送らない
          ...(totpRequired ? { totpCode } : {}),
        });

        if (result?.error) {
          if (result.code === AUTH_ERROR_CODE.TOTP_REQUIRED) {
            // パスワードは正しい。第2要素の入力へ進む
            setTotpRequired(true);
            return;
          }

          const message = resolveErrorMessage(result.code);
          setApiError(message);
          toast({
            title: TOAST_TITLES.LOGIN_ERROR,
            description: message,
            variant: 'error',
          });
          return;
        }

        toast({
          title: TOAST_TITLES.LOGIN_SUCCESS,
          description: TOAST_MESSAGES.LOGIN_SUCCESS_DESCRIPTION,
          variant: 'success',
        });

        router.push(resolveSafeCallbackUrl(callbackUrl));
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
    [router, toast, callbackUrl, totpRequired, totpCode],
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
          {/*
            管理者が発行するアカウントはメールアドレスを持たず、ユーザー名で
            ログインする。入力欄は兼用し、`@` の有無で振り分ける。
            type='email' のままだとブラウザ側の検証でユーザー名が弾かれるため
            type='text' にする（形式検証は loginSchema が担う）。
          */}
          <Input
            label='メールアドレスまたはアカウント名'
            type='text'
            autoComplete='username'
            placeholder='example@example.com または 4KMPQ7RSTWX2'
            fullWidth
            error={errors.email?.message}
            {...register('email')}
          />

          {/*
            ラベルは以前から両対応だったが、それでもメールアドレスを入れて
            失敗する人がいた（#1237）。発行アカウントの利用者はメールを
            閉じていると自分のアカウント名を思い出せないため、どこに書いて
            あるかまで示す
          */}
          <p className={styles.c_login_form__hint}>
            {AUTH_HINTS.USERNAME_LOGIN}
          </p>

          <Input
            label='パスワード'
            type='password'
            autoComplete='current-password'
            placeholder='パスワードを入力'
            fullWidth
            error={errors.password?.message}
            {...register('password')}
          />

          {totpRequired && (
            <>
              <Input
                label='認証コード'
                type='text'
                inputMode='text'
                autoComplete='one-time-code'
                placeholder='123456 またはリカバリーコード'
                autoFocus
                fullWidth
                value={totpCode}
                onChange={handleTotpCodeChange}
              />
              <p className={styles.c_login_form__hint}>
                認証アプリに表示されている6桁のコード、または発行済みの
                リカバリーコードを入力してください。
              </p>
            </>
          )}

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

      <SocialLoginButtons disabled={isSubmitting} callbackUrl={callbackUrl} />

      <p className={styles.c_login_form__footer}>
        <Link
          href={ROUTES.FORGOT_PASSWORD}
          className={styles.c_login_form__link}
        >
          パスワードをお忘れの方
        </Link>
      </p>

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
