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
import { resolveSafeCallbackUrl } from '@/utils/url';

interface UseTwoFactorChallengeParams {
  /** 検証後の戻り先 */
  callbackUrl?: string;
}

interface UseTwoFactorChallengeResult {
  code: string;
  error: string | null;
  isSubmitting: boolean;
  onCodeChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
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

  const onCodeChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setCode(event.target.value);
    },
    [],
  );

  const onSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!code.trim() || isSubmitting) {
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
    [code, isSubmitting, update, router, callbackUrl],
  );

  return { code, error, isSubmitting, onCodeChange, onSubmit };
}
