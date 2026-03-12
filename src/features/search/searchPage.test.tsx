/**
 * SearchPageコンポーネントのテスト
 */

import { render, screen } from '@testing-library/react';

import { SearchPage } from './searchPage';
import type { UseSearchReturn } from './hooks/useSearch';

// --- Mocks ---
const mockUseSearch = jest.fn<UseSearchReturn, []>();

jest.mock('./hooks/useSearch', () => ({
  useSearch: () => mockUseSearch(),
}));

jest.mock('@/features/search/component/searchResults/searchResults', () => ({
  SearchResults: jest.fn((props) => (
    <div data-testid='search-results'>
      <span data-testid='total-results'>{props.totalResults}</span>
      <span data-testid='current-page'>{props.currentPage}</span>
    </div>
  )),
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
    ...overrides,
  };
}

// --- Tests ---
describe('SearchPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('検索キーワードがある場合はタイトルに表示する', () => {
    mockUseSearch.mockReturnValue(
      createMockUseSearchReturn({ query: 'テスト映画' }),
    );

    render(<SearchPage />);

    expect(
      screen.getByRole('heading', { name: '「テスト映画」の検索結果' }),
    ).toBeInTheDocument();
  });

  it('検索キーワードがない場合は汎用タイトルを表示する', () => {
    mockUseSearch.mockReturnValue(createMockUseSearchReturn({ query: '' }));

    render(<SearchPage />);

    expect(
      screen.getByRole('heading', { name: '検索結果' }),
    ).toBeInTheDocument();
  });

  it('SearchResultsコンポーネントにpropsを渡す', () => {
    mockUseSearch.mockReturnValue(
      createMockUseSearchReturn({
        totalResults: 50,
        currentPage: 3,
      }),
    );

    render(<SearchPage />);

    expect(screen.getByTestId('total-results')).toHaveTextContent('50');
    expect(screen.getByTestId('current-page')).toHaveTextContent('3');
  });

  it('SearchResultsコンポーネントが表示される', () => {
    mockUseSearch.mockReturnValue(createMockUseSearchReturn());

    render(<SearchPage />);

    expect(screen.getByTestId('search-results')).toBeInTheDocument();
  });
});
