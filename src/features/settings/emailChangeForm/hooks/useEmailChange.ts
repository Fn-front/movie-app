/**
 * メールアドレス変更を扱うカスタムフック（#1359）
 *
 * 画面は「入力」→「コード入力」の2状態を行き来する。
 *
 * ⚠️ **成功するとログイン識別子が変わる。** セッションの `email` は古いままなので、
 * `update()` でセッションを更新しないと設定画面が旧アドレスを出し続ける。
 */

'use client';

import { useCallback, useState } from 'react';
import { useSession } from 'next-auth/react';

import { API_ENDPOINTS } from '@/constants';
import {
  EMAIL_CHANGE_MESSAGES,
  EMAIL_CHANGE_VIEW,
  type EmailChangeView,
} from '@/constants/emailChange';
import {
  SECOND_FACTOR_MESSAGES,
  SECOND_FACTOR_METHOD,
  type SecondFactorMethod,
} from '@/constants/secondFactor';

interface UseEmailChangeResult {
  view: EmailChangeView;
  /** コードの送信先（確認画面に出す） */
  pendingEmail: string;
  isSubmitting: boolean;
  error: string | null;
  notice: string | null;
  /**
   * 第2要素の方式
   *
   * ⚠️ 判定できるまで `undefined`。`null`（未設定）で初期化すると、
   * **設定済みの利用者に一瞬だけ入力欄の無い画面を見せて**送信できてしまう
   * （`useDeleteAccount` の `secondFactorRequired` と同じ理由）。
   */
  secondFactorMethod: SecondFactorMethod | null | undefined;
  /** 確認コードを送る */
  requestCode: (newEmail: string, currentPassword: string) => Promise<void>;
  /**
   * コードを検証してアドレスを差し替える
   *
   * @param code - 新しいアドレスに届いた確認コード
   * @param secondFactorCode - 第2要素。未設定の利用者は省く
   */
  confirmCode: (code: string, secondFactorCode?: string) => Promise<void>;
  /**
   * 第2要素のコードを送る（メールOTP のみ）
   *
   * ⚠️ この経路が無いと、メールOTP を第2要素にしている利用者は手元で
   * コードを作れず**アドレスを変更できない**（`twoFactorSettings` の
   * `sendChallenge` と同じ理由）。
   */
  sendSecondFactorCode: () => Promise<void>;
  /** 入力画面へ戻る */
  reset: () => void;
}

/**
 * メールアドレス変更
 *
 * @returns 画面の状態とハンドラ
 */
export function useEmailChange(): UseEmailChangeResult {
  const { update } = useSession();
  const [view, setView] = useState<EmailChangeView>(EMAIL_CHANGE_VIEW.INPUT);
  const [pendingEmail, setPendingEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [secondFactorMethod, setSecondFactorMethod] = useState<
    SecondFactorMethod | null | undefined
  >(undefined);

  const reset = useCallback(() => {
    setView(EMAIL_CHANGE_VIEW.INPUT);
    setPendingEmail('');
    setError(null);
    setNotice(null);
  }, []);

  /**
   * 第2要素の方式を取りにいく
   *
   * ⚠️ 設定ページに常時リクエストを足さないよう、**コード入力へ進むときだけ**
   * 呼ぶ。取得に失敗したら「要る」側へ倒す —— 入力欄を出さずに送ると
   * サーバーが 400 を返すだけで、利用者には理由が分からない。
   * 方式が分からないので TOTP 扱いにする（`send-challenge` のボタンは
   * 出ないが、リカバリーコードは打てる）。
   */
  const loadSecondFactorMethod = useCallback(async () => {
    try {
      const response = await fetch(API_ENDPOINTS.USER_TOTP);
      const json = await response.json();

      setSecondFactorMethod(
        response.ok
          ? ((json?.data?.method ?? null) as SecondFactorMethod | null)
          : SECOND_FACTOR_METHOD.TOTP,
      );
    } catch {
      setSecondFactorMethod(SECOND_FACTOR_METHOD.TOTP);
    }
  }, []);

  const requestCode = useCallback(
    async (newEmail: string, currentPassword: string) => {
      setIsSubmitting(true);
      setError(null);
      setNotice(null);

      try {
        const response = await fetch(API_ENDPOINTS.USER_EMAIL_CHANGE_REQUEST, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newEmail, currentPassword }),
        });

        const json = await response.json().catch(() => null);

        if (!response.ok || !json?.success) {
          setError(json?.error?.message ?? EMAIL_CHANGE_MESSAGES.FAILED);

          return;
        }

        // ⚠️ 送信先は**サーバーへ渡した値**を覚える。応答から取らないのは、
        //   正規化（小文字化）の結果が返ってこないため
        setPendingEmail(newEmail);
        setNotice(EMAIL_CHANGE_MESSAGES.CODE_SENT);
        setView(EMAIL_CHANGE_VIEW.CODE);

        // ⚠️ 画面を切り替える前に取りにいく。コード入力画面に入ってから
        //   取ると、設定済みの利用者に入力欄の無い状態を一瞬見せてしまう
        await loadSecondFactorMethod();
      } catch {
        setError(EMAIL_CHANGE_MESSAGES.FAILED);
      } finally {
        setIsSubmitting(false);
      }
    },
    [loadSecondFactorMethod],
  );

  const sendSecondFactorCode = useCallback(async () => {
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(API_ENDPOINTS.USER_TOTP_SEND_CHALLENGE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const json = await response.json().catch(() => null);

      if (!response.ok || !json?.success) {
        setError(json?.error?.message ?? EMAIL_CHANGE_MESSAGES.FAILED);

        return;
      }

      setNotice(SECOND_FACTOR_MESSAGES.CODE_SENT);
    } catch {
      setError(EMAIL_CHANGE_MESSAGES.FAILED);
    }
  }, []);

  const confirmCode = useCallback(
    async (code: string, secondFactorCode?: string) => {
      setIsSubmitting(true);
      setError(null);
      setNotice(null);

      try {
        const response = await fetch(API_ENDPOINTS.USER_EMAIL_CHANGE_CONFIRM, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // ⚠️ 空文字では送らない。スキーマが長さを見ていると空文字で
          //   400 になり、未設定の利用者まで弾かれる
          body: JSON.stringify({
            newEmail: pendingEmail,
            code,
            ...(secondFactorCode ? { secondFactorCode } : {}),
          }),
        });

        const json = await response.json().catch(() => null);

        if (!response.ok || !json?.success) {
          setError(json?.error?.message ?? EMAIL_CHANGE_MESSAGES.FAILED);

          return;
        }

        // ⚠️ **セッションを更新する。** しないと設定画面もパスワード変更
        //   フォームも旧アドレスを出し続け、利用者は変わったのか分からない。
        //
        // ⛔ **引数を省かない**（#1364 の E2E で発覚）。`next-auth/react` の
        //   `update` は `typeof data === 'undefined'` のとき**ボディ無しで
        //   GET する**（`node_modules/next-auth/react.js:340`）。GET では
        //   `trigger: 'update'` が立たず、`auth.ts` の
        //   「メールアドレスの変更をセッションへ反映する」ブロックへ到達しない。
        //
        //   実測: 引数なしだと変更後もリロード後も旧アドレスのままで、
        //   パスワード変更が旧アドレスで OTP を引いて必ず 400 になる
        //   （`auth.ts` のコメントが防ごうとしていた状態そのもの）。
        await update({});

        setNotice(EMAIL_CHANGE_MESSAGES.CHANGED);
        setView(EMAIL_CHANGE_VIEW.INPUT);
        setPendingEmail('');
      } catch {
        setError(EMAIL_CHANGE_MESSAGES.FAILED);
      } finally {
        setIsSubmitting(false);
      }
    },
    [pendingEmail, update],
  );

  return {
    view,
    pendingEmail,
    isSubmitting,
    error,
    notice,
    secondFactorMethod,
    requestCode,
    confirmCode,
    sendSecondFactorCode,
    reset,
  };
}
