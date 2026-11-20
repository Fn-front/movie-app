/**
 * 二段階認証の設定コンポーネント
 */

'use client';

import { memo, useCallback, useId, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button/button';
import { Input } from '@/components/ui/input/input';
import { Skeleton } from '@/components/ui/skeleton/skeleton';
import { SECOND_FACTOR_SETUP_CODE_MESSAGES } from '@/constants/secondFactorSetupCode';

import {
  SECOND_FACTOR_MESSAGES,
  SECOND_FACTOR_METHOD,
} from '@/constants/secondFactor';

import {
  TWO_FACTOR_VIEW,
  useTwoFactorSettings,
} from './hooks/useTwoFactorSettings';
import styles from './twoFactorSettings.module.scss';

export interface TwoFactorSettingsProps {
  /**
   * パスワードを持っているか（#1368）
   *
   * ⛔ 設定を始めるには**再認証**が要る。持っている人には現在のパスワード、
   * 持たない人（OAuth のみ）には登録アドレスへ送る使い捨てコードを求める。
   */
  hasPassword: boolean;
}

export const TwoFactorSettings = memo<TwoFactorSettingsProps>(
  function TwoFactorSettings({ hasPassword }) {
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
      sendReauthCode,
      sendChallenge,
      resendSetupCode,
      resendRemaining,
      canResendSetupCode,
      enable,
      disable,
      regenerateRecoveryCodes,
      dismissRecoveryCodes,
      cancelSetup,
    } = useTwoFactorSettings();

    const [code, setCode] = useState('');
    // 再認証（#1368）。持っている材料に応じてどちらか一方を使う
    const [reauthPassword, setReauthPassword] = useState('');
    const [reauthCode, setReauthCode] = useState('');

    const reauthPasswordId = useId();
    const reauthCodeId = useId();

    /**
     * 設定を始められるか
     *
     * ⚠️ 空のまま押すと 400 が返るだけなので手前で止める。
     */
    const canStartSetup = hasPassword
      ? reauthPassword.length > 0
      : reauthCode.length > 0;

    /**
     * 設定をやめる（#1368 のレビュー）
     *
     * ⚠️ **再認証の入力も捨てる。** 残すと、OAuth のみの利用者が
     * 「始める → やめる → もう一度」をしたときに**消費済みのコード**が
     * 欄に残ったままになり、ボタンは押せるのにサーバーが必ず 400 を返す。
     * 再送は60秒の間隔と 5回/60分 の枠に当たるので行き止まりに近い。
     */
    const handleCancelSetup = useCallback(() => {
      setReauthPassword('');
      setReauthCode('');
      setCode('');
      cancelSetup();
    }, [cancelSetup]);

    const handleReauthPasswordChange = useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        setReauthPassword(event.target.value);
      },
      [],
    );

    const handleReauthCodeChange = useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        setReauthCode(event.target.value);
      },
      [],
    );

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
        // ⚠️ 再認証の入力も捨てる。無効化すると方式の選択へ戻るので、
        //    もう一度設定するなら本人確認をやり直してもらう（残っていると
        //    画面だけ素通りして見える）
        setReauthPassword('');
        setReauthCode('');
      },
      [disable, code],
    );

    const handleRegenerate = useCallback(async () => {
      await regenerateRecoveryCodes(code);
      setCode('');
    }, [regenerateRecoveryCodes, code]);

    /**
     * 再認証の材料（#1368）
     *
     * ⚠️ 片方だけを送る。両方送っても害は無いが、サーバー側がどちらを
     * 要求するかは `users.password_hash` で決まるので、画面が推測して
     * 両方入れると「要らないほうを入力させる」ことになる。
     */
    const reauth = useMemo(
      () =>
        hasPassword ? { currentPassword: reauthPassword } : { reauthCode },
      [hasPassword, reauthPassword, reauthCode],
    );

    const handleStartTotp = useCallback(async () => {
      await startSetup(SECOND_FACTOR_METHOD.TOTP, reauth);
    }, [reauth, startSetup]);

    const handleStartEmailOtp = useCallback(async () => {
      await startSetup(SECOND_FACTOR_METHOD.EMAIL_OTP, reauth);
    }, [reauth, startSetup]);

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

            {/*
            ⛔ **再認証（#1368）。** これが無いと、セッションを奪った第三者が
            `setup` → `enable` の2手で被害者のアカウントに自分の第2要素を
            登録できる。登録された第2要素は乗っ取りの固定手段になる
          */}
            {/*
              ⚠️ `role='group'` と名前を付ける。同じ設定画面の
              メールアドレス変更にも『現在のパスワード』があり、名前だけでは
              どちらの欄か区別できない（支援技術でも E2E でも）
            */}
            <div
              className={styles.c_two_factor_settings__reauth}
              role='group'
              aria-label={SECOND_FACTOR_SETUP_CODE_MESSAGES.REAUTH_GROUP_LABEL}
            >
              <p className={styles.c_two_factor_settings__method_note}>
                {hasPassword
                  ? SECOND_FACTOR_SETUP_CODE_MESSAGES.PASSWORD_DESCRIPTION
                  : SECOND_FACTOR_SETUP_CODE_MESSAGES.CODE_DESCRIPTION}
              </p>

              {hasPassword ? (
                <Input
                  id={reauthPasswordId}
                  type='password'
                  label='現在のパスワード'
                  autoComplete='current-password'
                  value={reauthPassword}
                  onChange={handleReauthPasswordChange}
                  fullWidth
                />
              ) : (
                <>
                  <Button
                    type='button'
                    variant='secondary'
                    onClick={sendReauthCode}
                    isLoading={isSubmitting}
                  >
                    確認コードを送る
                  </Button>
                  <Input
                    id={reauthCodeId}
                    type='text'
                    inputMode='numeric'
                    label='確認コード'
                    autoComplete='one-time-code'
                    value={reauthCode}
                    onChange={handleReauthCodeChange}
                    fullWidth
                  />
                </>
              )}
            </div>

            <div className={styles.c_two_factor_settings__methods}>
              <div className={styles.c_two_factor_settings__method}>
                <Button
                  type='button'
                  variant='primary'
                  onClick={handleStartTotp}
                  isLoading={isSubmitting}
                  disabled={!canStartSetup}
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
                    disabled={!canStartSetup}
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
            {/*
            ⚠️ ここで「送りました」と断定しない（#1285）。
            再送間隔に当たると**1通も送っていない**のにこの文が出て、
            上の `notice`（「先ほど送った確認コードがまだ有効です」）と
            矛盾する。送信の結果は notice 側だけが言う。
          */}
            <p className={styles.c_two_factor_settings__lead}>
              登録しているメールアドレスに届いた6桁のコードを入力してください。
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
                onClick={handleCancelSetup}
                aria-label='二段階認証の設定をやめる'
              >
                やめる
              </Button>
            </div>

            {/*
            設定中の再送（#1285）

            これが無いと、コードの試行回数（5回）を使い切った利用者は
            「やめる → メールで設定する」でやり直すしかない。60秒以内だと
            再送間隔に当たって1通も届かないまま同じ画面に戻るため、
            最大60秒のあいだ何をしても進めない窓ができていた。

            ⚠️ `sendChallenge`（`ENABLED` の再送）は使えない。あちらが叩く
            `send-challenge` は `confirmed_at IS NOT NULL` が前提で、
            まだ有効化していない設定中のユーザーには何も送れない。

            ⚠️ `aria-label` は付けない。本文が「送信しています…」に変わるのに
            固定のラベルを置くと、見えている文字がアクセシブルネームに
            含まれなくなる（WCAG 2.5.3 Label in Name）。
            他の再送ボタン（`twoFactorChallenge`）と同じ扱い
          */}
            <div className={styles.c_two_factor_settings__resend}>
              <Button
                type='button'
                variant='secondary'
                onClick={resendSetupCode}
                disabled={!canResendSetupCode || isSubmitting}
              >
                {isSubmitting ? '送信しています…' : '確認コードを再送信する'}
              </Button>

              {/*
              ⚠️ `aria-live` を付けない。本文が毎秒変わるため、polite の
              キューに60件のアナウンスが積まれ、読み上げが追いつかなくなる。
              押せない理由はボタンの `disabled` が伝える
            */}
              <p className={styles.c_two_factor_settings__resend_hint}>
                {canResendSetupCode
                  ? '再送信できます。'
                  : `再送信できるまで ${resendRemaining} 秒`}
              </p>
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
                onClick={handleCancelSetup}
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
                {isEmailOtp
                  ? 'メールを受け取れなくなると'
                  : '認証アプリを失うと'}
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
  },
);

TwoFactorSettings.displayName = 'TwoFactorSettings';
