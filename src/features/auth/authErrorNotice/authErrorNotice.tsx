/**
 * ログインエラーの案内（`/auth/error`）
 *
 * Auth.js が `pages.error` へ飛ばしてくる先。指定していながらページが
 * 無かったため 404 になっていた（#1231）。OAuth の失敗など、利用者が
 * 自分では原因を知りようのない場面で踏む。
 */

import { memo } from 'react';
import Link from 'next/link';

import { Heading } from '@/components/ui/heading/heading';
import { ROUTES } from '@/constants';
import { AUTH_PAGE_ERROR_MESSAGES } from '@/constants/auth';

import styles from './authErrorNotice.module.scss';

interface AuthErrorNoticeProps {
  /**
   * Auth.js が付ける `?error=` の値
   *
   * 知らない値や未指定でも落とさず既定の文言に倒す
   */
  code?: string;
}

/** コードに対応する文言を返す。知らない値は既定へ */
function resolveMessage(code: string | undefined): string {
  if (code && code in AUTH_PAGE_ERROR_MESSAGES) {
    return AUTH_PAGE_ERROR_MESSAGES[
      code as keyof typeof AUTH_PAGE_ERROR_MESSAGES
    ];
  }

  return AUTH_PAGE_ERROR_MESSAGES.DEFAULT;
}

export const AuthErrorNotice = memo<AuthErrorNoticeProps>(
  function AuthErrorNotice({ code }) {
    return (
      <div className={styles.c_auth_error}>
        <Heading level={1} align='center'>
          ログインできませんでした
        </Heading>

        <p className={styles.c_auth_error__message} role='alert'>
          {resolveMessage(code)}
        </p>

        <Link href={ROUTES.LOGIN} className={styles.c_auth_error__cta}>
          ログイン画面へ戻る
        </Link>
      </div>
    );
  },
);

AuthErrorNotice.displayName = 'AuthErrorNotice';
