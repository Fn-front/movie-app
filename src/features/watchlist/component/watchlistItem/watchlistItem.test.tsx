/**
 * WatchlistItemコンポーネント テスト
 */

import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { WatchlistItem } from './watchlistItem';
import type { WatchlistItem as WatchlistItemType } from '@/lib/api/watchlist/watchlist';

// --- Helpers ---

const createMockItem = (
  overrides: Partial<WatchlistItemType> = {},
): WatchlistItemType => ({
  id: 'wl-1',
  tmdb_movie_id: 123,
  title: 'テスト映画',
  poster_path: '/test.jpg',
  release_date: '2026-03-01',
  added_at: '2026-03-10T00:00:00Z',
  watched_at: null,
  streaming: null,
  ...overrides,
});

// --- Tests ---

describe('WatchlistItem', () => {
  it('ポスター・タイトル・公開日・削除ボタンが表示される', () => {
    const item = createMockItem();
    render(
      <WatchlistItem item={item} onClick={jest.fn()} onDelete={jest.fn()} />,
    );

    expect(screen.getByAltText('テスト映画のポスター')).toBeInTheDocument();
    expect(screen.getByText('テスト映画')).toBeInTheDocument();
    expect(screen.getByText('2026年03月01日')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'テスト映画をウォッチリストから削除',
      }),
    ).toBeInTheDocument();
  });

  /** 公開日の行（role もラベルも無いのでクラス名で引く） */
  const dateRow = (container: HTMLElement) =>
    container.querySelector('[class*="c_watchlist_item__release_date"]');

  it('公開日がnullの場合は公開日が表示されない', () => {
    const item = createMockItem({ release_date: null });
    const { container } = render(
      <WatchlistItem item={item} onClick={jest.fn()} onDelete={jest.fn()} />,
    );

    expect(screen.getByText('テスト映画')).toBeInTheDocument();
    expect(screen.queryByText(/\d{4}年/)).not.toBeInTheDocument();
    // 文字が無いだけでなく、入れ物ごと出ていないこと
    expect(dateRow(container)).not.toBeInTheDocument();
  });

  /**
   * `formatDate` は不正な日付で null を返す。`item.release_date` で描画を
   * 判定していると、中身の無い `<p>` が残る（#1091）
   */
  it('公開日が不正な場合は公開日の行ごと出さない', () => {
    // formatDate は握りつぶすときに console.error を出す。想定どおりなので
    // 黙らせるが、復元は afterEach（失敗時も確実に戻すため）
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const item = createMockItem({ release_date: 'not-a-date' });
    const { container } = render(
      <WatchlistItem item={item} onClick={jest.fn()} onDelete={jest.fn()} />,
    );

    expect(dateRow(container)).not.toBeInTheDocument();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('アイテムクリック時にonClickが映画IDで呼ばれる', async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();
    const item = createMockItem({ tmdb_movie_id: 456 });
    render(
      <WatchlistItem item={item} onClick={onClick} onDelete={jest.fn()} />,
    );

    await user.click(screen.getByRole('link', { name: 'テスト映画' }));
    expect(onClick).toHaveBeenCalledWith(456);
  });

  it('削除ボタンクリック時にonDeleteが呼ばれonClickは発火しない', async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();
    const onDelete = jest.fn();
    const item = createMockItem({ id: 'wl-99' });
    render(<WatchlistItem item={item} onClick={onClick} onDelete={onDelete} />);

    await user.click(
      screen.getByRole('button', {
        name: 'テスト映画をウォッチリストから削除',
      }),
    );

    expect(onDelete).toHaveBeenCalledWith('wl-99');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('ポスター画像なし時にフォールバック表示', () => {
    const item = createMockItem({ poster_path: null });
    render(
      <WatchlistItem item={item} onClick={jest.fn()} onDelete={jest.fn()} />,
    );

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('🎬')).toBeInTheDocument();
  });

  it('aria-label属性が正しく設定される', () => {
    const item = createMockItem({ title: '映画タイトル' });
    render(
      <WatchlistItem item={item} onClick={jest.fn()} onDelete={jest.fn()} />,
    );

    expect(screen.getByRole('link', { name: '映画タイトル' })).toHaveAttribute(
      'href',
      '/movies/123',
    );
    expect(
      screen.getByRole('button', {
        name: '映画タイトルをウォッチリストから削除',
      }),
    ).toBeInTheDocument();
  });

  /**
   * タイトルはリンクなので、キーボードの起動は Enter のみ（Space は効かない）。
   * ブラウザの標準挙動に委ねており、行全体を role="button" にしていた頃の
   * 自前ハンドラは消した（#1064）
   */
  it('修飾キーなしの左クリックは遷移せず onClick を呼ぶ', () => {
    const onClick = jest.fn();
    render(
      <WatchlistItem
        item={createMockItem()}
        onClick={onClick}
        onDelete={jest.fn()}
      />,
    );

    const link = screen.getByRole('link', { name: 'テスト映画' });
    const event = createEvent.click(link, { button: 0 });
    fireEvent(link, event);

    expect(onClick).toHaveBeenCalledWith(123);
    expect(event.defaultPrevented).toBe(true);
  });

  /**
   * サイドバーは全ページに出るので、ここが壊れると ⌘+クリックで作品を
   * 新しいタブに開く導線がアプリ全体で死ぬ（`shouldLetBrowserHandle` / #1033）
   */
  it.each([
    ['Ctrl', { ctrlKey: true }],
    ['Meta', { metaKey: true }],
    ['Shift', { shiftKey: true }],
    ['Alt', { altKey: true }],
  ])('%s+クリックは横取りしない（新しいタブに任せる）', (_label, modifier) => {
    const onClick = jest.fn();
    render(
      <WatchlistItem
        item={createMockItem()}
        onClick={onClick}
        onDelete={jest.fn()}
      />,
    );

    const link = screen.getByRole('link', { name: 'テスト映画' });
    const event = createEvent.click(link, { button: 0, ...modifier });
    fireEvent(link, event);

    expect(onClick).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('削除ボタンのEnterキーでonDeleteが呼ばれonClickは発火しない', async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();
    const onDelete = jest.fn();
    const item = createMockItem({ id: 'wl-key' });
    render(<WatchlistItem item={item} onClick={onClick} onDelete={onDelete} />);

    const deleteButton = screen.getByRole('button', {
      name: 'テスト映画をウォッチリストから削除',
    });
    deleteButton.focus();
    await user.keyboard('{Enter}');

    expect(onDelete).toHaveBeenCalledWith('wl-key');
    expect(onClick).not.toHaveBeenCalled();
  });

  /**
   * 行全体を role="button" にすると、内側の削除ボタンが入れ子になり
   * axe の nested-interactive に触れる（#1064）。行はボタンではない
   */
  it('行全体はボタンではない（削除ボタンだけがボタン）', () => {
    const item = createMockItem();
    render(
      <WatchlistItem item={item} onClick={jest.fn()} onDelete={jest.fn()} />,
    );

    const buttons = screen.getAllByRole('button');

    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName(
      'テスト映画をウォッチリストから削除',
    );
  });

  it('削除ボタンのSpaceキーでonDeleteが呼ばれる', async () => {
    const user = userEvent.setup();
    const onDelete = jest.fn();
    const item = createMockItem({ id: 'wl-space' });
    render(
      <WatchlistItem item={item} onClick={jest.fn()} onDelete={onDelete} />,
    );

    const deleteButton = screen.getByRole('button', {
      name: 'テスト映画をウォッチリストから削除',
    });
    deleteButton.focus();
    await user.keyboard('{ }');

    expect(onDelete).toHaveBeenCalledWith('wl-space');
  });

  it('削除ボタンの他のキーではonDeleteが呼ばれない', async () => {
    const user = userEvent.setup();
    const onDelete = jest.fn();
    const item = createMockItem();
    render(
      <WatchlistItem item={item} onClick={jest.fn()} onDelete={onDelete} />,
    );

    const deleteButton = screen.getByRole('button', {
      name: 'テスト映画をウォッチリストから削除',
    });
    deleteButton.focus();
    await user.keyboard('{Tab}');

    expect(onDelete).not.toHaveBeenCalled();
  });

  it('ポスター画像のsrcが正しく生成される', () => {
    const item = createMockItem({ poster_path: '/abc.jpg' });
    render(
      <WatchlistItem item={item} onClick={jest.fn()} onDelete={jest.fn()} />,
    );

    const img = screen.getByAltText('テスト映画のポスター');
    expect(img).toHaveAttribute('src');
    expect(img.getAttribute('src')).toContain('abc.jpg');
  });
});
