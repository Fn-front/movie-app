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
      onCodeChange,
      onSubmit,
      onCancel,
    } = useTwoFactorChallenge({ callbackUrl });

    return (
      <div className={styles.c_two_factor}>
        <Heading level={1} align='center'>
          二段階認証
        </Heading>

        <p className={styles.c_two_factor__lead}>
          認証アプリに表示されている6桁のコードを入力してください。
          認証アプリが使えない場合は、発行済みのリカバリーコードでも進めます。
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
              disabled={isCancelling}
              aria-label='認証コードを確認'
            >
              確認
            </Button>
          </div>
        </form>

        {/*
          この画面からの出口（#1161）。
          `totpPending` のセッションは proxy が他のすべての画面から押し戻すため、
          認証アプリもリカバリーコードも手元に無い利用者は、これが無いと
          Cookie を手で消すまで公開ページすら見られない
        */}
        <div className={styles.c_two_factor__escape}>
          <p className={styles.c_two_factor__escape_lead}>
            認証アプリもリカバリーコードも使えない場合は、ログアウトして別のアカウントでログインできます。
          </p>

          <Button
            type='button'
            variant='ghost'
            size='md'
            fullWidth
            onClick={onCancel}
            isLoading={isCancelling}
            disabled={isSubmitting}
          >
            キャンセルしてログアウト
          </Button>
        </div>
      </div>
    );
  },
);

TwoFactorChallenge.displayName = 'TwoFactorChallenge';
