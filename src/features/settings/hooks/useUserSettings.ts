/**
 * 設定の読み取り（#1163）
 *
 * ⚠️ **読めなかったときに既定値で埋めない。** 埋めると呼び出し側が
 * 「読めなかった」と「オフだった」を区別できなくなり、既定値を確定値として
 * 描いてしまう。利用者はそれを見て設定し直し、表示の誤りがデータの誤りに
 * 変わる。`settings` は null のままにして、判断を呼び出し側へ残す。
 *
 * 通知設定と配信お知らせ設定が同じ形をしているのでここへ寄せた。
 */

'use client';

import { useCallback, useEffect, useState } from 'react';

import { getSettings } from '@/lib/api/user/user';
import type { UserSettings } from '@/schema/user';

/** 設定の読み取り状態 */
export interface UserSettingsState {
  /** 取得できた設定。**読めなかったときは null**（既定値で埋めない） */
  settings: UserSettings | null;
  /** 取得中 */
  isLoading: boolean;
  /** 取得に失敗した */
  hasFailed: boolean;
  /** 取得し直す */
  retry: () => void;
}

/**
 * 設定を読み取る
 *
 * @returns 設定と読み取り状態
 */
export function useUserSettings(): UserSettingsState {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasFailed, setHasFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // ⚠️ **effect ごとのローカル変数にすること。** `useRef` にして
    // 実行のたびに false へ戻すと、cleanup が立てた番兵が次の実行で消え、
    // **遅れて返った古い応答が新しい結果を上書きする**（StrictMode の
    // 二重実行で実際に起きる）。クロージャなら各実行が自分の旗を持つ
    let cancelled = false;
    setIsLoading(true);

    const fetchSettings = async () => {
      try {
        const next = await getSettings();
        if (cancelled) return;
        setSettings(next);
        setHasFailed(false);
      } catch {
        if (cancelled) return;
        // 既定値で埋めない。null のままにして「分からない」を伝える
        setSettings(null);
        setHasFailed(true);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchSettings();

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setAttempt((previous) => previous + 1);
  }, []);

  return { settings, isLoading, hasFailed, retry };
}
