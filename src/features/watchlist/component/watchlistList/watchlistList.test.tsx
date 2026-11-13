/**
 * WatchlistListコンポーネント テスト
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { WatchlistList } from './watchlistList';
import { IMAGE_SIZES } from '@/constants';
import type { WatchlistItem } from '@/lib/api/watchlist/watchlist';

// --- Mocks ---

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

jest.mock('@/components/ui/movie/movieTileSkeleton/movieTileSkeleton', () => ({
  MovieTileSkeleton: ({ count }: { count: number }) => (
    <div data-testid='movie-tile-skeleton'>skeleton x {count}</div>
  ),
}));

// --- Helpers ---

const createMockItems = (count: number): WatchlistItem[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `wl-${i}`,
    tmdb_movie_id: 100 + i,
    title: `映画${i}`,
    poster_path: i % 2 === 0 ? `/poster${i}.jpg` : null,
    release_date: i % 3 === 0 ? '2026-03-01' : null,
    added_at: `2026-03-${String(10 - i).padStart(2, '0')}T00:00:00Z`,
    watched_at: null,
    streaming: null,
  }));

// --- Tests ---

describe('WatchlistList', () => {
  it('ローディング中にスケルトンが表示される', () => {
    render(<WatchlistList watchlist={[]} isLoading={true} />);

    expect(screen.getByTestId('movie-tile-skeleton')).toBeInTheDocument();
  });

  it('空状態メッセージが表示される', () => {
    render(<WatchlistList watchlist={[]} isLoading={false} />);

    expect(
      screen.getByText('ウォッチリストに映画を追加しましょう'),
    ).toBeInTheDocument();
  });

  it('複数件のアイテムが表示される', () => {
    render(<WatchlistList watchlist={createMockItems(3)} isLoading={false} />);

    expect(screen.getByText('映画0')).toBeInTheDocument();
    expect(screen.getByText('映画1')).toBeInTheDocument();
    expect(screen.getByText('映画2')).toBeInTheDocument();
  });

  it('ポスター画像がある場合はImageが表示される', () => {
    render(<WatchlistList watchlist={createMockItems(1)} isLoading={false} />);

    expect(screen.getByAltText('映画0のポスター')).toBeInTheDocument();
  });

  // sizes が無いと next/image は srcset を 1x/2x しか出さず、
  // 枠（実測140〜241px）へ元画像(500px)が落ちてくる（#982）
  it('ポスターにsizesが指定されている', () => {
    render(<WatchlistList watchlist={createMockItems(1)} isLoading={false} />);

    expect(screen.getByAltText('映画0のポスター')).toHaveAttribute(
      'sizes',
      IMAGE_SIZES.POSTER.SIZES,
    );
  });

  it('ポスター画像がない場合はNo Imageが表示される', () => {
    const items = createMockItems(2);
    render(<WatchlistList watchlist={[items[1]]} isLoading={false} />);

    expect(screen.getByText('No Image')).toBeInTheDocument();
  });

  /**
   * 公開日の表記（#1019）
   *
   * ⚠️ 日付の `<p>` には role もラベルも無いのでクラス名で引いている。
   * CSS Modules のクラス名を変えると**黙って素通りする**（jest は
   * `next/jest` でクラス名をそのまま文字列にするので今は当たる）。
   */
  describe('公開日', () => {
    /** 日付の行（role もラベルも無いのでクラス名で引く） */
    const dateRow = (container: HTMLElement) =>
      container.querySelector('[class*="c_watchlist_tile__date"]');

    // API は ISO 形式（2026-03-01）で返すが、そのまま出すと
    // 他の一覧（MovieTile・サイドバー）と表記が揃わない
    it('他画面と同じ日本語表記で表示される', () => {
      render(
        <WatchlistList watchlist={createMockItems(1)} isLoading={false} />,
      );

      expect(screen.getByText('2026年03月01日')).toBeInTheDocument();
      expect(screen.queryByText('2026-03-01')).not.toBeInTheDocument();
    });

    // #1019 の完了条件「日付が無い作品で空表示のまま崩れない」
    it('日付が無い作品では公開日の行ごと出さない', () => {
      const [item] = createMockItems(1);
      const { container } = render(
        <WatchlistList
          watchlist={[{ ...item, release_date: null }]}
          isLoading={false}
        />,
      );

      expect(dateRow(container)).not.toBeInTheDocument();
    });

    /**
     * 不正な日付では `formatDate` が null を返す。
     * `item.release_date` で描画を判定したままだと、中身の無い `<p>` が残る
     */
    it('日付が不正な場合も公開日の行ごと出さない', () => {
      // formatDate は握りつぶすときに console.error を出す。想定どおりなので
      // 黙らせるが、**復元は afterEach で行う**（ここで mockRestore すると
      // アサーション失敗時に復元されず、以降のテストで警告が消える）
      jest.spyOn(console, 'error').mockImplementation(() => {});

      const [item] = createMockItems(1);
      const { container } = render(
        <WatchlistList
          watchlist={[{ ...item, release_date: 'not-a-date' }]}
          isLoading={false}
        />,
      );

      expect(dateRow(container)).not.toBeInTheDocument();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });
  });

  it('onClickが渡された場合、タイルクリックでコールバックが呼ばれる', async () => {
    const user = userEvent.setup();
    const handleClick = jest.fn();
    render(
      <WatchlistList
        watchlist={createMockItems(1)}
        isLoading={false}
        onClick={handleClick}
      />,
    );

    await user.click(screen.getByRole('link', { name: '映画0' }));
    expect(handleClick).toHaveBeenCalledWith(100);
  });

  it('onDeleteが渡された場合、削除ボタンが表示される', async () => {
    const user = userEvent.setup();
    const handleDelete = jest.fn();
    render(
      <WatchlistList
        watchlist={createMockItems(1)}
        isLoading={false}
        onClick={jest.fn()}
        onDelete={handleDelete}
      />,
    );

    await user.click(
      screen.getByRole('button', {
        name: '映画0をウォッチリストから削除',
      }),
    );
    expect(handleDelete).toHaveBeenCalledWith('wl-0');
  });

  /**
   * タイトルはリンクなので、キーボードの起動は Enter のみ（Space は効かない）。
   * カード全体を role="button" にしていた頃の自前ハンドラは消した（#1060）
   */
  it('タイトルは詳細ページへのリンクで、フォーカスできる', () => {
    render(
      <WatchlistList
        watchlist={createMockItems(1)}
        isLoading={false}
        onClick={jest.fn()}
      />,
    );

    const link = screen.getByRole('link', { name: '映画0' });
    link.focus();

    expect(link).toHaveAttribute('href', '/movies/100');
    expect(link).toHaveFocus();
  });

  /**
   * カード全体を role="button" にすると、内側の視聴済み・削除ボタンが
   * 入れ子になり axe の nested-interactive に触れる（#1060）
   */
  it('カード全体はボタンではない', () => {
    render(
      <WatchlistList
        watchlist={createMockItems(1)}
        isLoading={false}
        onClick={jest.fn()}
        onDelete={jest.fn()}
        onWatchedToggle={jest.fn()}
      />,
    );

    const names = screen
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'));

    expect(names).toEqual([
      '映画0を視聴済みにする',
      '映画0をウォッチリストから削除',
    ]);
  });

  describe('視聴済み', () => {
    /**
     * 視聴済みトグル。
     *
     * ラベルは状態非依存なので、視聴済み／未視聴は `pressed` でしか区別できない
     * （#1046）。省略を許すと名前だけで引くロケータが戻ってくるため必須にする
     *
     * @param pressed - true なら視聴済み、false なら未視聴
     */
    const watchedToggle = (pressed: boolean) =>
      screen.getByRole('button', {
        name: '映画0を視聴済みにする',
        pressed,
      });

    const watchedItems = () =>
      createMockItems(1).map((item) => ({
        ...item,
        watched_at: '2026-03-01T00:00:00Z',
      }));

    it('onWatchedToggleが渡された場合、視聴済みボタンが表示される', () => {
      render(
        <WatchlistList
          watchlist={createMockItems(1)}
          isLoading={false}
          onWatchedToggle={jest.fn()}
        />,
      );

      expect(watchedToggle(false)).toBeInTheDocument();
    });

    it('onWatchedToggleが無い場合は視聴済みボタンを出さない', () => {
      render(
        <WatchlistList watchlist={createMockItems(1)} isLoading={false} />,
      );

      expect(
        screen.queryByRole('button', { name: /視聴済みにする/ }),
      ).not.toBeInTheDocument();
    });

    it('視聴済みボタンのクリックでidと視聴済みフラグを渡す', async () => {
      const user = userEvent.setup();
      const handleWatchedToggle = jest.fn();

      render(
        <WatchlistList
          watchlist={createMockItems(1)}
          isLoading={false}
          onWatchedToggle={handleWatchedToggle}
        />,
      );

      await user.click(watchedToggle(false));

      expect(handleWatchedToggle).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'wl-0' }),
        true,
      );
    });

    it('視聴済みのアイテムはバッジが出てトグルが押下状態になる', () => {
      render(
        <WatchlistList
          watchlist={watchedItems()}
          isLoading={false}
          onWatchedToggle={jest.fn()}
        />,
      );

      expect(screen.getByText('視聴済み')).toBeInTheDocument();
      expect(watchedToggle(true)).toBeInTheDocument();
    });

    /**
     * ラベルを状態で入れ替えると `aria-pressed` と意味が衝突し、
     * 視聴済みの行が「○○を未視聴に戻す、オン」と読まれて未視聴に見える（#1046）。
     * 状態は `aria-pressed` だけで伝える
     */
    it('ラベルは状態によらず変わらない', () => {
      const { rerender } = render(
        <WatchlistList
          watchlist={createMockItems(1)}
          isLoading={false}
          onWatchedToggle={jest.fn()}
        />,
      );

      expect(watchedToggle(false)).toHaveAccessibleName(
        '映画0を視聴済みにする',
      );

      rerender(
        <WatchlistList
          watchlist={watchedItems()}
          isLoading={false}
          onWatchedToggle={jest.fn()}
        />,
      );

      expect(watchedToggle(true)).toHaveAccessibleName('映画0を視聴済みにする');
    });

    it('視聴済みのアイテムをクリックすると解除として渡す', async () => {
      const user = userEvent.setup();
      const handleWatchedToggle = jest.fn();

      render(
        <WatchlistList
          watchlist={watchedItems()}
          isLoading={false}
          onWatchedToggle={handleWatchedToggle}
        />,
      );

      await user.click(watchedToggle(true));

      expect(handleWatchedToggle).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'wl-0' }),
        false,
      );
    });

    it('未視聴のアイテムにはバッジを出さない', () => {
      render(
        <WatchlistList
          watchlist={createMockItems(1)}
          isLoading={false}
          onWatchedToggle={jest.fn()}
        />,
      );

      expect(screen.queryByText('視聴済み')).not.toBeInTheDocument();
    });

    it('視聴済みボタンのクリックでタイルのクリックは発火しない', async () => {
      const user = userEvent.setup();
      const handleClick = jest.fn();

      render(
        <WatchlistList
          watchlist={createMockItems(1)}
          isLoading={false}
          onClick={handleClick}
          onWatchedToggle={jest.fn()}
        />,
      );

      await user.click(watchedToggle(false));

      expect(handleClick).not.toHaveBeenCalled();
    });

    it('キーボード操作で視聴済みを切り替えられる', async () => {
      const user = userEvent.setup();
      const handleWatchedToggle = jest.fn();
      const handleClick = jest.fn();

      render(
        <WatchlistList
          watchlist={createMockItems(1)}
          isLoading={false}
          onClick={handleClick}
          onWatchedToggle={handleWatchedToggle}
        />,
      );

      watchedToggle(false).focus();
      await user.keyboard('{Enter}');

      // keydown で preventDefault するため、クリックとの二重発火にならない
      expect(handleWatchedToggle).toHaveBeenCalledTimes(1);
      // タイル本体の詳細モーダルは開かない
      expect(handleClick).not.toHaveBeenCalled();
    });

    it('キーボード操作で削除できる', async () => {
      const user = userEvent.setup();
      const handleDelete = jest.fn();
      const handleClick = jest.fn();

      render(
        <WatchlistList
          watchlist={createMockItems(1)}
          isLoading={false}
          onClick={handleClick}
          onDelete={handleDelete}
        />,
      );

      screen
        .getByRole('button', { name: '映画0をウォッチリストから削除' })
        .focus();
      await user.keyboard('{Enter}');

      expect(handleDelete).toHaveBeenCalledTimes(1);
      expect(handleClick).not.toHaveBeenCalled();
    });

    it('更新中は視聴済みボタンを無効化する', () => {
      render(
        <WatchlistList
          watchlist={createMockItems(1)}
          isLoading={false}
          onWatchedToggle={jest.fn()}
          isWatchedUpdating
        />,
      );

      expect(watchedToggle(false)).toBeDisabled();
    });
  });

  describe('配信バッジ', () => {
    it('配信中のアイテムにバッジを出す', () => {
      const items = createMockItems(1).map((item) => ({
        ...item,
        streaming: {
          offer_type: 'flatrate' as const,
          provider_ids: [84],
          resumed: false,
        },
      }));

      render(<WatchlistList watchlist={items} isLoading={false} />);

      expect(screen.getByText('見放題')).toBeInTheDocument();
      expect(screen.getByAltText('U-NEXT')).toBeInTheDocument();
    });

    it('配信なしのアイテムにはバッジを出さない', () => {
      const items = createMockItems(1);

      render(<WatchlistList watchlist={items} isLoading={false} />);

      expect(screen.queryByText('見放題')).toBeNull();
      expect(screen.queryByText('レンタル')).toBeNull();
    });

    it('視聴済みのアイテムにはバッジを出さない', () => {
      const items = createMockItems(1).map((item) => ({
        ...item,
        watched_at: '2026-04-01T00:00:00Z',
        streaming: {
          offer_type: 'flatrate' as const,
          provider_ids: [84],
          resumed: false,
        },
      }));

      render(<WatchlistList watchlist={items} isLoading={false} />);

      // 視聴済みバッジと同じ位置に置いているため、重ならないよう出さない
      expect(screen.queryByText('見放題')).toBeNull();
      expect(screen.getByText('視聴済み')).toBeInTheDocument();
    });
  });

  /**
   * 「観た作品に何点を付けたか」をウォッチリスト上で確認できるようにする（#827）。
   * 視聴済みかつ評価登録済みのときだけ出す
   */
  describe('評価の表示', () => {
    const watchedItems = () =>
      createMockItems(1).map((item) => ({
        ...item,
        watched_at: '2026-04-01T00:00:00Z',
      }));

    const getFavorite = () => ({ id: 'fav-1', rating: 8 });

    it('視聴済み＋評価登録済みなら評価を表示する', () => {
      render(
        <WatchlistList
          watchlist={watchedItems()}
          isLoading={false}
          getFavoriteInfo={getFavorite}
        />,
      );

      expect(
        screen.getByRole('img', { name: '評価: 8/10' }),
      ).toBeInTheDocument();
    });

    it('視聴済みでも評価未登録なら表示しない', () => {
      render(
        <WatchlistList
          watchlist={watchedItems()}
          isLoading={false}
          getFavoriteInfo={() => null}
        />,
      );

      expect(screen.queryByRole('img', { name: /評価:/ })).toBeNull();
    });

    // 視聴済みを解除したら、お気に入りが残っていても消す
    it('未視聴なら評価登録済みでも表示しない', () => {
      render(
        <WatchlistList
          watchlist={createMockItems(1)}
          isLoading={false}
          getFavoriteInfo={getFavorite}
        />,
      );

      expect(screen.queryByRole('img', { name: /評価:/ })).toBeNull();
    });

    // サイドバーなど評価を出さない場所では渡さない
    it('getFavoriteInfo が無ければ表示しない', () => {
      render(<WatchlistList watchlist={watchedItems()} isLoading={false} />);

      expect(screen.queryByRole('img', { name: /評価:/ })).toBeNull();
    });

    /**
     * カードの名前に評価を畳み込む回避は不要になった（#1060）。
     * タイトルがリンクになり role="button" の子孫ではなくなったので、
     * RatingIndicator の aria-label がそのまま読まれる
     */
    it('評価はカード名に畳み込まず、独立して読まれる', () => {
      render(
        <WatchlistList
          watchlist={watchedItems()}
          isLoading={false}
          onClick={jest.fn()}
          getFavoriteInfo={getFavorite}
        />,
      );

      expect(screen.getByRole('link', { name: '映画0' })).toBeInTheDocument();
      expect(
        screen.getByRole('img', { name: '評価: 8/10' }),
      ).toBeInTheDocument();
    });

    /**
     * 当たり判定は ::after（カード全面）が担うので、評価の上を押しても
     * 詳細が開く。jsdom は ::after を持たないため、ここでは
     * 「評価がリンクの子孫になっていない」ことだけを固定する
     * （入れ子になっていると nested-interactive に戻る）
     */
    it('評価はタイトルのリンクの中に入っていない', () => {
      render(
        <WatchlistList
          watchlist={watchedItems()}
          isLoading={false}
          onClick={jest.fn()}
          getFavoriteInfo={getFavorite}
        />,
      );

      const link = screen.getByRole('link', { name: '映画0' });
      const rating = screen.getByRole('img', { name: '評価: 8/10' });

      expect(link.contains(rating)).toBe(false);
    });
  });
});
