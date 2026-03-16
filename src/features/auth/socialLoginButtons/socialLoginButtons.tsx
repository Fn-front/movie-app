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
import styles from './socialLoginButtons.module.scss';

interface SocialLoginButtonsProps {
  disabled?: boolean;
}

export const SocialLoginButtons = memo<SocialLoginButtonsProps>(
  function SocialLoginButtons({ disabled = false }) {
    const [loadingProvider, setLoadingProvider] = useState<string | null>(null);

    const handleGoogleLogin = useCallback(async () => {
      try {
        setLoadingProvider('google');
        await signIn('google', { callbackUrl: '/' });
      } finally {
        setLoadingProvider(null);
      }
    }, []);

    const handleGithubLogin = useCallback(async () => {
      try {
        setLoadingProvider('github');
        await signIn('github', { callbackUrl: '/' });
      } finally {
        setLoadingProvider(null);
      }
    }, []);

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
