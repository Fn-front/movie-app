'use client';

import { useEffect } from 'react';

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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '1rem',
        textAlign: 'center',
      }}
    >
      <h1
        style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '1rem' }}
      >
        エラーが発生しました
      </h1>
      <p style={{ marginBottom: '2rem', color: '#666' }}>
        申し訳ございません。予期しないエラーが発生しました。
      </p>
      {error.digest && (
        <p
          style={{ fontSize: '0.875rem', color: '#999', marginBottom: '2rem' }}
        >
          エラーID: {error.digest}
        </p>
      )}
      <button
        onClick={reset}
        style={{
          padding: '0.75rem 1.5rem',
          backgroundColor: '#2390d6',
          color: 'white',
          border: 'none',
          borderRadius: '0.25rem',
          cursor: 'pointer',
          fontSize: '1rem',
        }}
      >
        もう一度試す
      </button>
    </div>
  );
}
