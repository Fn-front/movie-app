/**
 * useWatchlistToggle のキャッシュ購読が「他コンポーネントのレンダリング中に
 * 更新をスケジュールしない」ことの回帰テスト（#1061）
 *
 * ⚠️ 同じディレクトリの useWatchlistToggle.test.ts とは意図的に分けている。
 * あちらは `jest.mock('@tanstack/react-query')` で pub/sub を手書きのフェイクに
 * 置き換えているため、**react-query がレンダー中に `added` を同期発火する**
 * という本件の核心を構造的に再現できない。
 *
 * ここでは本物の QueryClient と本物の React レンダリングを使う。
 * 再現の条件は「先に購読している子」と「後からマウントして useInfiniteQuery を
 * 張る子」が同じツリーに並ぶこと。後者のレンダー中に queryCache.build() →
 * notify({type:'added'}) が同期で走り、前者の useSyncExternalStore が
 * 更新をスケジュールする（= React の規約違反）。
 */

import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useInfiniteQuery } from '@tanstack/react-query';

import { watchlistKeys } from '@/constants';
import {
  createQueryWrapper,
  createTestQueryClient,
} from '@/test/queryTestUtils';

import { useWatchlistToggle } from './useWatchlistToggle';

// --- Mocks ---

jest.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { id: 'user-1' } },
    status: 'authenticated',
  }),
}));

jest.mock('@/hooks/useToast', () => ({
  useToastDispatch: () => ({
    toast: jest.fn(),
    removeToast: jest.fn(),
    clearToasts: jest.fn(),
  }),
}));

jest.mock('@/lib/store/useLoginPromptStore', () => ({
  useLoginPromptStore: (selector: (s: { open: jest.Mock }) => jest.Mock) =>
    selector({ open: jest.fn() }),
}));

// 通信は張らない。キャッシュの作られ方だけを見るため queryFn を差し込む
//
// `getWatchlistLookup` も必ず置くこと（#1145）。useWatchlistToggle が
// 照会クエリを張るようになったので、未定義だと queryFn 無しのクエリができ、
// react-query が console.error を出す。このファイルは「レンダー中に
// console.error が1件も出ないこと」を見ているため、そこで落ちる
jest.mock('@/lib/api/watchlist/watchlist', () => ({
  addWatchlist: jest.fn(),
  removeWatchlist: jest.fn(),
  getWatchlistLookup: jest
    .fn()
    .mockResolvedValue({ success: true, data: { watchlist: [] } }),
}));

// --- Fixtures ---

const TMDB_MOVIE_ID = 42;

const watchlistPage = {
  data: {
    watchlist: [
      {
        id: 'watchlist-1',
        tmdb_movie_id: TMDB_MOVIE_ID,
        title: 'テスト映画',
        poster_path: '/poster.jpg',
        release_date: '2026-01-01',
        added_at: '2026-01-01T00:00:00Z',
        watched_at: null,
        streaming: null,
      },
    ],
    next_cursor: null,
    has_more: false,
  },
};

/** 実アプリの MovieGrid 相当。先にマウントしてキャッシュを購読する側 */
function WatchlistTile() {
  const { isInWatchlist } = useWatchlistToggle();

  return (
    <p role='status' aria-label='タイルの状態'>
      {isInWatchlist(TMDB_MOVIE_ID) ? '追加済み' : '未追加'}
    </p>
  );
}

/**
 * 実アプリの WatchlistPanel 相当。後からマウントして useInfiniteQuery を張る側。
 *
 * この**レンダー中**にキャッシュへ Query が作られ、`added` が同期で飛ぶ
 */
function WatchlistPanelStub() {
  const { isLoading } = useInfiniteQuery({
    // 実アプリ（useWatchlist.ts:105）と同じ形のキーにする。購読は
    // queryKey[0] の prefix で判定するので機構の再現には効かないが、
    // 「サイドバー相当」と読まれるので実在しない形を置かない
    queryKey: watchlistKeys.list({
      sort: 'added_at',
      excludeWatched: true,
      prioritizeStreaming: false,
    }),
    queryFn: () => Promise.resolve(watchlistPage),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: () => undefined,
  });

  return (
    <p role='status' aria-label='パネルの状態'>
      {isLoading ? '読み込み中' : '読み込み完了'}
    </p>
  );
}

function Screen() {
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  return (
    <>
      <WatchlistTile />
      {isPanelOpen ? <WatchlistPanelStub /> : null}
      <button type='button' onClick={() => setIsPanelOpen(true)}>
        パネルを開く
      </button>
    </>
  );
}

// --- Tests ---

describe('useWatchlistToggle のキャッシュ購読（本物の QueryClient）', () => {
  let consoleErrorSpy: jest.SpyInstance;
  let consoleErrors: string[];

  beforeEach(() => {
    consoleErrors = [];
    consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation((...args: unknown[]) => {
        consoleErrors.push(args.map((arg) => String(arg)).join(' '));
      });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('後から useInfiniteQuery が張られても、他コンポーネントのレンダリング中に更新をスケジュールしない', async () => {
    const user = userEvent.setup();
    render(<Screen />, {
      wrapper: createQueryWrapper(createTestQueryClient()),
    });

    expect(
      screen.getByRole('status', { name: 'タイルの状態' }),
    ).toHaveTextContent('未追加');

    await user.click(screen.getByRole('button', { name: 'パネルを開く' }));

    // データが届けば `updated` で拾えるので、`added` を落としても
    // タイルは追従する（取りこぼしていないことの確認）
    await waitFor(() => {
      expect(
        screen.getByRole('status', { name: 'タイルの状態' }),
      ).toHaveTextContent('追加済み');
    });
    expect(
      screen.getByRole('status', { name: 'パネルの状態' }),
    ).toHaveTextContent('読み込み完了');

    // 本丸。`added` を購読していると、WatchlistPanelStub のレンダー中に
    // WatchlistTile の更新がスケジュールされ React がこれを報告する。
    //
    // 文言で絞らず**1件も出ていないこと**を見る。絞ると React がメッセージを
    // 変えたときに無言で通るうえ、他のエラー（act 警告など）も握りつぶす
    expect(consoleErrors).toEqual([]);
  });
});
