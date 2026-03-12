import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SearchBar } from './searchBar';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

describe('SearchBar', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('検索フォームが表示される', () => {
    render(<SearchBar />);
    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(screen.getByLabelText('映画を検索')).toBeInTheDocument();
    expect(screen.getByLabelText('検索')).toBeInTheDocument();
  });

  it('プレースホルダーが表示される', () => {
    render(<SearchBar placeholder='テスト検索...' />);
    expect(screen.getByPlaceholderText('テスト検索...')).toBeInTheDocument();
  });

  it('デフォルトのプレースホルダーが表示される', () => {
    render(<SearchBar />);
    expect(screen.getByPlaceholderText('映画を検索...')).toBeInTheDocument();
  });

  it('defaultValueが初期値として設定される', () => {
    render(<SearchBar defaultValue='アベンジャーズ' />);
    expect(screen.getByLabelText('映画を検索')).toHaveValue('アベンジャーズ');
  });

  it('テキスト入力ができる', async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    const input = screen.getByLabelText('映画を検索');
    await user.type(input, 'スパイダーマン');
    expect(input).toHaveValue('スパイダーマン');
  });

  it('Enter押下で検索ページに遷移する', async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    const input = screen.getByLabelText('映画を検索');
    await user.type(input, 'バットマン');
    await user.keyboard('{Enter}');
    expect(mockPush).toHaveBeenCalledWith(
      '/search?query=%E3%83%90%E3%83%83%E3%83%88%E3%83%9E%E3%83%B3',
    );
  });

  it('検索ボタンクリックで検索ページに遷移する', async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    const input = screen.getByLabelText('映画を検索');
    await user.type(input, 'バットマン');
    const button = screen.getByLabelText('検索');
    await user.click(button);
    expect(mockPush).toHaveBeenCalledWith(
      '/search?query=%E3%83%90%E3%83%83%E3%83%88%E3%83%9E%E3%83%B3',
    );
  });

  it('空文字では検索できない', () => {
    render(<SearchBar />);
    const form = screen.getByRole('search');
    fireEvent.submit(form);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('空白のみでは検索できない', async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    const input = screen.getByLabelText('映画を検索');
    await user.type(input, '   ');
    await user.keyboard('{Enter}');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('空文字の場合、検索ボタンがdisabledになる', () => {
    render(<SearchBar />);
    const button = screen.getByLabelText('検索');
    expect(button).toBeDisabled();
  });

  it('テキスト入力後、検索ボタンがenabledになる', async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    const input = screen.getByLabelText('映画を検索');
    await user.type(input, 'テスト');
    const button = screen.getByLabelText('検索');
    expect(button).toBeEnabled();
  });

  it('カスタムクラス名が適用される', () => {
    render(<SearchBar className='custom-class' />);
    const form = screen.getByRole('search');
    expect(form.className).toContain('custom-class');
  });

  it('検索クエリがURLエンコードされる', async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    const input = screen.getByLabelText('映画を検索');
    await user.type(input, 'test & query');
    await user.keyboard('{Enter}');
    expect(mockPush).toHaveBeenCalledWith('/search?query=test%20%26%20query');
  });

  it('前後の空白がトリムされて検索される', async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    const input = screen.getByLabelText('映画を検索');
    await user.type(input, '  バットマン  ');
    await user.keyboard('{Enter}');
    expect(mockPush).toHaveBeenCalledWith(
      '/search?query=%E3%83%90%E3%83%83%E3%83%88%E3%83%9E%E3%83%B3',
    );
  });
});
