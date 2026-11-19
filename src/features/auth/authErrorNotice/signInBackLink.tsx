/**
 * `/auth/error` からログイン画面へ戻るリンク（#1246）
 *
 * ⚠️ `/auth/signin?error=` 側だけ直しても足りない。**アプリ自身が拒んだ
 * ソーシャルログインはこちらへ来る。**
 *
 * `signIn` コールバックが `return false` すると Auth.js は `AccessDenied`
 * を投げる（`@auth/core/lib/actions/callback/index.js:405`）。これは
 * `AuthError` 直系で `kind` を持たないため、`pageKind` が `'error'` に
 * 落ちて `pages.error`＝この画面へ飛ぶ（`@auth/core/index.js:135-136`）。
 * メール未検証・DB障害がこの経路で、`src/constants/auth.ts:202-203` にも
 * 同じことが書いてある。
 *
 * 戻り先が `ROUTES.LOGIN` 固定だと、ログイン画面に `?error=` が付かず
 * `SignInContent` は預かり分を採らない。つまり #1246 がそのまま再現する。
 * ここで取り出してクエリへ載せ替える。
 */

'use client';

import { memo, useEffect, useState } from 'react';
import Link from 'next/link';

import { ROUTES } from '@/constants';
import { takePendingCallbackUrl } from '@/features/auth/utils/pendingCallbackUrl';
import { resolveSafeCallbackUrl } from '@/utils/url';

interface SignInBackLinkProps {
  className?: string;
}

export const SignInBackLink = memo<SignInBackLinkProps>(
  function SignInBackLink({ className }) {
    /**
     * ⚠️ 初期値は `ROUTES.LOGIN` 固定にする。
     *
     * `href` は DOM に出るので、サーバーの描画とクライアントの初回描画が
     * 食い違うとハイドレーションのずれになる。`sessionStorage` はサーバーに
     * 無いため、読むのはマウント後に限る
     */
    const [href, setHref] = useState<string>(ROUTES.LOGIN);

    // `sessionStorage` はサーバーに無い。マウント後に読んで差し替えるため、
    // ここは effect の中で `setState` するしかない
    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
      const pending = takePendingCallbackUrl();
      if (!pending) return;

      // 預ける側でも検証しているが、`sessionStorage` は同一オリジンの
      // スクリプトなら誰でも書ける。クエリへ載せる前にもう一度通す
      const safe = resolveSafeCallbackUrl(pending);
      if (safe === ROUTES.HOME) return;

      setHref(`${ROUTES.LOGIN}?callbackUrl=${encodeURIComponent(safe)}`);
    }, []);
    /* eslint-enable react-hooks/set-state-in-effect */

    return (
      <Link href={href} className={className}>
        ログイン画面へ戻る
      </Link>
    );
  },
);

SignInBackLink.displayName = 'SignInBackLink';
