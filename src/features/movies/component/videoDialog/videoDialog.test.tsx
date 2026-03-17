/**
 * VideoDialogコンポーネント テスト
 */

import { fireEvent, render, screen } from '@testing-library/react';

import { VideoDialog } from './videoDialog';

import type { Video } from '@/lib/types';

// --- Helpers ---

const createVideo = (overrides: Partial<Video> = {}): Video => ({
  id: 'v1',
  iso_639_1: 'ja',
  iso_3166_1: 'JP',
  key: 'abc123',
  name: '予告編1',
  site: 'YouTube',
  size: 1080,
  type: 'Trailer',
  official: true,
  published_at: '2025-01-01T00:00:00.000Z',
  ...overrides,
});

const defaultProps = {
  open: true,
  onOpenChange: jest.fn(),
  movieTitle: 'テスト映画',
};

// --- Tests ---

describe('VideoDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('open=trueの場合、動画一覧を表示する', () => {
    const videos = [
      createVideo({ id: 'v1', name: '予告編1', key: 'key1' }),
      createVideo({ id: 'v2', name: '予告編2', key: 'key2' }),
    ];

    render(<VideoDialog {...defaultProps} videos={videos} />);

    expect(screen.getByText('予告編1')).toBeInTheDocument();
    expect(screen.getByText('予告編2')).toBeInTheDocument();
  });

  it('open=falseの場合、動画一覧を表示しない', () => {
    const videos = [createVideo()];

    render(<VideoDialog {...defaultProps} open={false} videos={videos} />);

    expect(screen.queryByText('予告編1')).not.toBeInTheDocument();
  });

  it('YouTube iframeが正しいsrcで表示される', () => {
    const videos = [createVideo({ key: 'test-key-123' })];

    render(<VideoDialog {...defaultProps} videos={videos} />);

    const iframe = screen.getByTitle('予告編1');
    expect(iframe).toHaveAttribute(
      'src',
      'https://www.youtube.com/embed/test-key-123',
    );
  });

  it('video.keyがencodeURIComponentでサニタイズされる', () => {
    const videos = [createVideo({ key: 'key/with?special&chars' })];

    render(<VideoDialog {...defaultProps} videos={videos} />);

    const iframe = screen.getByTitle('予告編1');
    expect(iframe).toHaveAttribute(
      'src',
      `https://www.youtube.com/embed/${encodeURIComponent('key/with?special&chars')}`,
    );
  });

  it('Trailer/Teaserが優先的に表示される', () => {
    const videos = [
      createVideo({
        id: 'v1',
        name: 'メイキング',
        type: 'Behind the Scenes',
        published_at: '2025-03-01T00:00:00.000Z',
      }),
      createVideo({
        id: 'v2',
        name: '予告編',
        type: 'Trailer',
        published_at: '2025-01-01T00:00:00.000Z',
      }),
      createVideo({
        id: 'v3',
        name: 'ティーザー',
        type: 'Teaser',
        published_at: '2025-02-01T00:00:00.000Z',
      }),
    ];

    render(<VideoDialog {...defaultProps} videos={videos} />);

    const videoNames = screen.getAllByText(/予告編|ティーザー|メイキング/);
    expect(videoNames[0]).toHaveTextContent('予告編');
    expect(videoNames[1]).toHaveTextContent('ティーザー');
    expect(videoNames[2]).toHaveTextContent('メイキング');
  });

  it('動画タイプが表示される', () => {
    const videos = [createVideo({ type: 'Trailer' })];

    render(<VideoDialog {...defaultProps} videos={videos} />);

    expect(screen.getByText('Trailer')).toBeInTheDocument();
  });

  it('閉じるボタンをクリックするとonOpenChangeが呼ばれる', () => {
    const onOpenChange = jest.fn();
    const videos = [createVideo()];

    render(
      <VideoDialog
        {...defaultProps}
        onOpenChange={onOpenChange}
        videos={videos}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('アクセシビリティ: aria-labelが設定されている', () => {
    const videos = [createVideo()];

    render(<VideoDialog {...defaultProps} videos={videos} />);

    expect(
      screen.getByRole('dialog', { name: 'テスト映画の予告動画' }),
    ).toBeInTheDocument();
  });

  it('空の動画一覧の場合、動画アイテムが表示されない', () => {
    render(<VideoDialog {...defaultProps} videos={[]} />);

    expect(screen.queryByTitle('予告編1')).not.toBeInTheDocument();
  });
});
