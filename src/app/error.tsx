'use client';

import { useEffect } from 'react';

import styles from './error.module.scss';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    // エラーをログに記録
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className={styles.c_error}>
      <h1 className={styles.c_error__title}>エラーが発生しました</h1>
      <p className={styles.c_error__message}>
        申し訳ございません。予期しないエラーが発生しました。
      </p>
      {error.digest && (
        <p className={styles.c_error__digest}>エラーID: {error.digest}</p>
      )}
      <button onClick={reset} className={styles.c_error__button}>
        もう一度試す
      </button>
    </div>
  );
}
