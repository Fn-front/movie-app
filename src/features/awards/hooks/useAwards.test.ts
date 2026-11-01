/**
 * useAwardsフックのテスト
 */

import { renderHook, act } from '@testing-library/react';

import { useAwards } from './useAwards';

// --- Mocks ---

jest.mock('@/lib/api/awards/awards', () => ({
  getAwards: jest.fn(),
}));

/** URL の ?award= / ?year= を差し替えるための可変値 */
let mockSearchParams = new URLSearchParams();
const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => '/awards',
}));

jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: jest.fn(),
  };
});

import { useQuery } from '@tanstack/react-query';

const mockUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;

// --- Tests ---

/** awards 配列を持つクエリ結果を作る */
function queryResult(
  awards: { awardName: string; label: string }[],
  years = [2026],
) {
  return {
    data: {
      year: years[0],
      availableYears: years,
      awards: awards.map((a) => ({ ...a, categories: [] })),
    },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useQuery>;
}

const THREE_AWARDS = [
  { awardName: 'academy_awards', label: 'アカデミー賞' },
  { awardName: 'cannes', label: 'カンヌ映画祭' },
  { awardName: 'golden_globes', label: 'ゴールデングローブ賞' },
];

describe('useAwards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  it('初期状態で現在の年度がselectedYearに設定される', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useQuery>);

    const { result } = renderHook(() => useAwards());

    expect(result.current.selectedYear).toBe(new Date().getFullYear());
    expect(result.current.isLoading).toBe(true);
  });

  it('データ取得成功時にdataが返される', () => {
    const mockData = {
      year: 2026,
      availableYears: [2026, 2025],
      awards: [
        {
          awardName: 'academy_awards',
          label: 'アカデミー賞',
          categories: [],
        },
      ],
    };

    mockUseQuery.mockReturnValue({
      data: mockData,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useQuery>);

    const { result } = renderHook(() => useAwards());

    expect(result.current.data).toEqual(mockData);
    expect(result.current.isLoading).toBe(false);
  });

  it('handleYearChangeで年度を変更できる', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useQuery>);

    const { result } = renderHook(() => useAwards());

    act(() => {
      result.current.handleYearChange('2025');
    });

    expect(result.current.selectedYear).toBe(2025);
  });

  it('エラー時にisErrorがtrueになる', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as ReturnType<typeof useQuery>);

    const { result } = renderHook(() => useAwards());

    expect(result.current.isError).toBe(true);
  });

  it('useQueryにawardKeysが渡される', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useQuery>);

    renderHook(() => useAwards());

    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['awards', new Date().getFullYear()],
      }),
    );
  });
});

describe('useAwards — 賞タブ', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  it('賞が複数あればタブの選択肢を返す', () => {
    mockUseQuery.mockReturnValue(queryResult(THREE_AWARDS));

    const { result } = renderHook(() => useAwards());

    expect(result.current.awardOptions).toEqual([
      { label: 'アカデミー賞', value: 'academy_awards' },
      { label: 'カンヌ映画祭', value: 'cannes' },
      { label: 'ゴールデングローブ賞', value: 'golden_globes' },
    ]);
  });

  // 選択肢が1つだけのタブは意味がないので出さない
  it('賞が1つなら選択肢を空にする', () => {
    mockUseQuery.mockReturnValue(queryResult([THREE_AWARDS[0]]));

    const { result } = renderHook(() => useAwards());

    expect(result.current.awardOptions).toEqual([]);
    expect(result.current.selectedAward?.awardName).toBe('academy_awards');
  });

  it('既定では先頭の賞を選ぶ', () => {
    mockUseQuery.mockReturnValue(queryResult(THREE_AWARDS));

    const { result } = renderHook(() => useAwards());

    expect(result.current.selectedAward?.awardName).toBe('academy_awards');
  });

  it('URL の ?award= を初期値にする', () => {
    mockSearchParams = new URLSearchParams({ award: 'cannes' });
    mockUseQuery.mockReturnValue(queryResult(THREE_AWARDS));

    const { result } = renderHook(() => useAwards());

    expect(result.current.selectedAward?.awardName).toBe('cannes');
  });

  it('handleAwardChange で表示する賞が変わる', () => {
    mockUseQuery.mockReturnValue(queryResult(THREE_AWARDS));

    const { result } = renderHook(() => useAwards());

    act(() => {
      result.current.handleAwardChange('golden_globes');
    });

    expect(result.current.selectedAward?.awardName).toBe('golden_globes');
  });

  // URL を手で書き換えられても落ちない
  it('存在しない賞キーなら先頭にフォールバックする', () => {
    mockSearchParams = new URLSearchParams({ award: 'oscar' });
    mockUseQuery.mockReturnValue(queryResult(THREE_AWARDS));

    const { result } = renderHook(() => useAwards());

    expect(result.current.selectedAward?.awardName).toBe('academy_awards');
  });

  // カンヌを見ている状態でアカデミー賞しかない年に移ると、選択が宙に浮く
  it('選んでいた賞がその年に無ければ先頭に落とす', () => {
    mockSearchParams = new URLSearchParams({ award: 'cannes' });
    mockUseQuery.mockReturnValue(queryResult([THREE_AWARDS[0]]));

    const { result } = renderHook(() => useAwards());

    expect(result.current.selectedAward?.awardName).toBe('academy_awards');
  });

  it('データ未取得なら selectedAward は null', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useQuery>);

    const { result } = renderHook(() => useAwards());

    expect(result.current.selectedAward).toBeNull();
    expect(result.current.awardOptions).toEqual([]);
  });
});

describe('useAwards — URL同期', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  it('データ取得後に賞と年をURLへ書き戻す', () => {
    mockUseQuery.mockReturnValue(queryResult(THREE_AWARDS, [2026, 2025]));

    renderHook(() => useAwards());

    expect(mockReplace).toHaveBeenCalled();
    const url = mockReplace.mock.calls.at(-1)?.[0] as string;
    expect(url).toContain('award=academy_awards');
    expect(url).toContain('year=2026');
  });

  // 戻るボタンの連打で履歴が埋まらないようにする
  it('履歴を積まない（replace かつ scroll しない）', () => {
    mockUseQuery.mockReturnValue(queryResult(THREE_AWARDS));

    renderHook(() => useAwards());

    expect(mockReplace.mock.calls.at(-1)?.[1]).toEqual({ scroll: false });
  });

  it('データ未取得のうちはURLを書き換えない', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useQuery>);

    renderHook(() => useAwards());

    expect(mockReplace).not.toHaveBeenCalled();
  });

  // 同期直後の確認（#894）で付く t を落とすと、以降の取得がキャッシュに戻る
  it('既存の他クエリ（t）を保持する', () => {
    mockSearchParams = new URLSearchParams({ t: '2026-11-01T00:00:00.000Z' });
    mockUseQuery.mockReturnValue(queryResult(THREE_AWARDS));

    renderHook(() => useAwards());

    const url = mockReplace.mock.calls.at(-1)?.[0] as string;
    expect(url).toContain('t=2026-11-01T00');
  });
});
