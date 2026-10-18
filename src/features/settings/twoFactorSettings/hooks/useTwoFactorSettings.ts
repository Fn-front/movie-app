/**
 * 二段階認証の設定を扱うカスタムフック
 *
 * 画面は「無効」「設定中（QR表示）」「有効」「リカバリーコード表示」の
 * 4状態を行き来する。平文のリカバリーコードはサーバーが一度しか返さないため、
 * 受け取ったらそのまま表示状態に持たせる。
 */

'use client';

import { useCallback, useEffect, useState } from 'react';

import { API_ENDPOINTS, UI_ERROR_MESSAGES } from '@/constants';
import { TOTP_ERROR_MESSAGES } from '@/constants/totp';

/** 画面の状態 */
export const TWO_FACTOR_VIEW = {
  /** 読み込み中 */
  LOADING: 'loading',
  /** 無効（有効化ボタンを出す） */
  DISABLED: 'disabled',
  /** 設定中（QRコードと初回コード入力） */
  SETUP: 'setup',
  /** リカバリーコードの表示（控えてもらう） */
  RECOVERY_CODES: 'recovery_codes',
  /** 有効（無効化・再発行ができる） */
  ENABLED: 'enabled',
} as const;

export type TwoFactorView =
  (typeof TWO_FACTOR_VIEW)[keyof typeof TWO_FACTOR_VIEW];

interface UseTwoFactorSettingsResult {
  view: TwoFactorView;
  /** 設定中に表示するQRコード（data URI） */
  qrCodeDataUri: string | null;
  /** 手入力用の共有鍵 */
  secret: string | null;
  /** 発行直後のリカバリーコード（平文） */
  recoveryCodes: string[] | null;
  /** 未使用のリカバリーコード残数 */
  remainingRecoveryCodes: number;
  isSubmitting: boolean;
  error: string | null;
  startSetup: () => Promise<void>;
  enable: (code: string) => Promise<void>;
  disable: (code: string) => Promise<void>;
  regenerateRecoveryCodes: (code: string) => Promise<void>;
  /** リカバリーコードの表示を閉じる */
  dismissRecoveryCodes: () => void;
  cancelSetup: () => void;
}

/**
 * 二段階認証の設定状態と操作を返す
 */
export function useTwoFactorSettings(): UseTwoFactorSettingsResult {
  const [view, setView] = useState<TwoFactorView>(TWO_FACTOR_VIEW.LOADING);
  const [qrCodeDataUri, setQrCodeDataUri] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [remainingRecoveryCodes, setRemainingRecoveryCodes] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 現在の状態を取得して画面に反映する */
  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch(API_ENDPOINTS.USER_TOTP);
      const json = await response.json();

      if (!response.ok) {
        setError(json.error?.message || TOTP_ERROR_MESSAGES.OPERATION_FAILED);
        setView(TWO_FACTOR_VIEW.DISABLED);
        return;
      }

      setRemainingRecoveryCodes(json.data.remainingRecoveryCodes);
      setView(
        json.data.enabled ? TWO_FACTOR_VIEW.ENABLED : TWO_FACTOR_VIEW.DISABLED,
      );
    } catch {
      setError(UI_ERROR_MESSAGES.NETWORK_ERROR);
      setView(TWO_FACTOR_VIEW.DISABLED);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  /**
   * コードを伴う操作をまとめて行う
   *
   * 成否の扱いとローディング表示が同じなので1か所にまとめる。
   *
   * @param endpoint - 呼び出し先
   * @param body - リクエストボディ
   * @returns 成功時のレスポンス本体。失敗時は null
   */
  const post = useCallback(
    async (
      endpoint: string,
      body?: Record<string, unknown>,
    ): Promise<Record<string, unknown> | null> => {
      setError(null);
      setIsSubmitting(true);

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        const json = await response.json();

        if (!response.ok) {
          setError(json.error?.message || TOTP_ERROR_MESSAGES.OPERATION_FAILED);
          return null;
        }

        return json;
      } catch {
        setError(UI_ERROR_MESSAGES.NETWORK_ERROR);
        return null;
      } finally {
        setIsSubmitting(false);
      }
    },
    [],
  );

  const startSetup = useCallback(async () => {
    const json = await post(API_ENDPOINTS.USER_TOTP_SETUP);
    if (!json) return;

    const data = json.data as { qrCodeDataUri: string; secret: string };
    setQrCodeDataUri(data.qrCodeDataUri);
    setSecret(data.secret);
    setView(TWO_FACTOR_VIEW.SETUP);
  }, [post]);

  const enable = useCallback(
    async (code: string) => {
      const json = await post(API_ENDPOINTS.USER_TOTP_ENABLE, { code });
      if (!json) return;

      const data = json.data as { recoveryCodes: string[] };
      // 平文はこの一度しか返ってこない。控えるまで画面に残す
      setRecoveryCodes(data.recoveryCodes);
      setRemainingRecoveryCodes(data.recoveryCodes.length);
      setQrCodeDataUri(null);
      setSecret(null);
      setView(TWO_FACTOR_VIEW.RECOVERY_CODES);
    },
    [post],
  );

  const disable = useCallback(
    async (code: string) => {
      const json = await post(API_ENDPOINTS.USER_TOTP_DISABLE, { code });
      if (!json) return;

      setRecoveryCodes(null);
      setRemainingRecoveryCodes(0);
      setView(TWO_FACTOR_VIEW.DISABLED);
    },
    [post],
  );

  const regenerateRecoveryCodes = useCallback(
    async (code: string) => {
      const json = await post(API_ENDPOINTS.USER_TOTP_RECOVERY_CODES, { code });
      if (!json) return;

      const data = json.data as { recoveryCodes: string[] };
      setRecoveryCodes(data.recoveryCodes);
      setRemainingRecoveryCodes(data.recoveryCodes.length);
      setView(TWO_FACTOR_VIEW.RECOVERY_CODES);
    },
    [post],
  );

  const dismissRecoveryCodes = useCallback(() => {
    setRecoveryCodes(null);
    setView(TWO_FACTOR_VIEW.ENABLED);
  }, []);

  const cancelSetup = useCallback(() => {
    setQrCodeDataUri(null);
    setSecret(null);
    setError(null);
    setView(TWO_FACTOR_VIEW.DISABLED);
  }, []);

  return {
    view,
    qrCodeDataUri,
    secret,
    recoveryCodes,
    remainingRecoveryCodes,
    isSubmitting,
    error,
    startSetup,
    enable,
    disable,
    regenerateRecoveryCodes,
    dismissRecoveryCodes,
    cancelSetup,
  };
}
