/**
 * プライバシーポリシーのテスト
 *
 * 公表事項の抜けを検知するのが目的。外部送信先の列挙と、Consent Mode の
 * 挙動（同意しなくても送られるものがある）の記載を固定する。
 */

import { render, screen, within } from '@testing-library/react';

import { recordConsentDecision } from '@/utils/cookieConsent';
import { PrivacyPage } from './privacyPage';

jest.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { id: 'user-1' } },
    status: 'authenticated',
  }),
}));

describe('PrivacyPage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('見出し構造', () => {
    it('h1 を1本だけ持つ（a11y E2E が h1 の出現を待つ）', () => {
      render(<PrivacyPage />);

      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      expect(
        screen.getByRole('heading', { level: 1, name: 'プライバシーポリシー' }),
      ).toBeInTheDocument();
    });

    it('11項目を h2 で並べる', () => {
      render(<PrivacyPage />);

      expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(11);
    });

    it('制定日と最終改定日を示す', () => {
      render(<PrivacyPage />);

      expect(screen.getByText(/制定日:/)).toBeInTheDocument();
      expect(screen.getByText(/最終改定日:/)).toBeInTheDocument();
    });
  });

  describe('端末から外部へ送信される情報（電気通信事業法）', () => {
    it('送信先・送信される情報・送信先での利用目的の3列を持つ', () => {
      // 外部送信規律は①情報の内容②送信先③送信先での利用目的を求める
      render(<PrivacyPage />);

      const headers = screen
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent);

      expect(headers).toContain('送信先');
      expect(headers).toContain('送信される情報');
      expect(headers).toContain('送信先での利用目的');
    });

    it.each([
      'Google（Google アナリティクス）',
      'YouTube（Google）',
      'Google / GitHub',
    ])('%s を列挙する', (name) => {
      render(<PrivacyPage />);

      expect(screen.getByRole('rowheader', { name })).toBeInTheDocument();
    });
  });

  describe('サーバーからの委託先（個人情報保護法）', () => {
    it.each([
      'OpenAI',
      'Have I Been Pwned',
      'Resend',
      'GitHub',
      'Supabase / Vercel',
    ])('%s を列挙する', (name) => {
      render(<PrivacyPage />);

      expect(screen.getByRole('rowheader', { name })).toBeInTheDocument();
    });

    it('パスワードそのものは送らないと明記する', () => {
      render(<PrivacyPage />);

      expect(
        screen.getByText(/パスワードそのものは送信しません/),
      ).toBeInTheDocument();
    });

    it('外国にある第三者への提供の項を持つ', () => {
      render(<PrivacyPage />);

      expect(
        screen.getByRole('heading', {
          level: 2,
          name: /外国にある第三者への提供/,
        }),
      ).toBeInTheDocument();
    });
  });

  describe('アクセス解析と同意', () => {
    const section = () =>
      screen
        .getByRole('heading', { level: 2, name: /アクセス解析と同意/ })
        .closest('section') as HTMLElement;

    it('同意の有無によらずタグが読み込まれることを書く', () => {
      render(<PrivacyPage />);

      expect(
        within(section()).getByText(/同意の有無にかかわらず/),
      ).toBeInTheDocument();
    });

    it('同意しなくても IP アドレス等が送られることを書く', () => {
      // 「個人を識別しない形の情報のみ」と書くと不正確になる
      render(<PrivacyPage />);

      expect(
        within(section()).getByText(/IPアドレス・ブラウザの種類・閲覧したURL/),
      ).toBeInTheDocument();
    });

    it('同意した場合に限り識別用Cookieを作ることを書く', () => {
      render(<PrivacyPage />);

      expect(
        within(section()).getByText(/同意いただいた場合に限り識別用Cookie/),
      ).toBeInTheDocument();
    });

    it('同意状態によらず説明文を表示する（公表事項のため）', () => {
      render(<PrivacyPage />);

      expect(section()).toBeInTheDocument();
    });
  });

  describe('撤回UI', () => {
    it('同意済みなら撤回できる', () => {
      recordConsentDecision('granted', 'user-1');

      render(<PrivacyPage />);

      expect(
        screen.getByRole('radiogroup', { name: 'アクセス解析Cookieの利用' }),
      ).toBeInTheDocument();
    });

    it('未決定ならトグルは出さない（説明文は残す）', () => {
      render(<PrivacyPage />);

      expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
      expect(
        screen.getByRole('heading', { level: 2, name: /アクセス解析と同意/ }),
      ).toBeInTheDocument();
    });
  });

  describe('実態との整合', () => {
    it('アカウント削除機能が未提供であることを正直に書く', () => {
      render(<PrivacyPage />);

      expect(
        screen.getByText(/アカウントを削除する機能は提供していません/),
      ).toBeInTheDocument();
    });

    it('開示請求の窓口を示す', () => {
      render(<PrivacyPage />);

      const link = screen.getByRole('link', { name: /@/ });
      expect(link).toHaveAttribute('href', expect.stringContaining('mailto:'));
    });
  });
});
