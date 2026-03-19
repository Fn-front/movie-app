'use client';

import { CSSProperties, useCallback, useEffect } from 'react';

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  padding: 'var(--spacing-4)',
  textAlign: 'center',
};

const titleStyle: CSSProperties = {
  fontSize: 'var(--font-size-3xl)',
  fontWeight: 'var(--font-weight-bold)',
  marginBottom: 'var(--spacing-4)',
};

const messageStyle: CSSProperties = {
  marginBottom: 'var(--spacing-8)',
  color: 'var(--text-secondary)',
};

const digestStyle: CSSProperties = {
  fontSize: 'var(--font-size-sm)',
  color: 'var(--text-disabled)',
  marginBottom: 'var(--spacing-8)',
};

const buttonStyle: CSSProperties = {
  padding: 'var(--spacing-3) var(--spacing-6)',
  backgroundColor: 'var(--primary-500)',
  color: 'var(--text-inverse)',
  border: 'none',
  borderRadius: 'var(--border-radius-md)',
  cursor: 'pointer',
  fontSize: 'var(--font-size-base)',
};

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  const handleReset = useCallback(() => {
    reset();
  }, [reset]);

  return (
    <div style={containerStyle}>
      <h1 style={titleStyle}>エラーが発生しました</h1>
      <p style={messageStyle}>
        申し訳ございません。予期しないエラーが発生しました。
      </p>
      {error.digest && <p style={digestStyle}>エラーID: {error.digest}</p>}
      <button onClick={handleReset} style={buttonStyle}>
        もう一度試す
      </button>
    </div>
  );
}
