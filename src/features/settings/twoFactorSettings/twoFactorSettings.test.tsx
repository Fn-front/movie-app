import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { RECOVERY_CODE_CONFIG } from '@/constants/totp';

import { TwoFactorSettings } from './twoFactorSettings';

// --- Mocks ---

const mockFetch = jest.fn();
global.fetch = mockFetch;

/** 状態取得のレスポンス */
const statusResponse = (enabled: boolean, remaining = 0) => ({
  ok: true,
  status: 200,
  json: async () => ({
    success: true,
    data: { enabled, remainingRecoveryCodes: remaining },
  }),
});

const okResponse = (data: Record<string, unknown>) => ({
  ok: true,
  status: 200,
  json: async () => ({ success: true, data }),
});

const errorResponse = (status: number, message: string) => ({
  ok: false,
  status,
  json: async () => ({ success: false, error: { message } }),
});

const QR_DATA_URI = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=';
const RECOVERY_CODES = Array.from(
  { length: RECOVERY_CODE_CONFIG.COUNT },
  (_, i) => `CODE${i}-ABCDE`,
);

// --- Tests ---

describe('TwoFactorSettings', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('無効な状態', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValueOnce(statusResponse(false));
    });

    it('設定を促すボタンを表示する', async () => {
      render(<TwoFactorSettings />);

      expect(
        await screen.findByRole('button', { name: '二段階認証を設定する' }),
      ).toBeInTheDocument();
    });

    it('設定開始でQRコードと鍵を表示する', async () => {
      mockFetch.mockResolvedValueOnce(
        okResponse({ qrCodeDataUri: QR_DATA_URI, secret: 'ABCDEFGH' }),
      );

      render(<TwoFactorSettings />);
      await user.click(
        await screen.findByRole('button', { name: '二段階認証を設定する' }),
      );

      const qr = await screen.findByRole('img', {
        name: '二段階認証のQRコード',
      });

      expect(qr).toHaveAttribute('src', QR_DATA_URI);
      // QRを読めない端末向けに手入力用の鍵も出す
      expect(screen.getByText('ABCDEFGH')).toBeInTheDocument();
    });

    it('設定開始に失敗したらエラーを表示する', async () => {
      mockFetch.mockResolvedValueOnce(
        errorResponse(400, '二段階認証は既に有効です。'),
      );

      render(<TwoFactorSettings />);
      await user.click(
        await screen.findByRole('button', { name: '二段階認証を設定する' }),
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(
        '二段階認証は既に有効です。',
      );
    });
  });

  describe('設定中', () => {
    /** 設定開始まで進める */
    const startSetup = async () => {
      mockFetch.mockResolvedValueOnce(statusResponse(false));
      mockFetch.mockResolvedValueOnce(
        okResponse({ qrCodeDataUri: QR_DATA_URI, secret: 'ABCDEFGH' }),
      );

      render(<TwoFactorSettings />);
      await user.click(
        await screen.findByRole('button', { name: '二段階認証を設定する' }),
      );
      await screen.findByLabelText('認証コード');
    };

    it('入力したコードで有効化する', async () => {
      await startSetup();
      mockFetch.mockResolvedValueOnce(
        okResponse({ recoveryCodes: RECOVERY_CODES }),
      );

      await user.type(screen.getByLabelText('認証コード'), '123456');
      await user.click(
        screen.getByRole('button', { name: '二段階認証を有効にする' }),
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenLastCalledWith(
          '/api/user/totp/enable',
          expect.objectContaining({ body: JSON.stringify({ code: '123456' }) }),
        );
      });
    });

    it('有効化するとリカバリーコードを表示する', async () => {
      await startSetup();
      mockFetch.mockResolvedValueOnce(
        okResponse({ recoveryCodes: RECOVERY_CODES }),
      );

      await user.type(screen.getByLabelText('認証コード'), '123456');
      await user.click(
        screen.getByRole('button', { name: '二段階認証を有効にする' }),
      );

      expect(await screen.findByText(RECOVERY_CODES[0])).toBeInTheDocument();
      expect(screen.getByText(RECOVERY_CODES.at(-1)!)).toBeInTheDocument();
    });

    it('二度と表示できないことを警告する', async () => {
      // 控えそこねると、認証アプリを失ったときの復旧手段が無くなる
      await startSetup();
      mockFetch.mockResolvedValueOnce(
        okResponse({ recoveryCodes: RECOVERY_CODES }),
      );

      await user.type(screen.getByLabelText('認証コード'), '123456');
      await user.click(
        screen.getByRole('button', { name: '二段階認証を有効にする' }),
      );

      expect(
        await screen.findByText(/二度と表示できません/),
      ).toBeInTheDocument();
    });

    it('誤ったコードならエラーを表示しQRのままにする', async () => {
      await startSetup();
      mockFetch.mockResolvedValueOnce(
        errorResponse(400, '認証コードが正しくありません。'),
      );

      await user.type(screen.getByLabelText('認証コード'), '000000');
      await user.click(
        screen.getByRole('button', { name: '二段階認証を有効にする' }),
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(
        '認証コードが正しくありません。',
      );
      expect(
        screen.getByRole('img', { name: '二段階認証のQRコード' }),
      ).toBeInTheDocument();
    });

    it('やめると最初の状態に戻る', async () => {
      await startSetup();

      await user.click(
        screen.getByRole('button', { name: '二段階認証の設定をやめる' }),
      );

      expect(
        screen.getByRole('button', { name: '二段階認証を設定する' }),
      ).toBeInTheDocument();
      expect(screen.queryByLabelText('認証コード')).not.toBeInTheDocument();
    });
  });

  describe('有効な状態', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValueOnce(statusResponse(true, 7));
    });

    it('有効であることと残数を表示する', async () => {
      render(<TwoFactorSettings />);

      expect(await screen.findByText(/有効/)).toBeInTheDocument();
      expect(screen.getByText(/7 個/)).toBeInTheDocument();
    });

    it('無効化に認証コードを要求する', async () => {
      render(<TwoFactorSettings />);

      await user.type(await screen.findByLabelText('認証コード'), '123456');
      await user.click(
        screen.getByRole('button', { name: '二段階認証を無効にする' }),
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenLastCalledWith(
          '/api/user/totp/disable',
          expect.objectContaining({ body: JSON.stringify({ code: '123456' }) }),
        );
      });
    });

    it('無効化すると最初の状態に戻る', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({}));

      render(<TwoFactorSettings />);
      await user.type(await screen.findByLabelText('認証コード'), '123456');
      await user.click(
        screen.getByRole('button', { name: '二段階認証を無効にする' }),
      );

      expect(
        await screen.findByRole('button', { name: '二段階認証を設定する' }),
      ).toBeInTheDocument();
    });

    it('無効化に失敗したら有効なままエラーを出す', async () => {
      mockFetch.mockResolvedValueOnce(
        errorResponse(400, '認証コードが正しくありません。'),
      );

      render(<TwoFactorSettings />);
      await user.type(await screen.findByLabelText('認証コード'), '000000');
      await user.click(
        screen.getByRole('button', { name: '二段階認証を無効にする' }),
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(
        '認証コードが正しくありません。',
      );
      expect(
        screen.getByRole('button', { name: '二段階認証を無効にする' }),
      ).toBeInTheDocument();
    });

    it('リカバリーコードを再発行できる', async () => {
      mockFetch.mockResolvedValueOnce(
        okResponse({ recoveryCodes: RECOVERY_CODES }),
      );

      render(<TwoFactorSettings />);
      await user.type(await screen.findByLabelText('認証コード'), '123456');
      await user.click(
        screen.getByRole('button', {
          name: `リカバリーコードを${RECOVERY_CODE_CONFIG.COUNT}個再発行する`,
        }),
      );

      expect(await screen.findByText(RECOVERY_CODES[0])).toBeInTheDocument();
    });

    it('控えたあとは有効な状態に戻る', async () => {
      mockFetch.mockResolvedValueOnce(
        okResponse({ recoveryCodes: RECOVERY_CODES }),
      );

      render(<TwoFactorSettings />);
      await user.type(await screen.findByLabelText('認証コード'), '123456');
      await user.click(
        screen.getByRole('button', {
          name: `リカバリーコードを${RECOVERY_CODE_CONFIG.COUNT}個再発行する`,
        }),
      );
      await user.click(
        await screen.findByRole('button', {
          name: 'リカバリーコードを控えた',
        }),
      );

      expect(
        screen.getByRole('button', { name: '二段階認証を無効にする' }),
      ).toBeInTheDocument();
      expect(screen.queryByText(RECOVERY_CODES[0])).not.toBeInTheDocument();
    });
  });

  it('リカバリーコードを使い切っていたら再発行を促す', async () => {
    // 使い切ったまま認証アプリを失うと復旧手段が無くなる
    mockFetch.mockResolvedValueOnce(statusResponse(true, 0));

    render(<TwoFactorSettings />);

    expect(await screen.findByText(/使い切っています/)).toBeInTheDocument();
  });

  it('状態取得に失敗しても画面を壊さない', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network'));

    render(<TwoFactorSettings />);

    expect(
      await screen.findByRole('button', { name: '二段階認証を設定する' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
