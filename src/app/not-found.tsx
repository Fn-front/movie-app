import Link from 'next/link';

import { ROUTES } from '@/constants/common';

import styles from './notFound.module.scss';

export default function NotFound() {
  return (
    <div className={styles.c_not_found}>
      <h1 className={styles.c_not_found__code}>404</h1>
      <h2 className={styles.c_not_found__title}>ページが見つかりません</h2>
      <p className={styles.c_not_found__message}>
        お探しのページは存在しないか、移動した可能性があります。
      </p>
      <Link href={ROUTES.HOME} className={styles.c_not_found__link}>
        ホームに戻る
      </Link>
    </div>
  );
}
