/**
 * StreamingBadgeコンポーネント テスト
 */

import { render, screen } from '@testing-library/react';

import { StreamingBadge } from './streamingBadge';

// --- Mocks ---

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

// --- Tests ---

describe('StreamingBadge', () => {
  it('見放題のラベルを出す', () => {
    render(
      <StreamingBadge
        streaming={{
          offer_type: 'flatrate',
          provider_ids: [8],
          resumed: false,
        }}
      />,
    );

    expect(screen.getByText('見放題')).toBeInTheDocument();
  });

  it('レンタルのラベルを出す', () => {
    render(
      <StreamingBadge
        streaming={{ offer_type: 'paid', provider_ids: [10], resumed: false }}
      />,
    );

    expect(screen.getByText('レンタル')).toBeInTheDocument();
  });

  it('プロバイダーのロゴを出す', () => {
    render(
      <StreamingBadge
        streaming={{
          offer_type: 'flatrate',
          provider_ids: [8, 84],
          resumed: false,
        }}
      />,
    );

    expect(screen.getByAltText('Netflix')).toBeInTheDocument();
    expect(screen.getByAltText('U-NEXT')).toBeInTheDocument();
  });

  it('ロゴが上限を超えたら残数を出す', () => {
    render(
      <StreamingBadge
        streaming={{
          offer_type: 'flatrate',
          provider_ids: [8, 9, 337, 15, 84],
          resumed: false,
        }}
      />,
    );

    // 上限3つまで表示し、残り2つは +2 に畳む
    expect(screen.getAllByRole('img')).toHaveLength(3);
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('上限ちょうどなら残数を出さない', () => {
    render(
      <StreamingBadge
        streaming={{
          offer_type: 'flatrate',
          provider_ids: [8, 9, 337],
          resumed: false,
        }}
      />,
    );

    expect(screen.queryByText(/^\+/)).toBeNull();
  });

  it('未知のプロバイダーだけならロゴを出さずラベルだけにする', () => {
    render(
      <StreamingBadge
        streaming={{
          offer_type: 'flatrate',
          provider_ids: [999999],
          resumed: false,
        }}
      />,
    );

    expect(screen.getByText('見放題')).toBeInTheDocument();
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });

  it('サービス名を含む読み上げラベルを持つ', () => {
    render(
      <StreamingBadge
        streaming={{
          offer_type: 'flatrate',
          provider_ids: [84],
          resumed: false,
        }}
      />,
    );

    expect(screen.getByLabelText('U-NEXT で見放題')).toBeInTheDocument();
  });
});
