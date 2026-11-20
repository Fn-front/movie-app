import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { RECOVERY_CODE_CONFIG } from '@/constants/totp';
import {
  SECOND_FACTOR_MESSAGES,
  SECOND_FACTOR_METHOD,
} from '@/constants/secondFactor';

import { TwoFactorSettings } from './twoFactorSettings';

// --- Mocks ---

const mockFetch = jest.fn();
global.fetch = mockFetch;

/** 状態取得のレスポンス */
const statusResponse = (
  enabled: boolean,
  remaining = 0,
  overrides: Record<string, unknown> = {},
) => ({
  ok: true,
  status: 200,
  json: async () => ({
    success: true,
    data: {
      enabled,
      method: enabled ? SECOND_FACTOR_METHOD.TOTP : null,
      emailOtpAvailable: true,
      remainingRecoveryCodes: remaining,
      ...overrides,
    },
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
        await screen.findByRole('button', { name: '認証アプリで設定する' }),
      ).toBeInTheDocument();
    });

    it('設定開始でQRコードと鍵を表示する', async () => {
      mockFetch.mockResolvedValueOnce(
        okResponse({ qrCodeDataUri: QR_DATA_URI, secret: 'ABCDEFGH' }),
      );

      render(<TwoFactorSettings />);
      await user.click(
        await screen.findByRole('button', { name: '認証アプリで設定する' }),
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
        await screen.findByRole('button', { name: '認証アプリで設定する' }),
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
        await screen.findByRole('button', { name: '認証アプリで設定する' }),
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
        screen.getByRole('button', { name: '認証アプリで設定する' }),
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
        await screen.findByRole('button', { name: '認証アプリで設定する' }),
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
          name: 'リカバリーコードを再発行する',
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
          name: 'リカバリーコードを再発行する',
        }),
      );
      await user.click(
        await screen.findByRole('button', {
          name: 'リカバリーコードを控えました',
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
      await screen.findByRole('button', { name: '認証アプリで設定する' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  describe('方式の選択', () => {
    const user = userEvent.setup();

    it('無効のとき、方式を選ぶボタンが2つ出る', async () => {
      mockFetch.mockResolvedValueOnce(statusResponse(false));

      render(<TwoFactorSettings />);

      expect(
        await screen.findByRole('button', { name: '認証アプリで設定する' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'メールで設定する' }),
      ).toBeInTheDocument();
    });

    it('メールOTP には安全性の注意を添える', async () => {
      mockFetch.mockResolvedValueOnce(statusResponse(false));

      render(<TwoFactorSettings />);
      await screen.findByRole('button', { name: 'メールで設定する' });

      expect(
        screen.getByText(/認証アプリより安全性が下がります/),
      ).toBeInTheDocument();
    });

    /**
     * ⚠️ admin が発行したアカウントは `users.email` が `.invalid` TLD
     * （RFC 2606、絶対に名前解決されない）。選ばせるとコードが永久に届かない。
     */
    it('emailOtpAvailable が false ならメールの選択肢を出さない', async () => {
      mockFetch.mockResolvedValueOnce(
        statusResponse(false, 0, { emailOtpAvailable: false }),
      );

      render(<TwoFactorSettings />);

      expect(
        await screen.findByRole('button', { name: '認証アプリで設定する' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'メールで設定する' }),
      ).not.toBeInTheDocument();
    });

    it('メールを選ぶとコード入力画面になる（QRは出さない）', async () => {
      mockFetch
        .mockResolvedValueOnce(statusResponse(false))
        .mockResolvedValueOnce(okResponse({ method: 'email_otp' }));

      render(<TwoFactorSettings />);
      await user.click(
        await screen.findByRole('button', { name: 'メールで設定する' }),
      );

      expect(
        await screen.findByText(/確認コードを送りました/),
      ).toBeInTheDocument();
      expect(
        screen.queryByAltText('二段階認証のQRコード'),
      ).not.toBeInTheDocument();
    });

    it('設定開始のリクエストに方式を載せる', async () => {
      mockFetch
        .mockResolvedValueOnce(statusResponse(false))
        .mockResolvedValueOnce(okResponse({ method: 'email_otp' }));

      render(<TwoFactorSettings />);
      await user.click(
        await screen.findByRole('button', { name: 'メールで設定する' }),
      );

      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/user/totp/setup',
        expect.objectContaining({
          body: JSON.stringify({ method: 'email_otp' }),
        }),
      );
    });

    /**
     * ⚠️ フォーカス位置だけを見ない（#1287）。
     *
     * もとは `user.tab()` 1回のあとフォーカスを確認するだけで、**Enter で
     * 実行できるか**も**どの方式が送られるか**も見ていなかった。
     * ボタンの `onClick` を外しても通る状態。
     *
     * 両方の選択肢に Tab で到達でき、Enter で**その方式の**設定が始まる
     * ところまで固定する。
     */
    it('キーボードだけで方式を選べる（Tab で到達し Enter で始まる）', async () => {
      mockFetch
        .mockResolvedValueOnce(statusResponse(false))
        .mockResolvedValueOnce(okResponse({ method: 'email_otp' }));

      render(<TwoFactorSettings />);
      await screen.findByRole('button', { name: '認証アプリで設定する' });

      await user.tab();
      expect(
        screen.getByRole('button', { name: '認証アプリで設定する' }),
      ).toHaveFocus();

      // 2つ目の選択肢にも Tab だけで到達できる
      await user.tab();
      expect(
        screen.getByRole('button', { name: 'メールで設定する' }),
      ).toHaveFocus();

      await user.keyboard('{Enter}');

      // フォーカスしていた方式がそのまま送られる（取り違えない）
      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/user/totp/setup',
        expect.objectContaining({
          body: JSON.stringify({ method: 'email_otp' }),
        }),
      );
      // 画面も進む。リクエストが飛ぶだけで止まっていないこと
      expect(
        await screen.findByText(/確認コードを送りました/),
      ).toBeInTheDocument();
    });
  });

  /**
   * 設定中（メールOTP）の再送（#1285）
   *
   * これが無いと、コードの試行回数（5回）を使い切った利用者は
   * 「やめる → メールで設定する」でやり直すしかない。60秒以内だと
   * 再送間隔に当たって1通も届かないまま同じ画面に戻るため、
   * 最大60秒のあいだ何をしても進めない窓ができていた。
   */
  describe('設定中（メールOTP）の再送', () => {
    /** メールOTP の設定中画面まで進める */
    const enterSetupEmail = async (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      clickUser: any,
      setupResponse: Record<string, unknown> = {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { method: 'email_otp', throttled: false },
          message: SECOND_FACTOR_MESSAGES.CODE_SENT,
        }),
      },
    ) => {
      mockFetch
        .mockResolvedValueOnce(statusResponse(false))
        .mockResolvedValueOnce(setupResponse);

      render(<TwoFactorSettings />);
      await clickUser.click(
        await screen.findByRole('button', { name: 'メールで設定する' }),
      );
    };

    it('再送ボタンを出す', async () => {
      await enterSetupEmail(user);

      expect(
        await screen.findByRole('button', { name: '確認コードを再送信する' }),
      ).toBeInTheDocument();
    });

    /**
     * ⚠️ サーバー側の再送間隔（60秒）より先に押させない。
     * 押せても `THROTTLED` で1通も送られないので、押せる顔をしているほうが
     * 不親切（この Issue の元の症状と同じ誤解を生む）。
     */
    it('カウントダウン中は押せず、残り秒数を出す', async () => {
      await enterSetupEmail(user);

      expect(
        await screen.findByRole('button', { name: '確認コードを再送信する' }),
      ).toBeDisabled();
      expect(screen.getByText(/再送信できるまで \d+ 秒/)).toBeInTheDocument();
    });

    it('60秒経つと押せるようになり、setup を叩き直す', async () => {
      jest.useFakeTimers();
      const timerUser = userEvent.setup({
        advanceTimers: jest.advanceTimersByTime,
      });

      try {
        await enterSetupEmail(timerUser);
        await screen.findByRole('button', { name: '確認コードを再送信する' });

        await act(async () => {
          jest.advanceTimersByTime(60_000);
        });

        const resendButton = screen.getByRole('button', {
          name: '確認コードを再送信する',
        });
        expect(resendButton).toBeEnabled();
        expect(screen.getByText('再送信できます。')).toBeInTheDocument();

        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: { method: 'email_otp', throttled: false },
            message: SECOND_FACTOR_MESSAGES.CODE_SENT,
          }),
        });

        await timerUser.click(resendButton);

        // ⚠️ send-challenge ではなく setup。あちらは confirmed_at が
        // 立っていないと何も送れない
        expect(mockFetch).toHaveBeenLastCalledWith(
          '/api/user/totp/setup',
          expect.objectContaining({
            body: JSON.stringify({ method: 'email_otp' }),
          }),
        );
        expect(
          await screen.findByText(SECOND_FACTOR_MESSAGES.CODE_SENT),
        ).toBeInTheDocument();
      } finally {
        jest.useRealTimers();
      }
    });

    /**
     * ⚠️ ここがこの Issue の本体。
     *
     * 再送間隔に当たると `setup` は 200 を返すが**1通も送っていない**。
     * 「確認コードを送りました」のままだと、利用者は届かないコードを
     * 待ち続けるか、受信箱の古いコードを入れて弾かれ続ける。
     */
    it('再送間隔に当たったら「送信しました」と言わない', async () => {
      await enterSetupEmail(user, {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { method: 'email_otp', throttled: true },
          message: SECOND_FACTOR_MESSAGES.CODE_ALREADY_SENT,
        }),
      });

      expect(
        await screen.findByText(SECOND_FACTOR_MESSAGES.CODE_ALREADY_SENT),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(SECOND_FACTOR_MESSAGES.CODE_SENT),
      ).not.toBeInTheDocument();
    });
  });

  describe('有効な状態（メールOTP）', () => {
    const user = userEvent.setup();

    const enabledEmailOtp = (remaining = 7) =>
      statusResponse(true, remaining, { method: 'email_otp' });

    /**
     * ⚠️ これが無いと、メールOTP の利用者はコードを取得できず
     * 無効化もリカバリーコード再発行もできなくなる。
     */
    it('コードを送信するボタンを出す', async () => {
      mockFetch.mockResolvedValueOnce(enabledEmailOtp());

      render(<TwoFactorSettings />);

      expect(
        await screen.findByRole('button', {
          name: '二段階認証の確認コードを送信',
        }),
      ).toBeInTheDocument();
    });

    it('認証アプリの利用者には送信ボタンを出さない', async () => {
      mockFetch.mockResolvedValueOnce(statusResponse(true, 7));

      render(<TwoFactorSettings />);
      await screen.findByRole('button', { name: '二段階認証を無効にする' });

      expect(
        screen.queryByRole('button', { name: '二段階認証の確認コードを送信' }),
      ).not.toBeInTheDocument();
    });

    it('送信ボタンで send-challenge を叩く', async () => {
      mockFetch
        .mockResolvedValueOnce(enabledEmailOtp())
        .mockResolvedValueOnce(okResponse({}));

      render(<TwoFactorSettings />);
      await user.click(
        await screen.findByRole('button', {
          name: '二段階認証の確認コードを送信',
        }),
      );

      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/user/totp/send-challenge',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('送信上限のエラーを表示する', async () => {
      mockFetch
        .mockResolvedValueOnce(enabledEmailOtp())
        .mockResolvedValueOnce(
          errorResponse(
            429,
            '確認コードの送信回数が上限に達しました。リカバリーコードを入力してログインしてください。',
          ),
        );

      render(<TwoFactorSettings />);
      await user.click(
        await screen.findByRole('button', {
          name: '二段階認証の確認コードを送信',
        }),
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(
        /リカバリーコード/,
      );
    });

    it('方式に合わせて文言を変える', async () => {
      mockFetch.mockResolvedValueOnce(enabledEmailOtp());

      render(<TwoFactorSettings />);

      expect(await screen.findByText(/メールのコード/)).toBeInTheDocument();
    });
  });

  /**
   * ⚠️ コード送信は画面の状態を変えない。これが無いと利用者は
   * 送られたのかどうか分からない。
   */
  it('コードを送信したことを画面で伝える', async () => {
    const user = userEvent.setup();
    mockFetch
      .mockResolvedValueOnce(statusResponse(true, 7, { method: 'email_otp' }))
      .mockResolvedValueOnce(okResponse({}));

    render(<TwoFactorSettings />);
    await user.click(
      await screen.findByRole('button', {
        name: '二段階認証の確認コードを送信',
      }),
    );

    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent('確認コードをメールに送信しました。');
  });

  it('送信に失敗したら完了の文言を出さない', async () => {
    const user = userEvent.setup();
    mockFetch
      .mockResolvedValueOnce(statusResponse(true, 7, { method: 'email_otp' }))
      .mockResolvedValueOnce(errorResponse(500, '送信できませんでした'));

    render(<TwoFactorSettings />);
    await user.click(
      await screen.findByRole('button', {
        name: '二段階認証の確認コードを送信',
      }),
    );

    await screen.findByRole('alert');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
