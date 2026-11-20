/**
 * メールアドレス変更フォームのテスト（#1359）
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  EMAIL_CHANGE_MESSAGES,
  EMAIL_CHANGE_VIEW,
} from '@/constants/emailChange';

import { EmailChangeForm } from './emailChangeForm';

// --- Mocks ---

const mockRequestCode = jest.fn();
const mockConfirmCode = jest.fn();
const mockReset = jest.fn();
const hookState = {
  view: EMAIL_CHANGE_VIEW.INPUT as string,
  pendingEmail: '',
  isSubmitting: false,
  error: null as string | null,
  notice: null as string | null,
};

jest.mock('./hooks/useEmailChange', () => ({
  useEmailChange: () => ({
    ...hookState,
    requestCode: mockRequestCode,
    confirmCode: mockConfirmCode,
    reset: mockReset,
  }),
}));

// --- Helpers ---

const renderForm = (hasPassword = true) =>
  render(<EmailChangeForm email='old@example.com' hasPassword={hasPassword} />);

beforeEach(() => {
  jest.clearAllMocks();
  hookState.view = EMAIL_CHANGE_VIEW.INPUT;
  hookState.pendingEmail = '';
  hookState.isSubmitting = false;
  hookState.error = null;
  hookState.notice = null;
});

// --- Tests ---

describe('EmailChangeForm', () => {
  describe('パスワードを持たない利用者', () => {
    /**
     * ⚠️ ソーシャル連携のみの利用者は対象外。フォームを出すと
     * 「入力しても必ず 400」になり、理由が分からない。
     */
    it('対象外であることだけを伝える', () => {
      renderForm(false);

      expect(
        screen.getByText(EMAIL_CHANGE_MESSAGES.PASSWORD_REQUIRED),
      ).toBeInTheDocument();
      expect(
        screen.queryByLabelText('新しいメールアドレス'),
      ).not.toBeInTheDocument();
    });
  });

  describe('入力', () => {
    it('現在のアドレスを出す', () => {
      renderForm();

      expect(
        screen.getByText(/現在のメールアドレス: old@example.com/),
      ).toBeInTheDocument();
    });

    it('両方入力するまで送れない', async () => {
      const user = userEvent.setup();
      renderForm();

      const button = screen.getByRole('button', { name: '確認コードを送る' });

      expect(button).toBeDisabled();

      await user.type(
        screen.getByLabelText('新しいメールアドレス'),
        'new@example.com',
      );

      expect(button).toBeDisabled();

      await user.type(screen.getByLabelText('現在のパスワード'), 'pw');

      expect(button).not.toBeDisabled();
    });

    it('入力した値を渡す', async () => {
      const user = userEvent.setup();
      renderForm();

      await user.type(
        screen.getByLabelText('新しいメールアドレス'),
        'new@example.com',
      );
      await user.type(screen.getByLabelText('現在のパスワード'), 'pw');
      await user.click(
        screen.getByRole('button', { name: '確認コードを送る' }),
      );

      expect(mockRequestCode).toHaveBeenCalledWith('new@example.com', 'pw');
    });

    // ⚠️ パスワードを画面に残さない
    it('送信後にパスワード欄を空にする', async () => {
      const user = userEvent.setup();
      renderForm();

      await user.type(
        screen.getByLabelText('新しいメールアドレス'),
        'new@example.com',
      );
      await user.type(screen.getByLabelText('現在のパスワード'), 'pw');
      await user.click(
        screen.getByRole('button', { name: '確認コードを送る' }),
      );

      expect(screen.getByLabelText('現在のパスワード')).toHaveValue('');
    });
  });

  describe('コード入力', () => {
    beforeEach(() => {
      hookState.view = EMAIL_CHANGE_VIEW.CODE;
      hookState.pendingEmail = 'new@example.com';
    });

    it('どこへ送ったかを出す', () => {
      renderForm();

      expect(
        screen.getByText(/new@example.com に確認コードを送りました。/),
      ).toBeInTheDocument();
    });

    it('コード未入力では送れない', () => {
      renderForm();

      expect(
        screen.getByRole('button', { name: 'メールアドレスを変更' }),
      ).toBeDisabled();
    });

    it('入力したコードを渡す', async () => {
      const user = userEvent.setup();
      renderForm();

      await user.type(screen.getByLabelText('確認コード'), '123456');
      await user.click(
        screen.getByRole('button', { name: 'メールアドレスを変更' }),
      );

      expect(mockConfirmCode).toHaveBeenCalledWith('123456');
    });

    it('やり直せる', async () => {
      const user = userEvent.setup();
      renderForm();

      await user.click(screen.getByRole('button', { name: 'やり直す' }));

      expect(mockReset).toHaveBeenCalled();
    });

    it('送信中は操作できない', () => {
      hookState.isSubmitting = true;
      renderForm();

      expect(
        screen.getByRole('button', { name: '変更しています…' }),
      ).toBeDisabled();
      expect(screen.getByRole('button', { name: 'やり直す' })).toBeDisabled();
    });
  });

  describe('通知とエラー', () => {
    it('完了は読み上げられる形で出す', () => {
      hookState.notice = EMAIL_CHANGE_MESSAGES.CHANGED;
      renderForm();

      expect(screen.getByRole('status')).toHaveTextContent(
        EMAIL_CHANGE_MESSAGES.CHANGED,
      );
    });

    it('エラーは読み上げられる形で出す', () => {
      hookState.error = 'このメールアドレスは使用できません。';
      renderForm();

      expect(screen.getByRole('alert')).toHaveTextContent(
        'このメールアドレスは使用できません。',
      );
    });
  });
});
