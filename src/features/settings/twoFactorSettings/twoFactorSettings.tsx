/**
 * 二段階認証の設定コンポーネント
 */

'use client';

import { memo, useCallback, useState } from 'react';

import { Button } from '@/components/ui/button/button';
import { Input } from '@/components/ui/input/input';
import { Skeleton } from '@/components/ui/skeleton/skeleton';

import {
  SECOND_FACTOR_MESSAGES,
  SECOND_FACTOR_METHOD,
} from '@/constants/secondFactor';

import {
  TWO_FACTOR_VIEW,
  useTwoFactorSettings,
} from './hooks/useTwoFactorSettings';
import styles from './twoFactorSettings.module.scss';

export const TwoFactorSettings = memo(function TwoFactorSettings() {
  const {
    view,
    method,
    emailOtpAvailable,
    qrCodeDataUri,
    secret,
    recoveryCodes,
    remainingRecoveryCodes,
    isSubmitting,
    error,
    notice,
    startSetup,
    sendChallenge,
    enable,
    disable,
    regenerateRecoveryCodes,
    dismissRecoveryCodes,
    cancelSetup,
  } = useTwoFactorSettings();

  const [code, setCode] = useState('');

  const handleCodeChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setCode(event.target.value);
    },
    [],
  );

  const handleEnable = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      await enable(code);
      setCode('');
    },
    [enable, code],
  );

  const handleDisable = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      await disable(code);
      setCode('');
    },
    [disable, code],
  );

  const handleRegenerate = useCallback(async () => {
    await regenerateRecoveryCodes(code);
    setCode('');
  }, [regenerateRecoveryCodes, code]);

  const handleStartTotp = useCallback(async () => {
    await startSetup(SECOND_FACTOR_METHOD.TOTP);
  }, [startSetup]);

  const handleStartEmailOtp = useCallback(async () => {
    await startSetup(SECOND_FACTOR_METHOD.EMAIL_OTP);
  }, [startSetup]);

  const isEmailOtp = method === SECOND_FACTOR_METHOD.EMAIL_OTP;

  if (view === TWO_FACTOR_VIEW.LOADING) {
    return <Skeleton variant='rect' width='100%' height={48} />;
  }

  return (
    <div className={styles.c_two_factor_settings}>
      {error && (
        <p className={styles.c_two_factor_settings__error} role='alert'>
          {error}
        </p>
      )}

      {/*
        コード送信は画面の状態を変えないため、これが無いと利用者は
        送られたのかどうか分からない。
        `role='status'` にして、読み上げを割り込ませずに伝える
      */}
      {notice && (
        <p className={styles.c_two_factor_settings__notice} role='status'>
          {notice}
        </p>
      )}

      {view === TWO_FACTOR_VIEW.DISABLED && (
        <>
          <p className={styles.c_two_factor_settings__lead}>
            パスワードに加えて、もう1つのコードを要求します。
            パスワードが漏れても、そのコードが無ければログインできません。
          </p>

          <div className={styles.c_two_factor_settings__methods}>
            <div className={styles.c_two_factor_settings__method}>
              <Button
                type='button'
                variant='primary'
                onClick={handleStartTotp}
                isLoading={isSubmitting}
                aria-label='認証アプリで設定する'
              >
                認証アプリで設定する
              </Button>
              <p className={styles.c_two_factor_settings__method_note}>
                {SECOND_FACTOR_MESSAGES.TOTP_DESCRIPTION}
              </p>
            </div>

            {/*
              admin が発行したアカウントは users.email が .invalid TLD
              （RFC 2606、絶対に名前解決されない）なので選ばせない。
              サーバー側でも拒否している（画面だけの制限にしない）
            */}
            {emailOtpAvailable && (
              <div className={styles.c_two_factor_settings__method}>
                <Button
                  type='button'
                  variant='secondary'
                  onClick={handleStartEmailOtp}
                  isLoading={isSubmitting}
                  aria-label='メールで設定する'
                >
                  メールで設定する
                </Button>
                <p className={styles.c_two_factor_settings__method_note}>
                  {SECOND_FACTOR_MESSAGES.EMAIL_OTP_DESCRIPTION}
                </p>
                {/*
                  ⚠️ role='alert' にしない。選ぶ前の説明であってエラーではなく、
                  読み上げを割り込ませる筋合いがない
                */}
                <p className={styles.c_two_factor_settings__method_warning}>
                  {SECOND_FACTOR_MESSAGES.EMAIL_OTP_WARNING}
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {view === TWO_FACTOR_VIEW.SETUP_EMAIL && (
        <form
          className={styles.c_two_factor_settings__setup}
          onSubmit={handleEnable}
        >
          <p className={styles.c_two_factor_settings__lead}>
            登録しているメールアドレスに確認コードを送りました。
            届いた6桁のコードを入力してください。
          </p>

          <Input
            label='確認コード'
            type='text'
            inputMode='numeric'
            autoComplete='one-time-code'
            placeholder='123456'
            fullWidth
            value={code}
            onChange={handleCodeChange}
          />

          <div className={styles.c_two_factor_settings__actions}>
            <Button
              type='submit'
              variant='primary'
              isLoading={isSubmitting}
              aria-label='二段階認証を有効にする'
            >
              有効にする
            </Button>
            <Button
              type='button'
              variant='secondary'
              onClick={cancelSetup}
              aria-label='二段階認証の設定をやめる'
            >
              やめる
            </Button>
          </div>
        </form>
      )}

      {view === TWO_FACTOR_VIEW.SETUP && (
        <form
          className={styles.c_two_factor_settings__setup}
          onSubmit={handleEnable}
        >
          <ol className={styles.c_two_factor_settings__steps}>
            <li>認証アプリで下のQRコードを読み取る</li>
            <li>表示された6桁のコードを入力する</li>
          </ol>

          {qrCodeDataUri && (
            // SVG文字列をそのまま挿入せず img で表示する。
            // img のSVGはスクリプトを実行できないため、XSSのsinkにならない。
            //
            // next/image は使わない。中身は data URI のSVG（数KB）で、
            // 最適化・CDN配信の対象にならず、unoptimized 指定が増えるだけ。
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className={styles.c_two_factor_settings__qr}
              src={qrCodeDataUri}
              alt='二段階認証のQRコード'
              width={240}
              height={240}
            />
          )}

          {secret && (
            <p className={styles.c_two_factor_settings__secret}>
              QRコードを読み取れない場合は、次の鍵を手で入力してください
              <code className={styles.c_two_factor_settings__secret_value}>
                {secret}
              </code>
            </p>
          )}

          <Input
            label='認証コード'
            type='text'
            inputMode='numeric'
            autoComplete='one-time-code'
            placeholder='123456'
            fullWidth
            value={code}
            onChange={handleCodeChange}
          />

          <div className={styles.c_two_factor_settings__actions}>
            <Button
              type='submit'
              variant='primary'
              isLoading={isSubmitting}
              aria-label='二段階認証を有効にする'
            >
              有効にする
            </Button>
            <Button
              type='button'
              variant='secondary'
              onClick={cancelSetup}
              aria-label='二段階認証の設定をやめる'
            >
              やめる
            </Button>
          </div>
        </form>
      )}

      {view === TWO_FACTOR_VIEW.RECOVERY_CODES && recoveryCodes && (
        <div className={styles.c_two_factor_settings__recovery}>
          <p className={styles.c_two_factor_settings__warning} role='alert'>
            リカバリーコードを安全な場所に保管してください。
            <strong>この画面を閉じると二度と表示できません。</strong>
            認証アプリを失ったとき、これが唯一の復旧手段です。
          </p>

          <ul
            className={styles.c_two_factor_settings__codes}
            aria-label='リカバリーコード'
          >
            {recoveryCodes.map((recoveryCode) => (
              <li key={recoveryCode}>
                <code>{recoveryCode}</code>
              </li>
            ))}
          </ul>

          <Button
            type='button'
            variant='primary'
            onClick={dismissRecoveryCodes}
            /*
              ⚠️ 可視テキスト（控えました）を**そのまま含む**こと（#1085）。
              WCAG 2.5.3 Label in Name。音声入力で見えている文字を読み上げて
              操作する利用者が、見えているとおりに言っても反応しなくなる
            */
            aria-label='リカバリーコードを控えました'
          >
            控えました
          </Button>
        </div>
      )}

      {view === TWO_FACTOR_VIEW.ENABLED && (
        <>
          <p className={styles.c_two_factor_settings__status}>
            二段階認証は<strong>有効</strong>です（
            {isEmailOtp ? 'メールのコード' : '認証アプリ'}）。
            未使用のリカバリーコードは {remainingRecoveryCodes} 個あります。
          </p>

          {remainingRecoveryCodes === 0 && (
            <p className={styles.c_two_factor_settings__warning} role='alert'>
              リカバリーコードを使い切っています。
              {isEmailOtp ? 'メールを受け取れなくなると' : '認証アプリを失うと'}
              ログインできなくなるため、再発行してください。
            </p>
          )}

          <form
            className={styles.c_two_factor_settings__setup}
            onSubmit={handleDisable}
          >
            <p className={styles.c_two_factor_settings__lead}>
              無効化とリカバリーコードの再発行には、
              {isEmailOtp ? 'メールに送る確認コード' : '認証アプリのコード'}
              （またはリカバリーコード）が必要です。
            </p>

            {/*
              ⚠️ メールOTP の利用者はコードを手元で作れない。
              この導線が無いと、一度有効にしたら二度と無効化できなくなる
              （再セットアップは「既に有効」で弾かれ、パスワードリセットは
              意図的に第2要素へ触れないため）
            */}
            {isEmailOtp && (
              <Button
                type='button'
                variant='secondary'
                onClick={sendChallenge}
                isLoading={isSubmitting}
                /*
                  ⚠️ 「確認コードを送信」にしない。同じ設定画面の
                  パスワード変更セクションに同名のボタンがあり、
                  部分一致のロケータ（getByLabel 等）で衝突する
                */
                aria-label='二段階認証の確認コードを送信'
              >
                二段階認証の確認コードを送信
              </Button>
            )}

            {/*
              ラベルは方式で変えない。リカバリーコードもここに入れるので、
              「確認コード」だと認証アプリ利用者に誤解を与える
            */}
            <Input
              label='認証コード'
              type='text'
              inputMode='text'
              autoComplete='one-time-code'
              placeholder='123456 またはリカバリーコード'
              fullWidth
              value={code}
              onChange={handleCodeChange}
            />

            <div className={styles.c_two_factor_settings__actions}>
              <Button
                type='button'
                variant='secondary'
                onClick={handleRegenerate}
                isLoading={isSubmitting}
                /*
                  ⚠️ 可視テキスト（リカバリーコードを再発行）を**そのまま含む**
                  こと（#1085）。個数は上の「未使用のリカバリーコードは N 個
                  あります」で読めるので、ここには入れない。
                  入れると可視テキストが途切れて WCAG 2.5.3 に反する
                */
                aria-label='リカバリーコードを再発行する'
              >
                リカバリーコードを再発行
              </Button>
              <Button
                type='submit'
                variant='danger'
                isLoading={isSubmitting}
                aria-label='二段階認証を無効にする'
              >
                無効にする
              </Button>
            </div>
          </form>
        </>
      )}
    </div>
  );
});

TwoFactorSettings.displayName = 'TwoFactorSettings';
