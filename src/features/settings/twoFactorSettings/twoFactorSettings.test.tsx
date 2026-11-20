import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { RECOVERY_CODE_CONFIG, TOTP_ERROR_MESSAGES } from '@/constants/totp';
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

  /**
   * 再認証の材料を入れる（#1368）
   *
   * ⛔ これが無いと「設定する」ボタンが押せない。セッションだけで第2要素を
   * 自己登録できた穴を塞いだため（`totp/setup` が再認証を要求する）。
   */
  const enterReauthPassword = async () => {
    await user.type(await screen.findByLabelText('現在のパスワード'), 'pw');
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // ⚠️ `clearAllMocks` は **`mockResolvedValueOnce` のキューを消さない**。
    //    押せないボタンをクリックしたテストが使い残した応答が次のテストへ
    //    漏れ、無関係なテストが「状態の取得」の応答を取り違える
    mockFetch.mockReset();
  });

  describe('無効な状態', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValueOnce(statusResponse(false));
    });

    it('設定を促すボタンを表示する', async () => {
      render(<TwoFactorSettings hasPassword />);

      expect(
        await screen.findByRole('button', { name: '認証アプリで設定する' }),
      ).toBeInTheDocument();
    });

    it('設定開始でQRコードと鍵を表示する', async () => {
      mockFetch.mockResolvedValueOnce(
        okResponse({ qrCodeDataUri: QR_DATA_URI, secret: 'ABCDEFGH' }),
      );

      render(<TwoFactorSettings hasPassword />);
      await enterReauthPassword();
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

      render(<TwoFactorSettings hasPassword />);
      await enterReauthPassword();
      await user.click(
        await screen.findByRole('button', { name: '認証アプリで設定する' }),
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(
        '二段階認証は既に有効です。',
      );
    });
  });

  /**
   * ⛔ **ここが #1368 の本体。**
   *
   * `totp/setup` も `totp/enable` も `getAuthSession()` 以外に何も要求して
   * いなかったため、セッションを奪った第三者が2手で**被害者のアカウントに
   * 自分の第2要素を登録できた**（被害者にはメールが1通も届かない）。
   */
  describe('再認証', () => {
    it('パスワードを持つ利用者には現在のパスワードを求める', async () => {
      mockFetch.mockResolvedValueOnce(statusResponse(false));

      render(<TwoFactorSettings hasPassword />);

      expect(
        await screen.findByLabelText('現在のパスワード'),
      ).toBeInTheDocument();
      expect(screen.queryByLabelText('確認コード')).not.toBeInTheDocument();
    });

    /**
     * ⛔ **E2E がこの名前で欄を絞っている**（`e2e/helpers/totp.ts` の
     * `reauthForSecondFactorSetup`）。同じ設定画面のメールアドレス変更にも
     * 『現在のパスワード』があり、名前が無いと strict mode 違反になる。
     *
     * 支援技術でも同じ問題が起きる（どちらの欄か読み上げでは分からない）。
     */
    it('入力欄に名前付きのグループを付ける', async () => {
      mockFetch.mockResolvedValueOnce(statusResponse(false));

      render(<TwoFactorSettings hasPassword />);

      const group = await screen.findByRole('group', {
        name: '二段階認証の設定の本人確認',
      });

      expect(
        within(group).getByLabelText('現在のパスワード'),
      ).toBeInTheDocument();
    });

    /**
     * ⚠️ パスワードを持たない利用者（OAuth のみ）は照合する材料が無い。
     * 登録アドレスへ送る使い捨てコードで受信箱の所持を確かめる。
     */
    it('パスワードを持たない利用者には確認コードを求める', async () => {
      mockFetch.mockResolvedValueOnce(statusResponse(false));

      render(<TwoFactorSettings hasPassword={false} />);

      expect(await screen.findByLabelText('確認コード')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: '確認コードを送る' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByLabelText('現在のパスワード'),
      ).not.toBeInTheDocument();
    });

    it('材料を入れるまで設定を始められない', async () => {
      mockFetch.mockResolvedValueOnce(statusResponse(false));

      render(<TwoFactorSettings hasPassword />);

      expect(
        await screen.findByRole('button', { name: '認証アプリで設定する' }),
      ).toBeDisabled();

      await enterReauthPassword();

      expect(
        screen.getByRole('button', { name: '認証アプリで設定する' }),
      ).not.toBeDisabled();
    });

    it('入力したパスワードをリクエストに載せる', async () => {
      mockFetch
        .mockResolvedValueOnce(statusResponse(false))
        .mockResolvedValueOnce(
          okResponse({ qrCodeDataUri: QR_DATA_URI, secret: 'ABCDEFGH' }),
        );

      render(<TwoFactorSettings hasPassword />);
      await enterReauthPassword();
      await user.click(
        screen.getByRole('button', { name: '認証アプリで設定する' }),
      );

      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/user/totp/setup',
        expect.objectContaining({
          body: JSON.stringify({ method: 'totp', currentPassword: 'pw' }),
        }),
      );
    });

    it('入力した確認コードをリクエストに載せる', async () => {
      mockFetch
        .mockResolvedValueOnce(statusResponse(false))
        .mockResolvedValueOnce(
          okResponse({ qrCodeDataUri: QR_DATA_URI, secret: 'ABCDEFGH' }),
        );

      render(<TwoFactorSettings hasPassword={false} />);
      await user.type(await screen.findByLabelText('確認コード'), '123456');
      await user.click(
        screen.getByRole('button', { name: '認証アプリで設定する' }),
      );

      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/user/totp/setup',
        expect.objectContaining({
          body: JSON.stringify({ method: 'totp', reauthCode: '123456' }),
        }),
      );
    });

    /**
     * ⛔ **宛先を載せない。** 受け付ける形にすると、アカウントを1つ持つだけで
     * 任意のアドレスへ自サービス名義のコードを送れる（#641）。
     */
    it('確認コードの送信は専用のエンドポイントへ本文なしで投げる', async () => {
      mockFetch
        .mockResolvedValueOnce(statusResponse(false))
        .mockResolvedValueOnce(okResponse({}));

      render(<TwoFactorSettings hasPassword={false} />);
      await user.click(
        await screen.findByRole('button', { name: '確認コードを送る' }),
      );

      const [url, init] = (mockFetch as jest.Mock).mock.calls.at(-1) as [
        string,
        { method?: string; body?: unknown },
      ];

      expect(url).toBe('/api/user/totp/reauth-code');
      expect(init.method).toBe('POST');
      expect(init.body).toBeUndefined();
    });
  });

  describe('設定中', () => {
    /** 設定開始まで進める */
    const startSetup = async () => {
      mockFetch.mockResolvedValueOnce(statusResponse(false));
      mockFetch.mockResolvedValueOnce(
        okResponse({ qrCodeDataUri: QR_DATA_URI, secret: 'ABCDEFGH' }),
      );

      render(<TwoFactorSettings hasPassword />);
      await enterReauthPassword();
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

    /**
     * ⛔ **設定の期限切れは画面も戻す**（#1368 の2回目レビュー）。
     *
     * 文言だけ出して設定画面に留まると、利用者は同じ画面で再送と入力を
     * 繰り返す。保留行はサーバー側でもう消えているので、やり直すしか道が
     * 無い。繰り返すたび `TOTP_SETTINGS_VERIFY` を消費し、5回で設定操作が
     * まとめて15分 429 になる。
     */
    it('設定の期限切れなら方式の選択へ戻す', async () => {
      await startSetup();
      mockFetch.mockResolvedValueOnce(
        errorResponse(400, TOTP_ERROR_MESSAGES.SETUP_EXPIRED),
      );

      await user.type(screen.getByLabelText('認証コード'), '123456');
      await user.click(
        screen.getByRole('button', { name: '二段階認証を有効にする' }),
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(
        TOTP_ERROR_MESSAGES.SETUP_EXPIRED,
      );
      // QRの画面に留まらない
      expect(
        screen.queryByRole('img', { name: '二段階認証のQRコード' }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: '認証アプリで設定する' }),
      ).toBeInTheDocument();
    });

    /**
     * ⚠️ **ほかのエラーでは戻さない。** 打ち間違いのたびに最初から
     * やり直させることになる。
     */
    it('コード違いでは設定画面に留まる', async () => {
      await startSetup();
      mockFetch.mockResolvedValueOnce(
        errorResponse(400, TOTP_ERROR_MESSAGES.INVALID_CODE),
      );

      await user.type(screen.getByLabelText('認証コード'), '000000');
      await user.click(
        screen.getByRole('button', { name: '二段階認証を有効にする' }),
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(
        TOTP_ERROR_MESSAGES.INVALID_CODE,
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

    /**
     * ⚠️ **やめたら再認証の入力も捨てる**（#1368 のレビュー）。
     *
     * 残すと、OAuth のみの利用者が「始める → やめる → もう一度」をしたときに
     * **消費済みのコード**が欄に残る。ボタンは押せるのにサーバーは必ず 400 を
     * 返し、再送は60秒の間隔と 5回/60分 の枠に当たる。
     */
    it('やめると再認証の入力も捨てる', async () => {
      // ⚠️ この describe の beforeEach は状態の応答を積まない
      //    （`startSetup()` が自分で積むため）。ここでも自分で積む
      mockFetch.mockResolvedValueOnce(statusResponse(false));
      mockFetch.mockResolvedValueOnce(
        okResponse({ qrCodeDataUri: QR_DATA_URI, secret: 'ABCDEFGH' }),
      );

      render(<TwoFactorSettings hasPassword={false} />);

      await user.type(await screen.findByLabelText('確認コード'), '123456');
      await user.click(
        screen.getByRole('button', { name: '認証アプリで設定する' }),
      );
      await user.click(
        await screen.findByRole('button', {
          name: '二段階認証の設定をやめる',
        }),
      );

      expect(await screen.findByLabelText('確認コード')).toHaveValue('');
      // 入力が空なので、もう一度は始められない
      expect(
        screen.getByRole('button', { name: '認証アプリで設定する' }),
      ).toBeDisabled();
    });
  });

  describe('有効な状態', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValueOnce(statusResponse(true, 7));
    });

    it('有効であることと残数を表示する', async () => {
      render(<TwoFactorSettings hasPassword />);

      expect(await screen.findByText(/有効/)).toBeInTheDocument();
      expect(screen.getByText(/7 個/)).toBeInTheDocument();
    });

    it('無効化に認証コードを要求する', async () => {
      render(<TwoFactorSettings hasPassword />);

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

      render(<TwoFactorSettings hasPassword />);
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

      render(<TwoFactorSettings hasPassword />);
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

      render(<TwoFactorSettings hasPassword />);
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

      render(<TwoFactorSettings hasPassword />);
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

    render(<TwoFactorSettings hasPassword />);

    expect(await screen.findByText(/使い切っています/)).toBeInTheDocument();
  });

  it('状態取得に失敗しても画面を壊さない', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network'));

    render(<TwoFactorSettings hasPassword />);

    expect(
      await screen.findByRole('button', { name: '認証アプリで設定する' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  describe('方式の選択', () => {
    const user = userEvent.setup();

    it('無効のとき、方式を選ぶボタンが2つ出る', async () => {
      mockFetch.mockResolvedValueOnce(statusResponse(false));

      render(<TwoFactorSettings hasPassword />);

      expect(
        await screen.findByRole('button', { name: '認証アプリで設定する' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'メールで設定する' }),
      ).toBeInTheDocument();
    });

    it('メールOTP には安全性の注意を添える', async () => {
      mockFetch.mockResolvedValueOnce(statusResponse(false));

      render(<TwoFactorSettings hasPassword />);
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

      render(<TwoFactorSettings hasPassword />);

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

      render(<TwoFactorSettings hasPassword />);
      await enterReauthPassword();
      await user.click(
        await screen.findByRole('button', { name: 'メールで設定する' }),
      );

      expect(
        await screen.findByText(SECOND_FACTOR_MESSAGES.CODE_SENT),
      ).toBeInTheDocument();
      expect(
        screen.queryByAltText('二段階認証のQRコード'),
      ).not.toBeInTheDocument();
    });

    it('設定開始のリクエストに方式を載せる', async () => {
      mockFetch
        .mockResolvedValueOnce(statusResponse(false))
        .mockResolvedValueOnce(okResponse({ method: 'email_otp' }));

      render(<TwoFactorSettings hasPassword />);
      await enterReauthPassword();
      await user.click(
        await screen.findByRole('button', { name: 'メールで設定する' }),
      );

      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/user/totp/setup',
        expect.objectContaining({
          body: JSON.stringify({ method: 'email_otp', currentPassword: 'pw' }),
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

      render(<TwoFactorSettings hasPassword />);
      await screen.findByRole('button', { name: '認証アプリで設定する' });
      // #1368: 入れないとボタンが disabled のまま（Tab でも到達しない）
      await enterReauthPassword();

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
          body: JSON.stringify({ method: 'email_otp', currentPassword: 'pw' }),
        }),
      );
      // 画面も進む。リクエストが飛ぶだけで止まっていないこと。
      //
      // ⚠️ リード文は「送りました」と断定しなくなった（#1285）。
      // 送信の結果は notice 側だけが言う
      expect(await screen.findByText(/6桁のコードを入力/)).toBeInTheDocument();
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

      render(<TwoFactorSettings hasPassword />);
      // #1368: 再認証の材料が無いと「設定する」が押せない
      await clickUser.type(
        await screen.findByLabelText('現在のパスワード'),
        'pw',
      );
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

    /**
     * ⚠️ 叩き先は **`send-challenge`**（#1285）。
     *
     * `setup` を叩き直すと `TOTP_SETTINGS_VERIFY`（5回/15分）を消費するので、
     *
     *   setup(1) + 再送×4 = 5 → 6回目の「有効にする」が 429 で15分ロック
     *
     * となり、**この Issue が直そうとしている行き止まりを別の形で作る**。
     */
    it('60秒経つと押せるようになり、send-challenge を叩く', async () => {
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

        mockFetch.mockResolvedValueOnce(okResponse({}));

        await timerUser.click(resendButton);

        // ⛔ `/api/user/totp/setup` を叩いてはいけない（上のコメント）
        expect(mockFetch).toHaveBeenLastCalledWith(
          '/api/user/totp/send-challenge',
          expect.objectContaining({ method: 'POST' }),
        );
        // 状態取得(1) + 設定開始(1) + 再送(1)
        expect(mockFetch).toHaveBeenCalledTimes(3);
        expect(
          await screen.findByText(SECOND_FACTOR_MESSAGES.CODE_SENT),
        ).toBeInTheDocument();
      } finally {
        jest.useRealTimers();
      }
    });

    /**
     * ⛔ **期限切れからの出口は2つある**（#1368 の3回目レビュー）。
     *
     * コードが来ないとき利用者がまず押すのは**再送**。そこで画面が戻らないと、
     * 「二段階認証が設定されていません。」と出たまま設定画面に留まり、
     * 同じ操作を繰り返させることになる。
     */
    it('再送が期限切れなら方式の選択へ戻す', async () => {
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

        mockFetch.mockResolvedValueOnce(
          errorResponse(400, TOTP_ERROR_MESSAGES.SETUP_EXPIRED),
        );

        await timerUser.click(
          screen.getByRole('button', { name: '確認コードを再送信する' }),
        );

        expect(await screen.findByRole('alert')).toHaveTextContent(
          TOTP_ERROR_MESSAGES.SETUP_EXPIRED,
        );
        expect(
          screen.queryByRole('button', { name: '確認コードを再送信する' }),
        ).not.toBeInTheDocument();
        expect(
          screen.getByRole('button', { name: 'メールで設定する' }),
        ).toBeInTheDocument();
      } finally {
        jest.useRealTimers();
      }
    });

    /**
     * ⚠️ 再送したらクールダウンを掛け直す。
     *
     * 掛け直さないと、押した直後からまた押せてしまい、サーバー側の
     * 60秒間隔に当たって**1通も届かない**。この Issue の元の症状と同じ
     * 誤解（「送信しました」と出るのに届かない）を再生産する。
     */
    it('再送したらカウントダウンを掛け直す', async () => {
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

        mockFetch.mockResolvedValueOnce(okResponse({}));
        await timerUser.click(
          screen.getByRole('button', { name: '確認コードを再送信する' }),
        );

        // ⚠️ 送信が終わるまで待つ。飛行中はボタンの文言が
        // 「送信しています…」なので、待たずに引くと見つからない
        await screen.findByText(SECOND_FACTOR_MESSAGES.CODE_SENT);

        expect(
          screen.getByRole('button', { name: '確認コードを再送信する' }),
        ).toBeDisabled();
        expect(screen.getByText(/再送信できるまで \d+ 秒/)).toBeInTheDocument();
      } finally {
        jest.useRealTimers();
      }
    });

    /**
     * ⚠️ 失敗したらクールダウンを掛け直さない。
     *
     * 1通も送れていないので、60秒待たせる理由がない。エラー文言を見て
     * すぐ押し直せるほうが正しい。
     */
    it('再送に失敗したらカウントダウンを掛け直さない', async () => {
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

        mockFetch.mockResolvedValueOnce(errorResponse(429, '送信上限です'));
        await timerUser.click(
          screen.getByRole('button', { name: '確認コードを再送信する' }),
        );

        expect(await screen.findByText('送信上限です')).toBeInTheDocument();
        expect(
          screen.getByRole('button', { name: '確認コードを再送信する' }),
        ).toBeEnabled();
      } finally {
        jest.useRealTimers();
      }
    });

    /**
     * ⚠️ 設定を開始した時点から数え始める。
     *
     * `useResendCountdown` はマウント時から数えるので、`startSetup` で
     * `restart()` しないと「設定画面を開いて放置した時間」ぶん短くなり、
     * サーバーの60秒より先に押せてしまう。
     */
    it('設定を開始した時点からカウントダウンを始める', async () => {
      jest.useFakeTimers();
      const timerUser = userEvent.setup({
        advanceTimers: jest.advanceTimersByTime,
      });

      try {
        mockFetch
          .mockResolvedValueOnce(statusResponse(false))
          .mockResolvedValueOnce(
            okResponse({ method: 'email_otp', throttled: false }),
          );

        render(<TwoFactorSettings hasPassword />);
        await screen.findByRole('button', { name: 'メールで設定する' });
        // #1368: 再認証の材料が無いと「設定する」が押せない
        await timerUser.type(screen.getByLabelText('現在のパスワード'), 'pw');

        // 設定を始める前に放置する
        await act(async () => {
          jest.advanceTimersByTime(50_000);
        });

        await timerUser.click(
          screen.getByRole('button', { name: 'メールで設定する' }),
        );
        await screen.findByRole('button', { name: '確認コードを再送信する' });

        // 放置ぶんが引かれていたら、残り10秒で押せてしまう
        await act(async () => {
          jest.advanceTimersByTime(30_000);
        });

        expect(
          screen.getByRole('button', { name: '確認コードを再送信する' }),
        ).toBeDisabled();
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

      // ⚠️ 固定のリード文も見る。`CODE_SENT` だけ見ていた頃は、
      // 「確認コードを送りました」という**別文字列**のリード文が残って
      // いても素通りした（レビューで実測）。画面のどこにも「送った」が
      // 出ていないことを固定する
      expect(screen.queryByText(/送りました|送信しました/)).toBeNull();
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

      render(<TwoFactorSettings hasPassword />);

      expect(
        await screen.findByRole('button', {
          name: '二段階認証の確認コードを送信',
        }),
      ).toBeInTheDocument();
    });

    it('認証アプリの利用者には送信ボタンを出さない', async () => {
      mockFetch.mockResolvedValueOnce(statusResponse(true, 7));

      render(<TwoFactorSettings hasPassword />);
      await screen.findByRole('button', { name: '二段階認証を無効にする' });

      expect(
        screen.queryByRole('button', { name: '二段階認証の確認コードを送信' }),
      ).not.toBeInTheDocument();
    });

    it('送信ボタンで send-challenge を叩く', async () => {
      mockFetch
        .mockResolvedValueOnce(enabledEmailOtp())
        .mockResolvedValueOnce(okResponse({}));

      render(<TwoFactorSettings hasPassword />);
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

      render(<TwoFactorSettings hasPassword />);
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

      render(<TwoFactorSettings hasPassword />);

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

    render(<TwoFactorSettings hasPassword />);
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

    render(<TwoFactorSettings hasPassword />);
    await user.click(
      await screen.findByRole('button', {
        name: '二段階認証の確認コードを送信',
      }),
    );

    await screen.findByRole('alert');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
