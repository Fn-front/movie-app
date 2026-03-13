/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react';

import Error from './error';

// --- Tests ---

describe('Error', () => {
  const mockReset = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('エラーメッセージが表示される', () => {
    const error = Object.assign(new global.Error('テストエラー'), {
      digest: undefined,
    });
    render(<Error error={error} reset={mockReset} />);
    expect(screen.getByText('エラーが発生しました')).toBeInTheDocument();
    expect(
      screen.getByText('申し訳ございません。予期しないエラーが発生しました。'),
    ).toBeInTheDocument();
  });

  it('もう一度試すボタンでresetが呼ばれる', () => {
    const error = Object.assign(new global.Error('テストエラー'), {
      digest: undefined,
    });
    render(<Error error={error} reset={mockReset} />);
    fireEvent.click(screen.getByRole('button', { name: 'もう一度試す' }));
    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  it('digestがある場合エラーIDが表示される', () => {
    const error = Object.assign(new global.Error('テストエラー'), {
      digest: 'abc123',
    });
    render(<Error error={error} reset={mockReset} />);
    expect(screen.getByText('エラーID: abc123')).toBeInTheDocument();
  });

  it('digestがない場合エラーIDが表示されない', () => {
    const error = Object.assign(new global.Error('テストエラー'), {
      digest: undefined,
    });
    render(<Error error={error} reset={mockReset} />);
    expect(screen.queryByText(/エラーID:/)).not.toBeInTheDocument();
  });
});
