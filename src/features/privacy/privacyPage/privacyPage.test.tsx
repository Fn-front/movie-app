/**
 * プライバシーポリシーのテスト
 *
 * 公表事項の抜けを検知するのが目的。外部送信先の列挙と、Consent Mode の
 * 挙動（同意しなくても送られるものがある）の記載を固定する。
 */

import { render, screen, within } from '@testing-library/react';

import { EXTERNAL_URLS } from '@/constants/external';
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

    // 送信先には補足の括弧が付くことがあるため前方一致で見る
    it.each([
      /^Google（Google アナリティクス）/,
      /^YouTube（Google/,
      /^Google \/ GitHub/,
    ])('%s を列挙する', (name) => {
      render(<PrivacyPage />);

      expect(screen.getByRole('rowheader', { name })).toBeInTheDocument();
    });

    it('YouTube の送信情報に、目的（計測）に対応する項目が入っている', () => {
      render(<PrivacyPage />);

      // 「再生品質の計測」と書く以上、何を計測しているかを欠いてはいけない
      const row = screen.getByRole('rowheader', {
        name: /^YouTube（Google/,
      }).parentElement;

      expect(row?.textContent).toContain('視聴する動画の識別子');
      expect(row?.textContent).toContain('再生状況');
    });

    it('Google の送信情報に、計測しているカスタムイベントが入っている', () => {
      // #938 で操作の計測を足した。表に書かないと外部送信規律の
      // 「送信される情報の内容」が実装より狭くなる
      render(<PrivacyPage />);

      const row = screen.getByRole('rowheader', {
        name: /^Google（Google アナリティクス）/,
      }).parentElement;

      expect(row?.textContent).toContain('ウォッチリスト');
      expect(row?.textContent).toContain('お気に入り');
      expect(row?.textContent).toContain('検索の実行');
      expect(row?.textContent).toContain('予告編を表示した作品のID');
      expect(row?.textContent).toContain('対象作品のID');
    });

    it('Google へ検索キーワードや作品名を送らないことを書く', () => {
      // 「検索の実行」とだけ書くと、読み手はキーワードも送られると受け取る
      render(<PrivacyPage />);

      const row = screen.getByRole('rowheader', {
        name: /^Google（Google アナリティクス）/,
      }).parentElement;

      expect(row?.textContent).toContain(
        '検索キーワードや作品名は送信しません',
      );
    });

    it('Google へ送るURLがクエリ文字列を除くことを書く', () => {
      // 「検索キーワードを送らない」はクエリ文字列を落とすことで成立している。
      // URL を限定せずにキーワード不送信だけ書くと、同じセル内で矛盾する
      render(<PrivacyPage />);

      const row = screen.getByRole('rowheader', {
        name: /^Google（Google アナリティクス）/,
      }).parentElement;

      expect(row?.textContent).toContain(
        '閲覧したページのURL（クエリ文字列を除く）',
      );
    });

    it('Google へ送る検索の内訳が実装と一致する', () => {
      // search イベントは作品IDを送らない。「対象作品のIDまで」とだけ書くと
      // 実際に送っている件数・ページ番号・絞り込み種別が未開示になる
      render(<PrivacyPage />);

      const row = screen.getByRole('rowheader', {
        name: /^Google（Google アナリティクス）/,
      }).parentElement;

      expect(row?.textContent).toContain(
        '検索の実行とその絞り込み種別・結果件数・ページ番号',
      );
    });

    it('埋め込み先のホスト名が実装と一致する', () => {
      render(<PrivacyPage />);

      // ポリシー本文に直書きすると、埋め込み先を変えたとき記述だけ古く残る
      const host = new URL(EXTERNAL_URLS.YOUTUBE_EMBED).hostname;

      expect(screen.getByText(host)).toBeInTheDocument();
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

      // 「同意の有無にかかわらず」はカスタムイベントの記述にも出るため、
      // 文として指定する（#938）
      expect(
        within(section()).getByText(
          /同意の有無にかかわらず、アクセス解析のタグ自体は読み込まれます/,
        ),
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

    it('操作の計測も同意の有無によらず送られることを書く', () => {
      // Consent Mode advanced では未同意でもカスタムイベントが送られる。
      // 「同意した場合だけ計測する」と読める書き方をしてはいけない（#938）
      render(<PrivacyPage />);

      expect(
        within(section()).getByText(
          /操作も送信します。これらも同意の有無にかかわらず送信されます/,
        ),
      ).toBeInTheDocument();
    });

    it('操作の計測で何を送るかを書く', () => {
      render(<PrivacyPage />);

      expect(
        within(section()).getByText(
          /対象作品のID（ウォッチリスト・お気に入り・予告編）と、検索の絞り込み種別・結果件数・ページ番号/,
        ),
      ).toBeInTheDocument();
    });

    it('操作の計測で作品ID以外を送らないことを書く', () => {
      render(<PrivacyPage />);

      expect(
        within(section()).getByText(
          /検索キーワード・作品名・評価の点数・お客様のアカウント情報は含みません/,
        ),
      ).toBeInTheDocument();
    });

    it('URLはクエリ文字列を除いて送ることを書く', () => {
      // §3 の表と §7 で記述が食い違わないようにする
      render(<PrivacyPage />);

      expect(
        within(section()).getByText(
          /URLもクエリ文字列を除いた部分のみを送信します/,
        ),
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
