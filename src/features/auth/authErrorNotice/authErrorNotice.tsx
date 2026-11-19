/**
 * ログインエラーの案内（`/auth/error`）
 *
 * Auth.js が `pages.error` へ飛ばしてくる先。指定していながらページが
 * 無かったため 404 になっていた（#1231）。OAuth の失敗など、利用者が
 * 自分では原因を知りようのない場面で踏む。
 */

import { memo } from 'react';

import { Heading } from '@/components/ui/heading/heading';
import { AUTH_PAGE_ERROR_MESSAGES } from '@/constants/auth';
import { resolveAuthErrorMessage } from '@/utils/authErrorMessage';

import { SignInBackLink } from './signInBackLink';
import styles from './authErrorNotice.module.scss';

interface AuthErrorNoticeProps {
  /**
   * Auth.js が付ける `?error=` の値
   *
   * 知らない値や未指定でも落とさず既定の文言に倒す
   */
  code?: string;
}

export const AuthErrorNotice = memo<AuthErrorNoticeProps>(
  function AuthErrorNotice({ code }) {
    return (
      <div className={styles.c_auth_error}>
        <Heading level={1} align='center'>
          ログインできませんでした
        </Heading>

        {/*
          ⚠️ `role='alert'` は付けない。この文言はページの初期描画から
          存在するので、ライブリージョンにしても「変化」が起きず、支援技術には
          通常の読み上げ順で届く。付けると実装によっては二重に読まれる。
          見出し（「ログインできませんでした」）が先に状況を伝える
        */}
        <p className={styles.c_auth_error__message}>
          {resolveAuthErrorMessage(AUTH_PAGE_ERROR_MESSAGES, code)}
        </p>

        {/*
          ⚠️ 単なる `<Link href={ROUTES.LOGIN}>` にしない。それだと
          ソーシャルログインを始める前の戻り先を落とす（#1246）。
          詳しい理由は `signInBackLink.tsx` の冒頭に書いてある
        */}
        <SignInBackLink className={styles.c_auth_error__cta} />
      </div>
    );
  },
);

AuthErrorNotice.displayName = 'AuthErrorNotice';
