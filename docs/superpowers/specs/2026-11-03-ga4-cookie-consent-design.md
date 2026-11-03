# GA4 導入と Cookie 同意UI（オプトイン）設計

- 日付: 2026-11-03
- 対象 Issue: #892（GA4 導入）、#893（プライバシー方針の判断）
- 関連 Issue: #169（デプロイ）、#649（Trusted Types enforce 昇格）

## 1. 背景と決定事項

### 1.1 #893 の決定

#893 で提示された A / B / C のうち **B（オプトインの同意UI を導入する）** を採用する。

これに伴い #892 の実装前提が変わる。GA4 の計測は「`NEXT_PUBLIC_GA_ID` が設定されていること」だけでなく「利用者が明示的に同意していること」を条件とする。

### 1.2 確定した仕様

| 論点                     | 決定                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------- |
| 同意前の gtag の振る舞い | **Google Consent Mode v2**。gtag.js は読み込むが `analytics_storage: 'denied'` で開始 |
| 同意UIの表示条件         | `NEXT_PUBLIC_GA_ID` が設定されているときのみ                                          |
| 同意状態の保存           | localStorage を正とし、ログイン中は `user_settings` にも同期する                      |
| E2E の扱い               | 既存 49 本には影響させない。同意UIは単体テストで担保し、E2E 未カバーは別 Issue で起票 |
| 撤回導線                 | 設定画面（`/settings`）と プライバシーポリシーページ（`/privacy`）の両方              |
| プライバシーポリシー     | 本 PR に含める                                                                        |
| PR 分割                  | 1 ブランチ 1 PR で GA4・同意UI・ポリシーをまとめて入れる                              |
| 本番での実測確認         | ローカル本番ビルドで行い、Vercel 実機確認は #169 へ申し送る                           |

### 1.3 Consent Mode v2 を採る判断と、その代償

当初は「同意するまで gtag.js を一切読み込まない」方式を検討したが、**Consent Mode v2 に切り替える**。

Consent Mode は Google タグに同意状態を伝える仕組みで、v2 で `ad_user_data` と `ad_personalization` が加わった。4 パラメータを `granted` / `denied` で宣言する。

```js
gtag('consent', 'default', {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied',
});
gtag('consent', 'update', { analytics_storage: 'granted' }); // 同意後
```

**代償を明記しておく。** `denied` の状態でも gtag.js は読み込まれ、**Cookie を伴わない ping が Google へ送信される**。したがって次が成り立つ。

- 未同意の利用者についても、Google へ接続が発生する（Cookie は置かれない）
- 撤回した後も同様に ping は続く。「撤回すれば Google に一切送られない」とは言えない
- この挙動はプライバシーポリシーに明記する必要がある（§7.2）
- CSP の GA オリジン許可は同意の有無にかかわらず常時必要になる
- `/api/csp-report` と Trusted Types（#649）への影響も常時発生する

代わりに得られるのは、同意状態の表明が Google の標準的な作法に沿うこと、および将来広告機能や Google シグナルを有効化する場合にそのまま拡張できることである。

### 1.4 調査で判明した前提（設計の根拠）

1. **E2E にバナーは出ない。** `NEXT_PUBLIC_GA_ID` はビルド時インライン化される。ローカル E2E は `npm run dev`、CI は `npm start`（`playwright.config.ts:135`）で、どちらも同変数を設定しない。表示条件を GA ID に紐づける限り、既存 49 本の spec は影響を受けない。#893 が懸念した「全シナリオにバナー操作が増える」は発生しない。
2. **認証ページは `AppLayout` を使わない。** `src/app/auth/layout.tsx` は独自の `<main>` のみ。バナーを全ページに出すには **ルートの `src/app/layout.tsx`** に置く必要がある。
3. **`layout.tsx` には既にストレージ読み取りのインラインスクリプトがある。** テーマ初期化（`layout.tsx` の `<head>`）が `localStorage` を同期読みして `data-theme` を決めている。Consent Mode の `default` も同じ手口で解決できる（§5.2）。
4. **`user_settings` は列を足すだけで保存が揃う。** `theme` / `notification_enabled` / `streaming_notice_scope` と同じテーブルで、RLS ポリシーと `updated_at` トリガーが既にある。直近の `20261102045228_add_streaming_notice_scope.sql` がそのままテンプレートになる。
5. **フッターのリンクは現状 0 件。** `Footer` は `links` prop を持つが、`appLayout.tsx:127` は `<Footer />` を引数なしで描画している。さらに `footer.module.scss` の `&__nav` は `lg` 未満で `display: none` のため、SP ではナビ自体が出ない。
6. **本番 Vercel は cron 以外すべて 404。** `src/proxy.ts:41` が `VERCEL_ENV === 'production'` のとき cron 以外を 404 で隠している。サイト公開（#169）まで本番 URL での実測はできない。
7. **外部送信は GA4 以前から存在する。** OpenAI（お気に入りのタイトルと評価・興味なし・ウォッチリストをプロンプトに含める / `generateRecommendations.ts:240-270`）、YouTube 埋め込み（CSP `frame-src`）、`image.tmdb.org`（CSP `img-src`、ブラウザが直接取得するため IP が渡る）、Google / GitHub OAuth（`auth.ts:303,312`）、Resend（`sendOtpEmail.ts:5`）。プライバシーポリシーは GA4 のためだけでなく、この既存の未整備を解消するものになる。

## 2. スコープ

### 2.1 含むもの

- Cookie 同意状態の管理（localStorage への保存・購読・変更）
- ログイン中のサーバー同期と、同意／撤回の日時記録
- Consent Mode v2 による GA4 の読み込みと同意状態の反映
- 未決定時のみ表示する同意バナー
- 同意の撤回UI（設定画面 / プライバシーポリシーページで共有）
- プライバシーポリシーページと、そこへの導線
- CSP への GA オリジン追加
- 上記すべての単体テスト

### 2.2 含まないもの

- カスタムイベント計測（お気に入り追加・検索など）。計測したい指標が固まってから別 Issue で扱う
- 広告機能・Google シグナルの有効化。`ad_storage` / `ad_user_data` / `ad_personalization` は常に `denied` 固定とする
- 同意UIの E2E。別 Issue で起票する
- Google Tag Manager

## 3. アーキテクチャ

同意状態がすべての起点になる。既存の `src/utils/theme.ts` + `src/hooks/useTheme.ts`（`useSyncExternalStore` による外部ストア購読 + サーバー保存）とまったく同じ形に揃える。

### 3.1 新規

| #   | ファイル                                                           | 役割                                                                      |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| 1   | `src/utils/cookieConsent.ts`                                       | 同意状態の読み書きとイベント発火。SSR 安全                                |
| 2   | `src/utils/analytics.ts`                                           | GA ID の取得と形式検証、`gtag('consent','update')` の送出、GA Cookie 削除 |
| 3   | `src/hooks/useCookieConsent.ts`                                    | `useSyncExternalStore` で 1 を購読。`grant()` / `deny()` とサーバー同期   |
| 4   | `src/components/providers/analyticsProvider.tsx`                   | gtag.js の読み込みと、同意状態の `consent update` への反映                |
| 5   | `src/features/cookieConsent/component/cookieConsentBanner/`        | 未決定時のみ表示する下部バナー                                            |
| 6   | `src/features/cookieConsent/component/cookieConsentToggle/`        | 同意する / しない の切り替えUI。設定画面とポリシーページで共有            |
| 7   | `src/features/privacy/privacyPage/`                                | ポリシー本文                                                              |
| 8   | `src/app/privacy/page.tsx` / `layout.tsx`                          | `/privacy` ルート（`AppLayout` を適用）                                   |
| 9   | `supabase/migrations/<ts>_add_cookie_consent_to_user_settings.sql` | `cookie_consent` と `cookie_consent_at` の 2 列を追加                     |

### 3.2 変更

| #   | ファイル                                              | 内容                                                               |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------ |
| 10  | `src/constants/common.ts`                             | `STORAGE_KEYS.COOKIE_CONSENT` と `ROUTES.PRIVACY` を追加           |
| 11  | `src/schema/user.ts`                                  | `UserSettings` と `updateSettingsSchema` に `cookieConsent` を追加 |
| 12  | `src/app/api/user/settings/route.ts`                  | GET の `select` と PUT の受け口に 11 を反映                        |
| 13  | `src/lib/api/user/user.ts`                            | `updateSettings` で `cookieConsent` を送る                         |
| 14  | `src/types/database.types.ts`                         | スキーマ変更後に再生成（手編集しない）                             |
| 15  | `src/lib/security/cspDirectives.mjs`                  | GA オリジンを 3 ディレクティブへ追加                               |
| 16  | `src/app/layout.tsx`                                  | Consent Mode の `default` インラインスクリプト、4 と 5 を描画      |
| 17  | `src/components/layout/appLayout/appLayout.tsx`       | `Footer` に `links` を渡す                                         |
| 18  | `src/components/layout/footer/footer.module.scss`     | `&__nav` を SP でも表示する                                        |
| 19  | `src/features/settings/settingsPage/settingsPage.tsx` | 「Cookie」セクションを追加                                         |

依存の向きは 1 → 3 → {4, 5, 6} の一方向で、循環しない。2 は 4 と 6 からのみ参照される。

### 3.3 配置上の制約

4 と 5 はサーバー同期のため `useSession()` を使う。`layout.tsx` では必ず **`<AppSessionProvider>` の内側**に置くこと。外側に置くと `useSession` が例外を投げる。

## 4. 同意状態の設計

### 4.1 状態

```ts
export type CookieConsentState = 'unknown' | 'unset' | 'granted' | 'denied';
```

| 状態      | 意味                                                   | バナー | `analytics_storage` |
| --------- | ------------------------------------------------------ | ------ | ------------------- |
| `unknown` | SSR / ハイドレート前。まだ localStorage を読めていない | 非表示 | `denied`            |
| `unset`   | 未決定                                                 | 表示   | `denied`            |
| `granted` | 同意済み                                               | 非表示 | `granted`           |
| `denied`  | 拒否                                                   | 非表示 | `denied`            |

`unknown` を `unset` と分けるのが肝である。`getServerSnapshot()` が `unknown` を返すことで、

- SSR 出力にバナーが含まれないため hydration mismatch が起きない
- 既に同意済みの利用者に「バナーが一瞬出てから消える」チラつきが起きない

React 側の `unknown` はバナーの表示制御にのみ使う。`analytics_storage` の初期値は React を待たず、`layout.tsx` のインラインスクリプトが localStorage を同期読みして決める（§5.2）。

### 4.2 永続化と同期

**localStorage を正（source of truth）とする。**

- 保存先: `localStorage['movie-app:cookie-consent']`。値は `granted` / `denied` のみ
- 未知の値・読み取り失敗は `unset` として扱う（壊れた値で同意済み扱いにしない）
- 同一タブ内の同期: カスタムイベント `movie-app:cookie-consent-change`
- 別タブとの同期: `storage` イベント

`useTheme` が `localStorage` 書き込み → `window.dispatchEvent(new Event(THEME_CHANGE_EVENT))` で購読側へ通知している形をそのまま踏襲する。

### 4.3 サーバー同期とマージ規則

ログイン中は `user_settings.cookie_consent` にも保存する。目的は 2 つ — 端末間で同意状態を揃えること、同意／撤回の証跡を残すこと。

**マージ規則: 端末の明示的な選択を常に優先する。サーバー値は端末が `unset` のときだけ適用する。**

| 端末 (localStorage) | サーバー  | 適用結果  | 動作                                         |
| ------------------- | --------- | --------- | -------------------------------------------- |
| `unset`             | `unset`   | `unset`   | バナーを表示する                             |
| `unset`             | `granted` | `granted` | サーバー値を localStorage へ書き戻す         |
| `unset`             | `denied`  | `denied`  | サーバー値を localStorage へ書き戻す         |
| `granted`           | 何であれ  | `granted` | 端末優先。差があればサーバーを端末値で上書き |
| `denied`            | 何であれ  | `denied`  | 端末優先。差があればサーバーを端末値で上書き |

この規則なら、ログイン直後に利用者の選択が勝手に覆ることがない。別端末で同意済みなら、新しい端末ではログイン後にバナーが消える。

同期は「ログイン済み」かつ「`NEXT_PUBLIC_GA_ID` が設定済み」のときだけ行う。未設定時は同意を求める対象が無いため、API も呼ばない。

サーバー保存が失敗しても localStorage 側の決定は巻き戻さない。同意の判断は端末側で完結しており、通信失敗で利用者の意思表示を無かったことにする方が有害なため。`useTheme` がロールバックしているのとは逆の判断になるので、実装時にコメントで理由を残すこと。

### 4.4 DB スキーマ

`20261102045228_add_streaming_notice_scope.sql` と同じ形で `user_settings` に 2 列を足す。新規テーブルではないため GRANT・RLS の追加は不要（既存ポリシーが `user_id` 単位で効く）。

```sql
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS cookie_consent TEXT NOT NULL DEFAULT 'unset';

ALTER TABLE public.user_settings
  DROP CONSTRAINT IF EXISTS chk_user_settings_cookie_consent;

ALTER TABLE public.user_settings
  ADD CONSTRAINT chk_user_settings_cookie_consent
    CHECK (cookie_consent IN ('unset', 'granted', 'denied'));

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS cookie_consent_at TIMESTAMP;
```

`cookie_consent_at` を別列にするのは、`updated_at` がテーマ変更など他の設定更新でも動いてしまい、同意の証跡として使えないため。

適用後は `supabase gen types typescript --project-id <id> > src/types/database.types.ts` で型を再生成する（手編集しない）。

## 5. GA4 と Consent Mode v2

### 5.1 読み込み条件

`analyticsProvider.tsx` は次を満たすときに gtag.js を読み込む。**同意状態は読み込みの条件に含めない**（Consent Mode が同意を表現するため）。

1. `process.env.NEXT_PUBLIC_GA_ID` が設定されている（空文字は未設定扱い）
2. GA4 測定 ID の形式（`/^G-[A-Z0-9]+$/`）に一致する

環境変数は `src/lib/auth/auth.ts:42` や `src/lib/api/nowShowing/nowShowing.server.ts:18` と同じく**関数内で直接参照**する。モジュールトップレベルで定数化すると、テストから `process.env` を差し替えるのに `jest.resetModules()` が必要になるため。

形式検証を入れるのは、測定 ID をインライン初期化スクリプトへ文字列補間するためである。自前の環境変数であり利用者入力ではないが、設定ミスや取り違えがそのままスクリプトへ流れ込む経路を塞いでおく。

### 5.2 `consent default` は gtag.js より前に置く

Consent Mode は **`default` が gtag.js の読み込みより前に `dataLayer` へ積まれていること**が前提になる。後から積むと、既定値が適用される前にヒットが送られてしまう。

`layout.tsx` の `<head>` に、テーマ初期化と同じ形のインラインスクリプトを 1 本追加する。localStorage を同期読みして `analytics_storage` の初期値をその場で決める。

```js
// layout.tsx <head>（イメージ。ストレージキーは STORAGE_KEYS.COOKIE_CONSENT と同期すること）
window.dataLayer = window.dataLayer || [];
function gtag() {
  dataLayer.push(arguments);
}
var c = null;
try {
  c = localStorage.getItem('movie-app:cookie-consent');
} catch (e) {}
gtag('consent', 'default', {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: c === 'granted' ? 'granted' : 'denied',
});
```

localStorage をここで読むことで、**再訪問した同意済み利用者に対して「denied で始めてから update する」往復が起きない**。Google が用意している `wait_for_update` も不要になる。

このスクリプトは既存のテーマ初期化スクリプトと同じ性質（SSR で静的に埋め込むインラインスクリプト、DOM 注入 sink ではない）なので、`layout.tsx` のコメントに書かれているとおり Trusted Types の対象外であり、`script-src 'unsafe-inline'` で許可される。

### 5.3 gtag.js の読み込み

`next/script` の `<Script strategy="afterInteractive">` を 2 本（loader と `gtag('js') / gtag('config')`）。`@next/third-parties` は入れない。同パッケージは公式に experimental と明記されており、ページビュー計測の範囲では `next/script` と機能差がないため（#892 の推奨案 A）。

ページビューの自動計測は GA4 の「拡張計測機能 > ブラウザの履歴イベントに基づくページの変更」が担うため、アプリ側にルート変更フックは書かない。

### 5.4 同意状態の変更を反映する

`analyticsProvider` の effect で、同意状態が確定（`unknown` 以外）するたびに `consent update` を送る。

```js
gtag('consent', 'update', {
  analytics_storage: consent === 'granted' ? 'granted' : 'denied',
});
```

| 遷移                 | 挙動                                                          |
| -------------------- | ------------------------------------------------------------- |
| `unset` → `granted`  | `update` で `granted`。以降 Cookie を伴う計測が始まる         |
| `unset` → `denied`   | `update` で `denied`（既定値と同じ）。Cookie は置かれないまま |
| `granted` → `denied` | `update` で `denied` にし、`_ga` / `_ga_*` Cookie を削除する  |
| `denied` → `granted` | `update` で `granted`                                         |

`update` は `dataLayer` へのコマンド送出なので、ページリロードは不要。前方式で検討していた `ga-disable-<測定ID>` フラグは、Consent Mode が同じ役割を果たすため使わない。

Cookie 削除は `_ga` で始まる名前を対象に、`path=/` かつ `location.hostname` と `.<hostname>` の両方へ `Max-Age=0` を書き込む。GA が登録可能ドメインへ Cookie を置くため、どちらか一方だけでは消えない場合がある。

## 6. CSP の変更

`src/lib/security/cspDirectives.mjs` の `getCspDirectives()` に追加する。Consent Mode では同意の有無にかかわらず gtag.js を読み込むため、常時必要になる。

| ディレクティブ | 追加するオリジン                                                                           |
| -------------- | ------------------------------------------------------------------------------------------ |
| `script-src`   | `https://www.googletagmanager.com`                                                         |
| `connect-src`  | `https://www.googletagmanager.com` `https://*.google-analytics.com` `https://*.google.com` |
| `img-src`      | `https://www.googletagmanager.com` `https://*.google-analytics.com` `https://*.google.com` |

[Google 公式 CSP ガイド](https://developers.google.com/tag-platform/security/guides/csp) の GA4 構成（広告機能なし）に準拠する。公式は `script-src-elem` に記載しているが、本リポジトリは `script-src-elem` を定義していないため `script-src` への追加で足りる。

次は意図的に追加しない。

- `https://*.analytics.google.com` — 公式の列挙に含まれない。`/api/csp-report` に違反が出てから追加する
- 広告機能・Google シグナル向けのオリジン群 — 本設計では 4 パラメータのうち広告系 3 つを `denied` 固定にするため不要。有効化する場合は `frame-src` にも `https://www.googletagmanager.com` を明示追加すること（本リポジトリの `frame-src` は YouTube のみを明示指定しており `default-src` にフォールバックしない）

## 7. プライバシーポリシーページ

`/privacy` を静的ページとして追加する。`AppLayout` を適用し、ヘッダー・フッターを他ページと揃える。認証は不要（`AUTH_REQUIRED_ROUTES` に加えない）。

### 7.1 構成

1. **取得する情報** — アカウント情報（メールアドレス・ユーザー名・ハッシュ化したパスワード）、ソーシャルログインで取得するプロフィール、二段階認証の共有鍵（暗号化して保管）とリカバリコード、利用データ（お気に入り・ウォッチリスト・興味なしリスト・評価・保存フィルター・各種設定）、技術情報（IP アドレス・セッション Cookie・CSP 違反レポート）、管理操作の監査ログ
2. **利用目的** — 認証とアカウント管理、作品レコメンドの生成、不正利用防止（レート制限）、障害調査、利用状況の把握（同意時のみ）
3. **外部送信先** — §7.2 の表
4. **Cookie とローカルストレージ** — セッション Cookie（NextAuth）、`_ga` / `_ga_<測定ID>`（同意時のみ）、localStorage（テーマ・言語・検索履歴・フィルター・Cookie 同意状態）
5. **アクセス解析と同意** — §7.3
6. **保存期間と削除** — アカウント削除時の扱い
7. **開示・訂正・削除の請求窓口**
8. **本ポリシーの改定について**

### 7.2 記載する外部送信先

| 送信先                   | 送信される情報                                                         |
| ------------------------ | ---------------------------------------------------------------------- |
| Google（GA4）            | 閲覧ページ・参照元・端末情報。同意した場合は `_ga` Cookie を伴う       |
| OpenAI                   | お気に入り作品のタイトルと評価、興味なしリスト、ウォッチリストの作品名 |
| YouTube                  | 予告編を再生した際の IP アドレスと Cookie                              |
| TMDb（`image.tmdb.org`） | ポスター画像取得時の IP アドレス                                       |
| Google / GitHub          | ソーシャルログイン利用時の認証情報                                     |
| Resend                   | 確認コード・パスワード再設定メールの宛先メールアドレス                 |
| Supabase / Vercel        | データの保管およびアプリケーションの配信                               |

GA4 以外は既に発生している送信であり、本ページの追加によって初めて公表されることになる。

### 7.3 Consent Mode の挙動を正直に書く

§1.3 のとおり、未同意・撤回後も Cookie を伴わない通信が Google へ発生する。「同意しなければ Google に一切送信されない」と読める書き方をしてはならない。次の 3 点を明記する。

- 同意の有無にかかわらず、アクセス解析タグ自体は読み込まれる
- 同意しない場合、Cookie は作成されず、個人を識別しない形の情報のみが送信される
- 同意した場合に限り `_ga` Cookie を作成し、同一ブラウザからの再訪問を区別する

### 7.4 同意の撤回UI

ページ内に `CookieConsentToggle` を置く。設定画面（`/settings`）は認証必須（`AUTH_REQUIRED_ROUTES`）のため、**未認証の利用者が撤回する唯一の手段**がここになる。オプトインを採る以上、同意した本人が必ず撤回できる必要がある。

`NEXT_PUBLIC_GA_ID` 未設定時は、同意を求める対象が存在しないためトグルを描画しない。

## 8. 導線

- `AppLayout` から `Footer` へ `links={[{ label: 'プライバシーポリシー', href: ROUTES.PRIVACY }]}` を渡す
- `footer.module.scss` の `&__nav` を SP でも表示する。`display: none` を `display: flex` に変え、`@include lg` 内の `display: flex` を削除する（`align-items` と `gap` はそのまま）。リンクは 1 本だけなので SP の幅でも収まる
- 同意バナーからもポリシーページへリンクする

SP でフッターナビが非表示のままだと、バナーが消えた後（＝同意または拒否を選んだ後）にポリシーへ到達する手段が SP から失われるため、フッター側の変更は必須である。

## 9. テスト計画

### 9.1 新規の単体テスト（Jest + React Testing Library）

| ファイル                                              | 観点                                                                                                                                      |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `src/utils/cookieConsent.test.ts`                     | 保存と読み出し / 未知の値は `unset` / localStorage 例外時のフォールバック / SSR（`window` 未定義）安全 / イベント発火                     |
| `src/utils/analytics.test.ts`                         | GA ID 未設定・空文字・不正形式を弾く / 正しい形式を通す / `consent update` の送出内容 / `_ga` Cookie の削除                               |
| `src/hooks/useCookieConsent.test.ts`                  | 初期状態 / `grant()` / `deny()` / カスタムイベントと `storage` での同期 / マージ規則 5 パターン（§4.3）/ サーバー保存失敗時に巻き戻さない |
| `src/components/providers/analyticsProvider.test.tsx` | GA ID 未設定・空文字・不正形式で描画しない / 設定時は同意状態によらず `<Script>` を描画する / 状態変化で `consent update` を送る          |
| `cookieConsentBanner.test.tsx`                        | 4 状態それぞれの表示可否 / 「同意する」「同意しない」の反映 / ポリシーへのリンク / キーボード操作 / ARIA 属性                             |
| `cookieConsentToggle.test.tsx`                        | 初期選択（未決定時は「同意しない」側）/ 切り替えの反映 / GA ID 未設定時は描画しない                                                       |
| `privacyPage.test.tsx`                                | 見出し構造 / 外部送信先 7 件の記載 / Consent Mode の挙動（§7.3 の 3 点）/ 撤回UIの存在                                                    |

### 9.2 既存テストの更新

| ファイル                                       | 内容                                                                                                                   |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `src/lib/security/cspDirectives.test.ts`       | `:20` と `:28` の `toBe()` による完全一致 assert が落ちるため期待値を更新。`img-src` / `connect-src` の `toContain` も |
| `src/lib/security/csp.test.ts`                 | 部分一致（`toContain`）のため**追記だけでは落ちない**。GA オリジンを含む assert を能動的に追加する                     |
| `src/app/api/user/settings/route.test.ts`      | `cookieConsent` の GET 返却・PUT 受理・不正値の拒否・列が NULL の既存行の扱い                                          |
| `src/lib/api/user/user.test.ts`                | `updateSettings` が `cookieConsent` を送ること                                                                         |
| `src/components/layout/footer/footer.test.tsx` | `links` を渡したときのリンク描画                                                                                       |
| `settingsPage.test.tsx`                        | Cookie セクションの追加                                                                                                |

### 9.3 カバレッジ

`jest.config.js:52-59` の閾値（Statements / Branches / Functions / Lines すべて 80%）を維持する。

### 9.4 E2E

既存 49 本には影響しない（`NEXT_PUBLIC_GA_ID` 未設定のため同意UIが描画されず、同期 API も呼ばれない）。同意UIと `/privacy` の E2E は本 PR では追加せず、別 Issue として起票する。

## 10. 完了条件

- [ ] `NEXT_PUBLIC_GA_ID` 未設定時は同意UIも gtag.js も一切描画しない
- [ ] `consent default` が gtag.js より前に積まれ、再訪問時に往復が起きない
- [ ] バナーから同意 / 拒否ができ、`consent update` が送られる
- [ ] `/settings` と `/privacy` の両方から撤回でき、`_ga` Cookie が削除される
- [ ] マージ規則（§4.3）の 5 パターンが期待どおりに動く
- [ ] サーバー保存が失敗しても端末側の決定が巻き戻らない
- [ ] `/privacy` に外部送信先 7 件と Consent Mode の挙動（§7.3）が記載されている
- [ ] フッターから `/privacy` へ到達できる（PC・SP の両方）
- [ ] CSP に GA オリジンが追加され、`cspDirectives.test.ts` の期待値が更新されている
- [ ] `csp.test.ts` に GA オリジンを含む assert が**追加**されている
- [ ] マイグレーションを適用し、`src/types/database.types.ts` を再生成した
- [ ] カバレッジ 80% 以上を維持
- [ ] `npm run lint` / `npx tsc --noEmit` / `npm run prettier:check` が通る
- [ ] 既存 E2E 49 本が通る
- [ ] ローカル本番ビルド（`NEXT_PUBLIC_GA_ID` を付けて `npm run build && npm start`）で、同意前後の `consent` 状態が DevTools で確認でき、CSP 違反が出ない
- [ ] `.claude/documents/environment-variables.md:425` の `- [ ] **Google Analytics**: 導入する？しない？` を解消する
- [ ] `.claude/documents/roadmap/phase11-deploy.md` に項目を追加する

## 11. 申し送り

| 宛先       | 内容                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #169       | Vercel 本番（Production スコープのみ）への `NEXT_PUBLIC_GA_ID` 登録と再デプロイ。`NEXT_PUBLIC_*` はビルド時に静的置換されるため、登録だけでは反映されない。GA4 側の「拡張計測機能 > ブラウザの履歴イベントに基づくページの変更」が有効であることの確認。実トラフィックでの `page_view` 計上確認と `/api/csp-report` の監視                                                                                                                                  |
| #649       | Consent Mode では同意の有無によらず gtag.js を常時読み込むため、Trusted Types 違反も常時発生する。gtag.js は script 要素を動的生成して `.src` を代入し、`next/script` のインライン初期化も DOM へ注入する。また Google のタグが独自ポリシー名を `createPolicy` する場合、`TRUSTED_TYPES_POLICIES` に無い名前は `trustedTypes.ts:41-49` で throw する。Report-Only では報告されないため、enforce 昇格の検証は本番ビルドで実際に enforce を有効化して行うこと |
| 新規 Issue | 同意バナー・`/privacy`・撤回フロー・マージ規則の E2E                                                                                                                                                                                                                                                                                                                                                                                                        |
| 新規 Issue | カスタムイベント計測（計測したい指標が固まってから）                                                                                                                                                                                                                                                                                                                                                                                                        |

## 12. 環境変数の扱い

| 設定先                                 | 可否       | 理由                                                                                                                                               |
| -------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel Production                      | 設定する   | 本番のみ計測する                                                                                                                                   |
| Vercel Preview / Development           | 設定しない | 開発データの混入を防ぐ                                                                                                                             |
| `.env.local` / `.env.local.example`    | 追加しない | `playwright.config.ts:10` が `.env.local` を読み、ローカル E2E は `npm run dev` で動く。設定するとローカル E2E 実行中に GA4 へ開発データが混入する |
| `.github/workflows/e2e.yml`            | 追加しない | `NEXT_PUBLIC_*` はビルド時インライン化されるため、build step に渡さないことで CI での読み込みを封じる                                              |
| GitHub Secrets（Actions / Dependabot） | 登録しない | HTML に露出する公開値であり、ワークフローから参照もしない（`.claude/rules/ci-secrets.md`）                                                         |
