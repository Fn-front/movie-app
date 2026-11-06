/**
 * プライバシーポリシー
 *
 * 公表するのは法令が求める範囲に絞る。義務の無い節を増やすと、実装を変える
 * たびに本文だけ古くなって嘘になる（#933 / #937 はどちらもその修正だった）。
 *
 * 載せる根拠は2系統あり、適用法令が違うので節を分ける。
 * - 電気通信事業法27条の12（外部送信規律）… 端末から直接出るもの。
 *   「送信される情報の内容」「送信先」「送信先での利用目的」の3点を求める
 * - 個人情報保護法32条1項 … 利用目的・安全管理措置・開示等の請求手続・苦情の申出先
 *
 * 意図的に載せていないもの（いずれも公表義務が無い）。消したくなった節を
 * 足し戻す前に、ここを読むこと:
 * - 取得する情報の項目一覧 … 32条が求めるのは利用目的であって項目の列挙ではない
 * - サーバー側の委託先一覧 … 法27条5項1号により第三者提供に当たらない。
 *   外国での取扱いは §4 で国名を示すことで足りる（事業者名は不要）
 * - Cookie・ローカルストレージの中身 … 外部送信を伴わない端末内保存は規律の対象外
 * - 保存期間 … 32条1項に保存期間は含まれない（GDPR 13条と混同しやすい）
 */

import { Heading } from '@/components/ui/heading/heading';
import { EXTERNAL_URLS } from '@/constants/external';
import { CookieConsentToggle } from '@/features/cookieConsent/component/cookieConsentToggle/cookieConsentToggle';

import styles from './privacyPage.module.scss';

/** 改定したら更新する。§3 の再同意の説明がこの日付を前提にしている */
const LAST_UPDATED = '2026年11月7日';

/**
 * 予告編の埋め込み先ホスト名
 *
 * ポリシー本文にホスト名を直書きすると、埋め込み先を変えたときに記述だけ
 * 古いまま残る（しかもテストでは落ちない）。実装から導出して構造的に外れない
 * ようにする（#937）。
 */
const YOUTUBE_EMBED_HOST = new URL(EXTERNAL_URLS.YOUTUBE_EMBED).hostname;

/** 問い合わせ・開示請求の窓口 */
const CONTACT_EMAIL = 'support@example.com';

/**
 * ご利用の端末から外部へ送信される情報（電気通信事業法 外部送信規律）
 *
 * 法27条の12 ただし書き一号により「当該電気通信役務の提供のために真に必要な
 * 情報」は対象外。総務省ガイドラインが除外例として挙げる「認証に用いる情報」
 * 「コンテンツの表示に必要な情報」に当たるものは、ここに載せない。
 * - ソーシャルログイン（Google / GitHub）への認証情報 … 認証に必要
 * - TMDb へのポスター画像取得に伴うIPアドレス … 画像の表示に必要
 *
 * 逆に下の2件は、配信そのものを超えた「計測」が目的に含まれるため載せる。
 */
const CLIENT_TRANSMISSIONS = [
  {
    // 操作の記録（カスタムイベント）は #938 で追加した。Consent Mode は
    // advanced なので、同意の有無にかかわらず送信される点に注意。
    //
    // 「検索キーワードは送信しません」と書けるのは、同じ #938 で
    // page_location からクエリ文字列を落としたから（buildPageLocation）。
    // あそこを window.location.href に戻すと /search?query=<キーワード> が
    // そのまま送られ、この記述が嘘になる。
    //
    // URLを「クエリ文字列を除く」と限定する以上、検索の内訳として実際に
    // 送っている値（絞り込み種別・結果件数・ページ番号）は列挙しないと、
    // 外部送信規律の「送信される情報の内容」が実装より狭くなる
    to: 'Google（Google アナリティクス）',
    data: '閲覧したページのURL（クエリ文字列を除く）・参照元・ブラウザの種類・IPアドレス、本サービス内での操作（ウォッチリストおよびお気に入りへの追加・更新・削除と対象作品のID、予告編を表示した作品のID、検索の実行とその絞り込み種別・結果件数・ページ番号）。検索キーワードや作品名は送信しません。同意いただいた場合は識別用Cookie（_ga など）',
    purpose: 'アクセス状況の分析とレポートの作成',
  },
  {
    // ファサード（クリックで読み込む仕組み）は無く、ダイアログを開いた時点で
    // iframe が生成される。「再生した際」と書くと実態より後ろにずれる。
    //
    // 「計測」と書く以上、計測対象を列挙しないと目的と内容が食い違う。
    // 送信先は動画配信・不正検知の関連ドメイン（googlevideo.com /
    // jnn-pa.googleapis.com 等）にも及ぶため、括弧で含む旨を書く。
    // URL が「オリジンまで」なのは next.config.mjs:103-104 の
    // Referrer-Policy: strict-origin-when-cross-origin による
    to: 'YouTube（Google。動画配信・不正検知の関連ドメインを含みます）',
    data: '予告編のダイアログを開いた際のIPアドレス・ブラウザの種類・視聴する動画の識別子・本サービスのURL（オリジンまで）・再生状況',
    purpose: '動画の配信と再生品質の計測',
  },
];

export function PrivacyPage() {
  return (
    <div className={styles.c_privacy_page}>
      <Heading level={1}>プライバシーポリシー</Heading>
      <p className={styles.c_privacy_page__meta}>最終改定日: {LAST_UPDATED}</p>

      <section className={styles.c_privacy_page__section}>
        <Heading level={2}>1. 利用目的</Heading>
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
        <Heading level={2}>2. ご利用の端末から外部へ送信される情報</Heading>
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
        {/*
          Cookie を設定しない旨は #937 の実測に基づく。切り替え前はダイアログを
          開いた時点で5件設定されていたため、埋め込み先を戻すとこの記述は嘘になる
        */}
        <p>
          予告編の埋め込みには YouTube のプライバシー強化モード（
          <code>{YOUTUBE_EMBED_HOST}</code>
          ）を利用しており、当社が確認した範囲では、ダイアログを開いても再生しても
          YouTube の Cookie は設定されません。
        </p>
      </section>

      <section className={styles.c_privacy_page__section}>
        <Heading level={2}>3. アクセス解析と同意</Heading>
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
          <li>
            閲覧の記録に加えて、ウォッチリストやお気に入りへの追加・削除、検索の実行、予告編の表示といった操作も送信します。これらも同意の有無にかかわらず送信されます。
          </li>
          <li>
            操作とともに送信するのは、対象作品のID（ウォッチリスト・お気に入り・予告編）と、検索の絞り込み種別・結果件数・ページ番号です。検索キーワード・作品名・評価の点数・お客様のアカウント情報は含みません。URLもクエリ文字列を除いた部分のみを送信します。
          </li>
        </ul>
        <p>
          広告関連の機能（広告用ストレージ、広告目的でのユーザーデータの送信、広告のパーソナライズ）は常に無効にしています。
        </p>
        {/*
          同意の版（user_settings.cookie_consent_version）を上げると再同意を求める
          実装になっている。その挙動の説明なので、改定告知の節を削っても残す
        */}
        <p>
          送信先や送信する情報の内容を変更したときは、本ページに最終改定日を記載して公表し、アクセス解析への同意をあらためて確認させていただきます。
        </p>
        <CookieConsentToggle />
      </section>

      <section className={styles.c_privacy_page__section}>
        <Heading level={2}>4. 外国における個人データの取扱い</Heading>
        <p>
          本サービスは、アプリケーションの実行および一部の処理の委託に伴い、
          <strong>米国</strong>
          において個人データを取り扱っています。委託先には、個人情報保護委員会規則で定める基準に適合する体制を整備した事業者を選定しています。委託先の名称、当該国の個人情報の保護に関する制度、および講じている措置の詳細は、下記の窓口へのご請求に応じて情報提供します。
        </p>
      </section>

      <section className={styles.c_privacy_page__section}>
        <Heading level={2}>5. 安全管理措置</Heading>
        {/*
          法32条1項4号。ガイドライン通則編により「概要」で足り、かつ「本人の
          知り得る状態に置くことにより支障を及ぼすおそれがあるもの」は除いてよい。
          ハッシュ関数名や鍵長のような実装詳細は攻撃者への情報提供になるため書かない
        */}
        <ul className={styles.c_privacy_page__list}>
          <li>通信はすべて暗号化（HTTPS）しています。</li>
          <li>
            パスワードおよび二段階認証の共有鍵は、ハッシュ化または暗号化して保管し、平文では保存しません。
          </li>
          <li>
            個人データへのアクセスはサーバー側に限定し、権限を必要最小限にしています。
          </li>
          <li>
            外国において個人データを取り扱っています（詳細は第4項をご覧ください）。
          </li>
        </ul>
      </section>

      <section className={styles.c_privacy_page__section}>
        <Heading level={2}>6. 開示等のご請求と苦情の申出先</Heading>
        <p>
          保有個人データの利用目的の通知、開示、訂正、利用停止、消去のご請求、および苦情の申出は次の窓口で承ります。手数料はいただきません。
        </p>
        <p>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
        {/*
          公表義務は無いが、画面から消せないことを事前に知れないと利用者が
          窓口の存在に辿り着けない。実装上の制約の開示として1文だけ残す
        */}
        <p>
          現在、画面からアカウントを削除する機能は提供していません。アカウントの削除をご希望の場合も同じ窓口で承り、手作業で対応します。
        </p>
        <p>
          ご本人確認のため、ご登録のメールアドレスからご連絡ください。代理人によるご請求の場合は委任状をご提出ください。
        </p>
        <p>運営者の氏名および住所は、ご請求に応じて遅滞なく回答します。</p>
      </section>
    </div>
  );
}
