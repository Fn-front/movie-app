/**
 * 設定の読み取り失敗表示（#1163）
 */

'use client';

import { memo } from 'react';

import { Button } from '@/components/ui/button/button';

import styles from './settingsLoadError.module.scss';

interface SettingsLoadErrorProps {
  /** 読み込めなかった設定の名前（「通知設定」など） */
  label: string;
  /** 再読み込み */
  onRetry: () => void;
}

/**
 * 設定を読み込めなかったことを伝える
 *
 * ⚠️ **ここに設定項目そのものを置かない。** 「読めなかった」と
 * 「オフだった」を画面上で区別できないのが #1163 の本体なので、既定値の
 * トグルを添えると直したことにならない。操作させないことで、表示の誤りが
 * データの誤りへ変わる経路も同時に塞ぐ。
 *
 * `role="alert"` にしているのは、読み込み中のスケルトンから置き換わる
 * ＝利用者が見ていない可能性があるため。**コンテナ側に付ける**こと。
 * 見出しの `<p>` だけに付けると、補足文と「再読み込み」ボタンが
 * ライブリージョンの外になり、再試行の導線が読み上げられない
 * （`src/features/person/personPage.tsx` も同じ形）。
 */
export const SettingsLoadError = memo(function SettingsLoadError({
  label,
  onRetry,
}: SettingsLoadErrorProps) {
  return (
    <div role='alert' className={styles.c_settings_load_error}>
      <p className={styles.c_settings_load_error__message}>
        {label}を読み込めませんでした
      </p>
      <p className={styles.c_settings_load_error__note}>
        現在の設定が分からないため、ここでは変更できません。
      </p>
      <Button variant='secondary' size='sm' onClick={onRetry}>
        再読み込み
      </Button>
    </div>
  );
});

SettingsLoadError.displayName = 'SettingsLoadError';
