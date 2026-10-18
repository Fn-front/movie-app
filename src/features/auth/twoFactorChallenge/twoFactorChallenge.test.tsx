import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TwoFactorChallenge } from './twoFactorChallenge';

// --- Mocks ---

const mockPush = jest.fn();
const mockRefresh = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

const mockUpdate = jest.fn();
jest.mock('next-auth/react', () => ({
  useSession: () => ({ update: mockUpdate }),
}));

// --- Tests ---

describe('TwoFactorChallenge', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /** 認証コードを入力して確認を押す */
  const submitCode = async (code: string) => {
    await user.type(screen.getByLabelText('認証コード'), code);
    await user.click(screen.getByRole('button', { name: '認証コードを確認' }));
  };

  it('入力欄と説明を表示する', () => {
    render(<TwoFactorChallenge />);

    expect(
      screen.getByRole('heading', { name: '二段階認証' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('認証コード')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '認証コードを確認' }),
    ).toBeInTheDocument();
  });

  it('リカバリーコードでも進めることを案内する', () => {
    // 認証アプリを失った利用者がここで詰まないようにする
    render(<TwoFactorChallenge />);

    expect(screen.getByText(/リカバリーコード/)).toBeInTheDocument();
  });

  it('入力したコードをサーバーへ渡す', async () => {
    mockUpdate.mockResolvedValue({ totpPending: false });

    render(<TwoFactorChallenge />);
    await submitCode('123456');

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({ totpCode: '123456' });
    });
  });

  it('前後の空白を落として渡す', async () => {
    mockUpdate.mockResolvedValue({ totpPending: false });

    render(<TwoFactorChallenge />);
    await submitCode('  123456  ');

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({ totpCode: '123456' });
    });
  });

  it('検証に成功すると戻り先へ遷移する', async () => {
    mockUpdate.mockResolvedValue({ totpPending: false });

    render(<TwoFactorChallenge callbackUrl='/watchlist' />);
    await submitCode('123456');

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/watchlist');
    });
  });

  it('戻り先が無ければホームへ遷移する', async () => {
    mockUpdate.mockResolvedValue({ totpPending: false });

    render(<TwoFactorChallenge />);
    await submitCode('123456');

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });

  it('外部URLの戻り先は拒否してホームへ遷移する', async () => {
    // オープンリダイレクトを踏ませない
    mockUpdate.mockResolvedValue({ totpPending: false });

    render(<TwoFactorChallenge callbackUrl='https://evil.com/steal' />);
    await submitCode('123456');

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });

  it('検証に失敗するとエラーを表示し遷移しない', async () => {
    mockUpdate.mockResolvedValue({ totpPending: true });

    render(<TwoFactorChallenge />);
    await submitCode('000000');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '認証コードが正しくありません。',
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('検証に失敗したら入力欄を空にする', async () => {
    mockUpdate.mockResolvedValue({ totpPending: true });

    render(<TwoFactorChallenge />);
    await submitCode('000000');

    await waitFor(() => {
      expect(screen.getByLabelText('認証コード')).toHaveValue('');
    });
  });

  it('更新が例外になってもエラーを表示する', async () => {
    mockUpdate.mockRejectedValue(new Error('network'));

    render(<TwoFactorChallenge />);
    await submitCode('123456');

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('セッションが返らない場合もエラーとして扱う', async () => {
    mockUpdate.mockResolvedValue(null);

    render(<TwoFactorChallenge />);
    await submitCode('123456');

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('未入力では送信しない', async () => {
    render(<TwoFactorChallenge />);

    await user.click(screen.getByRole('button', { name: '認証コードを確認' }));

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('空白だけの入力では送信しない', async () => {
    render(<TwoFactorChallenge />);
    await submitCode('   ');

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('失敗の内訳を画面に出さない', async () => {
    // 不正 / 使い回し / 試行上限 を区別すると、総当たりする側に手がかりを与える
    mockUpdate.mockResolvedValue({ totpPending: true });

    render(<TwoFactorChallenge />);
    await submitCode('000000');

    const alert = await screen.findByRole('alert');

    expect(alert).not.toHaveTextContent('使用済み');
    expect(alert).not.toHaveTextContent('しばらく時間をおいて');
  });
});
