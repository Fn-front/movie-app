import { CSSProperties } from 'react';
import Link from 'next/link';

import { ROUTES } from '@/constants/common';

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  padding: 'var(--spacing-4)',
  textAlign: 'center',
};

const codeStyle: CSSProperties = {
  fontSize: 'var(--font-size-5xl)',
  fontWeight: 'var(--font-weight-bold)',
  marginBottom: 'var(--spacing-4)',
};

const titleStyle: CSSProperties = {
  fontSize: 'var(--font-size-2xl)',
  fontWeight: 'var(--font-weight-medium)',
  marginBottom: 'var(--spacing-4)',
};

const messageStyle: CSSProperties = {
  marginBottom: 'var(--spacing-8)',
  color: 'var(--text-secondary)',
};

const linkStyle: CSSProperties = {
  padding: 'var(--spacing-3) var(--spacing-6)',
  backgroundColor: 'var(--primary-500)',
  color: 'var(--text-inverse)',
  textDecoration: 'none',
  borderRadius: 'var(--border-radius-md)',
  fontSize: 'var(--font-size-base)',
};

export default function NotFound() {
  return (
    <div style={containerStyle}>
      <h1 style={codeStyle}>404</h1>
      <h2 style={titleStyle}>ページが見つかりません</h2>
      <p style={messageStyle}>
        お探しのページは存在しないか、移動した可能性があります。
      </p>
      <Link href={ROUTES.HOME} style={linkStyle}>
        ホームに戻る
      </Link>
    </div>
  );
}
