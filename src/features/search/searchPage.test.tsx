/**
 * SearchPageコンポーネントのテスト
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SearchPage } from './searchPage';
import { ARIA_LABELS } from '@/constants';
import type { UseSearchReturn } from './hooks/useSearch';
import type { UseMovieFilterReturn } from './hooks/useMovieFilter';
import type { UseGenresReturn } from './hooks/useGenres';

// --- Mocks ---
const mockUseSearch = jest.fn<UseSearchReturn, []>();
const mockUseMovieFilter = jest.fn<UseMovieFilterReturn, []>();
const mockUseGenres = jest.fn<UseGenresReturn, []>();

jest.mock('./hooks/useSearch', () => ({
  useSearch: () => mockUseSearch(),
}));

jest.mock('./hooks/useMovieFilter', () => ({
  useMovieFilter: () => mockUseMovieFilter(),
}));

jest.mock('./hooks/useGenres', () => ({
  useGenres: () => mockUseGenres(),
}));

jest.mock('@/features/search/component/searchResults/searchResults', () => ({
  SearchResults: jest.fn((props) => (
    <div data-testid='search-results'>
      <span data-testid='total-results'>{props.totalResults}</span>
      <span data-testid='current-page'>{props.currentPage}</span>
    </div>
  )),
}));

jest.mock('@/features/search/component/movieFilter/movieFilter', () => ({
  MovieFilter: jest.fn(() => <div data-testid='movie-filter' />),
}));

// 本文側の検索欄（#1016）が useRouter を使うため、ルーターを差し替える
const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// --- Helpers ---
function createMockUseSearchReturn(
  overrides?: Partial<UseSearchReturn>,
): UseSearchReturn {
  return {
    query: '',
    movies: [],
    totalResults: 0,
    currentPage: 1,
    totalPages: 0,
    isLoading: false,
    isError: false,
    handlePageChange: jest.fn(),
    suggestions: [],
    isSuggestionLoading: false,
    ...overrides,
  };
}

function setupDefaultMocks(searchOverrides?: Partial<UseSearchReturn>) {
  mockUseSearch.mockReturnValue(createMockUseSearchReturn(searchOverrides));
  mockUseMovieFilter.mockReturnValue({
    currentFilters: {},
    hasActiveFilters: false,
    handleFilterChange: jest.fn(),
    handleFilterClear: jest.fn(),
  });
  mockUseGenres.mockReturnValue({
    genres: [
      { id: 28, name: 'アクション' },
      { id: 12, name: 'アドベンチャー' },
    ],
    isLoading: false,
    isError: false,
  });
}

// --- Tests ---
describe('SearchPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('フィルターのランドマークにラベルが付く（サイドバーと区別するため）', () => {
    setupDefaultMocks({ query: 'テスト映画' });

    render(<SearchPage />);

    expect(
      screen.getByRole('complementary', { name: '検索フィルター' }),
    ).toBeInTheDocument();
  });

  it('検索キーワードがある場合はタイトルに表示する', () => {
    setupDefaultMocks({ query: 'テスト映画' });

    render(<SearchPage />);

    expect(
      screen.getByRole('heading', { name: '「テスト映画」の検索結果' }),
    ).toBeInTheDocument();
  });

  it('本文側に検索入力欄を置き、現在の検索語を初期値にする', () => {
    // SP ではヘッダーの検索欄がトグルの中に隠れるため、ここから打ち直せる
    // ようにしている（#1016）
    setupDefaultMocks({ query: 'テスト映画' });

    render(<SearchPage />);

    expect(screen.getByLabelText('映画を検索')).toHaveValue('テスト映画');
  });

  it('検索キーワードが無いときは本文側の検索入力欄が空になる', () => {
    setupDefaultMocks({ query: undefined });

    render(<SearchPage />);

    expect(screen.getByLabelText('映画を検索')).toHaveValue('');
  });

  it('検索キーワードがない場合は汎用タイトルを表示する', () => {
    setupDefaultMocks({ query: '' });

    render(<SearchPage />);

    expect(
      screen.getByRole('heading', { name: '検索結果' }),
    ).toBeInTheDocument();
  });

  it('SearchResultsコンポーネントにpropsを渡す', () => {
    setupDefaultMocks({
      totalResults: 50,
      currentPage: 3,
    });

    render(<SearchPage />);

    expect(screen.getByTestId('total-results')).toHaveTextContent('50');
    expect(screen.getByTestId('current-page')).toHaveTextContent('3');
  });

  it('SearchResultsコンポーネントが表示される', () => {
    setupDefaultMocks();

    render(<SearchPage />);

    expect(screen.getByTestId('search-results')).toBeInTheDocument();
  });

  it('MovieFilterコンポーネントが表示される', () => {
    setupDefaultMocks();

    render(<SearchPage />);

    expect(screen.getByTestId('movie-filter')).toBeInTheDocument();
  });

  it('フィルタートグルボタンが表示される', () => {
    setupDefaultMocks();

    render(<SearchPage />);

    const toggleButton = screen.getByRole('button', { name: /フィルター/ });
    expect(toggleButton).toBeInTheDocument();
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
  });

  // 表示切替は共通設定（#1014）。この画面にも導線が要る
  it('表示切替のトグルが表示される', () => {
    setupDefaultMocks();

    render(<SearchPage />);

    expect(
      screen.getByRole('button', { name: ARIA_LABELS.SWITCH_TO_LIST_VIEW }),
    ).toBeInTheDocument();
  });

  it('フィルタートグルボタンクリックでaria-expandedが切り替わる', async () => {
    setupDefaultMocks();
    const user = userEvent.setup();

    render(<SearchPage />);

    const toggleButton = screen.getByRole('button', { name: /フィルター/ });
    await user.click(toggleButton);
    expect(toggleButton).toHaveAttribute('aria-expanded', 'true');

    await user.click(toggleButton);
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
  });
});
