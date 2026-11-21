/**
 * ソーシャルログインボタン群コンポーネント
 *
 * Googleログイン / GitHubログインボタンを表示する。
 */

'use client';

import { memo, useCallback, useState } from 'react';
import { signIn } from 'next-auth/react';
import { FaGoogle, FaGithub } from 'react-icons/fa';

import { Button } from '@/components/ui/button/button';
import { AUTH_ERROR_MESSAGES, TOAST_TITLES } from '@/constants/auth';
import { useToastDispatch } from '@/hooks/useToast';
import { resolveSafeCallbackUrl } from '@/utils/url';
import {
  clearPendingCallbackUrl,
  savePendingCallbackUrl,
} from '@/features/auth/utils/pendingCallbackUrl';
import styles from './socialLoginButtons.module.scss';

/** 対応しているプロバイダ */
type SocialProvider = 'google' | 'github';

interface SocialLoginButtonsProps {
  disabled?: boolean;
  /** ログイン後の戻り先（callbackUrl） */
  callbackUrl?: string;
}

export const SocialLoginButtons = memo<SocialLoginButtonsProps>(
  function SocialLoginButtons({ disabled = false, callbackUrl }) {
    const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
    const { toast } = useToastDispatch();

    /**
     * ソーシャルログインを始める
     *
     * ⚠️ **プロバイダごとに書き分けない（#1292）。** 以前は Google と GitHub で
     * ほぼ同じ本体を2つ持っており、失敗の扱いを片方にだけ足す形になりやすかった。
     */
    const startLogin = useCallback(
      async (provider: SocialProvider) => {
        try {
          setLoadingProvider(provider);
          // 失敗して戻されたときに復元する（#1246）。Auth.js は失敗時の
          // リダイレクトに error と code しか載せないため、callbackUrl は
          // OAuth の往復で消える
          savePendingCallbackUrl(callbackUrl);
          await signIn(provider, {
            callbackUrl: resolveSafeCallbackUrl(callbackUrl),
          });
        } catch {
          /*
            ⚠️ **始められなかったときは預かり分を捨てる（#1292）。**
            `savePendingCallbackUrl` は `signIn` の**前**に預けるので、
            残すと次にこの画面へ来た人が身に覚えのない場所へ飛ばされうる。

            ⛔ 利用者に伝えるのを省かない。`finally` でボタンが戻るだけだと
            「押したのに何も起きない」になり、原因を知りようがない。
          */
          clearPendingCallbackUrl();
          toast({
            title: TOAST_TITLES.LOGIN_ERROR,
            description: AUTH_ERROR_MESSAGES.SOCIAL_LOGIN_START_FAILED,
            variant: 'error',
          });
        } finally {
          setLoadingProvider(null);
        }
      },
      [callbackUrl, toast],
    );

    const handleGoogleLogin = useCallback(
      () => startLogin('google'),
      [startLogin],
    );

    const handleGithubLogin = useCallback(
      () => startLogin('github'),
      [startLogin],
    );

    const isDisabled = disabled || loadingProvider !== null;

    return (
      <div className={styles.c_social_login}>
        <div className={styles.c_social_login__divider}>
          <span className={styles.c_social_login__divider_text}>または</span>
        </div>

        <div className={styles.c_social_login__buttons}>
          <Button
            variant='ghost'
            size='lg'
            fullWidth
            disabled={isDisabled}
            isLoading={loadingProvider === 'google'}
            onClick={handleGoogleLogin}
            aria-label='Googleでログイン'
            className={styles.c_social_login__google}
          >
            <span className={styles.c_social_login__button_content}>
              <FaGoogle aria-hidden='true' />
              Googleでログイン
            </span>
          </Button>

          <Button
            variant='ghost'
            size='lg'
            fullWidth
            disabled={isDisabled}
            isLoading={loadingProvider === 'github'}
            onClick={handleGithubLogin}
            aria-label='GitHubでログイン'
            className={styles.c_social_login__github}
          >
            <span className={styles.c_social_login__button_content}>
              <FaGithub aria-hidden='true' />
              GitHubでログイン
            </span>
          </Button>
        </div>
      </div>
    );
  },
);

SocialLoginButtons.displayName = 'SocialLoginButtons';
