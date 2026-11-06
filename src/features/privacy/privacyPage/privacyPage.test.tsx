/**
 * プライバシーポリシーのテスト
 *
 * 目的は2つある。
 * 1. 法令が求める公表事項の抜けを検知する
 * 2. 載せない判断をした項目が、根拠を確かめずに足し戻されるのを検知する
 *
 * 2 のために「無いこと」を見るテストを置いている。足し戻すときは
 * privacyPage.tsx 冒頭のコメントにある根拠を先に読むこと。
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

    it('6項目を h2 で並べる', () => {
      render(<PrivacyPage />);

      expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(6);
    });

    it('最終改定日を示す（再同意の告知がこの日付を指す）', () => {
      render(<PrivacyPage />);

      expect(screen.getByText(/最終改定日:/)).toBeInTheDocument();
    });
  });

  describe('法32条1項の公表事項', () => {
    it.each([
      /利用目的/,
      /安全管理措置/,
      /外国における個人データの取扱い/,
      /開示等のご請求と苦情の申出先/,
    ])('%s の節を持つ', (name) => {
      render(<PrivacyPage />);

      expect(
        screen.getByRole('heading', { level: 2, name }),
      ).toBeInTheDocument();
    });

    it('外的環境の把握として国名を明示する', () => {
      // 法32条1項4号。「本人の求めに応じて」で足りる28条3項と違い、
      // 国名は公表が要る（個人情報保護委員会 Q&A 10-25）
      render(<PrivacyPage />);

      const section = screen
        .getByRole('heading', { level: 2, name: /外国における個人データ/ })
        .closest('section') as HTMLElement;

      expect(within(section).getByText('米国')).toBeInTheDocument();
    });

    it('安全管理措置に実装の詳細を書かない', () => {
      // 「支障を及ぼすおそれがあるもの」は公表しなくてよい（施行令10条1号）。
      // ハッシュ関数名や鍵長は攻撃者への情報提供になる
      render(<PrivacyPage />);

      const section = screen
        .getByRole('heading', { level: 2, name: /安全管理措置/ })
        .closest('section') as HTMLElement;

      expect(section.textContent).not.toMatch(/bcrypt|SHA|AES|ビット|鍵長/);
    });

    it('開示請求の窓口を示す', () => {
      render(<PrivacyPage />);

      const link = screen.getByRole('link', { name: /@/ });
      expect(link).toHaveAttribute('href', expect.stringContaining('mailto:'));
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
    it.each([/^Google（Google アナリティクス）/, /^YouTube（Google/])(
      '%s を列挙する',
      (name) => {
        render(<PrivacyPage />);

        expect(screen.getByRole('rowheader', { name })).toBeInTheDocument();
      },
    );

    it('適用除外のものを載せない', () => {
      // 法27条の12 ただし書き一号「役務の提供のために真に必要な情報」。
      // ソーシャルログインの認証情報と、ポスター画像取得に伴うIPアドレスが該当する。
      // 足し戻す前に privacyPage.tsx 冒頭の根拠を読むこと
      render(<PrivacyPage />);

      const rowHeaders = screen
        .getAllByRole('rowheader')
        .map((cell) => cell.textContent ?? '');

      expect(rowHeaders).toHaveLength(2);
      expect(rowHeaders.some((text) => text.includes('GitHub'))).toBe(false);
      expect(rowHeaders.some((text) => text.includes('TMDb'))).toBe(false);
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

  describe('公表義務が無いため載せない項目', () => {
    it('サーバー側の委託先一覧を持たない', () => {
      // 法27条5項1号により第三者提供に当たらず、公表義務が無い。
      // 外国での取扱いは §4 の国名で足りる
      render(<PrivacyPage />);

      expect(screen.queryByText(/OpenAI|Have I Been Pwned|Resend/)).toBeNull();
    });

    it('保存期間の節を持たない', () => {
      // 法32条1項に保存期間は含まれない（GDPR 13条と混同しやすい）
      render(<PrivacyPage />);

      expect(
        screen.queryByRole('heading', { level: 2, name: /保存期間/ }),
      ).toBeNull();
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
      // §2 の表と §3 で記述が食い違わないようにする
      render(<PrivacyPage />);

      expect(
        within(section()).getByText(
          /URLもクエリ文字列を除いた部分のみを送信します/,
        ),
      ).toBeInTheDocument();
    });

    it('送信内容を変えたら再同意を求めることを書く', () => {
      // user_settings.cookie_consent_version を上げると再同意になる実装の説明。
      // 改定告知の節を削った際、この1文だけは残している
      render(<PrivacyPage />);

      expect(
        within(section()).getByText(/あらためて確認させていただきます/),
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
  });
});
