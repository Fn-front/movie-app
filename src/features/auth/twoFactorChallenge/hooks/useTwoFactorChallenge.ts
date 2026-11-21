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
import { OTP_CONFIG } from '@/constants/otp';
import { SECOND_FACTOR_METHOD } from '@/constants/secondFactor';
import { useResendCountdown } from '@/features/auth/hooks/useResendCountdown';
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
  /** 第2要素がメールのコードか。再送の導線を出すかの判定に使う */
  isEmailOtp: boolean;
  /**
   * コードを送れなかったことを伝える文言。送れていれば null
   *
   * 「コードが違う」とは別物。打ち直しても直らないので分ける（#1148）
   */
  sendNotice: string | null;
  /**
   * 送信回数の上限に達しているか（#1280 系）
   *
   * ⚠️ 上限中は再送ボタンを**出さない**。押しても同じ 429 が返るだけで、
   * 利用者の出口はリカバリーコードしかない。
   * `loginForm` は `!sendLimited` で隠しており、こちらだけ出ていた。
   */
  sendLimited: boolean;
  /** 送信上限だが受信箱のコードは有効（GHSA-p899-6g7w-v7hg） */
  codeStillValid: boolean;
  /** コードを送り直している最中か */
  isResending: boolean;
  /** 再送までの残り秒数 */
  resendRemaining: number;
  /** 再送できるか */
  canResend: boolean;
  onCodeChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onResend: () => void;
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
  const { data: session, update } = useSession();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const isEmailOtp =
    session?.secondFactorMethod === SECOND_FACTOR_METHOD.EMAIL_OTP;

  /**
   * サーバーが「コードを送れなかった」と伝えてきたか
   *
   * ⚠️ `jwt` コールバックからは例外を出せないため（#1148）、送信の失敗は
   * セッションのフラグでしか届かない。**これを読まないと**、1通も
   * 送られていないのに「メールに送信した6桁のコードを入力してください」と
   * 表示され、利用者は届かないコードを待ち続ける。
   */
  const sendFailed = Boolean(session?.secondFactorSendFailed);
  const sendLimited = Boolean(session?.secondFactorSendLimited);
  /**
   * 送信上限だが、受信箱のコードはまだ有効（GHSA-p899-6g7w-v7hg）
   *
   * ⚠️ `sendLimited` と分ける。あちらは出口がリカバリーコードだけだが、
   * こちらはメールで届いたコードがそのまま使える。
   */
  const codeStillValid = Boolean(session?.secondFactorCodeStillValid);

  const {
    remaining: resendRemaining,
    canResend: countdownDone,
    restart,
  } = useResendCountdown(OTP_CONFIG.RESEND_INTERVAL_SECONDS);

  // 検証中・ログアウト中は押させない（理由は `onResend` のコメント）
  //
  // ⚠️ `sendLimited` / `codeStillValid` はここで見ない。どちらも
  //    **ボタンごと出さない**（`twoFactorChallenge.tsx`）ので、ここに足しても
  //    観測できる違いが無く、テストで固定できない条件になる
  const canResend = countdownDone && !isSubmitting && !isCancelling;

  // 送信上限のほうを優先する。こちらは「待っても送られない」ので、
  // リカバリーコードへ誘導しないと利用者の手が止まる
  const sendNotice = sendLimited
    ? AUTH_ERROR_MESSAGES.SECOND_FACTOR_SEND_LIMITED
    : sendFailed
      ? AUTH_ERROR_MESSAGES.SECOND_FACTOR_SEND_FAILED
      : // ⚠️ 上2つの後ろに置く。どちらも「1通も届いていない」ので先に出す。
        // こちらは受信箱のコードが使えるぶん軽い
        codeStillValid
        ? AUTH_ERROR_MESSAGES.SECOND_FACTOR_CODE_STILL_VALID
        : null;

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
      // 再送中も止める。並行すると、再送が後から totpPending: true を
      // 書き戻して**成功した検証が巻き戻る**（理由は `onResend`）
      if (!code.trim() || isSubmitting || isCancelling || isResending) {
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
    [
      code,
      isSubmitting,
      isCancelling,
      isResending,
      update,
      router,
      callbackUrl,
    ],
  );

  /**
   * コードを送り直す（メールOTP のみ）
   *
   * ⚠️ **検証と相互排他にする。**
   *
   * NextAuth の JWT はステートレスで、`update()` は「Cookie を読む →
   * jwt コールバック → 書き戻す」を独立に行う。再送（Resend の往復で遅い）と
   * 検証（速い）が並行すると、再送が**後から** `totpPending: true` の Cookie を
   * 書き戻し、成功したはずの検証が巻き戻る。利用者からは「正しいコードを
   * 入れたのに画面に戻された」ように見え、そのコードは消費済みなので
   * もう一度再送が要る。
   */
  const onResend = useCallback(async () => {
    if (!canResend || isResending) return;

    setError(null);
    setIsResending(true);

    try {
      await update({ resend: true });
      // ⚠️ `restart()` は無条件。送信上限で1通も出なかった場合も
      //    カウントダウンだけ振り出しに戻るが、その状態では
      //    **ボタンそのものを描画していない**ので押されない
      //    （`twoFactorChallenge.tsx` の `!sendLimited && !codeStillValid`）。
      //    `canResend` は上限を見ていないので、あちらを外さないこと
      restart();
    } catch {
      setError(AUTH_ERROR_MESSAGES.SECOND_FACTOR_SEND_FAILED);
    } finally {
      setIsResending(false);
    }
  }, [canResend, isResending, update, restart]);

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
    if (isSubmitting || isCancelling || isResending) {
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
  }, [isSubmitting, isCancelling, isResending]);

  return {
    code,
    error,
    sendNotice,
    sendLimited,
    codeStillValid,
    isSubmitting,
    isCancelling,
    isEmailOtp,
    isResending,
    resendRemaining,
    canResend,
    onCodeChange,
    onSubmit,
    onResend,
    onCancel,
  };
}
