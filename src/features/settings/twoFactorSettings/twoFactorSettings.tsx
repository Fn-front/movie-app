/**
 * 二段階認証の設定コンポーネント
 */

'use client';

import { memo, useCallback, useState } from 'react';

import { Button } from '@/components/ui/button/button';
import { Input } from '@/components/ui/input/input';
import { Skeleton } from '@/components/ui/skeleton/skeleton';
import { RECOVERY_CODE_CONFIG } from '@/constants/totp';

import {
  TWO_FACTOR_VIEW,
  useTwoFactorSettings,
} from './hooks/useTwoFactorSettings';
import styles from './twoFactorSettings.module.scss';

export const TwoFactorSettings = memo(function TwoFactorSettings() {
  const {
    view,
    qrCodeDataUri,
    secret,
    recoveryCodes,
    remainingRecoveryCodes,
    isSubmitting,
    error,
    startSetup,
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

      {view === TWO_FACTOR_VIEW.DISABLED && (
        <>
          <p className={styles.c_two_factor_settings__lead}>
            認証アプリで生成するコードを、パスワードに加えて要求します。
            メールやパスワードが漏れても、認証アプリが無ければログインできません。
          </p>
          <Button
            type='button'
            variant='primary'
            onClick={startSetup}
            isLoading={isSubmitting}
            aria-label='二段階認証を設定する'
          >
            二段階認証を設定する
          </Button>
        </>
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
            aria-label='リカバリーコードを控えた'
          >
            控えました
          </Button>
        </div>
      )}

      {view === TWO_FACTOR_VIEW.ENABLED && (
        <>
          <p className={styles.c_two_factor_settings__status}>
            二段階認証は<strong>有効</strong>です。 未使用のリカバリーコードは{' '}
            {remainingRecoveryCodes} 個あります。
          </p>

          {remainingRecoveryCodes === 0 && (
            <p className={styles.c_two_factor_settings__warning} role='alert'>
              リカバリーコードを使い切っています。認証アプリを失うと
              ログインできなくなるため、再発行してください。
            </p>
          )}

          <form
            className={styles.c_two_factor_settings__setup}
            onSubmit={handleDisable}
          >
            <p className={styles.c_two_factor_settings__lead}>
              無効化とリカバリーコードの再発行には、認証アプリのコード
              （またはリカバリーコード）が必要です。
            </p>

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
                aria-label={`リカバリーコードを${RECOVERY_CODE_CONFIG.COUNT}個再発行する`}
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
