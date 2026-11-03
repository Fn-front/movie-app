# GA4 導入と Cookie 同意UI（オプトイン）設計

- 日付: 2026-11-03
- 対象 Issue: #892（GA4 導入）、#893（プライバシー方針の判断）
- 関連 Issue: #169（デプロイ）、#649（Trusted Types enforce 昇格）

## 0. 改訂履歴

| 版  | 内容                                                                                                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 初版。同意まで gtag.js を読み込まない方式、localStorage のみ                                                                                                            |
| 2   | Consent Mode v2 へ変更。`user_settings` へのサーバー同期を追加                                                                                                          |
| 3   | 未認証時の同意時刻、ログアウト時の扱いを定義                                                                                                                            |
| 4   | 5 観点のレビュー結果を反映。マージ規則を証跡優先へ作り直し、page_view を手動送信に変更、バナーの配置方式を変更、外部送信先の誤りを訂正、§5 の実装詳細を確定コードで明示 |

## 1. 背景と決定事項

### 1.1 #893 の決定

#893 で提示された A / B / C のうち **B（オプトインの同意UI を導入する）** を採用する。GA4 の計測は「`NEXT_PUBLIC_GA_ID` が設定されていること」と「利用者が明示的に同意していること」の両方を条件とする。

### 1.2 確定した仕様

| 論点                     | 決定                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| 同意前の gtag の振る舞い | **Google Consent Mode v2（advanced）**。gtag.js は読み込み、`analytics_storage: 'denied'` で開始 |
| 同意UIの表示条件         | `NEXT_PUBLIC_GA_ID` が設定されているときのみ                                                     |
| 同意状態の保存           | localStorage を正とし、ログイン中は `user_settings` にも同期する                                 |
| 同期の衝突解決           | **新しいタイムスタンプを持つ側を採用する**（証跡優先）                                           |
| page_view の計上         | **手動送信**。GA4 の拡張計測「ブラウザの履歴イベント」はオフにする                               |
| バナーの配置             | `position: fixed` にせず、レイアウトを押し出す                                                   |
| 撤回導線                 | 設定画面（`/settings`）と プライバシーポリシーページ（`/privacy`）の両方                         |
| プライバシーポリシー     | 本 PR に含める                                                                                   |
| PR 分割                  | 1 ブランチ 1 PR                                                                                  |
| 本番での実測確認         | ローカル本番ビルドで行い、Vercel 実機確認は #169 へ申し送る                                      |

### 1.3 Consent Mode advanced を採る判断と、その代償

Consent Mode は Google タグに同意状態を伝える仕組みで、v2 で `ad_user_data` と `ad_personalization` が加わった。実装形態は 2 つある。

| 形態         | 同意前の挙動                                          |
| ------------ | ----------------------------------------------------- |
| **basic**    | 同意するまで gtag.js を読み込まない                   |
| **advanced** | gtag.js を読み込み、Cookie なしの ping を送る（採用） |

**advanced を採るが、現スコープで得られる見返りはゼロである。** advanced の実利は「同意しなかった利用者のコンバージョン・行動のモデリング」だが、本設計は §2.2 のとおり広告系 3 パラメータを恒久 `denied` とし Google シグナルも無効にするため、モデリングは機能しない。採用理由は「将来 Google シグナルや広告機能を有効化する際にタグ構成を変えずに済む」という一点に限られる。

支払うコストを明記する。

- 未同意の利用者についても Google へ接続が発生する（Cookie は置かれないが、**IP アドレス・User-Agent・閲覧 URL・リファラは送られる**）
- 撤回した後も同様に ping は続く。「撤回すれば Google に一切送られない」とは言えない
- CSP の GA オリジン許可が同意の有無にかかわらず常時必要になる（§6）
- Trusted Types enforce 昇格（#649）の障害が常時化する（§11）
- `afterInteractive` の `<Script src>` は静的 HTML に `<link rel="preload" as="script">` を埋めるため、gtag.js の**ダウンロード自体は HTML パース時点で始まる**

この挙動はプライバシーポリシーに正確に書く（§7.4）。

### 1.4 調査で判明した前提（設計の根拠）

1. **認証ページは `AppLayout` を使わない。** `src/app/auth/layout.tsx` は独自の `<main>` のみ。バナーを全ページに出すには **ルートの `src/app/layout.tsx`** に置く必要がある。
2. **`layout.tsx` には既にストレージ読み取りのインラインスクリプトがある。** テーマ初期化が `localStorage` を同期読みして `data-theme` を決めている。Consent Mode の `default` も同じ手口で解決できる（§5.2）。
3. **`AppLayout` はドキュメントをスクロールさせない。** `appLayout.module.scss` が `.c_app_layout { height: 100vh }` / `&__body { overflow: hidden }` / `&__main { overflow-y: auto }` / `&__footer { margin-top: auto }` で、フッターはビューポート下端に常時固定される。**`position: fixed; bottom: 0` のバナーはフッターを永久に覆い、スクロールで逃げられない**（§8.1）。
4. **トーストも画面下部に固定されている。** `toast.module.scss` が `position: fixed; bottom: 0; right: 0; max-width: 100vw; z-index: $z-index-toast`。SP ではバナーと同じ位置に重なる。
5. **フッターのリンクは現状 0 件。** `appLayout.tsx:128` が `<Footer />` を引数なしで描画しており、`footer.tsx:61` の `links && links.length > 0` が false のため nav 自体が DOM に無い。さらに `footer.module.scss` の `&__nav` は `lg` 未満で `display: none`。
6. **App Router は URL クエリの書き換えでも history イベントを発火する。** 本アプリはフィルタ・ソート・ページングを `router.replace` で URL に書いている（`useMovieFilter.ts:121,132`、`useMovieList.ts:394`、`useAwards.ts:145`、`useTheaterSelection.ts:30`）。**GA4 の拡張計測に任せると、ジャンルを 1 つチェックするたびに page_view が 1 件増える**（§5.5）。
7. **`useTheme` には「サーバー → 端末」の読み出しが無い。** `updateSettings` のみで `getSettings` を呼んでいない。したがってマージ処理には**踏襲できる前例が無く**、本設計で自前に定義する必要がある（§4.4）。
8. **`SessionProvider` は `refetchOnWindowFocus` を無効化していない**（`sessionProvider.tsx`）。effect の依存に `session` オブジェクトを入れるとタブ切替のたびに再実行される。
9. **`getSettings()` は既に 3 箇所から個別に呼ばれている**（`streamingNoticeSettings.tsx:44`、`notificationSettings.tsx:29`、`streamingSortHint.tsx:37`）。同期を無策に足すと `/settings` で GET が増える。
10. **本番 Vercel は cron 以外すべて 404。** `src/proxy.ts:41`。サイト公開（#169）まで本番 URL での実測も CSP 違反の収集もできない。
11. **`user_settings` は列を足すだけで保存が揃う。** 直近の `20261102045228_add_streaming_notice_scope.sql` がテンプレートになる。ただし既存の `created_at` / `updated_at` が naive `TIMESTAMP` なのは #160 の取りこぼしであり、**踏襲してはならない**（§4.6）。

### 1.5 外部送信の実態（初版の誤りを訂正）

初版は外部送信先を 7 件と書いたが、調査の結果**誤りと漏れがあった**。適用される法律が異なるため 2 系統に分ける。

#### ブラウザから外部へ出るもの（電気通信事業法 外部送信規律）

| 送信先                     | 根拠                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------- |
| Google（GA4）              | 本 PR で追加                                                                       |
| YouTube（iframe）          | `videoDialog.tsx:69-70`、CSP `frame-src`                                           |
| Google / GitHub（OAuth）   | `auth.ts:303,312` のリダイレクト                                                   |
| `image.tmdb.org`（限定的） | `dismissedMoviesList.tsx:165` の `unoptimized` 1 箇所のみ（`/settings`、認証必須） |

**`image.tmdb.org` に利用者の IP が渡るという初版の記述は誤り。** 画像はすべて `next/image` 経由で、`next.config.mjs:46-52` に `remotePatterns` 登録済み。ブラウザは自ドメインの `/_next/image?url=...` を叩き、TMDb へ取りに行くのはサーバーである。素の `<img>` はコンポーネントに 1 箇所（`twoFactorSettings.tsx:116`）あるが TOTP QR の data URI で外部通信ではない。

#### サーバーから外部へ出るもの（個人情報保護法 27 条・28 条）

| 送信先                              | 送信される情報                                                                                                 |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| OpenAI                              | お気に入り作品のタイトルと評価、興味なしリスト、ウォッチリストの作品名（`generateRecommendations.ts:240-270`） |
| **Have I Been Pwned（初版で漏れ）** | パスワードの SHA-1 ハッシュ**先頭 5 文字**（`constants/auth.ts:165`。登録・再設定確定・変更の 3 経路）         |
| Resend                              | 確認コード・パスワード再設定メールの宛先                                                                       |
| TMDb API                            | 作品データの取得（利用者情報は送らない）                                                                       |
| GitHub API                          | 検証済みメールアドレスの取得（`githubProfile.ts:87-88`）                                                       |
| Supabase / Vercel                   | データの保管およびアプリケーションの配信                                                                       |

**Supabase はブラウザ発の送信先ではない。** `createClient` はすべてサーバー側ファイルにあり、ブラウザ側クライアントは存在しない。CSP の `connect-src https://*.supabase.co` も現状は不要である可能性が高いが、削除は本 PR のスコープ外とし別 Issue で棚卸しする。

Wikipedia（`lib/wikipedia/`）と eiga.com（`lib/eiga/`）は admin の賞マスタ同期専用でサーバー側・利用者データ非関与のため記載しない。**網羅の基準は「利用者のデータを伴う送信」とする。**

`placehold.co`（`constants/external.ts:9`）は本体コードから未使用かつ CSP にも無い。別 Issue で定数ごと削除する。

## 2. スコープ

### 2.1 含むもの

- Cookie 同意状態の管理（localStorage への保存・購読・変更）
- ログイン中のサーバー同期（証跡優先のマージ、共有端末対策）
- Consent Mode v2（advanced）による GA4 の読み込みと同意状態の反映
- page_view の手動送信
- 未決定時のみ表示する同意バナー
- 同意の撤回UI（設定画面 / プライバシーポリシーページで共有）
- プライバシーポリシーページと、そこへの導線（`/auth/*` を含む）
- CSP への GA オリジン追加
- 上記すべての単体テストと、`/privacy` の a11y E2E

### 2.2 含まないもの

- カスタムイベント計測（お気に入り追加・検索など）
- 広告機能・Google シグナルの有効化。`ad_storage` / `ad_user_data` / `ad_personalization` は常に `denied` 固定
- 同意バナー・撤回フローの E2E（別 Issue）
- Google Tag Manager
- アカウント削除機能（別 Issue。§7.3 で「未提供」と正直に書く）

## 3. アーキテクチャ

### 3.1 新規

| #   | ファイル                                                           | 役割                                                                     |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| 1   | `src/utils/cookieConsent.ts`                                       | 同意レコード（状態・時刻・所有者）の読み書き、イベント発火。SSR 安全     |
| 2   | `src/utils/analytics.ts`                                           | GA ID の取得と形式検証、`window.gtag` 経由のコマンド送出、GA Cookie 削除 |
| 3   | `src/hooks/useCookieConsent.ts`                                    | 状態の購読と `grant()` / `deny()` のみ。**同期は持たない**               |
| 4   | `src/components/providers/analyticsProvider.tsx`                   | gtag.js の読み込み、`consent update`、page_view 送信、**サーバー同期**   |
| 5   | `src/features/cookieConsent/component/cookieConsentBanner/`        | 未決定時のみ表示するバナー                                               |
| 6   | `src/features/cookieConsent/component/cookieConsentToggle/`        | 同意する / しない の切り替えUI。設定画面とポリシーページで共有           |
| 7   | `src/features/privacy/privacyPage/`                                | ポリシー本文                                                             |
| 8   | `src/app/privacy/page.tsx` / `layout.tsx`                          | `/privacy` ルート（`AppLayout` を適用）                                  |
| 9   | `supabase/migrations/<ts>_add_cookie_consent_to_user_settings.sql` | 3 列を追加（§4.6）                                                       |

### 3.2 変更

| #   | ファイル                                              | 内容                                                                                 |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 10  | `src/constants/common.ts`                             | `STORAGE_KEYS` に 3 キー、`ROUTES.PRIVACY` を追加                                    |
| 11  | `src/constants/user.ts`                               | `COOKIE_CONSENT_VALUES` と `COOKIE_CONSENT_VERSION` を追加                           |
| 12  | `src/constants/strings.ts`                            | `ARIA_LABELS` に `COOKIE_BANNER` / `FOOTER_NAV` を追加                               |
| 13  | `src/schema/user.ts`                                  | `UserSettings` と `updateSettingsSchema` に 3 フィールドを追加（`superRefine` 付き） |
| 14  | `src/app/api/user/settings/route.ts`                  | GET の `select`、PUT の受け口、`DEFAULT_SETTINGS`、**レート制限の位置**（§4.7）      |
| 15  | `src/lib/api/user/user.ts`                            | `updateSettings` で 3 フィールドを送る                                               |
| 16  | `src/types/database.types.ts`                         | 再生成（手編集しない）→ prettier をかける                                            |
| 17  | `src/lib/security/cspDirectives.mjs`                  | GA オリジンを追加（§6）                                                              |
| 18  | `src/app/layout.tsx`                                  | `consent default` インラインスクリプト、4 と 5 を描画                                |
| 19  | `src/components/layout/appLayout/appLayout.tsx`       | `Footer` に `links` を渡す。バナー領域の確保                                         |
| 20  | `src/components/layout/footer/footer.tsx`             | `<nav>` に `aria-label` を付与                                                       |
| 21  | `src/components/layout/footer/footer.module.scss`     | `&__nav` を SP でも表示（空の `@include lg` ごと削除、コメント更新）                 |
| 22  | `src/app/auth/layout.tsx`                             | `/privacy` へのリンクを追加                                                          |
| 23  | `src/features/settings/settingsPage/settingsPage.tsx` | 「Cookie」セクションを追加（GA ID 未設定時は `<section>` ごと出さない）              |
| 24  | `src/styles/global/_theme.scss` / `_variables.scss`   | `--z-index-banner: 1035` を追加（§8.1）                                              |
| 25  | `playwright.config.ts`                                | `webServer.env` に `NEXT_PUBLIC_GA_ID: ''` を明示（§12）                             |

### 3.3 責務と配置の制約

**同期の責務は `analyticsProvider` のみが持つ。** `useCookieConsent` は読み書きと購読に徹し、同期ロジックを含めない。バナー・トグル・プロバイダが同じフックを使っても API が多重に呼ばれないようにするため（§1.4-9）。

- `analyticsProvider` は `layout.tsx` の `<AppSessionProvider>` 内に**単一マウント**する。`<body>` 内に置けば自動的に内側になる
- 同期 effect の依存は `status` と `session?.user?.id` のみ。`session` オブジェクトを入れない（§1.4-8）
- モジュールスコープに「同期済み userId」のガードを持ち、同一セッションで 1 回に抑える
- `useToast` は zustand ベース（`hooks/useToast.ts`）でプロバイダ階層に依存しないため、配置の制約にならない
- `consent default` スクリプトは `<head>`、gtag.js の `<Script>` は `<body>`。前者が必ず先に実行される

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

`getServerSnapshot()` が `unknown` を返すことで、SSR 出力にバナーが含まれず hydration mismatch が起きない。

**`unknown` が観測されるのはハイドレーション時にマウントされたインスタンスだけである。** クライアント遷移で後からマウントされる `/privacy` のトグルや `/settings` の Cookie セクションは、マウント時点で `getSnapshot()` が使われるため一度も `unknown` にならない。`unknown` を前提にしたローディング表示をこれらの画面で当てにしてはならない。

API へ送る値は `'unset' | 'granted' | 'denied'` の 3 値で、`'unknown'` を含まない。`src/constants/user.ts` に `COOKIE_CONSENT_VALUES` を定義し、zod と型で `'unknown'` が API へ流れないことを担保する（`STREAMING_SCOPE_VALUES` と同じ形）。

### 4.2 購読の形

**`useSyncExternalStore` が購読するのは状態（文字列）だけ。** 時刻・所有者は購読対象にせず、必要な時点で直接読む。オブジェクトを返すと `getSnapshot` が毎回新しい参照を生み、`Object.is` 比較で無限ループになるため。既存の `useTheme` / `useMediaQuery` もプリミティブを返している。

`subscribe` / `getSnapshot` / `getServerSnapshot` は**モジュールスコープ**に置く（`useTheme.ts` に倣う）。フック内で定義すると毎レンダリングで購読し直しになる。

### 4.3 永続化

キーは 3 本に分ける。1 本の JSON にしないのは、`layout.tsx` のインラインスクリプト（§5.2）が状態だけを同期読みするためで、`JSON.parse` を挟まず単純なままにしておきたいため。

| キー                             | 値                                                      |
| -------------------------------- | ------------------------------------------------------- |
| `movie-app:cookie-consent`       | `granted` / `denied` のみ                               |
| `movie-app:cookie-consent-at`    | 同意／撤回した時刻（ISO 8601 文字列）                   |
| `movie-app:cookie-consent-owner` | 操作時のログインユーザー ID。未ログイン時の操作は空文字 |

**書き込み順は「所有者 → 時刻 → 状態」に固定し、状態キーの書き込みをコミット点とする。** `setItem` は 3 回に分かれ原子的でないため、中間状態を別タブが観測しうる。この順序なら中間状態は「新しい時刻 + 古い状態」になり、読み手は常に状態キーを基準に判断できる。購読側の通知（カスタムイベント / `storage`）も**状態キーの変化だけ**をトリガにする。

- 未知の値・読み取り失敗は `unset` として扱う
- 時刻が欠けている場合は `null` 扱いとし、状態は有効とみなす
- 同一タブ内の同期: カスタムイベント `movie-app:cookie-consent-change`
- 別タブとの同期: `storage` イベント（書き込んだタブ自身には発火しないため二重発火しない）
- **ログアウトしても消さない。** `_ga` Cookie は端末に残り続けるため、同意の記録だけ消すのは不整合になる

### 4.4 サーバー同期とマージ規則（証跡優先）

ログイン中は `user_settings` にも保存する。初版の「端末優先」規則は、2 端末間でサーバー記録が往復上書きされ `cookie_consent_at` が「最後に開いた端末の値」になるため破棄した。

**規則: 新しいタイムスタンプを持つ側を採用する。ただし他人の同意レコードは採用も送信もしない。**

同期は `status === 'authenticated'` かつ GA ID 設定済みのときに 1 回だけ実行する。

```
1. 端末の同意レコード (localState, localAt, localOwner) を読む
2. localOwner が空文字でなく、かつ現在の userId と異なる場合:
     → 他人の同意。端末レコードを破棄して unset に戻し、4 へ進む
3. GET /api/user/settings で (serverState, serverAt, serverVersion) を取得
4. 採用する値を決める:
     - 両方 unset                   → unset（バナーを表示）
     - 片方だけ unset               → unset でない方
     - 両方とも値がある             → at が新しい方（at が無い側は古いとみなす）
     - 版が現行版より古い           → unset に戻す（§4.5）
5. 書き戻しの直前に localStorage を再読する（compare-and-swap）:
     - 1 で読んだ値と一致しない     → 同期結果を破棄して終了
     - 一致する                     → 採用値を端末へ書く（owner は現在の userId）
6. 採用値がサーバー値と状態において異なる場合のみ PUT する
```

この規則で、初版にあった次の欠陥が解消する。

- **共有端末でのなりすまし同意**（手順 2）— A が同意した端末で B がログインしても、B のサーバー記録に A の同意が書かれない
- **2 端末間の ping-pong**（手順 4）— 常に新しい方が残るので往復しない
- **同期応答待ちの間の操作が上書きされる**（手順 5）— 応答到着前にバナーを操作したら同期結果を捨てる
- **別タブの書き戻しによる踏み潰し**（手順 5）— 同じ compare-and-swap で防ぐ
- **無駄な PUT**（手順 6）— 状態が同じなら送らない

**未認証で同意した場合**は `localOwner` が空文字なので手順 2 を通過し、ログイン時に初めてサーバーへ書かれる。`cookie_consent_at` には実際に同意した時刻が入る。

サーバー側は、**状態が変わらない PUT では `cookie_consent_at` を更新しない**（最初の同意時刻を保持する）。

#### 失敗時の扱い

サーバー保存が失敗しても localStorage 側の決定は巻き戻さない。同意の判断は端末側で完結しており、通信失敗で意思表示を無かったことにする方が有害なため。`useTheme` がロールバックしているのとは逆の判断なので、実装時にコメントで理由を残すこと。

ただし**黙って成功したように見せない**。失敗時はエラートーストで「この端末では反映済み。他の端末への同期に失敗しました」と伝える。同期は認証済みマウントのたびに冪等に実行されるため、次回ログイン時に自己修復する。

### 4.5 同意の版管理

`src/constants/user.ts` に `COOKIE_CONSENT_VERSION`（整数）を置き、localStorage とサーバーの両方に保存する。外部送信先やポリシーの内容が変わったら定数を上げ、保存された版が古い同意は `unset` に戻してバナーを再表示する。

外部送信規律の通知・公表は内容が変われば改めて行う前提であり、オプトイン同意も対象が変われば取り直しが要る。列を後から足すのは高くつくため、本 PR の同じマイグレーションに含める。

### 4.6 DB スキーマ

`20261102045228_add_streaming_notice_scope.sql` と同じ形で `user_settings` に 3 列を足す。新規テーブルではないため GRANT・RLS の追加は不要。

**GRANT が不要な理由を正確に書いておく。** 本アプリは NextAuth を使い Supabase Auth を使わないため `auth.uid()` は常に NULL で、`20260310000000_add_user_settings.sql` の RLS ポリシー 4 本は実質機能していない。読み書きが通るのは `createServiceRoleClient()` が RLS をバイパスし、`20261018053616_declare_table_grants.sql:100-101` がテーブル単位で `service_role` に GRANT しているため。テーブル単位の GRANT は後から足した列にも自動で及ぶ（列単位だったら必要だった）。

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
--   この列はクライアントが申告した時刻が端末とサーバーの間を往復する。
--   naive TIMESTAMP だと PostgREST がオフセット無しで返し、JS の new Date() が
--   ローカル時刻として解釈するため往復のたびにずれる（#160 / 20261101095646）。
--   同テーブルの created_at / updated_at が TIMESTAMP なのは #160 の取りこぼし。

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
-- 逆向き（granted だが日時が無い）は、列追加前からの移行を許すため制約しない
ALTER TABLE public.user_settings
  DROP CONSTRAINT IF EXISTS chk_user_settings_cookie_consent_at;

ALTER TABLE public.user_settings
  ADD CONSTRAINT chk_user_settings_cookie_consent_at
    CHECK (cookie_consent <> 'unset' OR cookie_consent_at IS NULL);

COMMENT ON COLUMN public.user_settings.cookie_consent IS
  'アクセス解析 Cookie への同意状態。unset = 未決定、granted = 同意、denied = 拒否。localStorage を正とし、ログイン中のみ同期される。';

COMMENT ON COLUMN public.user_settings.cookie_consent_at IS
  '同意／撤回した日時。クライアントが申告した値であり、改ざん不能な証跡ではない。未認証で同意した場合は端末に保持された時刻がログイン時に送られる。';

COMMENT ON COLUMN public.user_settings.cookie_consent_version IS
  '同意した時点のポリシー版（COOKIE_CONSENT_VERSION）。現行版より古い同意は未決定に戻して再取得する。';
```

適用後は `supabase gen types typescript --project-id <id> > src/types/database.types.ts` で再生成し、**`npx prettier --write src/types/database.types.ts` をかける**（生出力はダブルクォートで `prettier:check` が落ちる）。

マイグレーションは**デプロイより先に適用する**。未適用の環境では `select` に無い列を要求して PostgREST が `42703` / `PGRST204` を返し、GET が 500 になる。

### 4.7 API の変更

#### レート制限の位置を直す

現状の PUT は 認証 → レート制限 → `safeParse` の順で、**バリデーションより前にレート制限がある**。これはこのリポジトリの過去のレビュー指摘（不正リクエストでカウンタを消費させない）と逆であり、既存の入力が enum だけだったため顕在化していなかった。`cookieConsentAt` は端末時計という外部要因で正常系が弾かれうる初の入力なので、本 PR で「認証 → バリデーション → レート制限」に直す。

#### 時刻の検証は拒否ではなくクランプ

`cookieConsentAt` が不正（非 ISO、未来、機能リリース日より前）な場合、**400 で PUT 全体を拒否しない**。拒否すると「端末時計が進んでいる人は同意状態が永久に保存されず、リトライがレート制限を食い潰す」という詰みが発生する。

- 未来（端末の時計ずれを見込んで +5 分まで許容）→ サーバー受信時刻にクランプ
- 機能リリース日より前 → サーバー受信時刻にクランプ
- 非 ISO / パース不能 → `null` として保存（§4.3 の「時刻が欠けていても状態は有効」規約に揃える）

いずれの場合も**同意状態そのものは必ず保存する**。

#### スキーマ

`cookieConsent` と `cookieConsentAt` は**セットでのみ受け付ける**。片方だけ送れるようにすると、状態を変えずに同意日時だけ任意の過去値へ書き換えられる。`updateSettingsSchema` に `superRefine` を足して片方だけの送信を 400 にする（`src/schema/awardSync.ts:34` に既存例）。

zod は v4 なので `z.string().datetime()` ではなく **`z.iso.datetime()`** を使う。`null` を明示的に送る経路があるため `.nullable().optional()` とし、route 側は `!== undefined` で判定する。

`DEFAULT_SETTINGS`（`route.ts:33-37`）にも 3 フィールドを追加する。`UserSettings` に必須フィールドを足すとここがコンパイルエラーになる。

## 5. GA4 と Consent Mode v2

### 5.1 測定 ID の取得と検証

```
process.env.NEXT_PUBLIC_GA_ID?.trim() が /^G-[A-Z0-9]{6,20}$/ に一致するときだけ有効
```

- 環境変数は `auth.ts:42` などと同じく**関数内で直接参照**する（モジュールトップレベルで定数化すると、テストから `process.env` を差し替えるのに `jest.resetModules()` が必要になる）
- `.trim()` するのは、Vercel の環境変数に貼り付けた際の前後空白で不一致になる事故（「設定したのに計測されない」の典型）を防ぐため
- 引用符・バックスラッシュを通さないので、インライン補間（§5.2）の防御としても機能する
- Google の「手動インストール」が出す `GT-` 形式は意図的に弾く
- 不一致のときは dev のみ `console.warn` で理由を出す

### 5.2 `consent default` を gtag.js より前に積む

Consent Mode は `default` が gtag.js の読み込みより前に `dataLayer` へ積まれていることが前提になる。`layout.tsx` の `<head>` に、テーマ初期化と同じ形でインラインスクリプトを 1 本追加する。**GA ID が有効なときだけ出力する。**

**`window.gtag` をグローバルに確定させることが必須**である。IIFE で包んで `function gtag(){}` と書くと関数スコープに閉じ、`window.gtag` が未定義になって §5.4 の `consent update` が丸ごと不発になる。

```js
// layout.tsx <head>（ストレージキーは STORAGE_KEYS.COOKIE_CONSENT と同期すること）
(function () {
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () {
    window.dataLayer.push(arguments);
  };
  var c = null;
  try {
    c = localStorage.getItem('movie-app:cookie-consent');
  } catch (e) {}
  window.gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: c === 'granted' ? 'granted' : 'denied',
  });
})();
```

localStorage をここで読むことで、再訪問した同意済み利用者に「denied で始めて update する」往復が起きない。Google の `wait_for_update` も不要になる（同機能は同意バナーが非同期ロードされる場合のためのもので、同期読みの本設計には当たらない）。

このスクリプトは既存のテーマ初期化と同じ性質（SSR で静的に埋め込むインラインスクリプト、DOM 注入 sink ではない）なので、Trusted Types の対象外であり `script-src 'unsafe-inline'` で許可される。

### 5.3 `gtag` は Arguments オブジェクトを push する

**`src/utils/analytics.ts` は自前で `dataLayer.push` してはならない。必ず `window.gtag(...)` を呼ぶ。**

gtag.js は dataLayer の要素が **Arguments オブジェクト**のときだけコマンドとして処理し、Array は無視する。TypeScript で自然に書くと `(...args: unknown[]) => window.dataLayer.push(args)` となり、これは Array を積む。症状は「`default` は効くのに `update` だけ効かない」という最も切り分けにくい形で出る。

§9.1 のテストで「積まれた要素が `Object.prototype.toString.call(...) === '[object Arguments]'` であること」を assert する。

### 5.4 gtag.js の読み込み

`next/script` の `<Script strategy="afterInteractive">` を 2 本。`@next/third-parties` は入れない（公式に experimental と明記されており、本スコープで機能差がない）。

- **両方に `id` を付ける。** Next.js 同梱ドキュメント `scripts.md:258` が「インラインスクリプトには `id` が必須」と明記。`next/script` の重複防止キーが `id || src` で、インラインは `src` が空のため `id` が無いと再マウント時に `gtag('config')` が二重注入され page_view が重複する
- **2 本目は `dataLayer` / `gtag` を再定義しない。** GA の標準スニペットをそのまま貼って `window.dataLayer = []` と書くと、head で積んだ `consent default` ごと消える
- 2 本目の内容は `gtag('js', new Date())` と **`gtag('config', '<ID>', { send_page_view: false })`** のみ（§5.5）

`consent update` が gtag.js のロード前に呼ばれても問題ない。`gtag()` は `dataLayer.push` するだけで、gtag.js はロード後にキューを順に処理する。

### 5.5 page_view は手動で送る

**GA4 の拡張計測「ブラウザの履歴イベントに基づくページの変更」はオフにする。**

App Router は状態コミットごとに `history.pushState` / `replaceState` を呼ぶ。本アプリはフィルタ・ソート・ページングを `router.replace` で URL クエリに書いているため（§1.4-6）、拡張計測に任せると**ジャンルを 1 つチェックするたびに page_view が 1 件増える**。さらに URL 書き換えが `useInsertionEffect` 内で起きるため、GA4 が読む `document.title` が 1 つ前のページのものになる（`person/[id]` は async `generateMetadata` なので特に確実にずれる）。

代わりに `analyticsProvider` で次を行う。

- `gtag('config', id, { send_page_view: false })` で自動送信を止める
- `usePathname()` の変化時のみ `gtag('event', 'page_view', { page_path, page_title, page_location })` を送る。`useSearchParams()` は依存に入れない（クエリ変更で送らないため）
- `page_title` は `document.title` 確定後に読む
- **`unset → granted` の遷移時に 1 回だけ page_view を送る。** `consent update` は page_view を発生させないため、同意した直後のページが計上されない

### 5.6 同意状態の変更を反映する

`analyticsProvider` の effect で、同意状態が確定（`unknown` 以外）するたびに送る。

```js
window.gtag('consent', 'update', {
  analytics_storage: consent === 'granted' ? 'granted' : 'denied',
});
```

| 遷移                 | 挙動                                                        |
| -------------------- | ----------------------------------------------------------- |
| `unset` → `granted`  | `update` で `granted`。加えて page_view を 1 回送る（§5.5） |
| `unset` → `denied`   | `update` で `denied`（既定値と同じ）                        |
| `granted` → `denied` | `update` で `denied` にし、`_ga` 系 Cookie を削除（§5.7）   |
| `denied` → `granted` | `update` で `granted`。page_view を 1 回送る                |

`ga-disable-<測定ID>` は使わない。`analytics_storage: 'denied'` が Cookie 書き込みと識別を止めるため役割が重複し、どちらを使っても gtag.js のロード自体は止まらない。

### 5.7 GA Cookie の削除

初版の「`location.hostname` と `.<hostname>` の 2 通り」では消えないケースがある。

- GA の `cookie_domain` は既定 `'auto'` で、Public Suffix List に基づく **eTLD+1（登録可能ドメイン）**に Cookie を置く。`www.example.com` で配信すると Cookie は `.example.com` にあり、`www.example.com` / `.www.example.com` への削除では消えない
- localhost では `cookie_domain` が `'none'` になり、**domain 属性なしの host-only Cookie** になる

したがって次のようにする。

1. `location.hostname` を `.` で分割し、最も具体的なものから順に全サフィックスを列挙する
2. 各サフィックスについて `domain=<d>` と `domain=.<d>` の 2 通り、加えて **domain 属性なし**の 1 通りで、`path=/; Max-Age=0` を書く
3. 対象は `document.cookie` 中の `_ga` で始まる名前すべて
4. 書き込み後に `document.cookie` を読み直し、残存がないことを確認する

Cookie 名は `_ga` と `_ga_<コンテナID>`（＝測定 ID から `G-` を除いた部分）。前方一致で消すので動作には影響しないが、ポリシー本文の表記はこれに合わせる。

## 6. CSP の変更

`src/lib/security/cspDirectives.mjs` の `getCspDirectives()` に追加する。Consent Mode では同意の有無にかかわらず gtag.js を読み込むため常時必要。

| ディレクティブ | 追加するオリジン                                                                           |
| -------------- | ------------------------------------------------------------------------------------------ |
| `script-src`   | `https://www.googletagmanager.com`                                                         |
| `connect-src`  | `https://www.googletagmanager.com` `https://*.google-analytics.com` `https://*.google.com` |
| `img-src`      | `https://www.googletagmanager.com` `https://*.google-analytics.com`                        |

[Google 公式 CSP ガイド](https://developers.google.com/tag-platform/security/guides/csp) の GA4（広告機能なし）構成に準拠する。公式は `script-src-elem` に記載しているが、本リポジトリは `script-src-elem` を定義していないため `script-src` への追加で足りる。

**`img-src` に `https://*.google.com` は入れない。** 公式の広告機能なし構成に含まれておらず、`accounts.google.com` 等を含む広いワイルドカードを不要に開けることになる（`connect-src` 側に入っているのは広告なし構成でも正しい）。

`https://*.analytics.google.com` は公式の列挙に含まれないため追加しない。違反が出てから足す方針だが、**本番が 404 で封鎖されている間（§1.4-10）は違反レポートが集まらない**。この依存関係を #169 へ申し送る。

広告機能・Google シグナルを有効化する場合は `frame-src` にも `https://www.googletagmanager.com` を明示追加すること（本リポジトリの `frame-src` は YouTube のみを明示指定しており `default-src` にフォールバックしない）。

## 7. プライバシーポリシーページ

`/privacy` を静的ページとして追加する。`AppLayout` を適用し、認証は不要（`AUTH_REQUIRED_ROUTES` に加えない）。

### 7.1 ページ要件

- `page.tsx` に `export const metadata: Metadata = { title: 'プライバシーポリシー | Movie App', description: '取得する情報・利用目的・外部送信先について' }`（既存ページと同形）
- `layout.tsx` は `<AppLayout>{children}</AppLayout>` のみ。`showSidebar` は既定（true）のまま
- **`<h1>` を 1 本持つ**（`e2e/a11y/helpers.ts:65` が `h1` の存在を待つ）。本文は `<section>` + `<Heading level={2}>` で構成する
- 制定日・最終改定日を掲示する

### 7.2 構成

1. 取得する情報
2. 利用目的
3. ご利用の端末から外部へ送信される情報（§1.5 の第 1 表。**送信先での利用目的の列を含む**）
4. 当社サーバーから取扱いを委託している先（§1.5 の第 2 表）
5. 外国にある第三者への提供
6. Cookie とローカルストレージ
7. アクセス解析と同意（§7.4）
8. 保存期間と削除
9. 安全管理措置
10. 開示・訂正・削除のご請求と苦情の申出先
11. 本ポリシーの改定について

項目 3 で「送信先での利用目的」を書くのは、電気通信事業法施行規則が通知・公表事項として ①送信される情報の内容 ②送信先 ③**当該情報の利用目的** の 3 点を求めるため。項目 2 の利用目的は自サービス側のものであって、これとは別物。

項目 5 は、委託であっても外国にある第三者への提供には個人情報保護法 28 条が適用される（27 条 5 項の委託の例外は 28 条に及ばない）ため。該当しうるのは Resend・OpenAI・Vercel・Google(GA4)、および Supabase（**プロジェクトのリージョンを確認し、東京なら対象外と整理する**）。個人開発の規模では基準適合体制（各社の DPA）を根拠にし、「移転先国は米国等で、規則で定める基準に適合する体制を整備した事業者を選定しています。詳細は請求に応じて情報提供します」で足りる。

項目 9・10 は法 32 条 1 項の公表事項。氏名・住所は「請求に応じて遅滞なく回答します」＋ 連絡先の明示で足り、自宅住所を掲載する必要はない。**公開用の連絡先メールアドレスを決める必要がある**（アプリ内に問い合わせ先は現状 1 件も無い）。

### 7.3 アカウント削除機能は存在しない

API を全数確認した結果、**利用者も管理者もアカウントを削除できない**（`/api/user/profile` は PUT のみ）。項目 8 に「アカウント削除機能は未提供です。削除のご請求は窓口で受け付け、手作業で対応します」と**正直に書く**。存在しない機能を前提に書くと、それ自体が不適正な取扱いになる。アカウント削除機能は別 Issue で起票する。

`rate_limits.identifier` には `メールアドレス|IPアドレス` の平文が入り（`loginIdentifier.ts:30`）、定期削除の cron が無いため事実上無期限で残る。保持期間を決めて項目 8 に書き、定期削除は別 Issue で起票する。

### 7.4 Consent Mode の挙動を正確に書く

§1.3 のとおり、未同意・撤回後も Google への通信は発生する。次の 3 点を明記する。

- 同意の有無にかかわらず、アクセス解析タグ自体は読み込まれる
- **同意しない場合、`_ga` などの識別用 Cookie は作成されないが、IP アドレス・ブラウザの種類・閲覧した URL などは Google へ送信される**
- 同意した場合に限り `_ga` / `_ga_<コンテナID>` Cookie を作成し、同一ブラウザからの再訪問を区別する

「個人を識別しない形の情報のみが送信される」とは書かない。IP アドレスは GDPR では個人データ、日本法でも少なくとも個人関連情報であり、不正確。

### 7.5 Cookie とローカルストレージの列挙

実装を確認した結果を正確に書く。

- Cookie: NextAuth のセッショントークン・CSRF トークン・コールバック URL、`_ga` / `_ga_<コンテナID>`（同意時のみ）
- localStorage: `movie-app:theme`、`movie-app:movie-filters`、`movie-app:cookie-consent`（＋時刻・所有者・版）
- sessionStorage: 送信済みレコメンドイベント（`useRecommendationEvents.ts:71`）、原題提案（`storedSuggestion.ts:98`）

`STORAGE_KEYS.LANGUAGE` と `STORAGE_KEYS.RECENT_SEARCHES` は**定義のみで使用箇所がゼロ**なので書かない。未使用定数の削除は別 Issue。

### 7.6 同意の撤回UI

ページ内に `CookieConsentToggle` を置く。`/settings` は認証必須のため、**未認証の利用者が撤回する唯一の手段**がここになる。

- GA ID 未設定時は描画しない。ただし**保存済みの状態が `unset` 以外なら、GA ID 未設定でも撤回導線（Cookie 削除）を出す**。運用側が GA を止めたときに、同意済みの人の撤回手段だけが消えるのを防ぐ
- 2 つの選択肢は**同等の視覚的重み**にする（色・サイズ・コントラストで「同意する」を目立たせない）
- バナーに閉じる `✕` を置かない。置くなら拒否と同値にする
- 同意を既定選択にしない。未決定は「拒否」でも「同意」でもないため、`RadioGroup` で 2 択にすると `aria-checked="true"` が利用者のしていない選択を報告することになる。**`role="switch"`（未決定 = off）にするか、`RadioGroup` のままなら未選択であることを可視テキストで示す**
- `unknown` / 同期未完了の間は `Skeleton` を出す（`StreamingNoticeSettings` に倣う）

## 8. 配置と導線

### 8.1 バナーの配置

**`position: fixed` にしない。** §1.4-3 のとおり `AppLayout` はドキュメントをスクロールさせないため、固定配置するとフッター（＝追加するポリシーリンク）を永久に覆い、スクロールで逃げられない。

- バナーは `AppLayout` のフッター直後に積み、レイアウトを押し出す
- `AppLayout` を使わない画面（`/auth/*`、`/theater-experience`、`not-found`、`error`）でも `layout.tsx` 直下に描画されるため、これらでは通常フローの末尾に入る
- z-index トークン `--z-index-banner: 1035` を `_theme.scss` / `_variables.scss` に追加する（header 1030 より上、modal-backdrop 1040 より下）
- トーストは `bottom: 0` で同じ領域に出るため、バナー表示中はトーストを押し上げる
- Radix のモーダル展開中はバナーが `aria-hidden` 配下に入り操作不能になるが、これは許容する（既存のオーバーレイと同じ扱い）

### 8.2 バナーのアクセシビリティ

- `<section role="region" aria-label="Cookie の利用について">`。文言は `ARIA_LABELS` に追加する
- **DOM 上は `{children}` の後**に置く。`appLayout.tsx:80-90` のスキップリンクは「DOM 上の最初のフォーカス可能要素」であることを前提にしており、`e2e/a11y/keyboard.spec.ts:30-32` が 1 回目の Tab でスキップリンクにフォーカスすることを assert している
- 末尾配置のままだとキーボード利用者がページ全体を通過しないと到達できないため、**バナー先頭に「Cookie 設定へ」のスキップリンクを置く**
- 初回描画のため `aria-live` は不適。ランドマーク化とスキップリンクで担保する
- アニメーションは付けない（`.claude/rules/scss-styling.md`）

### 8.3 ポリシーへの導線

- `AppLayout` から `Footer` へ `links={[{ label: 'プライバシーポリシー', href: ROUTES.PRIVACY }]}` を渡す
- `footer.module.scss` の `&__nav` を `display: flex` にし、**空になる `@include lg { display: flex }` ブロックごと削除**、コメント「// ナビゲーション（SP: 非表示）」も更新する
- `footer.tsx` の `<nav>` に `aria-label`（`ARIA_LABELS.FOOTER_NAV = 'フッターナビゲーション'`）を付ける。本リポジトリの他の nav はすべて名前付きで、名前の無い nav を全ページに増やすと axe の `landmark-unique`（best-practice タグも有効）に対して脆くなる
- `&__custom` も `display: none` だが、`appLayout.tsx` が children を渡していないため**今回は触らない**（判断を暗黙にしないため明記）
- **`src/app/auth/layout.tsx` に `/privacy` へのリンクを追加する。** 個人情報を取得するまさにその画面（`/auth/signup`）に利用目的への導線が無い状態を残さない。バナーは同意／拒否後に消えるため、恒久的な導線が別途要る
- 同意バナーからもポリシーページへリンクする

## 9. テスト計画

### 9.1 新規の単体テスト

| ファイル                                              | 観点                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/utils/cookieConsent.test.ts`                     | 保存と読み出し / 書き込み順（所有者→時刻→状態）/ 2 本目以降の `setItem` が throw したときの観測結果 / 未知の値は `unset` / 時刻が欠けても状態は有効 / 版が古ければ `unset` / SSR 安全 / イベント発火                                                                                                                                               |
| `src/utils/analytics.test.ts`                         | GA ID 未設定・空文字・前後空白・不正形式・`GT-` を弾く / 正しい形式を通す / **push された要素が Arguments である** / `consent update` の内容 / `_ga` Cookie 削除（サブドメイン・localhost・残存確認）                                                                                                                                              |
| `src/hooks/useCookieConsent.test.ts`                  | 初期状態 / `grant()` / `deny()` / カスタムイベントと `storage` での同期 / **同期ロジックを持たないこと**                                                                                                                                                                                                                                           |
| `src/components/providers/analyticsProvider.test.tsx` | GA ID 無効時に何も描画しない / `<Script>` 2 本に `id` がある / `send_page_view: false` / `usePathname` 変化で page_view / クエリ変更では送らない / `unset→granted` で page_view 1 回 / `consent update` / マージ規則（§4.4 の全分岐）/ 他人の同意レコードの破棄 / compare-and-swap / 同期失敗時にトーストを出し巻き戻さない / 未認証では同期しない |
| `cookieConsentBanner.test.tsx`                        | 4 状態の表示可否 / 同意・拒否の反映 / ポリシーリンク / スキップリンク / ランドマークと `aria-label` / キーボード操作 / 2 択の対等性（`✕` が無いこと）                                                                                                                                                                                              |
| `cookieConsentToggle.test.tsx`                        | 未決定時に「同意する」が選択済みに見えないこと / 切り替えの反映 / GA ID 未設定かつ `unset` では描画しない / GA ID 未設定でも保存済みなら撤回できる / `unknown` 中は `Skeleton`                                                                                                                                                                     |
| `privacyPage.test.tsx`                                | `h1` が 1 本 / 11 項目の見出し / 外部送信先（2 表）と送信先での利用目的 / Consent Mode の 3 点（§7.4）/ 撤回UIの存在                                                                                                                                                                                                                               |
| `src/app/privacy/layout.test.tsx`                     | `AppLayout` を適用していること（`src/app/auth/layout.test.tsx` に前例）                                                                                                                                                                                                                                                                            |
| `src/app/layout.test.tsx`                             | インラインスクリプト文字列が `STORAGE_KEYS.COOKIE_CONSENT` の値を含むこと（べた書きの同期漏れ検知）/ GA ID 未設定時に出力しないこと                                                                                                                                                                                                                |

### 9.2 既存テストの更新

| ファイル                                       | 内容                                                                                                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/security/cspDirectives.test.ts`       | `:20` `:28` の `toBe()` 完全一致が落ちるため期待値を更新。`img-src`（`:47-49`）/ `connect-src`（`:51`）の配列も更新                                                                  |
| `src/lib/security/csp.test.ts`                 | 部分一致のため**追記だけでは落ちない**。GA オリジンを含む assert を能動的に追加する                                                                                                  |
| `src/app/api/user/settings/route.test.ts`      | **`toEqual({...})` の完全一致 3 箇所（`:75` `:99` `:151`）の期待値更新**。3 フィールドの GET/PUT / 片方だけの送信を拒否 / 時刻のクランプ / 列が NULL の既存行 / レート制限の位置変更 |
| `src/lib/api/user/user.test.ts`                | **`UserSettings` 型リテラル（`:55`）の追従**（`tsc --noEmit` で落ちる。jest は型検査しないので気づけない）                                                                           |
| `src/components/layout/footer/footer.test.tsx` | `links` を渡したときのリンク描画 / `<nav>` の `aria-label`                                                                                                                           |
| `settingsPage.test.tsx`                        | Cookie セクションの追加 / **GA ID 未設定時に Cookie 見出しが出ないこと**                                                                                                             |

### 9.3 E2E

**初版の「既存 49 本に影響しない」は誤りだった。** GA 連動部分（バナー・トグル・gtag）は GA ID 未設定で描画されないため影響しないが、**§8.3 のフッター変更は GA ID と無関係に全ページへ入る**。

| 対象                                  | 扱い                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| `e2e/a11y/publicPages.spec.ts`        | 公開 9 ページ × light/dark の axe が新しい nav / link を検査する。**再実行して確認** |
| `e2e/mobile/mobileResponsive.spec.ts` | 375px で `scrollWidth <= clientWidth` を assert。**再実行して確認**                  |
| `e2e/a11y/keyboard.spec.ts`           | Tab 順に 1 要素増える。**再実行して確認**                                            |
| `/privacy`                            | `PUBLIC_PAGES` に追加して**本 PR に含める**（GA ID 未設定でも本文は描画される）      |
| 同意バナー・撤回フロー                | GA ID が必要なため別 Issue                                                           |

### 9.4 カバレッジとビジュアル証跡

- `jest.config.js:52-59` の閾値（全指標 80%）を維持する
- 全ページにバナーを足し SP のフッターを変えるため、`.claude/rules/visual-evidence.md` に従い **SP フッターの Before/After と、バナー表示〜同意／拒否の動画を PR に添付する**。SP 幅でのバナーの重なりは jsdom で検証できないため、ここで担保する

## 10. 完了条件

### 機能

- [ ] GA ID 未設定時は同意UIも gtag.js も `consent default` も一切出力しない
- [ ] `consent default` が gtag.js より前に積まれ、再訪問時に往復が起きない
- [ ] `window.gtag` がグローバルに定義され、push された要素が Arguments である
- [ ] バナーから同意 / 拒否ができ、`consent update` が送られる
- [ ] 同意直後のページが page_view として計上される
- [ ] **フィルタ・ソート・ページング操作で page_view が増えない**
- [ ] `page_title` が現在のページのものになる
- [ ] `/settings` と `/privacy` の両方から撤回でき、`_ga` 系 Cookie が削除される（削除後に `document.cookie` で残存ゼロを確認）
- [ ] GA ID 未設定でも、保存済みの同意があれば撤回できる

### 同期

- [ ] マージ規則（§4.4）の全分岐が期待どおりに動く
- [ ] 他人の同意レコードが現在のユーザーのサーバー記録に書かれない
- [ ] 2 端末間でサーバー記録が往復上書きされない
- [ ] 同期応答の到着中にバナーを操作しても選択が覆らない
- [ ] 1 ページロードで同期 API が 1 回しか呼ばれない。タブ切替で再実行されない
- [ ] 端末時計がずれていても同意状態は保存される（時刻はクランプ）
- [ ] サーバー保存が失敗しても端末側の決定が巻き戻らず、エラートーストが出る
- [ ] ログアウトしても同意状態が端末に残り、バナーが再表示されない
- [ ] 版を上げると同意が `unset` に戻り、バナーが再表示される

### 実装品質

- [ ] CSP に GA オリジンが追加され、`img-src` に `*.google.com` が入っていない
- [ ] `cspDirectives.test.ts` の期待値更新と、`csp.test.ts` への assert 追加
- [ ] `route.test.ts` / `user.test.ts` の既存 assert・型リテラルが追従している
- [ ] マイグレーションを適用し、型を再生成して prettier をかけた
- [ ] カバレッジ 80% 以上を維持
- [ ] `npm run lint` / `npx tsc --noEmit` / `npm run prettier:check` が通る
- [ ] 既存 E2E 49 本が通る（特に `e2e/a11y/` と `e2e/mobile/`）
- [ ] `/privacy` が `PUBLIC_PAGES` に追加され axe を通る

### ドキュメントと確認

- [ ] `/privacy` に 2 表・送信先での利用目的・Consent Mode の 3 点・越境移転・連絡先が記載されている
- [ ] フッターと `/auth/*` から `/privacy` へ到達できる（PC・SP 両方）
- [ ] Before/After スクショとデモ動画を PR に添付した
- [ ] ローカル本番ビルド（GA ID を付けて `npm run build && npm start`）で動作と CSP 違反ゼロを確認した。**確認後はサーバーを落としてから E2E を回す**（`reuseExistingServer: !isCI` のため、残したままだと全 spec にバナーが出る）
- [ ] `.claude/documents/environment-variables.md:425` の未決チェックを解消
- [ ] `.claude/documents/roadmap/phase11-deploy.md` に項目を追加

## 11. 申し送り

| 宛先       | 内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #169       | Vercel 本番（Production のみ）への `NEXT_PUBLIC_GA_ID` 登録と**再デプロイ**（`NEXT_PUBLIC_*` はビルド時に静的置換されるため登録だけでは反映されない）。GA4 プロパティ側で **拡張計測の「ブラウザの履歴イベント」をオフ**（§5.5）、**「Google のプロダクトとサービス」データ共有をオフ**、**Google シグナルを無効**、**データ保持期間を決定**、**Google の DPA を受諾**。決めた保持期間を `/privacy` に反映。実トラフィックでの page_view 確認と `/api/csp-report` の監視（**GA 関連の CSP 違反監視は公開後に初めて成立する**）。Supabase プロジェクトのリージョン確認（越境移転の整理に必要） |
| #649       | Consent Mode では同意の有無によらず gtag.js を常時読み込むため、Trusted Types 違反も常時発生する。enforce 検証時に **gtag.js が実際に使うポリシー名を実測し、必要なら `cspDirectives.mjs` の `TRUSTED_TYPES_POLICIES` へ追加する**。※ 初版が書いた「`trustedTypes.ts:41-49` が throw する」は誤り。同関数はアプリ自身のヘルパーで gtag.js は通らない。拒否するのはブラウザ                                                                                                                                                                                                                    |
| 新規 Issue | 同意バナー・撤回フロー・マージ規則の E2E                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 新規 Issue | アカウント削除機能（§7.3）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 新規 Issue | `rate_limits` の保持期間と定期削除（§7.3）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 新規 Issue | CSP `connect-src https://*.supabase.co` の要否棚卸し（ブラウザ側 Supabase クライアントが存在しない）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 新規 Issue | 未使用定数の削除（`STORAGE_KEYS.LANGUAGE` / `RECENT_SEARCHES` / `placehold.co`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 新規 Issue | `GET /api/user/settings` にレート制限が無い（他の認証必須 GET は `READ_USER_DATA` を使用）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 新規 Issue | `.claude/documents/security-audit.md:20,81` の「dangerouslySetInnerHTML 不使用」「nonce ベース CSP」が現状と食い違っている                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 新規 Issue | カスタムイベント計測                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

## 12. 環境変数の扱い

| 設定先                                    | 可否            | 理由                                                                                                                             |
| ----------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Vercel Production                         | 設定する        | 本番のみ計測する                                                                                                                 |
| Vercel Preview / Development              | 設定しない      | 開発データの混入を防ぐ                                                                                                           |
| `.env.local` / `.env.local.example`       | 追加しない      | `playwright.config.ts:10` が `.env.local` を読み、`webServer.env` は `process.env` にマージされるため dev サーバーへ渡ってしまう |
| `playwright.config.ts` の `webServer.env` | **`''` を明示** | 上記を機械的に封じる。誰かが動作確認のため `.env.local` に足してもローカル E2E が壊れない                                        |
| `.github/workflows/e2e.yml`               | 追加しない      | `NEXT_PUBLIC_*` はビルド時インライン化されるため、build step に渡さないことで CI での読み込みを封じる                            |
| GitHub Secrets（Actions / Dependabot）    | 登録しない      | HTML に露出する公開値であり、ワークフローから参照もしない（`.claude/rules/ci-secrets.md`）                                       |
