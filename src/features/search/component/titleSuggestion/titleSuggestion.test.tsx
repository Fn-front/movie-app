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

  it('候補ありの場合にプレフィックスとボタンを表示する', () => {
    render(
      <TitleSuggestion
        suggestions={['The Shawshank Redemption', 'Shawshank']}
        isLoading={false}
      />,
    );

    expect(screen.getByText('もしかして:')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'The Shawshank Redemption' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Shawshank' }),
    ).toBeInTheDocument();
  });

  it('候補が空配列の場合は何も表示しない', () => {
    const { container } = render(
      <TitleSuggestion suggestions={[]} isLoading={false} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('ローディング中は何も表示しない', () => {
    const { container } = render(
      <TitleSuggestion suggestions={[]} isLoading={true} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('クリックで原題で再検索する', async () => {
    const user = userEvent.setup();
    render(
      <TitleSuggestion
        suggestions={['The Shawshank Redemption', 'Pumping Iron']}
        isLoading={false}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Pumping Iron' }),
    );

    expect(mockPush).toHaveBeenCalledWith(
      '/search?query=Pumping%20Iron',
    );
  });
});
