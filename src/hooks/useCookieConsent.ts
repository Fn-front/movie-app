/**
 * Cookie同意状態の購読と更新
 *
 * localStorage（外部状態）を唯一の真実源とし、useSyncExternalStore で購読する。
 * サーバー同期は持たない（useConsentServerSync の責務）。バナー・撤回トグル・
 * プロバイダが同じフックを使っても API が多重に呼ばれないようにするため。
 */

'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { useSession } from 'next-auth/react';

import type { ConsentValue } from '@/constants/user';
import {
  getEffectiveConsentState,
  recordConsentDecision,
  subscribeConsent,
} from '@/utils/cookieConsent';

/**
 * UI が扱う同意状態
 *
 * `unknown` は「まだ localStorage を読めていない」を表すクライアント内部の
 * 表現で、localStorage にも API にも流さない。
 */
export type CookieConsentState = 'unknown' | ConsentValue;

interface UseCookieConsentReturn {
  /** 現在の同意状態（版が古い記録は未決定として返る） */
  consent: CookieConsentState;
  /** 同意する */
  grant: () => void;
  /** 拒否する／撤回する */
  deny: () => void;
}

/**
 * 購読対象は状態（文字列）だけにする
 *
 * オブジェクトを返すと毎回新しい参照になり、React の Object.is 比較で
 * 常に「変化した」と判定されて無限ループになる。日時・所有者・版は
 * 必要な時点で直接読む。
 */
function getSnapshot(): CookieConsentState {
  return getEffectiveConsentState();
}

/**
 * SSR と、ハイドレーション時の初回レンダーで使われる値
 *
 * `unset` ではなく `unknown` を返すことで、SSR 出力にバナーが含まれず
 * hydration mismatch が起きない。同意済みの利用者に「バナーが一瞬出てから
 * 消える」チラつきも防げる。
 */
function getServerSnapshot(): CookieConsentState {
  return 'unknown';
}

/**
 * 同意状態の取得と更新を行うフック
 */
export function useCookieConsent(): UseCookieConsentReturn {
  const { data: session } = useSession();
  const consent = useSyncExternalStore(
    subscribeConsent,
    getSnapshot,
    getServerSnapshot,
  );

  // 未ログイン時の操作は空文字で記録する。共有端末でログアウト後に
  // 前の利用者の同意が引き継がれるのを防ぐため、誰の意思表示かを残す
  const userId = session?.user?.id ?? '';

  const grant = useCallback(() => {
    recordConsentDecision('granted', userId);
  }, [userId]);

  const deny = useCallback(() => {
    recordConsentDecision('denied', userId);
  }, [userId]);

  return { consent, grant, deny };
}
