/**
 * SearchPageコンポーネントのテスト
 */

import { render, screen } from '@testing-library/react';

import { SearchPage } from './searchPage';
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

jest.mock(
  '@/features/search/component/movieFilter/movieFilter',
  () => ({
    MovieFilter: jest.fn(() => <div data-testid='movie-filter' />),
  }),
);

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

  it('検索キーワードがある場合はタイトルに表示する', () => {
    setupDefaultMocks({ query: 'テスト映画' });

    render(<SearchPage />);

    expect(
      screen.getByRole('heading', { name: '「テスト映画」の検索結果' }),
    ).toBeInTheDocument();
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
});
