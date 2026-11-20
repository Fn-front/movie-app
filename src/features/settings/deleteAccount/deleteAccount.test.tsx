/**
 * アカウント削除セクションのテスト（#932）
 *
 * ⚠️ 固定したいのは「**誰に何を要求するか**」。誤って必須にすると
 * 退会できない利用者が出るし、誤って外すと確認なしで消せる。
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ACCOUNT_DELETE_MESSAGES } from '@/constants/auth';

import { DeleteAccount } from './deleteAccount';

// --- Mocks ---

const mockDeleteAccount = jest.fn();
const mockLoadRequirement = jest.fn();
const mockClearError = jest.fn();
const mockSendDeleteCode = jest.fn();
const hookState = {
  isSubmitting: false,
  error: null as string | null,
  notice: null as string | null,
  secondFactorRequired: false as boolean | null,
};

jest.mock('./hooks/useDeleteAccount', () => ({
  useDeleteAccount: () => ({
    ...hookState,
    deleteAccount: mockDeleteAccount,
    loadRequirement: mockLoadRequirement,
    sendDeleteCode: mockSendDeleteCode,
    clearError: mockClearError,
  }),
}));

// --- Helpers ---

const openDialog = async () => {
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('button', { name: 'アカウントを削除する' }),
  );

  return user;
};

beforeEach(() => {
  jest.clearAllMocks();
  hookState.isSubmitting = false;
  hookState.error = null;
  hookState.notice = null;
  hookState.secondFactorRequired = false;
});

// --- Tests ---

describe('DeleteAccount', () => {
  it('消えるものを説明する', () => {
    render(<DeleteAccount hasPassword />);

    expect(
      screen.getByText(ACCOUNT_DELETE_MESSAGES.CONFIRM_DESCRIPTION),
    ).toBeInTheDocument();
  });

  // ⚠️ いきなり消さない。確認ダイアログを必ず挟む
  it('ボタンを押してもすぐには削除しない', async () => {
    render(<DeleteAccount hasPassword />);
    await openDialog();

    expect(mockDeleteAccount).not.toHaveBeenCalled();
    expect(
      screen.getByRole('heading', { name: 'アカウントを削除しますか？' }),
    ).toBeInTheDocument();
  });

  it('開いたときに第2要素の要否を取りにいく', async () => {
    render(<DeleteAccount hasPassword />);
    await openDialog();

    expect(mockLoadRequirement).toHaveBeenCalled();
  });

  describe('要求する確認手段', () => {
    it('パスワードを持つ利用者には入力欄を出す', async () => {
      render(<DeleteAccount hasPassword />);
      await openDialog();

      expect(screen.getByLabelText('現在のパスワード')).toBeInTheDocument();
    });

    /**
     * ⚠️ ソーシャル連携のみの利用者は照合できる値が無い。
     * 欄を出すと「正しいのに通らない」ことになる。
     */
    it('パスワードを持たない利用者には出さない', async () => {
      render(<DeleteAccount hasPassword={false} />);
      await openDialog();

      expect(
        screen.queryByLabelText('現在のパスワード'),
      ).not.toBeInTheDocument();
    });

    it('第2要素が要るときはコード欄を出す', async () => {
      hookState.secondFactorRequired = true;
      render(<DeleteAccount hasPassword />);
      await openDialog();

      expect(screen.getByLabelText('認証コード')).toBeInTheDocument();
    });

    it('第2要素が要らなければコード欄を出さない', async () => {
      render(<DeleteAccount hasPassword />);
      await openDialog();

      expect(screen.queryByLabelText('認証コード')).not.toBeInTheDocument();
    });

    /**
     * ⛔ **ここが #1362 の本体。**
     *
     * パスワードも第2要素も持たない利用者（OAuth のみで登録し二段階認証を
     * 設定していない層）には、**再確認が1つも掛からなかった**。
     * セッションを奪った第三者がそのまま2クリックで消せる。
     */
    it('どちらも持たない利用者には確認コードを要求する', async () => {
      render(<DeleteAccount hasPassword={false} />);
      await openDialog();

      expect(screen.getByLabelText('確認コード')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: '確認コードを送る' }),
      ).toBeInTheDocument();
    });

    // ⚠️ 持っている人には要求しない。3つとも求めると退会が無駄に重くなる
    it.each([
      ['パスワードを持つ', true, false],
      ['第2要素を持つ', false, true],
    ])('%s利用者には確認コードを求めない', async (_label, hasPassword, tfa) => {
      hookState.secondFactorRequired = tfa;
      render(<DeleteAccount hasPassword={hasPassword} />);
      await openDialog();

      expect(screen.queryByLabelText('確認コード')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: '確認コードを送る' }),
      ).not.toBeInTheDocument();
    });

    /**
     * ⚠️ 判定前（`null`）には出さない。出すと、第2要素を設定済みの利用者に
     * 一瞬だけ別の入力欄を見せることになる。
     */
    it('第2要素の要否が判定できるまで確認コード欄を出さない', async () => {
      hookState.secondFactorRequired = null;
      render(<DeleteAccount hasPassword={false} />);
      await openDialog();

      expect(screen.queryByLabelText('確認コード')).not.toBeInTheDocument();
    });
  });

  describe('確認コードの送信', () => {
    it('押すとコードを送る', async () => {
      render(<DeleteAccount hasPassword={false} />);
      const user = await openDialog();

      await user.click(
        screen.getByRole('button', { name: '確認コードを送る' }),
      );

      expect(mockSendDeleteCode).toHaveBeenCalled();
    });

    // 送れたことを伝えないと、利用者は届くまで何が起きたか分からない
    it('送れたことを読み上げられる形で出す', async () => {
      hookState.notice = '登録のメールアドレスに確認コードを送りました。';
      render(<DeleteAccount hasPassword={false} />);
      await openDialog();

      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent(
          '確認コードを送りました',
        ),
      );
    });

    it('コード未入力では削除できない', async () => {
      render(<DeleteAccount hasPassword={false} />);
      await openDialog();

      expect(screen.getByRole('button', { name: '削除する' })).toBeDisabled();
    });
  });

  describe('送信できる条件', () => {
    it('パスワード未入力では押せない', async () => {
      render(<DeleteAccount hasPassword />);
      await openDialog();

      expect(screen.getByRole('button', { name: '削除する' })).toBeDisabled();
    });

    it('入力すれば押せる', async () => {
      render(<DeleteAccount hasPassword />);
      const user = await openDialog();

      await user.type(screen.getByLabelText('現在のパスワード'), 'pw');

      expect(
        screen.getByRole('button', { name: '削除する' }),
      ).not.toBeDisabled();
    });

    it('第2要素が要るのにコード未入力では押せない', async () => {
      hookState.secondFactorRequired = true;
      render(<DeleteAccount hasPassword />);
      const user = await openDialog();

      await user.type(screen.getByLabelText('現在のパスワード'), 'pw');

      expect(screen.getByRole('button', { name: '削除する' })).toBeDisabled();
    });

    /**
     * ⚠️ 判定前（`null`）も押せないこと。
     *
     * `false` で初期化すると、第2要素を設定済みの利用者が
     * **コード欄の無いダイアログから送信できてしまう**。
     */
    it('第2要素の要否が判定できるまで押せない', async () => {
      hookState.secondFactorRequired = null;
      render(<DeleteAccount hasPassword={false} />);
      await openDialog();

      expect(screen.getByRole('button', { name: '削除する' })).toBeDisabled();
    });
  });

  describe('送信', () => {
    it('入力した確認情報を渡す', async () => {
      hookState.secondFactorRequired = true;
      render(<DeleteAccount hasPassword />);
      const user = await openDialog();

      await user.type(screen.getByLabelText('現在のパスワード'), 'pw');
      await user.type(screen.getByLabelText('認証コード'), '123456');
      await user.click(screen.getByRole('button', { name: '削除する' }));

      expect(mockDeleteAccount).toHaveBeenCalledWith({
        currentPassword: 'pw',
        code: '123456',
      });
    });

    // 要求していないものを送らない（サーバー側の判定と食い違わせない）
    it('パスワードを持たない利用者はパスワードを送らない', async () => {
      render(<DeleteAccount hasPassword={false} />);
      const user = await openDialog();

      await user.type(screen.getByLabelText('確認コード'), '123456');
      await user.click(screen.getByRole('button', { name: '削除する' }));

      expect(mockDeleteAccount).toHaveBeenCalledWith({ code: '123456' });
    });

    it('送信中は操作できない', async () => {
      hookState.isSubmitting = true;
      render(<DeleteAccount hasPassword={false} />);
      await openDialog();

      expect(
        screen.getByRole('button', { name: '削除しています…' }),
      ).toBeDisabled();
      expect(screen.getByRole('button', { name: 'キャンセル' })).toBeDisabled();
    });
  });

  describe('エラー', () => {
    it('読み上げられる形で出す', async () => {
      hookState.error = 'パスワードが違います';
      render(<DeleteAccount hasPassword />);
      await openDialog();

      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(
          'パスワードが違います',
        ),
      );
    });

    it('開き直すと消える', async () => {
      render(<DeleteAccount hasPassword />);
      await openDialog();

      expect(mockClearError).toHaveBeenCalled();
    });
  });
});
