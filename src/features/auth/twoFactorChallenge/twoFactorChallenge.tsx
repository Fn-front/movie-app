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
      sendNotice,
      sendLimited,
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

        {/*
          ⚠️ 「送れなかった」ときに「送った」と言わない。
          `jwt` コールバックは例外を出せないので（#1148）、送信の失敗は
          セッションのフラグでしか届かない。読まずに固定文を出すと、
          1通も届いていないのにコードを待たせることになる
        */}
        {sendNotice ? (
          <p className={styles.c_two_factor__error} role='alert'>
            {sendNotice}
          </p>
        ) : (
          <p className={styles.c_two_factor__lead}>
            {isEmailOtp
              ? 'メールに送信した6桁のコードを入力してください。メールが届かない場合は、発行済みのリカバリーコードでも進めます。'
              : '認証アプリに表示されている6桁のコードを入力してください。認証アプリが使えない場合は、発行済みのリカバリーコードでも進めます。'}
          </p>
        )}

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
          メールのコードだけに出す。

          ⚠️ 送信上限に達しているときも出さない。押しても同じ 429 が返る
          だけで、出口はリカバリーコードしかない（`loginForm` と揃える）。
        */}
        {isEmailOtp && !sendLimited && (
          <div className={styles.c_two_factor__resend}>
            {/*
              `isLoading` ではなく文言の差し替えで進行を伝える。
              `Button` は #1196 以降 `opacity: 0` なのでアクセシブルネームは
              残るが、「送信しています…」と明示したほうが状況が分かりやすい
              （下のログアウト導線と揃える）。

              ⚠️ `aria-label` は付けない。本文が「送信しています…」に
              変わるのに固定のラベルを置くと、見えている文字が
              アクセシブルネームに含まれなくなる（WCAG 2.5.3 Label in Name）。
              音声入力で見えているとおりに言っても反応しない。
              本文がそのまま名前になるほうが正しい
            */}
            <Button
              type='button'
              variant='secondary'
              size='lg'
              fullWidth
              onClick={onResend}
              disabled={!canResend || isResending}
            >
              {isResending ? '送信しています…' : '確認コードを再送信する'}
            </Button>

            {/*
              ⚠️ `aria-live` を付けない。本文が毎秒変わるため、polite の
              キューに60件のアナウンスが積まれ、読み上げが追いつかなくなる。
              カウント中は実質スクリーンリーダーで操作できない。
              既存の `otpVerification` も同じカウントダウンに付けていない。

              押せない理由はボタンの `disabled` が伝え、押せるように
              なったことは下の `role='status'` が**その瞬間だけ**知らせる
            */}
            <p className={styles.c_two_factor__resend_hint}>
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
