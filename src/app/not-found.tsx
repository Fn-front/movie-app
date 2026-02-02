import Link from 'next/link';

export default function NotFound() {
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
      <h1 style={{ fontSize: '4rem', fontWeight: 'bold', marginBottom: '1rem' }}>
        404
      </h1>
      <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1rem' }}>
        ページが見つかりません
      </h2>
      <p style={{ marginBottom: '2rem', color: '#666' }}>
        お探しのページは存在しないか、移動した可能性があります。
      </p>
      <Link
        href="/"
        style={{
          padding: '0.75rem 1.5rem',
          backgroundColor: '#2390d6',
          color: 'white',
          textDecoration: 'none',
          borderRadius: '0.25rem',
          fontSize: '1rem',
        }}
      >
        ホームに戻る
      </Link>
    </div>
  );
}
