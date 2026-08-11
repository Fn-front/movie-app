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

  it('ローディング中はスピナーを表示する', () => {
    render(<TitleSuggestion suggestions={[]} isLoading={true} />);

    expect(screen.getByText('原題を検索中...')).toBeInTheDocument();
  });

  it('複数の候補が全て表示される（境界値: 複数レンダリング）', () => {
    render(
      <TitleSuggestion
        suggestions={['Godzilla Minus One', 'Godzilla', 'Godzilla vs Kong']}
        isLoading={false}
      />,
    );

    expect(screen.getByText('Godzilla Minus One')).toBeInTheDocument();
    expect(screen.getByText('Godzilla')).toBeInTheDocument();
    expect(screen.getByText('Godzilla vs Kong')).toBeInTheDocument();
  });

  it('クリックで原題で再検索する', async () => {
    const user = userEvent.setup();
    render(
      <TitleSuggestion
        suggestions={['The Shawshank Redemption', 'Pumping Iron']}
        isLoading={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Pumping Iron' }));

    expect(mockPush).toHaveBeenCalledWith('/search?query=Pumping%20Iron');
  });

  it('クリック時に候補配列全体を sessionStorage に保存する', async () => {
    const user = userEvent.setup();
    const suggestions = ['The Shawshank Redemption', 'Pumping Iron'];
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');

    render(<TitleSuggestion suggestions={suggestions} isLoading={false} />);

    await user.click(screen.getByRole('button', { name: 'Pumping Iron' }));

    // TITLE_SUGGESTION.STORAGE_KEY に候補全体を JSON.stringify で保存
    expect(setItemSpy).toHaveBeenCalledWith(
      expect.any(String),
      JSON.stringify(suggestions),
    );
    setItemSpy.mockRestore();
  });

  it('境界値: タイトルに特殊文字(スラッシュ/クエスチョン)を含んでも encodeURIComponent される', async () => {
    const user = userEvent.setup();
    render(
      <TitleSuggestion suggestions={['Batman: Year One?']} isLoading={false} />,
    );

    await user.click(screen.getByRole('button', { name: 'Batman: Year One?' }));

    // "?" は %3F, ":" は %3A にエンコードされる
    expect(mockPush).toHaveBeenCalledWith(
      `/search?query=${encodeURIComponent('Batman: Year One?')}`,
    );
  });
});
