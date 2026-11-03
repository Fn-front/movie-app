/**
 * Cookie同意のサーバー同期
 *
 * ログイン中だけ `user_settings` と突き合わせる。目的は端末間で同意状態を
 * 揃えることと、同意／撤回の証跡を残すこと。
 *
 * 発火条件は認証済みであることのみで、GA ID の有無は含めない。同期は GA とは
 * 独立した関心事であり、条件に入れると「GA を止めている間の撤回がサーバーに
 * 残らない」という取りこぼしが生じる。
 *
 * このフックは analyticsProvider だけが呼ぶ（単一マウント）。
 */

'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';

import { COOKIE_CONSENT_MESSAGES, COOKIE_CONSENT_VERSION } from '@/constants';
import { useToast } from '@/hooks/useToast';
import type { CookieConsentState } from '@/hooks/useCookieConsent';
import { getSettings, updateSettings } from '@/lib/api/user/user';
import {
  clearConsentRecord,
  clearOwnedConsent,
  getSendableConsentAt,
  getStoredConsentRecord,
  getStoredConsentState,
  writeConsentRecord,
} from '@/utils/cookieConsent';
import { resolveConsentMerge } from '@/utils/resolveConsentMerge';
import type { ConsentValue } from '@/constants/user';
import type { UserSettings } from '@/schema/user';

/**
 * 初回マージを完了したユーザーID
 *
 * モジュールスコープに置くのは、StrictMode の二重マウントやプロバイダの
 * 再マウントをまたいで「1ページロードにつき1回」を担保するため。
 * 成功したときだけ確定する。失敗時に確定すると次のページロードで
 * 再試行されなくなる。
 */
let syncedUserId: string | null = null;

/**
 * 進行中の GET
 *
 * StrictMode では effect が2回走る。フラグで2回目を弾くと、1回目は
 * cleanup で cancelled になり2回目は skip されて、同期が一度も成立しない。
 * Promise を共有して2回目が結果を適用できるようにする。
 * userId で keying するのは、セッション差し替え直後に前のユーザーの応答を
 * 共有しないため。settle したら必ず null へ戻す。
 */
let inFlight: { userId: string; promise: Promise<UserSettings> } | null = null;

/** テスト用。モジュールスコープの状態は Jest のモジュールキャッシュを跨ぐ */
export function __resetConsentSyncForTest(): void {
  syncedUserId = null;
  inFlight = null;
}

/**
 * @param consent 現在の同意状態（analyticsProvider が購読している値）
 */
export function useConsentServerSync(consent: CookieConsentState): void {
  const { data: session, status } = useSession();
  const { toast } = useToast();

  const userId = session?.user?.id ?? '';
  /** 直近でサーバーへ送った値。初回マージの結果でシードする */
  const lastSentRef = useRef<ConsentValue | null>(null);
  /** 初回マージが終わったか（終わるまで変更追随は動かさない） */
  const mergeDoneRef = useRef(false);

  const notifyFailure = useCallback(() => {
    // 端末側の決定は巻き戻さない。通信失敗で利用者の意思表示を無かったことに
    // する方が有害なため（useTheme がロールバックしているのとは逆の判断）。
    // ただし黙って成功したようにも見せない
    toast({
      title: COOKIE_CONSENT_MESSAGES.SYNC_FAILED_TITLE,
      description: COOKIE_CONSENT_MESSAGES.SYNC_FAILED_DESCRIPTION,
      variant: 'error',
    });
  }, [toast]);

  // ログアウト時の後始末
  //
  // 本来は signOut の直前に clearOwnedConsent を呼んで同期的に消している
  // （signOut は window.location.href による完全遷移なので、ここで
  // authenticated → unauthenticated の遷移を観測する前にドキュメントが
  // 破棄される）。これは遷移を伴わない経路のための保険。
  // sessionExpiryHandler が loading → unauthenticated を除外しているのとは
  // 逆に、前の状態を問わず実行する。残骸を確実に掃除したいため。
  useEffect(() => {
    if (status !== 'unauthenticated') return;

    syncedUserId = null;
    inFlight = null;
    mergeDoneRef.current = false;
    lastSentRef.current = null;
    // 消えたことは購読経由で analyticsProvider に伝わり、
    // そちらが consent update と _ga の削除を行う
    clearOwnedConsent();
  }, [status]);

  // 初回マージ
  useEffect(() => {
    if (status !== 'authenticated' || userId === '') return;
    if (syncedUserId === userId) return;

    let cancelled = false;

    const run = async () => {
      // 1. 端末レコードのスナップショット
      const snapshot = getStoredConsentRecord();

      // 2. サーバー値の取得（進行中があれば相乗りする）
      let server: UserSettings;
      try {
        if (inFlight === null || inFlight.userId !== userId) {
          inFlight = { userId, promise: getSettings() };
        }
        server = await inFlight.promise;
      } catch {
        inFlight = null;
        if (!cancelled) notifyFailure();
        // GET に失敗しても変更追随は動かす。ここで止めると、以降その
        // SPA セッション中の同意・撤回が一切サーバーへ届かないまま
        // トーストも出ない（プロバイダは単一マウントで、セッション内の
        // 自動リトライも無いため、フルリロードまで復旧しない）。
        // サーバー値が分からないので ref はシードせず、次の変更で送る
        mergeDoneRef.current = true;
        lastSentRef.current = null;
        return;
      }
      inFlight = null;
      if (cancelled) return;

      // 3. 応答待ちの間に利用者が操作していないか確認する（compare-and-swap）
      //    比較するのは状態キーだけ。4キーすべてを見ると、別タブの書き込み
      //    途中（付随情報は新しいが状態はまだ古い）を操作と誤判定する
      const local =
        getStoredConsentState() === snapshot.state
          ? snapshot
          : getStoredConsentRecord();

      const result = resolveConsentMerge({
        local,
        server: {
          state: server.cookieConsent,
          at: server.cookieConsentAt,
          version: server.cookieConsentVersion,
        },
        userId,
        currentVersion: COOKIE_CONSENT_VERSION,
      });

      if (result.localWrite?.action === 'write') {
        writeConsentRecord(result.localWrite.record);
      } else if (result.localWrite?.action === 'clear') {
        clearConsentRecord();
      }

      // 変更追随が「サーバーから取ってきたばかりの値」を送り返さないよう、
      // 採用値でシードする
      lastSentRef.current = result.effectiveState;
      mergeDoneRef.current = true;

      if (result.putBody !== null) {
        try {
          await updateSettings(result.putBody);
        } catch {
          if (!cancelled) notifyFailure();
          return;
        }
      }

      if (!cancelled) syncedUserId = userId;
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [status, userId, notifyFailure]);

  // 変更の追随
  useEffect(() => {
    if (!mergeDoneRef.current) return;
    if (status !== 'authenticated' || userId === '') return;
    if (consent === 'unknown') return;
    if (lastSentRef.current === consent) return;

    let cancelled = false;

    const send = async () => {
      try {
        await updateSettings({
          cookieConsent: consent,
          cookieConsentAt: getSendableConsentAt(),
        });
        // ref の更新は成功後。先に更新すると失敗した値が二度と送られない
        if (!cancelled) lastSentRef.current = consent;
      } catch {
        if (!cancelled) notifyFailure();
      }
    };

    void send();

    return () => {
      cancelled = true;
    };
  }, [consent, status, userId, notifyFailure]);
}
