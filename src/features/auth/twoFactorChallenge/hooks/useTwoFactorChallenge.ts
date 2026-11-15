/**
 * 二段階認証コード入力のロジック
 *
 * OAuthログインは `authorize` を通らないため、プロバイダ側の認証が済んだ時点で
 * セッションが張られる。そのセッションは「第2要素が未了」の印が付いており、
 * ここでコードを入れるまで `session.user` は空のまま（= ログイン済みとして
 * 扱われない）。
 *
 * コードの検証は `jwt` コールバック（サーバー側）で行う。クライアントから
 * 渡せるのは入力されたコードだけで、「検証済み」という結果は渡せない。
 */

'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

import { AUTH_ERROR_MESSAGES } from '@/constants';
import { logout } from '@/lib/auth/logout';
import { resolveSafeCallbackUrl } from '@/utils/url';

interface UseTwoFactorChallengeParams {
  /** 検証後の戻り先 */
  callbackUrl?: string;
}

interface UseTwoFactorChallengeResult {
  code: string;
  error: string | null;
  isSubmitting: boolean;
  /** ログアウト処理中（完了すると画面遷移するので false には戻らない） */
  isCancelling: boolean;
  onCodeChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}

/**
 * 二段階認証コードの入力を扱う
 *
 * @param params - 戻り先
 * @returns 入力状態とハンドラー
 */
export function useTwoFactorChallenge({
  callbackUrl,
}: UseTwoFactorChallengeParams = {}): UseTwoFactorChallengeResult {
  const router = useRouter();
  const { update } = useSession();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const onCodeChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setCode(event.target.value);
    },
    [],
  );

  const onSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      // ⚠️ `isCancelling` も見る。ログアウトと検証が同時に走ると、
      // `signOut` の Cookie 削除と検証成功による再発行の順序が決まらず、
      // 「キャンセルしたのにログイン済みのCookieが残る」ことがありうる。
      // いまは DOM 側でも相互に `disabled` にしているが、片側だけ state で
      // 守る非対称を残さない
      if (!code.trim() || isSubmitting || isCancelling) {
        return;
      }

      setError(null);
      setIsSubmitting(true);

      try {
        // update() は jwt コールバックを trigger='update' で呼ぶ。
        // 検証に成功していれば totpPending が落ちたセッションが返る
        const updated = await update({ totpCode: code.trim() });

        if (updated && !updated.totpPending) {
          router.push(resolveSafeCallbackUrl(callbackUrl));
          router.refresh();
          return;
        }

        // 「コードが違う」のではなく「確認できなかった」（#1148）。
        // DB の不調などで検証そのものが成立しなかった場合で、入れ直しても
        // 直らない。同じ文言にすると、利用者は正しいコードを繰り返し打ち続ける。
        //
        // 入力は消さない。打ち直しではなく時間をおいた再試行を促したいため
        // （コードの寿命は30秒なので、残しても総当たりの助けにはならない）
        if (updated?.totpUnavailable) {
          setError(AUTH_ERROR_MESSAGES.TOTP_UNAVAILABLE);
          return;
        }

        // 失敗の内訳（不正 / 使い回し / 試行上限）はここでは区別しない。
        // 区別すると、コードを総当たりする側に手がかりを与える
        setError(AUTH_ERROR_MESSAGES.TOTP_INVALID);
        setCode('');
      } catch {
        setError(AUTH_ERROR_MESSAGES.TOTP_INVALID);
      } finally {
        setIsSubmitting(false);
      }
    },
    [code, isSubmitting, isCancelling, update, router, callbackUrl],
  );

  /**
   * この画面から抜ける
   *
   * `totpPending` のセッションは proxy が他のすべての画面から押し戻すため、
   * ログアウト以外に出口が無い（#1161）。認証アプリが手元に無い利用者は、
   * これが無いと Cookie を手で消すまで公開ページすら見られない。
   *
   * `signOut()` が叩く `/api/auth/csrf` と `/api/auth/signout` は
   * `src/proxy.ts` の冒頭で素通りするので、この状態でも成立する。
   */
  const onCancel = useCallback(async () => {
    if (isSubmitting || isCancelling) {
      return;
    }

    setError(null);
    setIsCancelling(true);

    try {
      await logout();
    } catch {
      // 遷移が始まらなかった（csrf 取得か /signout の POST が失敗）。
      // 画面に留まるので、押し直せる状態へ戻す
      setError(AUTH_ERROR_MESSAGES.LOGOUT_FAILED);
      setIsCancelling(false);
    }
  }, [isSubmitting, isCancelling]);

  return {
    code,
    error,
    isSubmitting,
    isCancelling,
    onCodeChange,
    onSubmit,
    onCancel,
  };
}
