/**
 * TitleSuggestionコンポーネントのテスト
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TitleSuggestion } from './titleSuggestion';

// --- Mocks ---
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// --- Tests ---
describe('TitleSuggestion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('提案ありの場合にリンクを表示する', () => {
    render(
      <TitleSuggestion
        suggestion='The Shawshank Redemption'
        isLoading={false}
      />,
    );

    expect(
      screen.getByText('The Shawshank Redemption'),
    ).toBeInTheDocument();
    expect(screen.getByText('ですか？')).toBeInTheDocument();
  });

  it('提案なしの場合は何も表示しない', () => {
    const { container } = render(
      <TitleSuggestion suggestion={null} isLoading={false} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('ローディング中は何も表示しない', () => {
    const { container } = render(
      <TitleSuggestion suggestion={null} isLoading={true} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('クリックで原題で再検索する', async () => {
    const user = userEvent.setup();
    render(
      <TitleSuggestion
        suggestion='The Shawshank Redemption'
        isLoading={false}
      />,
    );

    await user.click(
      screen.getByRole('button'),
    );

    expect(mockPush).toHaveBeenCalledWith(
      '/search?query=The%20Shawshank%20Redemption',
    );
  });
});
