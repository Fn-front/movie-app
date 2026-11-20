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
import {
  SECOND_FACTOR_METHOD,
  type SecondFactorMethod,
} from '@/constants/secondFactor';
import { OTP_CONFIG } from '@/constants/otp';
import { useResendCountdown } from '@/features/auth/hooks/useResendCountdown';

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
    case AUTH_ERROR_CODE.SECOND_FACTOR_SEND_FAILED:
      // 「コードが違う」と必ず分ける。打ち直しても直らない（#1148 と同じ理由）
      return AUTH_ERROR_MESSAGES.SECOND_FACTOR_SEND_FAILED;
    case AUTH_ERROR_CODE.SECOND_FACTOR_SEND_LIMITED:
      return AUTH_ERROR_MESSAGES.SECOND_FACTOR_SEND_LIMITED;
    case AUTH_ERROR_CODE.EMAIL_NOT_VERIFIED:
      // 確認コードを入れる前に離脱した人（#1247）。丸めると、パスワードは
      // 正しいのに「違う」と言われ続けて復帰できない
      return AUTH_ERROR_MESSAGES.EMAIL_NOT_VERIFIED;
    default:
      return AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS;
  }
};

interface LoginFormProps {
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
  const [secondFactorMode, setSecondFactorMode] =
    useState<SecondFactorMethod | null>(null);
  const [totpCode, setTotpCode] = useState('');

  /**
   * コードが1通も送られていないか
   *
   * 送信上限に達した状態。ヒント文と再送ボタンをこの事実に合わせないと、
   * 「メールに送信した6桁のコード」「再送信できます」と出て矛盾する
   */
  const [sendLimited, setSendLimited] = useState(false);

  const totpRequired = secondFactorMode !== null;
  const isEmailOtp = secondFactorMode === SECOND_FACTOR_METHOD.EMAIL_OTP;

  const { remaining, canResend, restart } = useResendCountdown(
    OTP_CONFIG.RESEND_INTERVAL_SECONDS,
  );

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

  /**
   * サインインを実行する
   *
   * @param data - 入力されたメールアドレス／アカウント名とパスワード
   * @param isResend - 再送なら true。第2要素のコードを送らない
   */
  const performSignIn = useCallback(
    async (data: LoginFormData, isResend: boolean) => {
      setApiError(null);

      try {
        const result = await signIn('credentials', {
          redirect: false,
          email: data.email,
          password: data.password,
          // 入力欄を出していないうち、および再送のときは送らない
          ...(totpRequired && !isResend ? { totpCode } : {}),
        });

        if (result?.error) {
          if (result.code === AUTH_ERROR_CODE.TOTP_REQUIRED) {
            // パスワードは正しい。第2要素（認証アプリ）の入力へ進む
            setSecondFactorMode(SECOND_FACTOR_METHOD.TOTP);
            return;
          }

          if (result.code === AUTH_ERROR_CODE.EMAIL_OTP_REQUIRED) {
            // パスワードは正しい。コードはサーバーが送信済み
            setSecondFactorMode(SECOND_FACTOR_METHOD.EMAIL_OTP);
            setSendLimited(false);
            restart();
            return;
          }

          // ⚠️ **どちらも入力欄を出す。**
          //
          // 1通も送られていないが、だからこそリカバリーコードが唯一の出口に
          // なる。入力欄を出さないと、手元にコードがあっても入れる場所が
          // 無く、Resend の障害が続く限りそのアカウントは一切ログイン
          // できない。
          //
          // パスワードは照合済みなので、方式を露出しても列挙にはならない
          // （上の2分岐と同じ理屈）。
          if (
            result.code === AUTH_ERROR_CODE.SECOND_FACTOR_SEND_LIMITED ||
            result.code === AUTH_ERROR_CODE.SECOND_FACTOR_SEND_FAILED
          ) {
            setSecondFactorMode(SECOND_FACTOR_METHOD.EMAIL_OTP);
            setSendLimited(true);
            setApiError(resolveErrorMessage(result.code));
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
    [router, toast, callbackUrl, totpRequired, totpCode, restart],
  );

  const onSubmit = useCallback(
    (data: LoginFormData) => performSignIn(data, false),
    [performSignIn],
  );

  /**
   * コードを送り直す
   *
   * ⚠️ 再送では**入力済みのコードを送らない**。`performSignIn` は
   * `totpRequired` のとき `totpCode` を送るため、打ち間違えた状態で
   * 再送を押すとそのコードが検証され、`TOTP_VERIFY`（5回/15分）の枠を
   * 1つ失う。サーバー側は「コード未指定」を再送の合図として扱う。
   *
   * 「再送かどうか」を state や ref ではなく引数で渡すのは、
   * `setTotpCode('')` が同期的に反映されず、クロージャが古い値を
   * 掴むため。
   */
  const handleResend = useCallback(() => {
    setTotpCode('');
    restart();
    // パスワードごと送り直す。フォームが値を保持しているので、
    // 利用者はもう一度入力する必要がない
    handleSubmit((data) => performSignIn(data, true))();
  }, [handleSubmit, performSignIn, restart]);

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
                {!isEmailOtp
                  ? '認証アプリに表示されている6桁のコード、または発行済みのリカバリーコードを入力してください。'
                  : sendLimited
                    ? // 1通も送っていない。コードを待たせない
                      '発行済みのリカバリーコードを入力してください。'
                    : 'メールに送信した6桁のコード、または発行済みのリカバリーコードを入力してください。'}
              </p>

              {/* 認証アプリは手元で作れるので再送の概念が無い */}
              {/* 送信上限のときは出さない。押しても同じエラーが返るだけで、
                  「再送信できます」と出ると案内と矛盾する */}
              {isEmailOtp && !sendLimited && (
                <div className={styles.c_login_form__resend}>
                  <Button
                    type='button'
                    variant='secondary'
                    onClick={handleResend}
                    disabled={!canResend || isSubmitting}
                    aria-label='確認コードを再送信する'
                  >
                    確認コードを再送信する
                  </Button>
                  {/*
                    ⚠️ `aria-live` を付けない。本文が毎秒変わるため、polite の
                    キューに60件のアナウンスが積まれ、読み上げが追いつかなくなる。
                    カウント中は実質スクリーンリーダーで操作できない。
                    既存の `otpVerification` も同じカウントダウンに付けていない
                  */}
                  <p className={styles.c_login_form__hint}>
                    {canResend
                      ? '再送信できます。'
                      : `再送信できるまで ${remaining} 秒`}
                  </p>
                </div>
              )}
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
