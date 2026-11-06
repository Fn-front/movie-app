/**
 * プライバシーポリシー
 *
 * GA4 の導入（#892）に伴って用意するが、対象は GA4 だけではない。
 * OpenAI・Have I Been Pwned・YouTube 埋め込みなど、GA4 以前から存在する
 * 外部送信もここで公表する。
 *
 * 電気通信事業法の外部送信規律は「送信される情報の内容」「送信先」
 * 「送信先での利用目的」の3点を求めるため、端末から出るものの表には
 * 利用目的の列を置く。個人情報保護法27条・28条の委託先とは適用法令が
 * 違うので表を分ける。
 */

import { Heading } from '@/components/ui/heading/heading';
import { RATE_LIMIT_RETENTION_HOURS } from '@/constants/rateLimit';
import { CookieConsentToggle } from '@/features/cookieConsent/component/cookieConsentToggle/cookieConsentToggle';

import styles from './privacyPage.module.scss';

/** 制定日。改定したら LAST_UPDATED を更新する */
const ESTABLISHED_AT = '2026年11月3日';
const LAST_UPDATED = '2026年11月6日';

/** 問い合わせ・開示請求の窓口 */
const CONTACT_EMAIL = 'support@example.com';

/** ご利用の端末から外部へ送信される情報（電気通信事業法 外部送信規律） */
const CLIENT_TRANSMISSIONS = [
  {
    to: 'Google（Google アナリティクス）',
    data: '閲覧したページのURL・参照元・ブラウザの種類・IPアドレス。同意いただいた場合は識別用Cookie（_ga など）',
    purpose: 'アクセス状況の分析とレポートの作成',
  },
  {
    // ファサード（クリックで読み込む仕組み）は無く、ダイアログを開いた時点で
    // iframe が生成される。「再生した際」と書くと実態より後ろにずれる
    to: 'YouTube（Google）',
    data: '予告編のダイアログを開いた際のIPアドレス・Cookie',
    purpose: '動画の配信と再生品質の計測',
  },
  {
    to: 'Google / GitHub',
    data: 'ソーシャルログインを選択した際の認証情報',
    purpose: '本人確認（OAuth 認証）',
  },
  {
    to: 'TMDb',
    data: '設定画面の「興味なし一覧」を表示する際のIPアドレス',
    purpose: 'ポスター画像の配信',
  },
];

/** 当社サーバーから取扱いを委託している先（個人情報保護法 27条・28条） */
const SERVER_TRANSMISSIONS = [
  {
    to: 'OpenAI',
    data: 'お気に入り作品のタイトルと評価、興味なしリスト、ウォッチリストの作品名、検索時に入力された作品名',
    purpose: 'おすすめ作品の生成と、検索時の原題候補の提示',
  },
  {
    to: 'Have I Been Pwned',
    data: 'パスワードから生成したハッシュ値の先頭5文字（パスワードそのものは送信しません）',
    purpose: '漏洩が確認されたパスワードの使用を防ぐため',
  },
  {
    to: 'Resend',
    data: '確認コード・パスワード再設定メールの宛先メールアドレス',
    purpose: 'メールの送信',
  },
  {
    to: 'TMDb',
    data: '作品の検索キーワード（利用者を識別する情報は含みません）',
    purpose: '作品情報の取得',
  },
  {
    to: 'GitHub',
    data: 'ソーシャルログイン利用時のアクセストークン',
    purpose: '検証済みメールアドレスの取得',
  },
  {
    to: 'Supabase / Vercel',
    data: '本ポリシーに記載するすべての情報',
    purpose: 'データの保管およびアプリケーションの配信',
  },
];

export function PrivacyPage() {
  return (
    <div className={styles.c_privacy_page}>
      <Heading level={1}>プライバシーポリシー</Heading>
      <p className={styles.c_privacy_page__meta}>
        制定日: {ESTABLISHED_AT} / 最終改定日: {LAST_UPDATED}
      </p>

      <section className={styles.c_privacy_page__section}>
        <Heading level={2}>1. 取得する情報</Heading>
        <ul className={styles.c_privacy_page__list}>
          <li>
            アカウント情報（メールアドレス、ユーザー名、ハッシュ化したパスワード）
          </li>
          <li>
            ソーシャルログインで取得するプロフィール（メールアドレス、表示名）
          </li>
          <li>
            二段階認証の共有鍵（暗号化して保管します）およびリカバリコード
          </li>
          <li>
            利用データ（お気に入り、ウォッチリスト、興味なしリスト、評価、保存した絞り込み条件、各種設定）
          </li>
          <li>
            Cookie同意の状態と日時（ログイン中はアカウントにも保存します）
          </li>
          <li>
            技術情報（IPアドレス、セッションCookie、コンテンツセキュリティポリシー違反のレポート）
          </li>
          {/*
            admin_audit_logs は §1 の表には載せない。記録するのは
            (操作者, 対象, 操作, 日時) の4項目のみで、メールアドレス等の
            内容を持たないため。ただし target_user_id に紐づく以上、当該
            利用者の保有個人データではあるので、§2 の利用目的で
            「管理操作の記録」として覆っている（法32条1項2号）
          */}
        </ul>
      </section>

      <section className={styles.c_privacy_page__section}>
        <Heading level={2}>2. 利用目的</Heading>
        <ul className={styles.c_privacy_page__list}>
          <li>認証とアカウントの管理</li>
          <li>おすすめ作品の生成</li>
          <li>
            不正利用の防止および管理操作の記録（アクセス回数の制限、アカウントの発行・再発行の監査）
          </li>
          <li>障害の調査と品質の改善</li>
          <li>利用状況の把握（同意いただいた場合のみ）</li>
        </ul>
      </section>

      <section className={styles.c_privacy_page__section}>
        <Heading level={2}>3. ご利用の端末から外部へ送信される情報</Heading>
        <p>
          本サービスの利用にあたり、お客様の端末から次の送信先へ情報が送信されます。
        </p>
        <table className={styles.c_privacy_page__table}>
          <thead>
            <tr>
              <th scope='col'>送信先</th>
              <th scope='col'>送信される情報</th>
              <th scope='col'>送信先での利用目的</th>
            </tr>
          </thead>
          <tbody>
            {CLIENT_TRANSMISSIONS.map((row) => (
              <tr key={row.to}>
                <th scope='row'>{row.to}</th>
                <td>{row.data}</td>
                <td>{row.purpose}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={styles.c_privacy_page__section}>
        <Heading level={2}>4. 取扱いを委託している先</Heading>
        <p>
          本サービスのサーバーから、次の事業者へ情報の取扱いを委託しています。
        </p>
        <table className={styles.c_privacy_page__table}>
          <thead>
            <tr>
              <th scope='col'>委託先</th>
              <th scope='col'>取り扱う情報</th>
              <th scope='col'>委託の目的</th>
            </tr>
          </thead>
          <tbody>
            {SERVER_TRANSMISSIONS.map((row) => (
              <tr key={`${row.to}-${row.purpose}`}>
                <th scope='row'>{row.to}</th>
                <td>{row.data}</td>
                <td>{row.purpose}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={styles.c_privacy_page__section}>
        <Heading level={2}>5. 外国にある第三者への提供</Heading>
        <p>
          上記の委託先およびGoogleには、米国など日本国外に所在する事業者が含まれます。個人情報保護委員会規則で定める基準に適合する体制を整備した事業者を選定しています。移転先の国名や講じている措置の詳細は、下記の窓口へのご請求に応じて情報提供します。
        </p>
      </section>

      <section className={styles.c_privacy_page__section}>
        <Heading level={2}>6. Cookie とブラウザの保存領域</Heading>
        <ul className={styles.c_privacy_page__list}>
          <li>
            Cookie:
            ログイン状態を保持するためのセッショントークン、CSRF対策のトークン、ログイン後の戻り先
          </li>
          <li>
            Cookie: <code>_ga</code> および <code>_ga_&lt;コンテナID&gt;</code>
            （アクセス解析に同意いただいた場合のみ）
          </li>
          <li>
            Cookie: YouTube
            が設定するもの（予告編のダイアログを開いた場合。同意の有無に
            かかわらず設定されます）
          </li>
          <li>
            ローカルストレージ:
            表示テーマ、作品一覧の絞り込み条件、Cookie同意の状態・日時・対象者・版
          </li>
          <li>
            セッションストレージ: おすすめ表示の送信済み記録、検索時の原題候補
          </li>
        </ul>
      </section>

      <section className={styles.c_privacy_page__section}>
        <Heading level={2}>7. アクセス解析と同意</Heading>
        <p>
          本サービスは Google アナリティクス 4 を利用しています。Google
          同意モードにより、お客様の同意状態をタグへ伝えています。
        </p>
        <ul className={styles.c_privacy_page__list}>
          <li>
            同意の有無にかかわらず、アクセス解析のタグ自体は読み込まれます。
          </li>
          <li>
            同意いただかない場合、<code>_ga</code>{' '}
            などの識別用Cookieは作成されませんが、IPアドレス・ブラウザの種類・閲覧したURLなどはGoogleへ送信されます。
          </li>
          <li>
            同意いただいた場合に限り識別用Cookieを作成し、同一ブラウザからの再訪問を区別します。
          </li>
        </ul>
        <p>
          広告関連の機能（広告用ストレージ、広告目的でのユーザーデータの送信、広告のパーソナライズ）は常に無効にしています。
        </p>
        <CookieConsentToggle />
      </section>

      <section className={styles.c_privacy_page__section}>
        <Heading level={2}>8. 保存期間と削除</Heading>
        <p>
          アカウントに紐づく情報は、アカウントが存在する間保存します。
          <strong>
            現在、画面からアカウントを削除する機能は提供していません。
          </strong>
          削除のご希望は下記の窓口で承り、手作業で対応します。
        </p>
        <p>
          不正利用の防止に用いる試行回数の記録（メールアドレス・IPアドレスを含みます）は、最後の試行から
          {RATE_LIMIT_RETENTION_HOURS}
          時間が過ぎたものを毎日自動削除します。制限中（ロック中）のものは、解除されるまで保持します。
        </p>
      </section>

      <section className={styles.c_privacy_page__section}>
        <Heading level={2}>9. 安全管理措置</Heading>
        <ul className={styles.c_privacy_page__list}>
          <li>パスワードはハッシュ化して保管し、平文では保存しません。</li>
          <li>二段階認証の共有鍵は暗号化して保管しています。</li>
          <li>通信はすべて暗号化（HTTPS）しています。</li>
          <li>
            データベースへのアクセスはサーバー側に限定し、権限を必要最小限にしています。
          </li>
          <li>
            外国において個人データを取り扱っています（詳細は第5項をご覧ください）。
          </li>
        </ul>
      </section>

      <section className={styles.c_privacy_page__section}>
        <Heading level={2}>10. 開示等のご請求と苦情の申出先</Heading>
        <p>
          保有個人データの利用目的の通知、開示、訂正、利用停止、消去のご請求、および苦情の申出は次の窓口で承ります。手数料はいただきません。
        </p>
        <p>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
        <p>
          ご本人確認のため、ご登録のメールアドレスからご連絡ください。代理人によるご請求の場合は委任状をご提出ください。
        </p>
        <p>運営者の氏名および住所は、ご請求に応じて遅滞なく回答します。</p>
      </section>

      <section className={styles.c_privacy_page__section}>
        <Heading level={2}>11. 本ポリシーの改定について</Heading>
        <p>
          本ポリシーの内容を変更する場合は、本ページに最終改定日を記載して公表します。送信先や送信する情報の内容を変更したときは、アクセス解析への同意をあらためて確認させていただきます。
        </p>
      </section>
    </div>
  );
}
