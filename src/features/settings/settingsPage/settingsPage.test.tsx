const mockUseSession = jest.fn();
jest.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

jest.mock('@/lib/api/user/user', () => ({
  getSettings: jest.fn().mockResolvedValue({
    theme: 'light',
    notificationEnabled: false,
  }),
  updateProfile: jest.fn(),
  updateSettings: jest.fn(),
}));

jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({
    toast: jest.fn(),
  }),
  useToastDispatch: () => ({
    toast: jest.fn(),
  }),
}));

jest.mock('@/features/settings/changePasswordForm/changePasswordForm', () => ({
  ChangePasswordForm: ({
    email,
    hasPassword,
  }: {
    email: string;
    hasPassword: boolean;
  }) => (
    <div
      data-testid='change-password-form'
      data-email={email}
      data-has-password={String(hasPassword)}
    />
  ),
}));

/*
  ⚠️ 二段階認証と退会も差し替える。どちらも `hasPassword` の受け取り先で、
  かつ素のままだと自前で `/api/user/totp` を叩くため、下の fetch モックと
  期待値が絡み合う
*/
jest.mock('@/features/settings/twoFactorSettings/twoFactorSettings', () => ({
  TwoFactorSettings: ({ hasPassword }: { hasPassword: boolean }) => (
    <div
      data-testid='two-factor-settings'
      data-has-password={String(hasPassword)}
    />
  ),
}));

jest.mock('@/features/settings/deleteAccount/deleteAccount', () => ({
  DeleteAccount: ({ hasPassword }: { hasPassword: boolean }) => (
    <div data-testid='delete-account' data-has-password={String(hasPassword)} />
  ),
}));

jest.mock('@/features/settings/emailChangeForm/emailChangeForm', () => ({
  EmailChangeForm: ({
    email,
    hasPassword,
  }: {
    email: string;
    hasPassword: boolean;
  }) => (
    <div
      data-testid='email-change-form'
      data-email={email}
      data-has-password={String(hasPassword)}
    />
  ),
}));

jest.mock(
  '@/features/dismissedMovies/component/dismissedMoviesList/dismissedMoviesList',
  () => ({
    DismissedMoviesList: () => <div data-testid='dismissed-movies-list' />,
  }),
);

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

import { recordConsentDecision } from '@/utils/cookieConsent';
import { SettingsPage } from './settingsPage';

/** `useHasPassword` が叩く `GET /api/user/totp` */
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// --- Tests ---

describe('SettingsPage', () => {
  beforeEach(() => {
    localStorage.clear();
    // 既定では「パスワードの有無を取りにいっても分からない」状態にして、
    // セッション由来の値がそのまま使われるようにする（#1388）
    //
    // ⚠️ 呼び出し回数を見るテストがあるので毎回リセットする。この describe は
    // `clearAllMocks` を使っていないため、積み残すと前のテストの分を数える
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) });
    mockUseSession.mockReturnValue({
      data: {
        user: {
          name: 'テストユーザー',
          email: 'test@example.com',
          image: null,
        },
      },
      status: 'authenticated',
      update: jest.fn(),
    });
  });

  it('設定見出しが表示される', () => {
    render(<SettingsPage />);
    expect(screen.getByRole('heading', { name: '設定' })).toBeInTheDocument();
  });

  it('プロフィールセクションが表示される', () => {
    render(<SettingsPage />);
    expect(
      screen.getByRole('heading', { name: 'プロフィール' }),
    ).toBeInTheDocument();
  });

  it('パスワード変更セクションが表示される', () => {
    render(<SettingsPage />);
    expect(
      screen.getByRole('heading', { name: 'パスワード変更' }),
    ).toBeInTheDocument();
    const changePasswordForm = screen.getByTestId('change-password-form');
    expect(changePasswordForm).toBeInTheDocument();
    expect(changePasswordForm).toHaveAttribute(
      'data-email',
      'test@example.com',
    );
  });

  /**
   * ⚠️ 現在のアドレスを渡すのは**変更前の値を画面に出す**ため。
   * 空のまま渡すと、利用者はどのアドレスから変えようとしているのか
   * 分からないまま操作することになる。
   */
  it('メールアドレスセクションが表示される', () => {
    render(<SettingsPage />);

    expect(
      screen.getByRole('heading', { name: 'メールアドレス' }),
    ).toBeInTheDocument();

    const emailChangeForm = screen.getByTestId('email-change-form');

    expect(emailChangeForm).toHaveAttribute('data-email', 'test@example.com');
  });

  /**
   * ⛔ **`hasPassword` を落とさない。** パスワード未設定（ソーシャルのみ）の
   * 利用者に「現在のパスワード」を求めると、入れようのない欄で行き止まりになる。
   */
  it('パスワード未設定を下のフォームへ伝える', () => {
    mockUseSession.mockReturnValue({
      data: {
        user: {
          name: 'テストユーザー',
          email: 'test@example.com',
          hasPassword: false,
        },
      },
      status: 'authenticated',
      update: jest.fn(),
    });

    render(<SettingsPage />);

    expect(screen.getByTestId('email-change-form')).toHaveAttribute(
      'data-has-password',
      'false',
    );
  });

  /**
   * `hasPassword` の出どころ（#1388）
   *
   * ⛔ セッション（JWT）だけを根拠にしない。追従は5分間隔のスロットル付きで、
   * サーバーは毎回 `users.password_hash` を見る。初回パスワードを設定した
   * 直後は食い違い、**画面が出す欄とサーバーが求める材料が合わない**。
   * 退会はいちばん重く、「確認コードを送る」しか出ないのにサーバーは
   * 現在のパスワードを求め、その欄が無いので従えない。
   */
  describe('パスワードの有無の出どころ', () => {
    /** セッションは「未設定」、実体は「設定済み」の状態を作る */
    const sessionSaysNoPassword = () => {
      mockUseSession.mockReturnValue({
        data: {
          user: {
            name: 'テストユーザー',
            email: 'test@example.com',
            hasPassword: false,
          },
        },
        status: 'authenticated',
        update: jest.fn(),
      });
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: { hasPassword: true } }),
      });
    };

    it.each([
      ['delete-account'],
      ['change-password-form'],
      ['email-change-form'],
      ['two-factor-settings'],
    ])('%s に API 由来の値が渡る', async (testId) => {
      sessionSaysNoPassword();

      render(<SettingsPage />);

      await waitFor(() =>
        expect(screen.getByTestId(testId)).toHaveAttribute(
          'data-has-password',
          'true',
        ),
      );
    });

    /*
      ⛔ 取得に失敗した利用者から欄を消さない。API を唯一の根拠にすると、
      これまで使えていた操作ができなくなる（#1378 のレビューで確認した判断）
    */
    it('取得に失敗したらセッション由来の値のまま', async () => {
      sessionSaysNoPassword();
      mockFetch.mockRejectedValue(new Error('network down'));

      render(<SettingsPage />);

      await waitFor(() => expect(mockFetch).toHaveBeenCalled());
      expect(screen.getByTestId('delete-account')).toHaveAttribute(
        'data-has-password',
        'false',
      );
    });

    /*
      ⚠️ 4つの節で1回しか取りにいかない。節ごとに取ると同じ問い合わせが並び、
      同じ画面の中で値が揃わない時間も生まれる
    */
    it('問い合わせは1回だけ', async () => {
      sessionSaysNoPassword();

      render(<SettingsPage />);

      await waitFor(() => expect(mockFetch).toHaveBeenCalled());
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  it('通知セクションが表示される', () => {
    render(<SettingsPage />);
    expect(screen.getByRole('heading', { name: '通知' })).toBeInTheDocument();
  });

  it('外観セクションが表示される', () => {
    render(<SettingsPage />);
    expect(screen.getByRole('heading', { name: '外観' })).toBeInTheDocument();
  });

  it('配信開始のお知らせセクションが表示される', () => {
    render(<SettingsPage />);
    expect(
      screen.getByRole('heading', { name: '配信開始のお知らせ' }),
    ).toBeInTheDocument();
  });

  it('興味なし一覧セクションが表示される', () => {
    render(<SettingsPage />);
    expect(
      screen.getByRole('heading', { name: '興味なし一覧' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('dismissed-movies-list')).toBeInTheDocument();
  });

  it('表示名入力フィールドが表示される', () => {
    render(<SettingsPage />);
    expect(screen.getByLabelText('表示名')).toBeInTheDocument();
  });

  it('通知チェックボックスが表示される', async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(
        screen.getByRole('checkbox', {
          name: '公開日リマインダーを受け取る',
        }),
      ).toBeInTheDocument();
    });
  });

  it('テーマ選択が表示される', async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(
        screen.getByRole('radiogroup', { name: 'テーマを選択' }),
      ).toBeInTheDocument();
    });
  });

  it('emailが空の場合パスワード変更セクションが非表示になる', () => {
    mockUseSession.mockReturnValue({
      data: {
        user: {
          name: 'テストユーザー',
          email: '',
          image: null,
        },
      },
      status: 'authenticated',
      update: jest.fn(),
    });

    render(<SettingsPage />);

    expect(
      screen.queryByRole('heading', { name: 'パスワード変更' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('change-password-form'),
    ).not.toBeInTheDocument();

    // ⚠️ メールアドレスの変更も同じ条件で消える。アドレスを持たない
    //    （管理者発行の）アカウントには変更する元が無い
    expect(
      screen.queryByRole('heading', { name: 'メールアドレス' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('email-change-form')).not.toBeInTheDocument();
  });

  it('sessionがnullの場合パスワード変更セクションが非表示になる', () => {
    mockUseSession.mockReturnValue({
      data: null,
      status: 'unauthenticated',
      update: jest.fn(),
    });

    render(<SettingsPage />);

    expect(
      screen.queryByRole('heading', { name: 'パスワード変更' }),
    ).not.toBeInTheDocument();
  });

  it('セッションloading中はパスワード変更セクションにスケルトンが表示される', () => {
    mockUseSession.mockReturnValue({
      data: null,
      status: 'loading',
      update: jest.fn(),
    });

    render(<SettingsPage />);

    expect(
      screen.getByRole('heading', { name: 'パスワード変更' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('change-password-form'),
    ).not.toBeInTheDocument();

    // ⚠️ セッションが来るまでアドレスが確定しないので、空のまま
    //    フォームを描かない（「変更前: 」が空欄で出てしまう）
    expect(screen.queryByTestId('email-change-form')).not.toBeInTheDocument();
  });

  /**
   * ⛔ **再取得中にフォームをアンマウントしない**（#1364 の E2E で発覚）。
   *
   * `useSession().update()` は再取得のあいだ `status` を `loading` に戻す
   * （`node_modules/next-auth/react.js` の `setLoading(true)`）。`loading`
   * だけで判定すると `EmailChangeForm` がアンマウントされ、**state が消える**。
   *
   * 実測: メールアドレスの変更に成功しても「メールアドレスを変更しました。」
   * が一度も出ず、利用者からは入力欄が空に戻っただけに見えた。
   */
  it('再取得中でもアドレスを持っていればフォームを残す', () => {
    mockUseSession.mockReturnValue({
      data: { user: { email: 'user@example.com', hasPassword: true } },
      status: 'loading',
      update: jest.fn(),
    });

    render(<SettingsPage />);

    expect(screen.getByTestId('email-change-form')).toBeInTheDocument();
    expect(screen.getByTestId('change-password-form')).toBeInTheDocument();
    // 退会セクションも消さない（同じ判定を使っている）
    expect(
      screen.getByRole('heading', { name: 'アカウントの削除' }),
    ).toBeInTheDocument();
  });

  describe('Cookie セクション', () => {
    it('同意済みなら表示する', () => {
      recordConsentDecision('granted', 'user-1');

      render(<SettingsPage />);

      expect(
        screen.getByRole('heading', { name: 'Cookie' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('radiogroup', { name: 'アクセス解析Cookieの利用' }),
      ).toBeInTheDocument();
    });

    it('未決定なら見出しごと出さない（空セクションを作らない）', () => {
      render(<SettingsPage />);

      expect(
        screen.queryByRole('heading', { name: 'Cookie' }),
      ).not.toBeInTheDocument();
    });
  });
});
