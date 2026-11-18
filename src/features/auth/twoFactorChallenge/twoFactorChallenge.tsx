/**
 * 二段階認証コードの入力画面
 *
 * OAuthログインの後に第2要素を要求するためのもの。
 * パスワードログインは `loginForm` 内で同じ入力欄を出すため、ここは通らない。
 */

'use client';

import { memo } from 'react';

import { Heading } from '@/components/ui/heading/heading';
import { Input } from '@/components/ui/input/input';
import { Button } from '@/components/ui/button/button';

import { useTwoFactorChallenge } from './hooks/useTwoFactorChallenge';
import styles from './twoFactorChallenge.module.scss';

interface TwoFactorChallengeProps {
  /** 検証後の戻り先 */
  callbackUrl?: string;
}

export const TwoFactorChallenge = memo<TwoFactorChallengeProps>(
  function TwoFactorChallenge({ callbackUrl }) {
    const {
      code,
      error,
      isSubmitting,
      isCancelling,
      isEmailOtp,
      isResending,
      resendRemaining,
      canResend,
      onCodeChange,
      onSubmit,
      onResend,
      onCancel,
    } = useTwoFactorChallenge({ callbackUrl });

    return (
      <div className={styles.c_two_factor}>
        <Heading level={1} align='center'>
          二段階認証
        </Heading>

        <p className={styles.c_two_factor__lead}>
          {isEmailOtp
            ? 'メールに送信した6桁のコードを入力してください。メールが届かない場合は、発行済みのリカバリーコードでも進めます。'
            : '認証アプリに表示されている6桁のコードを入力してください。認証アプリが使えない場合は、発行済みのリカバリーコードでも進めます。'}
        </p>

        <form className={styles.c_two_factor__body} onSubmit={onSubmit}>
          <div className={styles.c_two_factor__fields}>
            <Input
              label='認証コード'
              type='text'
              inputMode='text'
              autoComplete='one-time-code'
              placeholder='123456 またはリカバリーコード'
              autoFocus
              fullWidth
              value={code}
              onChange={onCodeChange}
            />

            {error && (
              <p className={styles.c_two_factor__error} role='alert'>
                {error}
              </p>
            )}

            <Button
              type='submit'
              variant='primary'
              size='lg'
              fullWidth
              isLoading={isSubmitting}
              disabled={isCancelling || isResending}
              aria-label='認証コードを確認'
            >
              確認
            </Button>
          </div>
        </form>

        {/*
          認証アプリは手元で作れるので再送の概念が無い。
          メールのコードだけに出す
        */}
        {isEmailOtp && (
          <div className={styles.c_two_factor__resend}>
            {/*
              ⚠️ `isLoading` は使わない。`Button` はローディング中に本文を
              `visibility: hidden` にしてアクセシブルネームごと消すため、
              下のログアウト導線と同じ理由で文言の差し替えにする
            */}
            <Button
              type='button'
              variant='secondary'
              size='lg'
              fullWidth
              onClick={onResend}
              disabled={!canResend || isResending}
              aria-label='確認コードを再送信する'
            >
              {isResending ? '送信しています…' : '確認コードを再送信する'}
            </Button>

            {/*
              残り秒数は読み上げる。視覚で待ち時間を読めない利用者が
              「押せない理由」を知る手がかりがこれしかない
            */}
            <p className={styles.c_two_factor__resend_hint} aria-live='polite'>
              {canResend
                ? '再送信できます。'
                : `再送信できるまで ${resendRemaining} 秒`}
            </p>
          </div>
        )}

        {/*
          この画面からの出口（#1161）。
          `totpPending` のセッションは proxy が他のすべての画面から押し戻すため、
          認証アプリもリカバリーコードも手元に無い利用者は、これが無いと
          Cookie を手で消すまで公開ページすら見られない
        */}
        <div className={styles.c_two_factor__escape}>
          <p className={styles.c_two_factor__escape_lead}>
            {isEmailOtp ? 'メールが受け取れず' : '認証アプリが使えず'}
            リカバリーコードも手元に無い場合は、ログアウトして別のアカウントでログインできます。
          </p>

          {/*
            ⚠️ `isLoading` は使わない。`Button` はローディング中に本文を
            `visibility: hidden` にするため**アクセシブルネームごと消え**、
            さらに ghost バリアントではスピナーが白で背景に埋もれる。
            脱出導線が「空のボタン」になってしまう。
            文言の差し替えで進行を伝え、二重押下は `disabled` で止める。

            `size='lg'` は $tap-target-min（44px）に合わせるため。
            主ボタンとの区別は variant で付ける
          */}
          <Button
            type='button'
            variant='ghost'
            size='lg'
            fullWidth
            onClick={onCancel}
            disabled={isSubmitting || isCancelling || isResending}
          >
            {isCancelling
              ? 'ログアウトしています…'
              : 'キャンセルしてログアウト'}
          </Button>
        </div>
      </div>
    );
  },
);

TwoFactorChallenge.displayName = 'TwoFactorChallenge';
