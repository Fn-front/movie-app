/**
 * GA4（gtag.js）との境界
 *
 * Consent Mode v2（advanced）で運用する。gtag.js は同意の有無によらず
 * 読み込み、`analytics_storage` で同意状態を表す。
 *
 * ⚠️ このモジュールは window.dataLayer へ直接 push してはならない。
 * gtag.js は要素が Arguments オブジェクトのときだけコマンドとして処理し、
 * Array は無視する。TypeScript で `(...args) => dataLayer.push(args)` と
 * 書くと Array を積み、「consent default は効くのに update だけ効かない」
 * という切り分けにくい壊れ方をする。window.gtag(...) だけを経由すること。
 */

import type { AnalyticsEventName } from '@/constants/analytics';
import { STORAGE_KEYS } from '@/constants/common';
import { COOKIE_CONSENT_VERSION } from '@/constants/user';

/**
 * GA4 測定IDの形式
 *
 * `G-` + 英数大文字。Google は桁数を公式に保証していないため幅を持たせる。
 * 「手動インストール」が出す `GT-` 形式は本構成では扱わないので弾く。
 * 引用符・バックスラッシュ・`<` を通さないので、インライン補間の防御も兼ねる。
 */
const MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]{6,20}$/;

/**
 * 有効な GA4 測定IDを返す。無効なら null
 *
 * 環境変数はモジュールトップレベルではなくこの関数の中で読む。定数化すると
 * テストから `process.env` を差し替えるのに `jest.resetModules()` が要る。
 *
 * `.trim()` しているのは、Vercel の環境変数に貼り付けたときの前後空白で
 * 不一致になる事故（「設定したのに計測されない」の典型）を防ぐため。
 */
export function getGaMeasurementId(): string | null {
  const raw = process.env.NEXT_PUBLIC_GA_ID?.trim();
  if (!raw) return null;

  if (!MEASUREMENT_ID_PATTERN.test(raw)) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[analytics] NEXT_PUBLIC_GA_ID の形式が不正なため計測を無効にします: ${raw}`,
      );
    }
    return null;
  }
  return raw;
}

/**
 * `consent default` を積む <head> インラインスクリプトを組み立てる
 *
 * Consent Mode は `default` が gtag.js の読み込みより前に dataLayer へ
 * 積まれていることが前提。そのため layout.tsx の <head> に静的に埋める。
 *
 * localStorage をここで同期読みすることで、再訪問した同意済み利用者に
 * 「denied で始めて update する」往復が起きない（Google の
 * `wait_for_update` も不要になる）。
 *
 * 文字列を直書きせず関数にしているのは、ストレージキーと版を補間して
 * 定数との同期漏れを構造的に防ぐため。版の比較だけは localStorage の
 * 生文字列と行う（同期読みで数値化を挟まないため。getStoredConsentVersion
 * の数値正規化とは別経路になるが、どちらも「現行版と一致するか」を見る）。
 *
 * owner は見ない。認証状態は Cookie 側にあり同期読みできないため。
 * ログアウト時に owner 付きレコードを消す（clearOwnedConsent）ことで、
 * 未認証の第三者に前の利用者の同意が適用される経路を断つ。
 */
export function buildConsentBootstrapScript(
  version: number = COOKIE_CONSENT_VERSION,
): string {
  const stateKey = JSON.stringify(STORAGE_KEYS.COOKIE_CONSENT);
  const versionKey = JSON.stringify(STORAGE_KEYS.COOKIE_CONSENT_VERSION);
  const expectedVersion = JSON.stringify(String(version));

  return `(function(){
window.dataLayer=window.dataLayer||[];
window.gtag=function(){window.dataLayer.push(arguments)};
var c=null,v=null;
try{c=localStorage.getItem(${stateKey});v=localStorage.getItem(${versionKey})}catch(e){}
window.gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:(c==='granted'&&v===${expectedVersion})?'granted':'denied'});
})();`;
}

/**
 * gtag.js 本体を読み込んだあとに実行する初期化コマンド
 *
 * dataLayer / gtag は再定義しない（<head> で積んだ consent default ごと
 * 消えるため）。page_view の自動送信は切る。App Router は URL クエリの
 * 書き換えでも history イベントを発火し、本アプリはフィルタ・ソート・
 * ページングを router.replace で URL に書いているため、自動送信のままだと
 * 操作のたびに計上されてしまう。
 */
export function buildGtagInitScript(measurementId: string): string {
  const id = JSON.stringify(measurementId);
  return `window.gtag('js',new Date());
window.gtag('config',${id},{send_page_view:false});`;
}

/** 同意状態を gtag へ反映する。gtag.js が無い環境では何もしない */
export function sendConsentUpdate(granted: boolean): void {
  window.gtag?.('consent', 'update', {
    analytics_storage: granted ? 'granted' : 'denied',
  });
}

/** page_view を手動送信する */
export function sendPageView(params: {
  pagePath: string;
  pageLocation: string;
  pageTitle: string;
}): void {
  window.gtag?.('event', 'page_view', {
    page_path: params.pagePath,
    page_location: params.pageLocation,
    page_title: params.pageTitle,
  });
}

/**
 * カスタムイベントのパラメータ
 *
 * GA4 が受け付けるのはスカラー値のみ。配列・オブジェクトは送れないので、
 * 複数値は呼び出し側で文字列へ畳んでから渡す（`filter_types` など）。
 */
export type AnalyticsEventParams = Record<string, string | number | boolean>;

/**
 * カスタムイベントを送信する
 *
 * ガードは `sendPageView` と同じく gtag の存在のみで、**同意状態は見ない**。
 * Consent Mode v2 advanced の建て付けどおりの挙動で、未同意でも Cookie を
 * 伴わないヒットとして送られる。同意済み・未同意でパラメータは変わらない。
 *
 * ここで `useCookieConsent` を参照しないことには意味がある。購読を増やすと
 * 送信箇所のコンポーネントが同意状態の変化で再レンダリングされる（#939）。
 *
 * ⚠️ パラメータに個人を特定しうる値を入れないこと。理由と禁止事項は
 * `src/constants/analytics.ts` の冒頭に書いてある。
 */
export function sendEvent(
  name: AnalyticsEventName,
  params?: AnalyticsEventParams,
): void {
  window.gtag?.('event', name, params);
}

/**
 * ホスト名から Cookie の domain 候補を、最も具体的なものから列挙する
 *
 * 例: www.example.com → ['www.example.com', 'example.com', 'com']
 * 末尾の TLD 単体はブラウザが拒否するが、害は無いので絞り込まない
 * （Public Suffix List を自前で持たないため）。
 *
 * jsdom では window.location を差し替えられないため、サブドメイン配信時の
 * 挙動はこの関数単体で検証する。
 */
export function buildDomainCandidates(hostname: string): string[] {
  const parts = hostname.split('.');
  return parts.map((_, index) => parts.slice(index).join('.'));
}

/** `document.cookie` から `_ga` で始まる Cookie 名を列挙する */
function listGaCookieNames(): string[] {
  return document.cookie
    .split(';')
    .map((part) => part.split('=')[0]?.trim() ?? '')
    .filter((name) => name.startsWith('_ga'));
}

/**
 * GA が置いた Cookie（`_ga` / `_ga_<コンテナID>`）を削除する
 *
 * 単純に現在のホスト名だけを対象にすると消えない。GA の `cookie_domain` は
 * 既定 `'auto'` で eTLD+1（登録可能ドメイン）に Cookie を置くため、
 * `www.example.com` で配信していても Cookie は `.example.com` にある。
 * localhost では `cookie_domain` が `'none'` になり domain 属性なしの
 * host-only Cookie になる。したがって全サフィックス × 3通り（domain 有無）を
 * 総当たりする。`document.cookie` は domain / path 属性を返さないので、
 * どこに置かれたかは読み取れない。
 *
 * 呼ぶ前に `sendConsentUpdate(false)` を済ませること。逆順だと、キューに
 * 残ったヒットが削除直後に `_ga` を書き戻しうる。
 */
export function deleteGaCookies(): void {
  if (typeof document === 'undefined') return;

  const names = listGaCookieNames();
  if (names.length === 0) return;

  const domains = buildDomainCandidates(window.location.hostname);

  for (const name of names) {
    // domain 属性なし（localhost の host-only Cookie 向け）
    document.cookie = `${name}=; path=/; max-age=0`;
    for (const domain of domains) {
      document.cookie = `${name}=; path=/; max-age=0; domain=${domain}`;
      document.cookie = `${name}=; path=/; max-age=0; domain=.${domain}`;
    }
  }

  const remaining = listGaCookieNames();
  if (remaining.length > 0 && process.env.NODE_ENV !== 'production') {
    console.warn(
      `[analytics] 削除できなかった GA Cookie があります: ${remaining.join(', ')}`,
    );
  }
}
