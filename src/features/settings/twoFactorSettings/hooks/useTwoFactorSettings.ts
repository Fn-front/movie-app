/**
 * 二段階認証の設定を扱うカスタムフック
 *
 * 画面は「無効」「設定中（QR表示）」「有効」「リカバリーコード表示」の
 * 4状態を行き来する。平文のリカバリーコードはサーバーが一度しか返さないため、
 * 受け取ったらそのまま表示状態に持たせる。
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  API_ENDPOINTS,
  PASSWORD_CHANGE_EVENT,
  UI_ERROR_MESSAGES,
} from '@/constants';
import { TOTP_ERROR_MESSAGES } from '@/constants/totp';
import {
  SECOND_FACTOR_MESSAGES,
  SECOND_FACTOR_METHOD,
  type SecondFactorMethod,
} from '@/constants/secondFactor';
import { OTP_CONFIG } from '@/constants/otp';
import { SECOND_FACTOR_SETUP_CODE_MESSAGES } from '@/constants/secondFactorSetupCode';
import { useResendCountdown } from '@/features/auth/hooks/useResendCountdown';

/** 画面の状態 */
export const TWO_FACTOR_VIEW = {
  /** 読み込み中 */
  LOADING: 'loading',
  /** 無効（方式の選択肢を出す） */
  DISABLED: 'disabled',
  /** 設定中（認証アプリ。QRコードと初回コード入力） */
  SETUP: 'setup',
  /** 設定中（メールOTP。コードを送信済みで入力待ち） */
  SETUP_EMAIL: 'setup_email',
  /** リカバリーコードの表示（控えてもらう） */
  RECOVERY_CODES: 'recovery_codes',
  /** 有効（無効化・再発行ができる） */
  ENABLED: 'enabled',
} as const;

export type TwoFactorView =
  (typeof TWO_FACTOR_VIEW)[keyof typeof TWO_FACTOR_VIEW];

interface UseTwoFactorSettingsResult {
  view: TwoFactorView;
  /** 有効になっている方式。無効なら null */
  method: SecondFactorMethod | null;
  /**
   * メールOTP を選べるか
   *
   * admin が発行したアカウントは `users.email` が `.invalid` TLD
   * （RFC 2606、絶対に名前解決されない）なので選ばせない。
   */
  emailOtpAvailable: boolean;
  /**
   * 再認証でパスワードを求められるか（#1372）
   *
   * ⚠️ **取れなかったら `null`。** 呼び出し側はセッション由来の値へ倒すこと。
   *
   * ここで `false` を既定にすると、**取得に失敗した**利用者（429 /
   * ネットワーク断など）に誤った欄が出たまま戻らなくなる。取得前の
   * ちらつきは起きない（`view` が `LOADING` の間は Skeleton しか描かない）
   * ので、守っているのは失敗経路のほう。
   */
  hasPassword: boolean | null;
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
  /**
   * 操作の完了を伝える文言
   *
   * コード送信は画面の状態を変えないため、これが無いと利用者は
   * 送られたのかどうか分からない。
   */
  notice: string | null;
  /**
   * 設定を始める（#1368）
   *
   * ⛔ **再認証の材料が要る。** セッションだけで通すと、セッションを奪った
   * 第三者が被害者のアカウントに自分の第2要素を登録できる。
   */
  startSetup: (
    method: SecondFactorMethod,
    reauth: { currentPassword?: string; reauthCode?: string },
  ) => Promise<void>;
  /**
   * 再認証の確認コードを送る（パスワードを持たない利用者 / #1368）
   *
   * ⚠️ 宛先は渡さない。サーバーが `users.email` から引く。渡せる形にすると、
   * アカウントを1つ持つだけで任意のアドレスへ送れる（#641）。
   */
  sendReauthCode: () => Promise<void>;
  enable: (code: string) => Promise<void>;
  disable: (code: string) => Promise<void>;
  regenerateRecoveryCodes: (code: string) => Promise<void>;
  /**
   * 設定変更に使うコードを送る（メールOTP のみ）
   *
   * これが無いと、メールOTP の利用者は無効化もリカバリーコード再発行も
   * できない。手元でコードを作れないため。
   */
  sendChallenge: () => Promise<void>;
  /**
   * 設定中（メールOTP）にコードを送り直す（#1285）
   *
   * `sendChallenge` は有効化済みのユーザーにしか効かないため別にする。
   */
  resendSetupCode: () => Promise<void>;
  /** 設定中の再送が押せるようになるまでの秒数 */
  resendRemaining: number;
  /** 設定中の再送が押せるか */
  canResendSetupCode: boolean;
  /** リカバリーコードの表示を閉じる */
  dismissRecoveryCodes: () => void;
  cancelSetup: () => void;
}

/**
 * 二段階認証の設定状態と操作を返す
 */
export function useTwoFactorSettings(): UseTwoFactorSettingsResult {
  const [view, setView] = useState<TwoFactorView>(TWO_FACTOR_VIEW.LOADING);
  const [method, setMethod] = useState<SecondFactorMethod | null>(null);
  const [emailOtpAvailable, setEmailOtpAvailable] = useState(true);
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [qrCodeDataUri, setQrCodeDataUri] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [remainingRecoveryCodes, setRemainingRecoveryCodes] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /** 送信中かどうか。再入の判定に使う（state だと古い値を掴む） */
  const inFlightRef = useRef(false);
  /** 直前の失敗の文言。呼び出し側がエラーの種類で分岐するために使う */
  const lastErrorRef = useRef<string | null>(null);

  /**
   * 設定中（メールOTP）の再送クールダウン（#1285）
   *
   * サーバー側の再送間隔は `OTP_CONFIG.RESEND_INTERVAL_SECONDS`。ここを
   * 超えて押させても `THROTTLED` で何も送られないので、押せる時刻まで
   * ボタンを無効にして理由を見せる。他の画面（ログイン・OAuth の第2要素）と
   * 同じ作法に揃える。
   */
  const {
    remaining: resendRemaining,
    canResend,
    restart: restartResendCountdown,
  } = useResendCountdown(OTP_CONFIG.RESEND_INTERVAL_SECONDS);

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
      setMethod(json.data.method ?? null);
      // 取得できなかったときは出さない側へ倒す。選べない方式を見せて
      // 「設定したのにコードが届かない」より、選択肢が1つ少ないほうがよい
      setEmailOtpAvailable(json.data.emailOtpAvailable === true);
      // ⚠️ 真偽値でなければ `null` のまま残す（#1372）。呼び出し側が
      //   セッション由来の値へ倒せるようにするため、ここで握り潰さない
      setHasPassword(
        typeof json.data.hasPassword === 'boolean'
          ? json.data.hasPassword
          : null,
      );
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
   * パスワードの有無だけを取り直す（#1372）
   *
   * ⛔ **`loadStatus` を呼ばないこと。** あちらは `view` も書き換えるので、
   * リカバリーコードを表示している最中に走ると**平文が画面から消える**
   * （サーバーは二度と返さない）。設定中（QR・コード入力）も方式の選択へ
   * 戻ってしまい、やり直しになる。
   *
   * ⚠️ 失敗しても `error` を立てない。利用者が触っているのは別の節
   * （パスワード変更）なので、関係のないエラーを出す筋合いがない。
   * 取れなければ今の値のまま＝これまでと同じ振る舞いに留まる。
   */
  const refreshHasPassword = useCallback(async () => {
    try {
      const response = await fetch(API_ENDPOINTS.USER_TOTP);
      if (!response.ok) return;

      const json = await response.json();

      if (typeof json.data?.hasPassword === 'boolean') {
        setHasPassword(json.data.hasPassword);
      }
    } catch {
      // 取れなければ今の値を保つ
    }
  }, []);

  /**
   * 同じ画面でパスワードを設定・変更したら取り直す（#1372）
   *
   * これが無いと、初回パスワードを設定した利用者には「確認コードを送る」
   * しか出ないのにサーバーはパスワードを要求する、という行き止まりが
   * 再読み込みするまで続く。
   */
  useEffect(() => {
    window.addEventListener(PASSWORD_CHANGE_EVENT, refreshHasPassword);

    return () => {
      window.removeEventListener(PASSWORD_CHANGE_EVENT, refreshHasPassword);
    };
  }, [refreshHasPassword]);

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
      // ⚠️ 再入を止める。`isSubmitting` はボタンの `disabled` には効くが、
      // 連打や二重サブミットで同時に走るのは防げない。メールOTP では
      // 1回の余分な送信が60秒の再送間隔と送信上限に直撃する。
      //
      // state ではなく ref で見るのは、`useCallback` が捕まえた
      // `isSubmitting` が古い値のままになるため
      if (inFlightRef.current) return null;

      inFlightRef.current = true;
      lastErrorRef.current = null;
      setError(null);
      setNotice(null);
      setIsSubmitting(true);

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        const json = await response.json();

        if (!response.ok) {
          const message: string =
            json.error?.message || TOTP_ERROR_MESSAGES.OPERATION_FAILED;

          // ⚠️ state だけだと、同じターンで読む呼び出し側が古い値を見る。
          //   「どのエラーだったか」で分岐する箇所があるので ref にも残す
          lastErrorRef.current = message;
          setError(message);

          return null;
        }

        return json;
      } catch {
        lastErrorRef.current = UI_ERROR_MESSAGES.NETWORK_ERROR;
        setError(UI_ERROR_MESSAGES.NETWORK_ERROR);

        return null;
      } finally {
        inFlightRef.current = false;
        setIsSubmitting(false);
      }
    },
    [],
  );

  const sendReauthCode = useCallback(async () => {
    const json = await post(API_ENDPOINTS.USER_TOTP_REAUTH_CODE);
    if (!json) return;

    // 画面の状態が変わらないので、送れたことを文言で伝える
    setNotice(SECOND_FACTOR_SETUP_CODE_MESSAGES.CODE_SENT);
  }, [post]);

  const startSetup = useCallback(
    async (
      selected: SecondFactorMethod,
      reauth: { currentPassword?: string; reauthCode?: string },
    ) => {
      const json = await post(API_ENDPOINTS.USER_TOTP_SETUP, {
        method: selected,
        ...(reauth.currentPassword
          ? { currentPassword: reauth.currentPassword }
          : {}),
        ...(reauth.reauthCode ? { reauthCode: reauth.reauthCode } : {}),
      });
      if (!json) return;

      setMethod(selected);

      if (selected === SECOND_FACTOR_METHOD.EMAIL_OTP) {
        // 共有鍵もQRも無い。コードはメールで届いている
        setQrCodeDataUri(null);
        setSecret(null);
        setView(TWO_FACTOR_VIEW.SETUP_EMAIL);

        // ⚠️ 送信の結果を言うのは**ここだけ**（#1285）。
        //
        //   画面のリード文は「届いたコードを入力してください」に留めてある。
        //   以前は「確認コードを送りました」と断定していたため、再送間隔に
        //   当たって**1通も送っていない**ときでもそう表示され、しかも
        //   `CODE_ALREADY_SENT` と同時に出て矛盾していた。
        //
        //   やめる→メールで設定する を60秒以内にやり直すと必ず throttled を通る
        const data = json.data as { throttled?: boolean } | undefined;
        setNotice(
          data?.throttled
            ? SECOND_FACTOR_MESSAGES.CODE_ALREADY_SENT
            : SECOND_FACTOR_MESSAGES.CODE_SENT,
        );

        // ⚠️ THROTTLED のときも60秒から数え直す。サーバーは「あと何秒で
        //   押せるか」を返さないため、ここでは上限しか分からない。
        //   手元のコードは生きているので待つ必要は無く、余分に待つのは
        //   「もう1通ほしい」人だけ。押せるのに弾かれるより軽い
        restartResendCountdown();
        return;
      }

      const data = json.data as { qrCodeDataUri: string; secret: string };
      setQrCodeDataUri(data.qrCodeDataUri);
      setSecret(data.secret);
      setView(TWO_FACTOR_VIEW.SETUP);
    },
    [post, restartResendCountdown],
  );

  /**
   * 設定中（メールOTP）にコードを送り直す（#1285）
   *
   * これが無いと、コードの試行回数（5回）を使い切った利用者は
   * 「やめる → メールで設定する」でやり直すしかなく、60秒以内だと
   * `THROTTLED` で1通も届かないまま同じ画面に戻される。
   *
   * ⚠️ **`setup` を叩き直さないこと。** あちらは `TOTP_SETTINGS_VERIFY`
   * （5回/15分）を消費するので、
   *
   *   setup(1) + 再送×4 = 5 → 6回目の「有効にする」が 429 で15分ロック
   *
   * となり、**この Issue が直そうとしている行き止まりを別の形で作る**。
   * `send-challenge` は設定途中も対象にしてあり（#1285）、効くのは
   * `TWO_FACTOR_SEND`（10回/60分）だけ。`user_totp` も作り直さない。
   *
   * ⚠️ 失敗しても `restart` しない。`post` が `error` を立てているので
   * 押せる状態のまま理由が出るほうが正しい（押し直せる）。
   */
  /**
   * 設定の期限切れだったら方式の選択へ戻す
   *
   * ⛔ 出口は2つある（#1368 の3回目レビュー）。「有効にする」と「再送」の
   * どちらから期限切れに当たっても、同じ場所へ戻さないと画面に留まったまま
   * 同じ操作を繰り返させることになる。保留行はもう無いので、やり直す以外に
   * やることが無い。
   *
   * ⚠️ 文言で判定しているのは、`post` が本文の `error.code` を捨てて
   * いるため。サーバーと同じ定数を参照しているので、文言を変えても
   * 両側が同時に変わる（テストで固定してある）。
   *
   * @returns 期限切れとして処理したかどうか
   */
  const handleSetupExpired = useCallback((): boolean => {
    if (lastErrorRef.current !== TOTP_ERROR_MESSAGES.SETUP_EXPIRED) {
      return false;
    }

    setQrCodeDataUri(null);
    setSecret(null);
    setMethod(null);
    setView(TWO_FACTOR_VIEW.DISABLED);

    return true;
  }, []);

  const resendSetupCode = useCallback(async () => {
    const json = await post(API_ENDPOINTS.USER_TOTP_SEND_CHALLENGE);

    if (!json) {
      handleSetupExpired();

      return;
    }

    // 画面の状態が変わらないので、送れたことを文言で伝える
    setNotice(SECOND_FACTOR_MESSAGES.CODE_SENT);
    restartResendCountdown();
  }, [handleSetupExpired, post, restartResendCountdown]);

  /**
   * 設定変更に使うコードを送る（メールOTP のみ）
   *
   * 無効化とリカバリーコード再発行はコードの所持を要求するが、メールOTP の
   * 利用者は手元で作れない。この経路が無いと、設定を有効にしたあと
   * 二度と無効化できなくなる。
   */
  const sendChallenge = useCallback(async () => {
    const json = await post(API_ENDPOINTS.USER_TOTP_SEND_CHALLENGE);
    if (!json) return;

    // 画面の状態が変わらないので、送れたことを文言で伝える
    setNotice(SECOND_FACTOR_MESSAGES.CODE_SENT);
  }, [post]);

  const enable = useCallback(
    async (code: string) => {
      const json = await post(API_ENDPOINTS.USER_TOTP_ENABLE, { code });

      if (!json) {
        // ⚠️ **設定の期限切れは画面も戻す**（#1368 の2回目レビュー）。
        //   文言だけ出して `SETUP` に留まると、利用者は同じ画面で再送と入力を
        //   繰り返す。保留行はもう消えているので、やり直すしか道が無い
        handleSetupExpired();

        return;
      }

      const data = json.data as { recoveryCodes: string[] };
      // 平文はこの一度しか返ってこない。控えるまで画面に残す
      setRecoveryCodes(data.recoveryCodes);
      setRemainingRecoveryCodes(data.recoveryCodes.length);
      setQrCodeDataUri(null);
      setSecret(null);
      setView(TWO_FACTOR_VIEW.RECOVERY_CODES);
    },
    [handleSetupExpired, post],
  );

  const disable = useCallback(
    async (code: string) => {
      const json = await post(API_ENDPOINTS.USER_TOTP_DISABLE, { code });
      if (!json) return;

      setRecoveryCodes(null);
      setRemainingRecoveryCodes(0);
      // 方式も戻す。残したままだと、無効化した直後の画面が
      // 「メールOTP が有効」の前提で描かれる（＝方式を選び直せない）
      setMethod(null);
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
    // 方式の選択からやり直せるようにする
    setMethod(null);
    setView(TWO_FACTOR_VIEW.DISABLED);
  }, []);

  return {
    view,
    method,
    emailOtpAvailable,
    hasPassword,
    qrCodeDataUri,
    secret,
    recoveryCodes,
    remainingRecoveryCodes,
    isSubmitting,
    error,
    notice,
    startSetup,
    sendReauthCode,
    sendChallenge,
    resendSetupCode,
    resendRemaining,
    canResendSetupCode: canResend,
    enable,
    disable,
    regenerateRecoveryCodes,
    dismissRecoveryCodes,
    cancelSetup,
  };
}
