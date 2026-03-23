import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AwardSection } from './awardSection';
import type { AwardData } from '@/features/awards/types';

// --- Mocks ---

jest.mock(
  '@/features/awards/awardCategorySection/awardCategorySection',
  () => ({
    AwardCategorySection: ({
      category,
      awardName,
    }: {
      category: { category: string; label: string };
      awardName: string;
    }) => (
      <div
        data-testid={`category-${category.category}`}
        id={`category-${awardName}-${category.category}`}
      >
        {category.label}
      </div>
    ),
  }),
);

// --- Helpers ---

const createMockAward = (overrides: Partial<AwardData> = {}): AwardData => ({
  awardName: 'academy_awards',
  label: 'アカデミー賞',
  categories: [
    {
      category: 'best_picture',
      label: '作品賞',
      winner: null,
      nominees: [],
    },
    {
      category: 'best_director',
      label: '監督賞',
      winner: null,
      nominees: [],
    },
  ],
  ...overrides,
});

const defaultProps = {
  onMovieClick: jest.fn(),
  isInWatchlist: jest.fn().mockReturnValue(false),
  onWatchlistToggle: jest.fn(),
  isMovieToggling: jest.fn().mockReturnValue(false),
  onFavoriteToggle: jest.fn(),
  isFavoriteProcessing: jest.fn().mockReturnValue(false),
};

// --- Tests ---

describe('AwardSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('賞名がh2で表示される', () => {
    const award = createMockAward();

    render(<AwardSection award={award} {...defaultProps} />);

    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent('アカデミー賞');
  });

  it('aria-labelに賞名が設定される', () => {
    const award = createMockAward();

    render(<AwardSection award={award} {...defaultProps} />);

    const section = screen.getByRole('region', { name: 'アカデミー賞' });
    expect(section).toBeInTheDocument();
  });

  it('カテゴリごとにAwardCategorySectionが表示される', () => {
    const award = createMockAward();

    render(<AwardSection award={award} {...defaultProps} />);

    expect(screen.getByTestId('category-best_picture')).toBeInTheDocument();
    expect(screen.getByTestId('category-best_director')).toBeInTheDocument();
  });

  it('カテゴリが空の場合もレンダリングされる', () => {
    const award = createMockAward({ categories: [] });

    render(<AwardSection award={award} {...defaultProps} />);

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'アカデミー賞',
    );
    expect(
      screen.queryByTestId('category-best_picture'),
    ).not.toBeInTheDocument();
  });

  it('カテゴリナビゲーションが表示される', () => {
    const award = createMockAward();

    render(<AwardSection award={award} {...defaultProps} />);

    const nav = screen.getByRole('navigation', {
      name: 'アカデミー賞カテゴリナビゲーション',
    });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '作品賞' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '監督賞' })).toBeInTheDocument();
  });

  it('ナビゲーションボタンをクリックするとscrollIntoViewが呼ばれる', async () => {
    const user = userEvent.setup();
    const award = createMockAward();
    const mockScrollIntoView = jest.fn();

    render(<AwardSection award={award} {...defaultProps} />);

    const targetElement = document.getElementById(
      'category-academy_awards-best_director',
    );
    expect(targetElement).not.toBeNull();
    targetElement!.scrollIntoView = mockScrollIntoView;

    await user.click(screen.getByRole('button', { name: '監督賞' }));

    expect(mockScrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    });
  });
});
