/**
 * 再送までの待ち時間を数えるフック
 *
 * ログイン画面と OAuth の第2要素画面で共用する。
 *
 * `useOtpVerification` にも同じ計算があるが、あちらは `email` / `action` /
 * OTPエンドポイントと密結合していて再利用できない。こちらは「秒を数える」
 * だけを持ち、送信そのものは呼び出し側に任せる。
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface UseResendCountdownResult {
  /** 残り秒数。0 なら再送できる */
  remaining: number;
  /** 再送できるか */
  canResend: boolean;
  /** カウントダウンを最初から始め直す */
  restart: () => void;
}

/**
 * 再送のカウントダウンを扱う
 *
 * @param initialSeconds - 数え始める秒数
 * @returns 残り秒数と再送可否、再開の関数
 */
export function useResendCountdown(
  initialSeconds: number,
): UseResendCountdownResult {
  const [remaining, setRemaining] = useState(initialSeconds);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (remaining <= 0) return;

    timerRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [remaining]);

  const restart = useCallback(() => {
    setRemaining(initialSeconds);
  }, [initialSeconds]);

  return { remaining, canResend: remaining === 0, restart };
}
