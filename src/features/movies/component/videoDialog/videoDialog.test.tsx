/**
 * VideoDialogコンポーネント テスト
 */

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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
      'https://www.youtube-nocookie.com/embed/test-key-123',
    );
  });

  it('video.keyがencodeURIComponentでサニタイズされる', () => {
    const videos = [createVideo({ key: 'key/with?special&chars' })];

    render(<VideoDialog {...defaultProps} videos={videos} />);

    const iframe = screen.getByTitle('予告編1');
    expect(iframe).toHaveAttribute(
      'src',
      `https://www.youtube-nocookie.com/embed/${encodeURIComponent('key/with?special&chars')}`,
    );
  });

  it('並び替えは行わず、渡された順にそのまま表示する', () => {
    // 表示順の決定は selectTrailerVideos の責務。
    // 種別・公開日の優先度に反する並びでも、このコンポーネントは組み替えない。
    const videos = [
      createVideo({
        id: 'v1',
        name: 'ティーザー',
        type: 'Teaser',
        published_at: '2025-01-01T00:00:00.000Z',
      }),
      createVideo({
        id: 'v2',
        name: '予告編',
        type: 'Trailer',
        published_at: '2025-06-01T00:00:00.000Z',
      }),
    ];

    render(<VideoDialog {...defaultProps} videos={videos} />);

    // 完全一致にするのは、YouTubeリンクの読み上げ用テキストにも動画名が
    // 入るため（「（ティーザー・新しいタブで開きます）」/ #980）
    const videoNames = screen.getAllByText(/^(予告編|ティーザー)$/);
    expect(videoNames[0]).toHaveTextContent('ティーザー');
    expect(videoNames[1]).toHaveTextContent('予告編');
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

  it('アクセシビリティ: aria-describedbyを付けない', () => {
    // Radix は常に aria-describedby を出すため、Dialog.Description を
    // 描画しないと存在しないIDを指す dangling IDREF になる（#791）
    const videos = [createVideo()];

    render(<VideoDialog {...defaultProps} videos={videos} />);

    expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-describedby');
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

  // クロスオリジンの iframe は onError が発火せず埋め込みの失敗を検知できない。
  // 空のプレイヤーで詰まないよう、出し分けずに常時リンクを置く（#980）
  describe('YouTubeへの代替導線', () => {
    it('視聴ページへのリンクが表示される', () => {
      const videos = [createVideo({ key: 'test-key-123' })];

      render(<VideoDialog {...defaultProps} videos={videos} />);

      expect(
        screen.getByRole('link', { name: /YouTubeで見る/ }),
      ).toHaveAttribute('href', 'https://www.youtube.com/watch?v=test-key-123');
    });

    it('新しいタブで開き、rel="noopener noreferrer"が付く', () => {
      const videos = [createVideo()];

      render(<VideoDialog {...defaultProps} videos={videos} />);

      const link = screen.getByRole('link', { name: /YouTubeで見る/ });
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('video.keyがencodeURIComponentでサニタイズされる', () => {
      const videos = [createVideo({ key: 'key/with?special&chars' })];

      render(<VideoDialog {...defaultProps} videos={videos} />);

      expect(
        screen.getByRole('link', { name: /YouTubeで見る/ }),
      ).toHaveAttribute(
        'href',
        `https://www.youtube.com/watch?v=${encodeURIComponent('key/with?special&chars')}`,
      );
    });

    it('埋め込みと違い youtube.com を指す（トップレベル遷移のため frame-src の管轄外）', () => {
      const videos = [createVideo({ key: 'abc' })];

      render(<VideoDialog {...defaultProps} videos={videos} />);

      const link = screen.getByRole('link', { name: /YouTubeで見る/ });
      expect(link.getAttribute('href')).toContain('https://www.youtube.com/');
      expect(link.getAttribute('href')).not.toContain('youtube-nocookie.com');
    });

    it('アクセシブル名に動画名と新しいタブで開く旨が含まれる', () => {
      // 動画が複数並ぶため、リンクだけを拾って読む操作でどれか分かる必要がある
      const videos = [createVideo({ name: '本予告', key: 'k1' })];

      render(<VideoDialog {...defaultProps} videos={videos} />);

      // 可視テキストと読み上げ専用テキストの連結。アクセシブル名の算出は
      // 要素の境界に空白を入れるため、そこは緩く見る
      expect(
        screen.getByRole('link', {
          name: /^YouTubeで見る\s*（本予告・新しいタブで開きます）$/,
        }),
      ).toBeInTheDocument();
    });

    it('動画の数だけリンクが並び、それぞれ別の動画を指す', () => {
      const videos = [
        createVideo({ id: 'v1', name: '予告編1', key: 'key1' }),
        createVideo({ id: 'v2', name: '予告編2', key: 'key2' }),
      ];

      render(<VideoDialog {...defaultProps} videos={videos} />);

      const links = screen.getAllByRole('link', { name: /YouTubeで見る/ });
      expect(links).toHaveLength(2);
      expect(links[0]).toHaveAttribute(
        'href',
        'https://www.youtube.com/watch?v=key1',
      );
      expect(links[1]).toHaveAttribute(
        'href',
        'https://www.youtube.com/watch?v=key2',
      );
    });

    it('空の動画一覧ではリンクも表示されない', () => {
      render(<VideoDialog {...defaultProps} videos={[]} />);

      expect(
        screen.queryByRole('link', { name: /YouTubeで見る/ }),
      ).not.toBeInTheDocument();
    });

    it('Tabキーで到達できる', async () => {
      const user = userEvent.setup();
      const videos = [createVideo()];

      render(<VideoDialog {...defaultProps} videos={videos} />);

      const link = screen.getByRole('link', { name: /YouTubeで見る/ });

      // ダイアログ内のフォーカス順を進めてリンクへ到達することを見る
      for (let i = 0; i < 10 && document.activeElement !== link; i++) {
        await user.tab();
      }

      expect(link).toHaveFocus();
    });
  });
});
