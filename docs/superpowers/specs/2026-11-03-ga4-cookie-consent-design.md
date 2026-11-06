# GA4 導入と Cookie 同意UI（オプトイン）設計

- 日付: 2026-11-03
- 対象 Issue: #892（GA4 導入）、#893（プライバシー方針の判断）
- 関連 Issue: #169（デプロイ）、#649（Trusted Types enforce 昇格）

## 0. 改訂履歴

| 版  | 内容                                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 初版。同意まで gtag.js を読み込まない方式、localStorage のみ                                                                                               |
| 2   | Consent Mode v2 へ変更。`user_settings` へのサーバー同期を追加                                                                                             |
| 3   | 未認証時の同意時刻、ログアウト時の扱いを定義                                                                                                               |
| 4   | マージ規則を証跡優先へ、page_view を手動送信へ、外部送信先の誤りを訂正                                                                                     |
| 5   | マージ規則を純関数へ切り出し、版はサーバーが書く方式へ                                                                                                     |
| 6   | **マージ規則を実行可能な式として確定**（`at` 比較・`writeLocal` の未定義を解消）、バナー配置を `fixed` + 高さ変数方式へ、ログアウト消去を `signOut` 直前へ |

## 1. 背景と決定事項

### 1.1 #893 の決定

#893 の A / B / C のうち **B（オプトインの同意UI を導入する）** を採用する。

### 1.2 確定した仕様

| 論点                     | 決定                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| 同意前の gtag の振る舞い | **Consent Mode v2（advanced）**。gtag.js は読み込み、`analytics_storage: 'denied'` で開始            |
| 同意取得UI（バナー）     | `NEXT_PUBLIC_GA_ID` が有効なときのみ表示                                                             |
| 撤回UI（トグル）         | GA ID の有無によらず、保存済み状態が `unset` 以外なら表示                                            |
| 同意状態の保存           | localStorage を正とし、ログイン中は `user_settings` にも同期する                                     |
| **同期の発火条件**       | **認証済みであること。GA ID の有無は条件に含めない**                                                 |
| 衝突解決                 | 有効なレコードのうち `at` が明確に新しい方。決着しないときは `denied` 優先 → 時刻を持つ方 → サーバー |
| **PUT の条件**           | **状態または版が異なるときのみ。`at` の差だけでは送らない**（収束のため）                            |
| 同意の版                 | サーバーが書く。クライアントからは送らせない                                                         |
| page_view の計上         | 手動送信。GA4 の拡張計測「ブラウザの履歴イベント」はオフ                                             |
| **バナーの配置**         | **`position: fixed` ＋ 各コンテナから `var(--cookie-banner-height)` を引く**                         |
| 撤回導線                 | `/settings` と `/privacy` の両方                                                                     |
| プライバシーポリシー     | 本 PR に含める                                                                                       |
| 本番での実測確認         | ローカル本番ビルドで行い、Vercel 実機確認は #169 へ申し送る                                          |

### 1.3 Consent Mode advanced を採る判断と、その代償

| 形態         | 同意前の挙動                                          |
| ------------ | ----------------------------------------------------- |
| basic        | 同意するまで gtag.js を読み込まない                   |
| **advanced** | gtag.js を読み込み、Cookie なしの ping を送る（採用） |

**advanced を採るが、現スコープで得られる見返りはゼロである。** advanced の実利は「同意しなかった利用者のモデリング」だが、§2.2 のとおり広告系 3 パラメータを恒久 `denied` とし Google シグナルも無効にするため機能しない。採用理由は「将来 Google シグナルや広告機能を有効化する際にタグ構成を変えずに済む」の一点に限る。

支払うコスト。

- 未同意の利用者についても Google へ接続が発生する（Cookie は置かれないが **IP アドレス・User-Agent・閲覧 URL・リファラは送られる**）
- 撤回後も ping は続く
- CSP の GA オリジン許可が常時必要（§6）
- Trusted Types enforce 昇格（#649）の障害が常時化する
- `afterInteractive` の `<Script src>` は静的 HTML に `<link rel="preload" as="script">` を埋めるため、gtag.js のダウンロードは HTML パース時点で始まる

### 1.4 調査で判明した前提

1. **認証ページは `AppLayout` を使わない。** バナーを全ページに出すにはルートの `src/app/layout.tsx` に置く。
2. **`layout.tsx` には既にストレージ読み取りのインラインスクリプトがある**（テーマ初期化）。
3. **`AppLayout` はドキュメントをスクロールさせない。** `.c_app_layout { height: 100vh }` / `&__body { overflow: hidden }` / `&__main { overflow-y: auto }` / `&__footer { margin-top: auto }`。フッターは常にビューポート下端にある。
4. **この定高に依存している子孫がある。** `sidebar.module.scss:9` の `height: 100%` → `watchlistPanel.module.scss:6` の `height: 100%`。`.c_app_layout` が定高を失うと、サイドバーのウォッチリストが内部スクロールをやめて伸び続ける。**したがって `.c_app_layout` の定高は維持しなければならない**（§8.1）。
5. **`AppLayout` も `auth/layout` も通らないページが 3 本ある。** `/theater-experience`・`/admin/accounts`・`/admin/awards` は `layout.tsx` を持たず、ルート要素は高さを持たない素の div。
6. **トーストは画面下部固定。** `toast.module.scss` の `.c_toast__viewport { position: fixed; bottom: 0; right: 0; z-index: 1080 }`。
7. **`signOut` は完全遷移する。** next-auth の `redirect: true`（既定）が `window.location.href` を書き換える。呼び出しは `useUserMenu.ts:36`・`mobileDrawer.tsx:162`・`sessionExpiryHandler.tsx:36`・`axios.ts:77` の 4 箇所。**ログアウトしたタブは `authenticated → unauthenticated` を React が観測する前に破棄される**（§4.3）。
8. **フッターのリンクは現状 0 件。** `appLayout.tsx:128` が `<Footer />` を引数なしで描画。`&__nav` は `lg` 未満で `display: none`。
9. **App Router は URL クエリの書き換えでも history イベントを発火する。** フィルタ・ソート・ページングを `router.replace` で URL に書いている（`useMovieFilter.ts:121,132`、`useMovieList.ts:394`、`useAwards.ts:145`、`useTheaterSelection.ts:30`）。一方 **`usePathname()` はクエリだけの変化では再発火しない**（`app-router.js` が `url.pathname` を渡すため値が同一）。これが §5.5 の手動送信が成立する根拠。
10. **`useTheme` には「サーバー → 端末」の読み出しが無い。** マージ処理に踏襲できる前例は無い。
11. **`SessionProvider` は `refetchOnWindowFocus` を無効化していない。**
12. **`reactStrictMode: true`**（`next.config.mjs:42`）。dev では effect が 2 回走る。
13. **`getSettings()` は既に 3 箇所から `useEffect` で呼ばれている**（`streamingNoticeSettings.tsx:44`、`notificationSettings.tsx:29`、`streamingSortHint.tsx:37`）。react-query を通していないので、同期を足すと `/settings` で同一 GET が 4 本になる。
14. **`next/script` はこのリポジトリで使用実績ゼロ。** `afterInteractive` は `null` を返し `useEffect` で `document.body.appendChild` するため、jsdom では**インラインが実際に実行される**。必ずモックする。
15. **`jest.setup.js` の `ResizeObserver` は完全な no-op スタブ**（`observe(){}` が空）。コールバックが発火しないため、高さ反映をそのままではテストできない。
16. **本番 Vercel は cron 以外すべて 404**（`src/proxy.ts:41`）。#169 まで本番での実測も CSP 違反の収集もできない。
17. **`user_settings` は列を足すだけで保存が揃う。** ただし既存の `created_at` / `updated_at` が naive `TIMESTAMP` なのは #160 の取りこぼしで、**踏襲してはならない**。
18. **この worktree に `node_modules` が無い。** 実装前に `npm ci` が要る。

### 1.5 外部送信の実態（初版の誤りを訂正）

初版は外部送信先を 7 件と書いたが誤りと漏れがあった。適用法令が異なるため 2 系統に分ける。

#### ブラウザから外部へ出るもの（電気通信事業法 外部送信規律）

| 送信先                     | 根拠                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------- |
| Google（GA4）              | 本 PR で追加                                                                       |
| YouTube（iframe）          | `videoDialog.tsx`、CSP `frame-src`                                                 |
| Google / GitHub（OAuth）   | `auth.ts` のプロバイダ定義によるリダイレクト                                       |
| `image.tmdb.org`（限定的） | `dismissedMoviesList.tsx:165` の `unoptimized` 1 箇所のみ（`/settings`、認証必須） |

**`image.tmdb.org` に利用者の IP が渡るという初版の記述は誤り。** 画像はすべて `next/image` 経由で `next.config.mjs:46-52` に `remotePatterns` 登録済み。TMDb へ取りに行くのはサーバー。

#### サーバーから外部へ出るもの（個人情報保護法 27 条・28 条）

| 送信先                              | 送信される情報                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------ |
| OpenAI                              | お気に入り作品のタイトルと評価、興味なしリスト、ウォッチリストの作品名                                 |
| **Have I Been Pwned（初版で漏れ）** | パスワードの SHA-1 ハッシュ**先頭 5 文字**（`constants/auth.ts:165`。登録・再設定確定・変更の 3 経路） |
| Resend                              | 確認コード・パスワード再設定メールの宛先                                                               |
| TMDb API                            | 作品データの取得（利用者情報は送らない）                                                               |
| GitHub API                          | 検証済みメールアドレスの取得                                                                           |
| Supabase / Vercel                   | データの保管およびアプリケーションの配信                                                               |

**Supabase はブラウザ発の送信先ではない。** `createClient` はすべてサーバー側ファイルにある。

Wikipedia と eiga.com は admin の賞マスタ同期専用・利用者データ非関与のため記載しない。**網羅の基準は「利用者のデータを伴う送信」とする。**

## 2. スコープ

### 2.1 含むもの

- Cookie 同意状態の管理（localStorage への保存・購読・変更）
- ログイン中のサーバー同期（証跡優先のマージ、共有端末対策、版管理）
- Consent Mode v2（advanced）による GA4 の読み込みと同意状態の反映
- page_view の手動送信
- 同意バナーと撤回UI、プライバシーポリシーページと導線
- CSP への GA オリジン追加
- 単体テストと `/privacy` の a11y E2E

### 2.2 含まないもの

- カスタムイベント計測
- 広告機能・Google シグナルの有効化（3 パラメータは常に `denied`）
- 同意バナー・撤回フローの E2E（別 Issue）
- Google Tag Manager
- アカウント削除機能（別 Issue。§7.3 で「未提供」と正直に書く）

## 3. アーキテクチャ

### 3.1 新規

| #   | ファイル                                                           | 役割                                                                  |
| --- | ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| 1   | `src/utils/cookieConsent.ts`                                       | 同意レコードの読み書き・消去、イベント発火。SSR 安全                  |
| 2   | `src/utils/resolveConsentMerge.ts`                                 | **マージ規則の純関数**（§4.4）。副作用なし                            |
| 3   | `src/utils/analytics.ts`                                           | GA ID 検証、`buildConsentBootstrapScript`、gtag 呼び出し、Cookie 削除 |
| 4   | `src/hooks/useCookieConsent.ts`                                    | 状態の購読と `grant()` / `deny()` のみ                                |
| 5   | `src/hooks/useConsentServerSync.ts`                                | **サーバー同期の全ロジック**（§4.5）。`analyticsProvider` のみが呼ぶ  |
| 6   | `src/components/providers/analyticsProvider.tsx`                   | gtag.js の読み込み、`consent update`、page_view、5 の呼び出し         |
| 7   | `src/features/cookieConsent/component/cookieConsentBanner/`        | 未決定かつ GA ID 有効時のみ表示するバナー                             |
| 8   | `src/features/cookieConsent/component/cookieConsentToggle/`        | 撤回UI。設定画面とポリシーページで共有                                |
| 9   | `src/features/privacy/privacyPage/`                                | ポリシー本文                                                          |
| 10  | `src/app/privacy/page.tsx` / `layout.tsx`                          | `/privacy` ルート                                                     |
| 11  | `src/app/layout.module.scss`                                       | バナーの `position: fixed` 指定                                       |
| 12  | `src/types/gtag.d.ts`                                              | `window.gtag` / `window.dataLayer` のグローバル型（§5.3）             |
| 13  | `supabase/migrations/<ts>_add_cookie_consent_to_user_settings.sql` | 3 列を追加（§4.7）                                                    |

### 3.2 変更

| #   | ファイル                                                | 内容                                                                         |
| --- | ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 14  | `src/constants/common.ts`                               | `STORAGE_KEYS` に 4 キー、`ROUTES.PRIVACY`                                   |
| 15  | `src/constants/user.ts`                                 | `COOKIE_CONSENT_VALUES` / `COOKIE_CONSENT_VERSION` / `COOKIE_CONSENT_MIN_AT` |
| 16  | `src/constants/strings.ts`                              | `ARIA_LABELS` に `COOKIE_BANNER` / `FOOTER_NAV`                              |
| 17  | `src/schema/user.ts`                                    | `UserSettings` と `updateSettingsSchema` を拡張（`superRefine`）             |
| 18  | `src/app/api/user/settings/route.ts`                    | GET の `select`、PUT の受け口、`DEFAULT_SETTINGS`、処理順（§4.8）            |
| 19  | `src/lib/api/user/user.ts`                              | `updateSettings` の引数型を専用型に                                          |
| 20  | `src/types/database.types.ts`                           | 再生成 → prettier                                                            |
| 21  | `src/lib/security/cspDirectives.mjs`                    | GA オリジンを末尾に追加（§6）                                                |
| 22  | `src/app/layout.tsx`                                    | `consent default` スクリプト、6 と 7 を描画                                  |
| 23  | `src/styles/global/_theme.scss`                         | `:root` に `--cookie-banner-height: 0px`                                     |
| 24  | `src/styles/global/_global.scss`                        | `body` に `padding-bottom: var(--cookie-banner-height)`                      |
| 25  | `src/components/layout/appLayout/appLayout.module.scss` | `height: calc(100vh - var(--cookie-banner-height))`                          |
| 26  | `src/app/auth/layout.module.scss`                       | `min-height: calc(100vh - var(--cookie-banner-height))`                      |
| 27  | `src/app/not-found.tsx` / `src/app/error.tsx`           | インライン `minHeight` を同じ `calc()` に                                    |
| 28  | `src/components/ui/toast/toast.module.scss`             | `bottom: var(--cookie-banner-height)`                                        |
| 29  | `src/components/layout/appLayout/appLayout.tsx`         | `Footer` に `links` を渡す                                                   |
| 30  | `src/components/layout/footer/footer.tsx`               | `<nav>` に `aria-label`                                                      |
| 31  | `src/components/layout/footer/footer.module.scss`       | `&__nav` を SP でも表示（空の `@include lg` ごと削除）                       |
| 32  | `src/app/auth/layout.tsx`                               | `<main>` 内に `/privacy` リンク                                              |
| 33  | `src/features/settings/settingsPage/settingsPage.tsx`   | 「Cookie」セクション（§7.6 の表示条件）                                      |
| 34  | `src/components/layout/userMenu/useUserMenu.ts`         | `signOut` の前に消去（§4.3）                                                 |
| 35  | `src/components/layout/mobileDrawer/mobileDrawer.tsx`   | 同上                                                                         |
| 36  | `src/components/providers/sessionExpiryHandler.tsx`     | 同上                                                                         |
| 37  | `src/lib/axios/axios.ts`                                | 同上                                                                         |
| 38  | `playwright.config.ts`                                  | `webServer.env` に `NEXT_PUBLIC_GA_ID: ''`（§12 の限界も参照）               |
| 39  | `e2e/a11y/publicPages.spec.ts`                          | `PUBLIC_PAGES` に `/privacy`                                                 |

### 3.3 責務

- `useCookieConsent`（#4）— localStorage の読み書きと購読のみ。同期を含まない
- `useConsentServerSync`（#5）— 同期の全ロジック。`analyticsProvider` だけが呼ぶ。`renderHook` で単体テストする
- `analyticsProvider`（#6）— `<AppSessionProvider>` の子として**単一マウント**する。`layout.tsx:50` では `<body>` 直下が `AppSessionProvider` 自身なので「body 内なら自動的に内側」ではない
- 既存の `createPersistStore` は使わない。`layout.tsx` のインラインスクリプトが生のキーを同期読みする必要があるため
- `useToast` は zustand ベースでプロバイダ階層に依存しない

## 4. 同意状態の設計

### 4.1 状態

```ts
export type ConsentValue = 'unset' | 'granted' | 'denied'; // 保存・API で使う 3 値
export type CookieConsentState = 'unknown' | ConsentValue; // UI が使う 4 値
```

| 状態      | 意味                                                   | バナー | `analytics_storage` |
| --------- | ------------------------------------------------------ | ------ | ------------------- |
| `unknown` | SSR / ハイドレート前。まだ localStorage を読めていない | 非表示 | `denied`            |
| `unset`   | 未決定                                                 | 表示   | `denied`            |
| `granted` | 同意済み                                               | 非表示 | `granted`           |
| `denied`  | 拒否                                                   | 非表示 | `denied`            |

`getServerSnapshot()` が `unknown` を返すことで SSR 出力にバナーが含まれず hydration mismatch が起きない。

**`unknown` が観測されるのはハイドレーション時にマウントされたインスタンスだけ。** クライアント遷移で後からマウントされる `/privacy` のトグルや `/settings` の Cookie セクションは一度も `unknown` にならない。逆に `/privacy` を直接ロードした場合は `unknown` から始まる（§7.6）。

### 4.2 購読の形

**`getSnapshot()` は状態キーに加えて版キーも同期読みし、現行版でなければ `'unset'` を返す。** これが無いと、版を上げても `granted` を返し続けてバナーが再表示されず、§4.6 と §10 の完了条件が成立しない。戻り値は文字列のままなので、オブジェクトを返したときの無限ループ（`Object.is` 比較）には当たらない。

所有者（`owner`）は `getSnapshot` では判定できない（モジュールスコープは `userId` を知らない）。他人のレコードは §4.4 のマージが `clear` を返すことで解消する。

`subscribe` / `getSnapshot` / `getServerSnapshot` はモジュールスコープに置く（`useTheme.ts:36-48` に倣う）。

### 4.3 永続化

| キー                               | 値                                                      |
| ---------------------------------- | ------------------------------------------------------- |
| `movie-app:cookie-consent`         | `granted` / `denied` のみ                               |
| `movie-app:cookie-consent-at`      | 同意／撤回した時刻（ISO 8601）                          |
| `movie-app:cookie-consent-owner`   | 操作時のログインユーザー ID。未ログイン時の操作は空文字 |
| `movie-app:cookie-consent-version` | 操作時の `COOKIE_CONSENT_VERSION`                       |

**書き込み順は「所有者 → 版 → 時刻 → 状態」。状態キーの書き込みをコミット点とする。** `setItem` は 4 回に分かれ原子的でないため、中間状態を別タブが観測しうる。この順序なら中間状態は「新しい付随情報 + 古い状態」になり、読み手は常に状態キーを基準に判断できる。

**消去順は書き込みと逆（状態 → 時刻 → 版 → 所有者）。** 同じ順で消すと、一瞬 `state=granted, owner=''` が観測され、§4.4 手順 1 で「未認証時の同意＝有効」と判定されて**他人の同意が現在のユーザーのサーバー行に書かれる**。

購読側の通知（カスタムイベント / `storage`）は**状態キーの変化だけ**をトリガにする。未知の値・読み取り失敗は `unset` として扱う。

**版キーは文字列で保存されるので、読み出し時に数値へ正規化する。** `Number.parseInt` が `NaN` を返したら `null` に倒す。`§5.2` の head スクリプトだけは localStorage の生文字列と `String(COOKIE_CONSENT_VERSION)` を比較する（同期読みで数値化を挟まないため）。**この二重基準を実装時に取り違えないこと**。どちらも「現行版と一致するか」を見る点は同じである。

#### ログアウト時

**`owner` が空でないレコードは 4 キーすべてを消し、`_ga` 系 Cookie も削除する。** `owner` が空文字（未認証時の同意）は残す。

第 3 版は「`useTheme` がテーマを消さないのと揃え、`_ga` も端末に残るから」として消さない方針だったが、§5.7 で `_ga` を削除できる以上この理由は成り立たない。消さないと、A がログアウトした端末を未認証の第三者が使ったときに A の同意がそのまま適用される。

**実行は `signOut` の直前に同期的に行う。** §1.4-7 のとおり `signOut` は完全遷移なので、React の effect で遷移を観測する前にドキュメントが破棄される。`cookieConsent.ts` に `clearOwnedConsent()` を用意し、**4 箇所の `signOut` 呼び出し側から呼ぶ**（#34〜#37）。保険として `useConsentServerSync` 側にも「`status === 'unauthenticated'` かつ owner 付きレコードが残っていれば消す」補正を置く（前状態は問わない。`sessionExpiryHandler.tsx` が `loading → unauthenticated` を除外しているのとは逆の条件になるので、理由をコメントで残す）。

消去時はモジュールスコープの同期ガード（§4.5）もリセットする。

### 4.4 マージ規則（純関数 `resolveConsentMerge`）

#### 型

```ts
export interface ConsentRecord {
  state: ConsentValue;
  at: string | null; // ISO 8601
  version: number | null;
}
export interface LocalConsentRecord extends ConsentRecord {
  owner: string; // '' = 未認証時の操作
}
export type ConsentMergeReason =
  | 'undecided' // 有効なレコードが無い
  | 'in-sync' // 端末もサーバーも採用値と一致。書かない
  | 'adopt-server' // サーバー値を端末へ降ろす
  | 'adopt-local' // 端末値をサーバーへ上げる
  | 'claim-owner' // 値は同じだが owner を現ユーザーへ付け替える
  | 'clear-foreign' // 他人のレコードを端末から消す
  | 'stale-local' // 端末が旧版。消さずに未決定として扱う
  | 'skip-future-server'; // サーバーが未来版。上書きしない

export interface ConsentMergeResult {
  effectiveState: ConsentValue; // UI と gtag が従う値
  localWrite:
    | { action: 'write'; record: LocalConsentRecord }
    | { action: 'clear' }
    | null;
  putBody: {
    cookieConsent: ConsentValue;
    cookieConsentAt: string | null;
  } | null;
  reason: ConsentMergeReason;
}
```

#### 式

```ts
// 時刻は必ずエポック値で比較する。文字列比較だとクライアントの "…Z" と
// PostgREST の "…+00:00" が同一時刻でも不一致になり、辞書順では
// '+'(0x2B) < 'Z'(0x5A) のため「端末が新しい」と誤判定して
// 毎ページロードで PUT が飛び続ける
const toEpoch = (at: string | null): number | null => {
  if (at === null) return null;
  const ms = Date.parse(at);
  return Number.isNaN(ms) ? null : ms;
};

// owner==='' （未認証）と区別できなくなるため、空の userId は呼び出し側の誤り
if (userId === '') throw new Error('resolveConsentMerge: userId is required');

// 1. 端末レコードの有効性（localStorage は書き換えない）
const isForeign = local.owner !== '' && local.owner !== userId;
const isStaleLocal =
  local.state !== 'unset' && local.version !== currentVersion;
const effectiveLocal =
  local.state === 'unset' || isForeign || isStaleLocal ? null : local;

// 2. サーバーレコードの有効性
const isFutureServer =
  server.version !== null && server.version > currentVersion;
const effectiveServer =
  server.state === 'unset' || server.version !== currentVersion ? null : server;

// 3. 採用値
let adopted: ConsentRecord | null;
if (!effectiveLocal && !effectiveServer) adopted = null;
else if (!effectiveLocal) adopted = effectiveServer;
else if (!effectiveServer) adopted = effectiveLocal;
else {
  const le = toEpoch(effectiveLocal.at);
  const se = toEpoch(effectiveServer.at);
  if (le !== null && se !== null && le !== se) {
    adopted = le > se ? effectiveLocal : effectiveServer; // 明確に新しい方
  } else if (
    effectiveLocal.state === 'denied' &&
    effectiveServer.state !== 'denied'
  ) {
    // 時刻で決着しないとき（同値・片方 null・双方 null・パース不能）は denied を採る。
    // at が欠けている／壊れているだけで撤回が同意へ差し戻されるのを防ぐ。
    // §4.3 の消去が途中で止まった場合などに現実に起きる
    adopted = effectiveLocal;
  } else if (
    effectiveServer.state === 'denied' &&
    effectiveLocal.state !== 'denied'
  ) {
    adopted = effectiveServer;
  } else if (le !== null && se === null) {
    adopted = effectiveLocal; // 時刻を持つ方を優先
  } else if (se !== null && le === null) {
    adopted = effectiveServer;
  } else {
    adopted = effectiveServer; // 完全に決着しない → サーバー
  }
}

// 4. UI と gtag が従う値
const effectiveState: ConsentValue = adopted ? adopted.state : 'unset';

// 5. localStorage への書き込み
let localWrite = null;
if (adopted === null) {
  // 他人のレコードだけ消す。旧版は §4.6 のとおり残す
  // （effectiveState が 'unset' なのでバナーは出る）
  if (isForeign) localWrite = { action: 'clear' };
} else {
  // 端末の at がパース不能なら、値が実質同じでも書き直して修復する
  const atBroken = local.at !== null && toEpoch(local.at) === null;
  const same =
    adopted.state === local.state &&
    toEpoch(adopted.at) === toEpoch(local.at) &&
    adopted.version === local.version &&
    local.owner === userId && // owner は userId と比較する
    !atBroken;
  if (!same)
    localWrite = { action: 'write', record: { ...adopted, owner: userId } };
}

// 6. PUT
// at の差だけでは送らない。サーバーは状態が変わらない PUT で at を更新しない
// ため（§4.8）、at で送ると「送ってもサーバー値が変わらない」→ 毎ロード PUT
// という非収束になる。at は「最初の意思表示時刻」としてサーバーに保持する
let putBody = null;
if (adopted !== null && !isFutureServer) {
  const sameAsServer =
    adopted.state === server.state && adopted.version === server.version;
  if (!sameAsServer) {
    putBody = { cookieConsent: adopted.state, cookieConsentAt: adopted.at };
  }
}

// 7. reason（テストと障害調査のため、結論に至った理由を返す）
// 出力 3 列からは一意に決まらないので、中間変数から別途決める
const reason: ConsentMergeReason =
  adopted === null
    ? isForeign
      ? 'clear-foreign'
      : isStaleLocal
        ? 'stale-local'
        : 'undecided'
    : isFutureServer
      ? 'skip-future-server'
      : localWrite === null && putBody === null
        ? 'in-sync'
        : localWrite !== null &&
            putBody === null &&
            adopted.state === local.state &&
            adopted.version === local.version &&
            local.owner !== userId
          ? 'claim-owner' // 値は一致。owner だけ付け替える
          : adopted === effectiveServer
            ? 'adopt-server'
            : 'adopt-local';

return { effectiveState, localWrite, putBody, reason };
```

**`localWrite.action === 'write'` は 4 キーすべてを確定する。** `record.at` や `record.version` が `null` のときは `removeItem` する。「`null` ならスキップ」にすると、他人のレコードを上書きする行 11 で**他人の `at` が端末に残る**。

**収束性**: 行 13（端末が現行版・サーバーが旧版・状態同値）では `putBody` が立つ。サーバーは §4.8 により `cookieConsent` を含む PUT で**状態の変化有無によらず版を現行版で書く**ため、次回は `adopted.version === server.version` となり `putBody = null`。1 往復で収束する。`at` が端末とサーバーで食い違ったまま残ることは許容する（PUT 条件に含めないため振動しない）。

**`putBody` に `version` を含めない。** §4.6 のとおり版はサーバーが書く。

#### 分岐の網羅表（§9.1 のテストはこの表を使う）

`at` は相対的な新旧のみ示す（T1 < T2）。`ver` 列の「現」= `currentVersion`。

| #   | 端末 state | owner | ver  | at   | サーバー state | ver  | at  | effectiveState | localWrite | putBody  | reason                              |
| --- | ---------- | ----- | ---- | ---- | -------------- | ---- | --- | -------------- | ---------- | -------- | ----------------------------------- |
| 1   | unset      | ''    | –    | –    | unset          | –    | –   | unset          | null       | null     | undecided                           |
| 2   | unset      | ''    | –    | –    | granted        | 現   | T1  | granted        | write      | null     | adopt-server                        |
| 3   | unset      | ''    | –    | –    | denied         | 現   | T1  | denied         | write      | null     | adopt-server                        |
| 4   | granted    | ''    | 現   | T1   | unset          | –    | –   | granted        | write      | **あり** | adopt-local                         |
| 5   | denied     | ''    | 現   | T1   | unset          | –    | –   | denied         | write      | **あり** | adopt-local                         |
| 6   | granted    | 自分  | 現   | T1   | denied         | 現   | T2  | denied         | write      | null     | adopt-server                        |
| 7   | denied     | 自分  | 現   | T2   | granted        | 現   | T1  | denied         | null       | あり     | adopt-local                         |
| 8   | granted    | 自分  | 現   | T1   | granted        | 現   | T1  | granted        | **null**   | **null** | in-sync                             |
| 9   | granted    | ''    | 現   | T2   | denied         | 現   | T1  | granted        | write      | あり     | adopt-local                         |
| 10  | granted    | 他人  | 現   | T1   | unset          | –    | –   | unset          | **clear**  | null     | clear-foreign                       |
| 11  | granted    | 他人  | 現   | T1   | denied         | 現   | T2  | denied         | write      | null     | adopt-server                        |
| 12  | granted    | 自分  | 旧   | T1   | unset          | –    | –   | unset          | **null**   | null     | stale-local                         |
| 13  | granted    | 自分  | 現   | T1   | granted        | 旧   | T1  | granted        | null       | **あり** | adopt-local                         |
| 14  | granted    | 自分  | 現   | T1   | granted        | 未来 | T1  | granted        | null       | **null** | skip-future-server                  |
| 15  | granted    | 自分  | 現   | T1   | denied         | 現   | T1  | denied         | write      | null     | adopt-server（同時刻タイブレーク）  |
| 16  | granted    | 自分  | 現   | null | granted        | 現   | T1  | granted        | write      | null     | adopt-server（時刻を持つ方）        |
| 17  | granted    | 自分  | 現   | 不正 | denied         | 現   | T1  | denied         | write      | null     | adopt-server（NaN は null 扱い）    |
| 18  | granted    | ''    | 現   | T1   | granted        | 現   | T1  | granted        | write      | null     | claim-owner（値は同じ。owner のみ） |
| 19  | denied     | 自分  | 現   | null | granted        | 現   | T1  | **denied**     | null       | あり     | adopt-local（denied 優先）          |
| 20  | granted    | 自分  | 旧   | T1   | granted        | 現   | T2  | granted        | write      | null     | adopt-server（版の追いつき）        |
| 21  | unset      | ''    | –    | –    | granted        | 旧   | T1  | unset          | null       | null     | undecided（旧記録は消さない）       |
| 22  | granted    | 自分  | 未来 | T1   | unset          | –    | –   | unset          | null       | null     | stale-local（ロールバック時）       |
| 23  | granted    | 自分  | 現   | T1   | granted        | null | T1  | granted        | null       | あり     | adopt-local（版 null の移行行）     |

行 8 が最頻ケースで「何も書かない」ことを固定する。行 5・7・**19** で端末 `denied` の伝播を担保する（撤回の経路なので法的に最重要）。行 13 が「版だけ古いサーバーを更新する」経路、行 14 がその逆方向の保護、行 20 が版を上げた後に 2 台目が追いつく経路。

**行 19 が無いと撤回が差し戻される。** `at` が欠けている・壊れているだけで、時刻比較では決着せずサーバーの `granted` が採用されてしまう。手順 3 の denied 優先がこれを防ぐ。

**行 18 は「値が同じなら書かない」と最適化すると壊れる。** owner の付け替えだけが目的の書き込みである。

### 4.5 同期のライフサイクル（`useConsentServerSync`）

**発火条件は `status === 'authenticated'` のみ。GA ID の有無は条件に含めない。** 同期は GA とは独立の関心事であり、条件に入れると「GA を止めている間の撤回がサーバーに残らない」（§7.6 がまさに想定する状況）という取りこぼしが生じる。

依存配列は `status` と `session?.user?.id` のみ。`session` オブジェクトを入れない（§1.4-11）。

#### 初回マージ

```
1. 端末レコード（4 キー）を読む。スナップショットとして保持する
2. モジュールスコープの inFlight（{ userId, promise }）が
   同じ userId のものであれば、その promise を await する
   （StrictMode の二重マウントで同期が一度も成立しないのを防ぐ。
     フラグで弾くと 1 回目が cancelled、2 回目が skip になり両方落ちる）
   無ければ GET を発行し、{ userId, promise } を入れる。
   settle したら必ず null へ戻す（残すと再試行が解決済み Promise を
   await するだけになる）
3. resolveConsentMerge を呼ぶ
4. 書き込み直前に状態キーを再読し、1 のスナップショットと比較する
     一致   → localWrite / putBody を適用する
     不一致 → 応答待ちの間に利用者が操作した。
              再読した端末レコードと 2 で取得済みのサーバー値で
              resolveConsentMerge を「もう一度」実行し、その結果を適用する
              （捨てるだけだと、その操作は変更追随の発火条件
                「初回マージ完了後の変化」も満たさず永久に送られない。
                一方で端末値をそのまま PUT すると unset を送って
                サーバーの証跡を潰しうるし、未来版サーバーの保護も迂回する）
5. 適用した effectiveState で変更追随の ref をシードする
6. GET と、必要だった書き込み・PUT がすべて成功したときだけ
   syncedUserId を確定する。失敗時は確定しない
```

**手順 4 の再読は状態キーだけを見る。** §4.3 のとおり状態キーがコミット点なので、4 キーすべてを比較すると別タブの書き込み途中（付随情報は新しいが状態はまだ古い）を「利用者が操作した」と誤判定し、ちぐはぐな中間値を送ることになる。

`getSettings()` は `AbortSignal` を受け取らないので、クリーンアップは**関数スコープの** `cancelled` フラグで結果の適用のみを抑止する（リクエスト自体はキャンセルしない）。§4.3 の「モジュールスコープの同期ガード」とは別物なので混同しないこと。

**失敗時の再試行はフルリロードまで起きない。** `analyticsProvider` は §3.3 のとおり単一マウントなので、SPA セッション中に「次回マウント」は来ない。`syncedUserId` を確定しないことで次のページロードでは再試行される、という意味であり、同一セッション内での自動リトライは行わない。

テスト用に `__resetConsentSyncForTest()` を export する（モジュールスコープの状態が Jest のモジュールキャッシュを跨ぐため）。

#### 変更の追随

初回マージの完了後、`effectiveState` が変化したら PUT する。

- **直近送信値の ref は、初回マージが適用した `effectiveState`（`ConsentValue`）でシードする。** 比較対象が `effectiveState` なので `adopted`（レコード）ではシードできない（`adopted === null` の行もある）。未初期化だと、ハイドレーションの `unknown → granted` を「変化」と見なして再訪問のたびに PUT が飛ぶ。また初回マージが `localWrite` したときもカスタムイベント経由で発火するので、**サーバーから取ってきたばかりの値を送り返してしまう**
- **ref の更新は PUT 成功後に行う。** 先に更新すると、失敗した値が二度と送られない
- 未認証なら何もしない（localStorage への保存のみ）
- 失敗しても localStorage は巻き戻さない

#### 失敗時の扱い

サーバー保存が失敗しても localStorage 側の決定は巻き戻さない。通信失敗で利用者の意思表示を無かったことにする方が有害なため。`useTheme` がロールバックしているのとは逆の判断なので、実装時にコメントで理由を残すこと。

ただし黙って成功したように見せない。失敗時はエラートーストで「この端末では反映済み。他の端末への同期に失敗しました」と伝える。

### 4.6 同意の版

`src/constants/user.ts` に `COOKIE_CONSENT_VERSION`（整数）を置く。外部送信先やポリシーの内容が変わったら上げる。

**版が古い記録は「未決定として扱う」だけで消さない。** 端末の localStorage もサーバーの行もそのまま残し、再同意で上書きする。バナーが再表示されるのは §4.2 の `getSnapshot` が版を見るため。

**版はサーバーが書く。クライアントからは送らせない。** クライアント申告にすると、版だけ単独で送って古い同意を現行版に見せかけ、再取得を回避できる。

### 4.7 DB スキーマ

`20261102045228_add_streaming_notice_scope.sql` と同じ形で 3 列を足す。

**GRANT が不要な理由。** 本アプリは NextAuth を使い Supabase Auth を使わないため `auth.uid()` は常に NULL で、`20260310000000_add_user_settings.sql` の RLS ポリシー 4 本は実質機能していない。読み書きが通るのは `createServiceRoleClient()` が RLS をバイパスし、`20261018053616_declare_table_grants.sql:100-101` がテーブル単位で `service_role` に GRANT しているため。テーブル単位の GRANT は後から足した列にも自動で及ぶ。

```sql
-- Cookie 同意の状態・日時・版を保持する
--
-- 背景:
--   GA4 導入（#892）にあたりオプトインの同意UIを入れる（#893 で決定）。
--   同意は localStorage を正とするが、端末間で揃えることと証跡を残すことを
--   目的に、ログイン中はこのテーブルにも保存する。
--
-- user_settings に置く理由:
--   theme / notification_enabled / streaming_notice_scope と同じテーブルで、
--   service_role への GRANT が既にある。列を足すだけで保存の仕組みが揃う。
--
-- cookie_consent_at を updated_at と別に持つ理由:
--   updated_at はテーマ変更など他の設定更新でも動くため、同意の証跡に使えない。
--
-- TIMESTAMPTZ にする理由:
--   クライアントが申告した時刻が端末とサーバーの間を往復する。naive TIMESTAMP
--   だと PostgREST がオフセット無しで返し、JS の new Date() がローカル時刻として
--   解釈するため往復のたびにずれる（#160 / 20261101095646）。同テーブルの
--   created_at / updated_at が TIMESTAMP なのは #160 の取りこぼし。

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS cookie_consent TEXT NOT NULL DEFAULT 'unset';

-- 列側を IF NOT EXISTS にしている以上、制約側も再適用で落ちないようにする。
-- ADD CONSTRAINT には IF NOT EXISTS が無いため、先に落としてから足す
ALTER TABLE public.user_settings
  DROP CONSTRAINT IF EXISTS chk_user_settings_cookie_consent;

ALTER TABLE public.user_settings
  ADD CONSTRAINT chk_user_settings_cookie_consent
    CHECK (cookie_consent IN ('unset', 'granted', 'denied'));

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS cookie_consent_at TIMESTAMPTZ;

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS cookie_consent_version SMALLINT;

-- 未決定なのに同意日時が入っている行を作れないようにする。
-- 逆向き（granted だが日時が NULL）は許す。クライアントが送る時刻が
-- パース不能だった場合に NULL へ倒して状態だけ保存するため（§4.8）
ALTER TABLE public.user_settings
  DROP CONSTRAINT IF EXISTS chk_user_settings_cookie_consent_at;

ALTER TABLE public.user_settings
  ADD CONSTRAINT chk_user_settings_cookie_consent_at
    CHECK (cookie_consent <> 'unset' OR cookie_consent_at IS NULL);

COMMENT ON COLUMN public.user_settings.cookie_consent IS
  'アクセス解析 Cookie への同意状態。unset = 未決定、granted = 同意、denied = 拒否。localStorage を正とし、ログイン中のみ同期される。';

COMMENT ON COLUMN public.user_settings.cookie_consent_at IS
  '最初に同意／撤回した日時。クライアントが申告した値であり、改ざん不能な証跡ではない。状態が変わらない更新では上書きしない。';

COMMENT ON COLUMN public.user_settings.cookie_consent_version IS
  '同意した時点のポリシー版。サーバーが書く（クライアントからは送らせない）。現行版より古い記録は未決定として扱い、バナーを再表示する。記録自体は消さない。';
```

適用後は型を再生成し、**`npx prettier --write src/types/database.types.ts` をかける**。マイグレーションは**デプロイより先に適用する**。

### 4.8 API の変更

#### 処理順を「認証 → ボディのパース → バリデーション → レート制限」にする

現状は 認証 → レート制限 → `request.json()` → `safeParse`。リポジトリの過去のレビュー指摘（不正リクエストでカウンタを消費させない）と逆であり、既存の入力が enum だけだったため顕在化していなかった。

**`request.json()` を try/catch して 400 を返すこと。** 並べ替えだけだと、不正な JSON が catch に落ちて **500 かつレート制限ノーカウント**になる。

**この並べ替えで落ちる既存テストは無い**（PUT 系はすべて valid な body か validation-only）。回帰を検知できないので、**新規に「バリデーションエラー時に `checkRateLimit` が呼ばれないこと」を追加する**。

#### 版は常に書く

**`cookieConsent` を含む PUT では、状態の変化有無によらず `cookie_consent_version = COOKIE_CONSENT_VERSION` を書く。** これが §4.4 行 13 の収束条件。「状態を更新するときだけ書く」と読めると、版が永久に旧版のまま残り別端末でバナーが無限に再表示される。

#### 日時はクランプし、状態が変わらないときは据え置く

| 入力                                     | 扱い                                                  |
| ---------------------------------------- | ----------------------------------------------------- |
| 未来（時計ずれを見込んで +5 分まで許容） | サーバー受信時刻へクランプ                            |
| `COOKIE_CONSENT_MIN_AT` より前           | サーバー受信時刻へクランプ                            |
| 非 ISO / パース不能                      | `null` として保存                                     |
| `state` が `unset`                       | `at` を `null` へ正規化（§4.7 の CHECK 違反を避ける） |

いずれの場合も**同意状態そのものは必ず保存する**。拒否すると「端末時計が進んでいる人は同意が永久に保存されず、リトライがレート制限を食い潰す」という詰みになる。

`cookieConsent` を含む PUT では upsert の前に現在値を読み、**状態が同値なら `cookie_consent_at` を `updateData` から落とす**（最初の意思表示時刻を保つ）。

- 読み取りは **`.maybeSingle()`** を使う。`.single()` は行が無い利用者（初回同意がまさにそれ）で `PGRST116` を返し、握り潰す記述が無いと 500 になる
- 行が無い場合は「現在値なし＝状態変化あり」として `cookie_consent_at` を落とさない

#### スキーマ

`cookieConsent` と `cookieConsentAt` は**セットでのみ受け付ける**。片方だけ送れると、状態を変えずに同意日時だけ任意の過去値へ書き換えられる。`updateSettingsSchema` に `superRefine` を足す（`src/schema/awardSync.ts:34` に前例）。

`cookieConsentVersion` はクライアントから受け付けない。zod の `z.object` は未知キーを黙って除去するだけで 400 にはしないので、テストは「parse 結果に含まれないこと」を見る（`.strict()` は足さない。既存フィールドの挙動が変わるため）。

zod は v4 なので `z.iso.datetime()`。`null` を送る経路があるため `.nullable().optional()` とし、route 側は `!== undefined` で判定する。

`src/lib/api/user/user.ts` の `updateSettings(settings: Partial<UserSettings>)` は `Partial` のままだと片方だけ渡すコードが型を通る。**専用の引数型**でペアを型として強制する（既存の `updateSettings({ theme })` 単独呼び出しは引き続き通るようにする）。

`DEFAULT_SETTINGS`（`route.ts:33-37`）にも 3 フィールドを追加し、GET は `streaming_notice_scope` と同じ形で `?? 'unset'` / `?? null` のフォールバックを置く。

## 5. GA4 と Consent Mode v2

### 5.1 測定 ID の取得と検証

`process.env.NEXT_PUBLIC_GA_ID?.trim()` が `/^G-[A-Z0-9]{6,20}$/` に一致するときだけ有効。

- 環境変数は**参照する関数の中で読む**（`helpers/supabase.ts:17,37` が前例。テストから `process.env` を差し替えられる。`next/jest` の SWC は `NEXT_PUBLIC_*` をインライン化しないので `jest.resetModules()` は不要）
- `.trim()` は Vercel の環境変数に貼り付けた際の前後空白対策
- 引用符・バックスラッシュ・`<` を通さないので、インライン補間（§5.2）の防御としても機能する
- `GT-` 形式は意図的に弾く。不一致時は dev のみ `console.warn`

### 5.2 `consent default` を gtag.js より前に積む

Consent Mode は `default` が gtag.js の読み込みより前に `dataLayer` へ積まれていることが前提。`layout.tsx` の `<head>` にインラインスクリプトを 1 本追加する。**GA ID が有効なときだけ出力する。**

**スクリプト本文は `src/utils/analytics.ts` の純関数 `buildConsentBootstrapScript(version, keys)` が組み立てる。** `layout.tsx` に直書きしない。理由は 4 つ。

1. `COOKIE_CONSENT_VERSION` と `STORAGE_KEYS` を補間でき、同期漏れが構造的に起きない（第 5 版は `v === '1'` をハードコードし、コメントで「同期すること」と書くだけだった）
2. 版を変えて出力が変わることを `analytics.test.ts` で assert できる
3. 生成文字列を jsdom で評価すれば「旧版の `granted` では `denied` が積まれる」という**挙動**まで検証できる（`renderToStaticMarkup` の文字列検査では、出力が版によらず同一なので検証できない）
4. `analyticsProvider` 側のテストも同じ関数で `window.gtag` を用意でき、head とプロバイダの前提がずれない

**`window.gtag` をグローバルに確定させることが必須。** IIFE で包んで `function gtag(){}` と書くと関数スコープに閉じ、`window.gtag` が未定義になって §5.6 の `consent update` が丸ごと不発になる。

```js
// buildConsentBootstrapScript(1, STORAGE_KEYS) の出力イメージ
(function () {
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () {
    window.dataLayer.push(arguments);
  };
  var c = null;
  var v = null;
  try {
    c = localStorage.getItem('movie-app:cookie-consent');
    v = localStorage.getItem('movie-app:cookie-consent-version');
  } catch (e) {}
  window.gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: c === 'granted' && v === '1' ? 'granted' : 'denied',
  });
})();
```

localStorage をここで読むことで、再訪問した同意済み利用者に「denied で始めて update する」往復が起きない。`wait_for_update` も不要。

このスクリプトは既存のテーマ初期化と同じ性質（SSR で静的に埋め込むインラインスクリプト、DOM 注入 sink ではない）なので Trusted Types の対象外。

**この head スクリプトは `owner` を見ない。** 認証状態は Cookie 側にあり同期読みできないため。§4.3 のログアウト消去で未認証の第三者に漏れる経路を断つ。

### 5.3 `gtag` は Arguments オブジェクトを push する

**`analytics.ts` は自前で `dataLayer.push` してはならない。必ず `window.gtag(...)` を呼ぶ。** gtag.js は dataLayer の要素が **Arguments オブジェクト**のときだけコマンドとして処理し、Array は無視する。TypeScript で自然に書くと Array を積む。症状は「`default` は効くのに `update` だけ効かない」という切り分けにくい形で出る。

型は `src/types/gtag.d.ts` に置く（`src/types/next-auth.d.ts` が前例。`jest.config.js` の `collectCoverageFrom` が `.d.ts` を除外済み）。

```ts
export {};
declare global {
  interface Window {
    // head スクリプト（§5.2）が未出力のケースがあるため optional。
    // §5.6 の「window.gtag が未定義ならスキップ」を型として表現する
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}
```

Arguments であることの assert は、**`buildConsentBootstrapScript` の出力を評価する `analytics.test.ts` 側**で行う。プロバイダ側のテストは `window.gtag` をテスト自身が定義するため、そこで assert してもテストのスタブの性質を見ているだけになる。

### 5.4 gtag.js の読み込み

`next/script` の `<Script strategy="afterInteractive">` を 2 本。`@next/third-parties` は入れない。

- **両方に `id` を付ける。** `scripts.md:258` が「インラインスクリプトには `id` が必須」と明記。重複防止キーが `id || src` で、インラインは `src` が空のため `id` が無いと再マウント時に二重注入される
- **インライン本文は `children`（テンプレートリテラル）で渡す。** `next/script` は `dangerouslySetInnerHTML` を先に見るため、どちらで渡すかを決めておかないと §9.1 のモックが無言で空になる
- **2 本目は `dataLayer` / `gtag` を再定義しない。** 標準スニペットをそのまま貼ると head で積んだ `consent default` ごと消える
- 2 本目の内容は `gtag('js', new Date())` と `gtag('config', '<ID>', { send_page_view: false })` のみ

実行順は `useEffect` の宣言順 → `appendChild` で保証される。1 本目（src）は非同期ダウンロード、2 本目（インライン）は appendChild 時点で同期実行されるため、`gtag('js'|'config')` は gtag.js ロード前に `dataLayer` へ積まれる（標準スニペットと同じ挙動）。

### 5.5 page_view は手動で送る

**GA4 の拡張計測「ブラウザの履歴イベントに基づくページの変更」はオフにする**（#169 申し送り）。§1.4-9 のとおり、拡張計測に任せるとフィルタ操作のたびに page_view が増える。

- `gtag('config', id, { send_page_view: false })` で自動送信を止める
- `usePathname()` を依存にした effect で送る。**初回マウントでも送る**（初回スキップのガードを入れるとランディングページが計上されない）
- `useSearchParams()` は依存に入れない。root layout で使うと `BailoutToCSRError` で静的プリレンダから外れる。`page_location` は送信時点で `window.location.href` を読む（`HistoryUpdater` が `useInsertionEffect` で history を書くため、passive effect の時点で URL は更新済み）
- **`page_title` は `requestAnimationFrame` を 1 フレーム待ってから `document.title` を読む。** App Router のメタデータは Suspense 越しに解決されるため、effect の時点では前ページのタイトルが残っていることがある（`person/[id]` は async `generateMetadata` なので確実にずれる）。拡張計測を否定した理由（§1.4-9）と同じ失敗なので、手動送信でも同じ手当てが要る
- **「直近送信した pathname」を ref に持ち、同一 pathname への二重送信を防ぐ**

`usePathname()` は Server Component の子で問題なく動く。`cacheComponents` は無効なので Suspense 境界は不要。dev では StrictMode により 2 回走る（本番では起きない）。

### 5.6 同意状態の変更を反映する

| 遷移                           | `consent update`   | 備考                                                |
| ------------------------------ | ------------------ | --------------------------------------------------- |
| `unknown` → `granted`          | 送る               | 再訪問者のハイドレーション                          |
| `unknown` → `unset` / `denied` | 送る               |                                                     |
| `unset` → `granted`            | 送る               | 同意成立                                            |
| `unset` → `denied`             | 送る               | 既定値と同じ                                        |
| `granted` → `denied`           | 送る               | `_ga` 系 Cookie を削除（§5.7）                      |
| `denied` → `granted`           | 送る               |                                                     |
| **`granted` → `unset`**        | **送る（denied）** | **ログアウト（§4.3）／版の切り上げ。** `_ga` も削除 |
| **`denied` → `unset`**         | 送る（denied）     | 同上                                                |

下 2 行は §4.3 のログアウト消去と §4.6 の版切り上げで実際に起きる。表から漏らすと、**ログアウト後も同一 SPA セッションの間 GA が granted のまま動き続ける**。

**同意が成立しても page_view は送り直さない（実装時に方針変更）。** 第 5 版までは「`unset → granted` では追加の page_view を送る」としていたが、これは**同意まで gtag.js を読み込まない basic 構成の発想**だった。本構成は advanced なので、未同意の時点で既に Cookie を伴わない page_view が送られており、再送すると同じ閲覧が 2 件計上される。page_view は §5.5 の `pathname` effect だけが送る。

`window.gtag` が未定義のとき（GA ID 無効で head スクリプトが出ていない）は `consent update` をスキップし、Cookie 削除のみ行う。

`ga-disable-<測定ID>` は使わない。`analytics_storage: 'denied'` が役割を果たす。

### 5.7 GA Cookie の削除

**先に `consent update` で `denied` を送ってから削除する。** 逆順だと、キューに残ったヒットが削除直後に `_ga` を書き戻しうる。

`location.hostname` と `.<hostname>` の 2 通りでは消えないケースがある。

- GA の `cookie_domain` は既定 `'auto'` で **eTLD+1** に Cookie を置く。`www.example.com` で配信すると Cookie は `.example.com` にある
- localhost では `cookie_domain` が `'none'` になり **domain 属性なしの host-only Cookie** になる

手順:

1. `document.cookie` を `;` で分割し、名前部分を **`trim()` してから** `_ga` の前方一致で絞る
2. `location.hostname` を `.` で分割し、最も具体的なものから全サフィックスを列挙する
3. 各サフィックスについて `domain=<d>` / `domain=.<d>` / **domain 属性なし** の 3 通りで `path=/; Max-Age=0` を書く
4. `document.cookie` を読み直して残存を確認する。**残っていた場合は dev のみ `console.warn` を出し、処理は続行する**

ポリシー本文に書く Cookie 名は `_ga` と `_ga_<コンテナID>`（測定 ID から `G-` を除いた部分）。削除処理自体は前方一致なので測定 ID を必要としない（GA ID 無効時の撤回でも動く）。

### 5.8 effect の一覧と宣言順

`analyticsProvider` に置く effect を宣言順に示す。§5.5 の「`consent update` を送ってから page_view を送る」はこの順序で担保する。

| 順  | 名前           | 依存                      | 発火条件                     | 未認証時   |
| --- | -------------- | ------------------------- | ---------------------------- | ---------- |
| 1   | consent update | `consent`                 | `consent !== 'unknown'`      | 実行する   |
| 2   | page_view      | `pathname`                | GA ID 有効                   | 実行する   |
| 3   | 初回マージ     | `status`, `userId`        | `status === 'authenticated'` | 実行しない |
| 4   | 変更の追随     | `consent`, 初回マージ完了 | 初回マージ完了後の変化       | 実行しない |

3 と 4 は `useConsentServerSync`（§3.1-5）の内部に置く。

## 6. CSP の変更

`cspDirectives.mjs` の `getCspDirectives()` に追加する。Consent Mode では同意の有無によらず gtag.js を読み込むため常時必要。

| ディレクティブ | 追加するオリジン                                                                           |
| -------------- | ------------------------------------------------------------------------------------------ |
| `script-src`   | `https://www.googletagmanager.com`                                                         |
| `connect-src`  | `https://www.googletagmanager.com` `https://*.google-analytics.com` `https://*.google.com` |
| `img-src`      | `https://www.googletagmanager.com` `https://*.google-analytics.com`                        |

[Google 公式 CSP ガイド](https://developers.google.com/tag-platform/security/guides/csp) の GA4（広告機能なし）構成に準拠。本リポジトリは `script-src-elem` を定義していないため `script-src` への追加で足りる。

**`img-src` に `https://*.google.com` は入れない。** 公式の広告なし構成に含まれておらず、`accounts.google.com` 等を含む広いワイルドカードを不要に開けることになる。

**追加位置は各ディレクティブの末尾。** `script-src` では `'unsafe-eval'` より前（`cspDirectives.mjs:94` のテンプレートリテラル 1 箇所の編集で両立する）。`csp.test.ts` は結合文字列への部分一致なので、先頭や中間に挿入すると既存 assert が落ちる。

`https://*.analytics.google.com` は公式の列挙に無いため追加しない。違反が出てから足す方針だが、本番が 404 で封鎖されている間は違反レポートが集まらない（#169 へ申し送り）。

**広告機能・Google シグナルを有効化する場合は `frame-src` にも `https://www.googletagmanager.com` を明示追加すること。** 本リポジトリの `frame-src`（`cspDirectives.mjs:103`）は YouTube のみを明示指定しており `default-src` にフォールバックしない。

## 7. プライバシーポリシーページ

`/privacy` を静的ページとして追加する。`AppLayout` を適用し、認証は不要。

### 7.1 ページ要件

- `page.tsx` に `metadata`（`title: 'プライバシーポリシー | Movie App'`、`description: '取得する情報・利用目的・外部送信先について'`）
- `layout.tsx` は `<AppLayout>{children}</AppLayout>` のみ。`showSidebar` は既定
- **`<h1>` を 1 本持つ**（`e2e/a11y/helpers.ts:65` が `h1` の存在を待つ）。本文は `<section>` + `<Heading level={2}>`
- 制定日・最終改定日を掲示する

### 7.2 構成

1. 取得する情報
2. 利用目的
3. ご利用の端末から外部へ送信される情報（§1.5 の第 1 表。**送信先での利用目的の列を含む**）
4. 当社サーバーから取扱いを委託している先（§1.5 の第 2 表）
5. 外国にある第三者への提供
6. Cookie とローカルストレージ（§7.5）
7. アクセス解析と同意（§7.4）
8. 保存期間と削除（§7.3）
9. 安全管理措置
10. 開示・訂正・削除のご請求と苦情の申出先
11. 本ポリシーの改定について

項目 3 で「送信先での利用目的」を書くのは、電気通信事業法施行規則が通知・公表事項として ①送信される情報の内容 ②送信先 ③**当該情報の利用目的** の 3 点を求めるため。項目 2 の利用目的は自サービス側のもので別物。

項目 5 は、委託であっても外国にある第三者への提供には個人情報保護法 28 条が適用される（27 条 5 項の委託の例外は 28 条に及ばない）ため。該当しうるのは Resend・OpenAI・Vercel・Google(GA4)、および Supabase（**プロジェクトのリージョンを確認し、東京なら対象外と整理する**）。各社の DPA を根拠に「移転先国は米国等で、規則で定める基準に適合する体制を整備した事業者を選定しています。詳細は請求に応じて情報提供します」で足りる。

項目 9・10 は法 32 条 1 項の公表事項。氏名・住所は「請求に応じて遅滞なく回答します」＋連絡先の明示で足りる。**公開用の連絡先メールアドレスを決める必要がある。**

### 7.3 アカウント削除機能は存在しない

API を全数確認した結果、**利用者も管理者もアカウントを削除できない**（`/api/user/profile` は PUT のみ。DELETE があるのは favorites / watchlist / dismissed-movies のみ）。項目 8 に「アカウント削除機能は未提供です。削除のご請求は窓口で受け付け、手作業で対応します」と**正直に書く**。実装は別 Issue。

`rate_limits.identifier` には `メールアドレス|IPアドレス` の平文が入り、`vercel.json` の cron 8 本に削除処理が無いため事実上無期限で残る。保持期間を決めて項目 8 に書き、定期削除は別 Issue。

### 7.4 Consent Mode の挙動を正確に書く

- 同意の有無にかかわらず、アクセス解析タグ自体は読み込まれる
- **同意しない場合、`_ga` などの識別用 Cookie は作成されないが、IP アドレス・ブラウザの種類・閲覧した URL などは Google へ送信される**
- 同意した場合に限り `_ga` / `_ga_<コンテナID>` Cookie を作成し、同一ブラウザからの再訪問を区別する

「個人を識別しない形の情報のみが送信される」とは書かない。IP アドレスは GDPR では個人データ、日本法でも少なくとも個人関連情報であり不正確。

**この項目の本文は、同意状態や GA ID の有無にかかわらず常に表示する。** §7.6 の「`<section>` ごと描画しない」はトグル UI の話であって、公表事項である説明文には及ばない。

### 7.5 Cookie とローカルストレージの列挙

- Cookie: NextAuth のセッショントークン・CSRF トークン・コールバック URL、`_ga` / `_ga_<コンテナID>`（同意時のみ）
- localStorage: `movie-app:theme`、`movie-app:movie-filters`、`movie-app:cookie-consent`（＋時刻・所有者・版）
- sessionStorage: 送信済みレコメンドイベント（`useRecommendationEvents.ts:71`）、原題提案（`storedSuggestion.ts:98`）

`STORAGE_KEYS.LANGUAGE` と `RECENT_SEARCHES` は定義のみで使用箇所がゼロなので書かない。未使用定数の削除は別 Issue。

### 7.6 撤回UI の表示条件

| 条件                               | バナー（同意取得） | トグル（撤回） |
| ---------------------------------- | ------------------ | -------------- |
| GA ID 有効 / `unknown`             | 非表示             | 非表示         |
| GA ID 有効 / `unset`               | **表示**           | 非表示         |
| GA ID 有効 / `granted` or `denied` | 非表示             | **表示**       |
| GA ID 無効 / `unknown` or `unset`  | 非表示             | 非表示         |
| GA ID 無効 / `granted` or `denied` | 非表示             | **表示**       |

最後の行が要点。運用側が GA を止めたときに、同意済みの人の撤回手段だけが消えるのを防ぐ。このとき `window.gtag` は存在しないので、撤回操作は Cookie 削除と localStorage の更新のみを行う（§5.6）。**同期は GA ID の有無に依存しない**（§4.5）ので、サーバーにも記録される。

`unknown` の行が要る理由: `/privacy` は公開ページで、検索・ブックマーク・`page.goto` による**直接ロードが普通**。この場合トグルは初回描画で `unknown` になる。見出しと §7.4 の説明文は常に出し、**トグルだけハイドレーション後に現れる**形にする（公表事項としての要件は §7.4 の本文が満たす）。

`settingsPage.tsx` と `privacyPage` は、トグルが非表示になる条件では `<section>` ごと描画しない（見出しだけの空セクションを作らない）。ただし `/privacy` の項目 7 は §7.4 のとおり別物として常に出す。

**Skeleton は出さない。** 同期状態は `useConsentServerSync` の内部にあり、トグルから知る手段が無い。トグルは localStorage の値だけで描画する。

### 7.7 ダークパターンの回避

- 2 つの選択肢は**同等の視覚的重み**にする
- バナーに閉じる `✕` を置かない。置くなら拒否と同値にする
- 同意を既定選択にしない。未決定は「拒否」でも「同意」でもないため、`RadioGroup` で 2 択にすると `aria-checked="true"` が利用者のしていない選択を報告する。**`role="switch"`（未決定 = off）にするか、`RadioGroup` のままなら未選択であることを可視テキストで示す**

## 8. 配置と導線

### 8.1 バナーの配置（`fixed` ＋ 高さ変数）

第 4 版の素のフロー配置、第 5 版の flex ラッパーはいずれも成立しなかった。

- フロー配置: `.c_app_layout { height: 100vh }` の**下**に積まれ、初期表示で画面外
- flex ラッパー: ラッパーの `height` は `auto` のままなのでコンテンツ高で決まり、`flex: 1; min-height: 0` の子は自分のコンテンツ高を取る。**内部スクロールが消えてドキュメントスクロールになり、フッターが文書末尾へ移動する**。`/privacy`（11 項目の長文）自身が踏む。さらに §1.4-4 のサイドバー `height: 100%` チェーンも壊れる

**`position: fixed` に戻し、バナーの高さ分を各コンテナから引く。** 第 4 版が fixed を却下した理由は「フッターを永久に覆う」ことだったが、覆う分を引けば解消する。**バナー非表示時は `calc(100vh - 0px)` となり現状と完全に同一**になるのが決め手で、内部スクロール構造も `/theater-experience` 等の 3 ページも一切触らずに済む。

```scss
// src/styles/global/_theme.scss  :root
--cookie-banner-height: 0px;

// src/styles/global/_global.scss  body
// 同意バナーは position: fixed。AppLayout を使わないページ
// （/theater-experience・/admin/*）でも本文末尾が隠れないよう場所を空ける
padding-bottom: var(--cookie-banner-height);

// src/components/layout/appLayout/appLayout.module.scss  .c_app_layout
// 内部スクロール（&__body / &__main）とサイドバーの height:100% チェーンを
// 維持するため定高のまま。バナーの分だけ縮めてフッターが覆われないようにする
height: calc(100vh - var(--cookie-banner-height));

// src/app/auth/layout.module.scss  .l_auth
min-height: calc(100vh - var(--cookie-banner-height));

// src/app/not-found.tsx / src/app/error.tsx（インラインスタイル）
minHeight: 'calc(100vh - var(--cookie-banner-height))',

// src/components/ui/toast/toast.module.scss  .c_toast__viewport
bottom: var(--cookie-banner-height);

// src/app/layout.module.scss（新規）バナー自身
// $z-index-fixed（1030）= ヘッダーと同値。モーダル(1050)・トースト(1080)
// より下なので、ダイアログ表示中にバナーが前に出ることはない
position: fixed;
inset: auto 0 0 0;
z-index: $z-index-fixed;
```

高さの反映は純関数 `setBannerHeightVar(px: number | null)` に切り出す（jsdom の `ResizeObserver` が no-op スタブ（§1.4-15）なので、関数として分けないとテストできない）。

```ts
useEffect(() => {
  const el = ref.current;
  if (!el) return;
  const observer = new ResizeObserver(([entry]) => {
    setBannerHeightVar(Math.ceil(entry.contentRect.height));
  });
  observer.observe(el);
  return () => {
    observer.disconnect(); // カスタム lint は ResizeObserver を検出しないので手動で担保
    setBannerHeightVar(null); // バナーが消えるのは同意/拒否の直後＝最頻パス
  };
}, []);
```

- **値は必ず `px` 付き**で書く。単位を落とすと `calc(100vh - 0)` が invalid at computed-value time になり `height: auto` へフォールバックする
- 同値なら書かない（`ResizeObserver` のフィードバックループ回避）
- クリーンアップで `removeProperty` する。`document.documentElement.style` は React ツリー外なので、消さないとクライアント遷移後もトーストが浮いたままになる

### 8.2 バナーのアクセシビリティ

- `<section role="region" aria-label="Cookie の利用について">`。文言は `ARIA_LABELS` に追加
- **DOM 上は `{children}` の後**に置く。`appLayout.tsx:85-90` のスキップリンクは「DOM 上の最初のフォーカス可能要素」であることを前提にしており、`e2e/a11y/keyboard.spec.ts:30-32` が 1 回目の Tab でスキップリンクにフォーカスすることを assert している
- **スキップリンクも自動フォーカス移動も設けない。** バナーは操作を強制せず、無視しても `denied` のままなので到達性の要求は緩い。キーボード利用者はランドマークナビゲーションか Tab 順の末尾で到達する
- 初回描画のため `aria-live` は不適
- アニメーションは付けない（`.claude/rules/scss-styling.md`）
- Radix のモーダル展開中はバナーが `aria-hidden` 配下に入り操作不能になるが、既存のオーバーレイと同じ扱いとして許容する
- **バナーが本文を覆わないことが a11y E2E の合格条件。** `e2e/a11y/helpers.ts` の `expectNoA11yViolations` は `incomplete` も落とすため、本文に重なると `color-contrast` の `elmPartiallyObscuring` で `publicPages.spec.ts` が落ちる

### 8.3 ポリシーへの導線

- `AppLayout` から `Footer` へ `links={[{ label: 'プライバシーポリシー', href: ROUTES.PRIVACY }]}` を渡す
- `footer.module.scss` の `&__nav` を `display: flex` にし、**空になる `@include lg { display: flex }` ブロックごと削除**、コメントも更新する
- `footer.tsx` の `<nav>` に `ARIA_LABELS.FOOTER_NAV` を付ける。他の nav はすべて名前付きで、名前の無い nav を全ページに増やすと axe の `landmark-unique`（best-practice タグも有効）に対して脆くなる
- `&__custom` も `display: none` だが children が渡されていないため**今回は触らない**
- **`src/app/auth/layout.tsx` の `<main>` の内側、`{children}` の後**に `/privacy` リンクを置く。`<main>` の外に出すとどのランドマークにも属さないコンテンツになる
- 同意バナーからもポリシーページへリンクする

## 9. テスト計画

### 9.1 新規の単体テスト

| ファイル                                            | 観点                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/utils/cookieConsent.test.ts`                   | 読み書き / **書き込み順（所有者→版→時刻→状態）** / **消去順（逆順）** / 途中の `setItem` が throw / 未知の値は `unset` / `clearOwnedConsent` は owner 付きのみ消す / SSR 安全 / イベント発火                                                                                                                                       |
| `src/utils/resolveConsentMerge.test.ts`             | **§4.4 の分岐表 23 ケース全て** / `userId === ''` で throw / `…Z` と `…+00:00` が同値と判定される                                                                                                                                                                                                                                  |
| `src/utils/analytics.test.ts`                       | GA ID 検証（未設定・空文字・前後空白・不正形式・`GT-`）/ **`buildConsentBootstrapScript` の出力に版とキーが補間される** / **生成文字列を評価して「旧版 granted → denied が積まれる」「push が Arguments である」** / `setBannerHeightVar`（px 付き・null で removeProperty）/ `_ga` 削除（サブドメイン・localhost・残存時の warn） |
| `src/hooks/useCookieConsent.test.ts`                | 初期状態 / `grant()` / `deny()` / カスタムイベントと `storage` での同期 / **版違いなら `unset` を返す** / 同期ロジックを持たないこと                                                                                                                                                                                               |
| `src/hooks/useConsentServerSync.test.ts`            | `renderHook` で：初回マージ 1 回 / StrictMode 二重マウントで in-flight を共有 / **CAS 不一致時に現在値を PUT** / 変更追随の ref シード / 失敗時にガードを立てず再試行 / 失敗トースト / 未認証では GET しない / **GA ID 無効でも同期する** / `unauthenticated` で owner 付きを消す                                                  |
| `analyticsProvider.script.test.tsx`                 | `<Script>` 2 本 / `id` / `send_page_view: false` / GA ID 無効で描画しない                                                                                                                                                                                                                                                          |
| `analyticsProvider.pageView.test.tsx`               | 初回マウントで送る / `pathname` 変化で送る / クエリ変化では送らない / `page_title` が rAF 後 / 同一 pathname の二重送信を防ぐ                                                                                                                                                                                                      |
| `analyticsProvider.consent.test.tsx`                | **§5.6 の遷移表 8 行** / `window.gtag` 未定義時のスキップ / `consent update` → Cookie 削除の順序                                                                                                                                                                                                                                   |
| `cookieConsentBanner.test.tsx`                      | §7.6 の表 / 同意・拒否の反映 / ポリシーリンク / ランドマークと `aria-label` / キーボード操作 / `✕` が無いこと                                                                                                                                                                                                                      |
| `cookieConsentToggle.test.tsx`                      | §7.6 の表 5 行 / 未決定時に「同意する」が選択済みに見えないこと / GA ID 無効時は Cookie 削除のみ                                                                                                                                                                                                                                   |
| `privacyPage.test.tsx`                              | `h1` が 1 本 / 11 項目の見出し / 2 表と送信先での利用目的 / §7.4 の 3 点が**同意状態によらず**出ること                                                                                                                                                                                                                             |
| `src/app/privacy/page.test.tsx` / `layout.test.tsx` | `metadata` / `AppLayout` 適用（`src/app/auth/layout.test.tsx` に前例）                                                                                                                                                                                                                                                             |
| `src/app/layout.test.tsx`                           | `renderToStaticMarkup` で GA ID 有効/無効のタグ有無。**版の判定は検証対象にしない**（出力文字列は版によらず同一のため `analytics.test.ts` 側で担保）                                                                                                                                                                               |

#### テストの前提

- **`next/script` のモック**（使用実績ゼロで前例が無い。`afterInteractive` は jsdom で実際にインラインを実行してしまう）

  ```tsx
  jest.mock('next/script', () => ({
    __esModule: true,
    default: ({
      id,
      src,
      children,
      dangerouslySetInnerHTML,
    }: Record<string, unknown>) => (
      <div
        data-testid='next-script'
        data-id={id as string}
        data-src={src as string}
      >
        {(dangerouslySetInnerHTML as { __html?: string })?.__html ??
          (children as string)}
      </div>
    ),
  }));
  ```

- **`src/app/layout.test.tsx` は 4 プロバイダをパススルーにモックする。** `next/font` は `next/jest` が自動で `nextFontMock` に解決するため対応不要。障害になるのは `AppSessionProvider`（`useSession` 前提）/ `AppQueryProvider` / `ThemeProvider` / `AppToastProvider`（Radix の `useLayoutEffect`）
- **`window.dataLayer` / `window.gtag` を `beforeEach` でリセットする。** jsdom の `window` はファイル単位でしか作り直されず、`jest.setup.js` にリセットが無いため同一ファイル内で前のテストの push が見える

### 9.2 既存テストの更新

| ファイル                                  | 内容                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/security/cspDirectives.test.ts`  | `:20` `:28` の `toBe()` 完全一致が落ちる。`img-src`（`:47-49`）/ `connect-src`（`:51`）の配列も更新                                                                                                                                                                                                                                                    |
| `src/lib/security/csp.test.ts`            | 部分一致のため追記だけでは落ちない。GA オリジンを含む assert を**能動的に追加**する                                                                                                                                                                                                                                                                    |
| `src/schema/user.test.ts`                 | 3 フィールドの受理 / ペア必須（`superRefine`）/ `cookieConsentVersion` が parse 結果に含まれないこと                                                                                                                                                                                                                                                   |
| `src/app/api/user/settings/route.test.ts` | **`toEqual({...})` 完全一致 3 箇所（`:75` `:99` `:150`）の期待値更新** / 時刻のクランプ 4 パターン / 状態が同じなら `at` は据え置き・**版は書く** / **行が無い利用者（`maybeSingle`）** / **不正 JSON で 400** / **バリデーションエラー時に `checkRateLimit` が呼ばれない（新規）**。※ `select` + `upsert` の 2 段チェーンになるためモック形状が変わる |
| `src/lib/api/user/user.test.ts`           | **`UserSettings` 型リテラル（`:55`）の追従**（`tsc --noEmit` で落ちる）/ `updateSettings({ theme })` 単独呼び出しが通ること                                                                                                                                                                                                                            |
| `footer.test.tsx`                         | `<nav>` の `aria-label`（`links` のリンク描画テストは `:20-31` に既存）                                                                                                                                                                                                                                                                                |
| `settingsPage.test.tsx`                   | Cookie セクション / GA ID 無効かつ `unset` のとき見出しごと出ないこと                                                                                                                                                                                                                                                                                  |

### 9.3 E2E

GA 連動部分は GA ID 未設定で描画されないが、**§8.1 のレイアウト変更と §8.3 のフッター変更は GA ID と無関係に全ページへ入る**。

| 対象                                  | 扱い                                                      |
| ------------------------------------- | --------------------------------------------------------- |
| `e2e/a11y/publicPages.spec.ts`        | 公開 10 ページ × light/dark の axe。**再実行して確認**    |
| `e2e/mobile/mobileResponsive.spec.ts` | 375px で `scrollWidth <= clientWidth`。**再実行して確認** |
| `e2e/a11y/keyboard.spec.ts`           | Tab 順。**再実行して確認**                                |
| `/privacy`                            | `PUBLIC_PAGES` に追加して**本 PR に含める**               |
| 同意バナー・撤回フロー                | GA ID が必要なため別 Issue                                |

> **【更新 / #931】** 上記は解消済み。`playwright.ga.config.ts`（ポート3001・ダミー測定ID `G-TEST1234567`）を追加し、`e2e/cookieConsent/` でバナー表示・`consent default` / `update`・`_ga` の生成と削除・`--cookie-banner-height`・複数タブ同期・ログアウト時の後始末・サーバー同期の収束を検証している。CI は `e2e.yml` の `e2e-ga` ジョブが **main への push 時のみ** 実行する（PR では回さない。googletagmanager.com への外部依存があり、ビルドも1回増えるため）。
>
> 残る手動分は §9.4 のビジュアル証跡（SP フッターとの重なり、同意〜撤回の動画）のみ。

**（#931 以前の記述）CI ではバナーが出ている状態を一度も検証できない。** `NEXT_PUBLIC_GA_ID` 未設定のためバナーも `--cookie-banner-height` も発生しない。バナー表示時の Tab 順・レイアウト・トーストとの重なりは §9.4 のビジュアル証跡（手動）でしか担保できない。

既存 E2E は **49 ファイル / 205 テスト**。

### 9.4 カバレッジとビジュアル証跡

- `jest.config.js:52-59` の閾値（全指標 80%）を維持する
- `.claude/rules/visual-evidence.md` に従い、**SP フッターとバナーの Before/After、同意〜撤回の動画を PR に添付する**

## 10. 完了条件

### GA4

- [ ] GA ID 無効時は gtag.js も `consent default` もバナーも出力しない
- [ ] `window.gtag` がグローバルに定義され、push された要素が Arguments である
- [ ] `consent default` が gtag.js より前に積まれ、版が古いときは `granted` を出さない
- [ ] 同意直後のページが page_view として計上され、再訪問者で二重計上されない
- [ ] フィルタ・ソート・ページング操作で page_view が増えない
- [ ] `page_title` が現在のページのものになる（`person/[id]` で確認）
- [ ] 撤回で `consent update` → `_ga` 削除の順に実行され、残存ゼロ
- [ ] GA ID 無効でも保存済みの同意があれば撤回でき、**サーバーにも記録される**

### 同意と同期

- [ ] `resolveConsentMerge` が §4.4 の分岐表 23 ケースすべてで期待どおり
- [ ] `…Z` と `…+00:00` が同値と判定され、同じ値で PUT が繰り返されない
- [ ] バナーで同意したらそのページロード中に PUT される
- [ ] 同期応答の到着中にバナーを操作しても、選択が覆らず**かつサーバーへ届く**
- [ ] 初回マージ（GET）は 1 ページロードで 1 回。StrictMode でも成立し、タブ切替で再実行されない
- [ ] 同期失敗後に再試行される
- [ ] 他人の同意レコードが端末から消え、現在のユーザーのサーバー記録にも書かれない
- [ ] 版を上げるとバナーが再表示され、サーバーの旧記録は消えない
- [ ] 版を上げた後に片方の端末で再同意すると、もう一方でもバナーが出なくなる（1 往復で収束）
- [ ] 端末時計がずれていても同意状態は保存される
- [ ] サーバー保存が失敗しても端末側の決定が巻き戻らず、エラートーストが出る
- [ ] ログアウトで owner 付きレコードが消え（`signOut` 前に同期実行）、再ログインでサーバーから復活する

### 実装品質

- [ ] CSP に GA オリジンが末尾に追加され、`img-src` に `*.google.com` が入っていない
- [ ] `cspDirectives.test.ts` の期待値更新と `csp.test.ts` への assert 追加
- [ ] `route.test.ts` / `user.test.ts` / `schema/user.test.ts` の追従
- [ ] バリデーションエラー時に `checkRateLimit` が呼ばれないテストがある
- [ ] 不正 JSON が 400 になる
- [ ] マイグレーションを適用し、型を再生成して prettier をかけた
- [ ] カバレッジ 80% 以上を維持
- [ ] `npm run lint` / `npx tsc --noEmit` / `npm run prettier:check` が通る
- [ ] 既存 E2E 49 ファイルが通る（特に `e2e/a11y/` と `e2e/mobile/`）
- [ ] `/privacy` が `PUBLIC_PAGES` に追加され axe を通る

### レイアウト

- [ ] バナー非表示時のレイアウトが変更前と完全に同一
- [ ] バナー表示時にフッターが覆われず、全画面（`/`・`/privacy`・`/auth/*`・`/theater-experience`・`/admin/*`・`not-found`・`error`）で本文末尾に到達できる
- [ ] サイドバーのウォッチリストが内部スクロールを維持している
- [ ] トーストとバナーが重ならない
- [ ] バナーが消えたあとに `--cookie-banner-height` が残らない
- [ ] フッターと `/auth/*` から `/privacy` へ到達できる（PC・SP 両方）

### ドキュメントと確認

- [ ] `/privacy` に 2 表・送信先での利用目的・Consent Mode の 3 点・越境移転・連絡先が記載されている
- [ ] Before/After スクショとデモ動画を PR に添付した
- [ ] ローカル本番ビルドで動作と CSP 違反ゼロを確認した。**確認後はサーバーを落としてから E2E を回す**（§12）
- [ ] `.claude/documents/environment-variables.md:425` の未決チェックを解消
- [ ] `.claude/documents/roadmap/phase11-deploy.md` に項目を追加

## 11. 申し送り

| 宛先       | 内容                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #169       | Vercel 本番（Production のみ）への `NEXT_PUBLIC_GA_ID` 登録と**再デプロイ**。GA4 プロパティ側で **拡張計測の「ブラウザの履歴イベント」をオフ**、**データ共有をオフ**、**Google シグナルを無効**、**データ保持期間を決定**、**DPA を受諾**。保持期間を `/privacy` に反映。実トラフィックでの page_view 確認と `/api/csp-report` 監視（**GA 関連の CSP 違反監視は公開後に初めて成立する**）。Supabase プロジェクトのリージョン確認 |
| #649       | Consent Mode では gtag.js を常時読み込むため Trusted Types 違反も常時発生する。enforce 検証時に **gtag.js が実際に使うポリシー名を実測し、必要なら `TRUSTED_TYPES_POLICIES` へ追加する**。※ 第 4 版が書いた「`trustedTypes.ts:41-49` が throw する」は誤り。拒否するのはブラウザ                                                                                                                                                 |
| 新規 Issue | 同意バナー・撤回フロー・マージ規則の E2E                                                                                                                                                                                                                                                                                                                                                                                         |
| 新規 Issue | アカウント削除機能（§7.3）                                                                                                                                                                                                                                                                                                                                                                                                       |
| 新規 Issue | `rate_limits` の保持期間と定期削除（§7.3）                                                                                                                                                                                                                                                                                                                                                                                       |
| 新規 Issue | CSP `connect-src https://*.supabase.co` の要否棚卸し                                                                                                                                                                                                                                                                                                                                                                             |
| 新規 Issue | 未使用定数の削除（`STORAGE_KEYS.LANGUAGE` / `RECENT_SEARCHES` / `placehold.co`）                                                                                                                                                                                                                                                                                                                                                 |
| 新規 Issue | `GET /api/user/settings` にレート制限が無い。同期を足すと `/settings` で同一 GET が 4 本になる（§1.4-13）                                                                                                                                                                                                                                                                                                                        |
| 新規 Issue | `.claude/documents/security-audit.md:20,81` が現状と食い違っている                                                                                                                                                                                                                                                                                                                                                               |
| 新規 Issue | カスタムイベント計測                                                                                                                                                                                                                                                                                                                                                                                                             |

## 12. 環境変数の扱い

| 設定先                                    | 可否        | 理由                                                                                              |
| ----------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------- |
| Vercel Production                         | 設定する    | 本番のみ計測する                                                                                  |
| Vercel Preview / Development              | 設定しない  | 開発データの混入を防ぐ                                                                            |
| `.env.local` / `.env.local.example`       | 追加しない  | `playwright.config.ts:10` が `.env.local` を読み、`webServer.env` は `process.env` にマージされる |
| `playwright.config.ts` の `webServer.env` | `''` を明示 | ただし後述の限界あり                                                                              |
| `.github/workflows/e2e.yml`               | 追加しない  | `NEXT_PUBLIC_*` はビルド時インライン化されるため、build step に渡さないことで CI を封じる         |
| GitHub Secrets（Actions / Dependabot）    | 登録しない  | HTML に露出する公開値であり、ワークフローから参照もしない                                         |

**`webServer.env` の限界。** これが効くのは「Playwright が dev サーバーを新規起動する」ローカルケースだけである。

- `reuseExistingServer: !isCI` のため、**起動済みの dev サーバーがあれば適用されない**
- CI は `npm start` で、`NEXT_PUBLIC_*` は `npm run build` の時点で静的置換済み

したがって **CI で GA が入らない根拠は `e2e.yml` の build step に渡していないことだけ**であり、ローカルでの事故防止は §10 の「本番ビルド確認後はサーバーを落としてから E2E を回す」という運用で担保する。
