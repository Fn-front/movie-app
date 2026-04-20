/**
 * UnsupportedBrowserNoticeコンポーネント
 * WebGL2非対応時のフォールバック表示
 */

import { memo } from 'react';

import { cn } from '@/utils/cn';

import styles from './unsupportedBrowserNotice.module.scss';

export interface UnsupportedBrowserNoticeProps {
  /** 追加クラス名 */
  className?: string;
}

export const UnsupportedBrowserNotice = memo<UnsupportedBrowserNoticeProps>(
  function UnsupportedBrowserNotice({ className }) {
    return (
      <div className={cn(styles.c_unsupported_notice, className)} role='alert'>
        <h2 className={styles.c_unsupported_notice__title}>
          3D表示に対応していません
        </h2>
        <p className={styles.c_unsupported_notice__description}>
          お使いのブラウザはWebGL2に対応していないため、3Dシアター体験をご利用いただけません。
        </p>
        <div className={styles.c_unsupported_notice__suggestions}>
          <p className={styles.c_unsupported_notice__suggestions_label}>
            以下のブラウザでお試しください：
          </p>
          <ul className={styles.c_unsupported_notice__list}>
            <li className={styles.c_unsupported_notice__list_item}>
              Google Chrome（推奨）
            </li>
            <li className={styles.c_unsupported_notice__list_item}>
              Mozilla Firefox
            </li>
            <li className={styles.c_unsupported_notice__list_item}>
              Microsoft Edge
            </li>
          </ul>
        </div>
        <p className={styles.c_unsupported_notice__note}>
          座席情報は下部のテキスト一覧からもご確認いただけます。
        </p>
      </div>
    );
  },
);

UnsupportedBrowserNotice.displayName = 'UnsupportedBrowserNotice';
