# GA4 導入と Cookie 同意UI（オプトイン）設計

- 日付: 2026-11-03
- 対象 Issue: #892（GA4 導入）、#893（プライバシー方針の判断）
- 関連 Issue: #169（デプロイ）、#649（Trusted Types enforce 昇格）

## 0. 改訂履歴

| 版  | 内容                                                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 初版。同意まで gtag.js を読み込まない方式、localStorage のみ                                                                                   |
| 2   | Consent Mode v2 へ変更。`user_settings` へのサーバー同期を追加                                                                                 |
| 3   | 未認証時の同意時刻、ログアウト時の扱いを定義                                                                                                   |
| 4   | 5 観点のレビューを反映。マージ規則を証跡優先へ、page_view を手動送信へ、外部送信先の誤りを訂正                                                 |
| 5   | 再レビューを反映。**マージ規則を純関数に切り出して全分岐を表で網羅**、版はサーバーが書く方式へ、バナー配置を flex ラッパー方式で実現可能にする |

## 1. 背景と決定事項

### 1.1 #893 の決定

#893 の A / B / C のうち **B（オプトインの同意UI を導入する）** を採用する。GA4 の計測は「`NEXT_PUBLIC_GA_ID` が設定されていること」と「利用者が明示的に同意していること」の両方を条件とする。

### 1.2 確定した仕様

| 論点                     | 決定                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| 同意前の gtag の振る舞い | **Consent Mode v2（advanced）**。gtag.js は読み込み、`analytics_storage: 'denied'` で開始 |
| 同意取得UI（バナー）     | `NEXT_PUBLIC_GA_ID` が有効なときのみ表示                                                  |
| 撤回UI（トグル）         | **GA ID の有無によらず、保存済み状態が `unset` 以外なら表示**                             |
| 同意状態の保存           | localStorage を正とし、ログイン中は `user_settings` にも同期する                          |
| 同期の衝突解決           | 新しいタイムスタンプを持つ側を採用（証跡優先）。同値はサーバー優先                        |
| 同意の版                 | **サーバーが書く**。クライアントからは送らせない                                          |
| page_view の計上         | 手動送信。GA4 の拡張計測「ブラウザの履歴イベント」はオフ                                  |
| バナーの配置             | `position: fixed` にせず、**body 直下の flex ラッパーで押し出す**                         |
| 撤回導線                 | `/settings` と `/privacy` の両方                                                          |
| プライバシーポリシー     | 本 PR に含める                                                                            |
| 本番での実測確認         | ローカル本番ビルドで行い、Vercel 実機確認は #169 へ申し送る                               |

### 1.3 Consent Mode advanced を採る判断と、その代償

| 形態         | 同意前の挙動                                          |
| ------------ | ----------------------------------------------------- |
| basic        | 同意するまで gtag.js を読み込まない                   |
| **advanced** | gtag.js を読み込み、Cookie なしの ping を送る（採用） |

**advanced を採るが、現スコープで得られる見返りはゼロである。** advanced の実利は「同意しなかった利用者のモデリング」だが、§2.2 のとおり広告系 3 パラメータを恒久 `denied` とし Google シグナルも無効にするため機能しない。採用理由は「将来 Google シグナルや広告機能を有効化する際にタグ構成を変えずに済む」の一点に限る。

支払うコスト。

- 未同意の利用者についても Google へ接続が発生する（Cookie は置かれないが **IP アドレス・User-Agent・閲覧 URL・リファラは送られる**）
- 撤回後も ping は続く。「撤回すれば Google に一切送られない」とは言えない
- CSP の GA オリジン許可が常時必要（§6）
- Trusted Types enforce 昇格（#649）の障害が常時化する
- `afterInteractive` の `<Script src>` は静的 HTML に `<link rel="preload" as="script">` を埋めるため、gtag.js のダウンロードは HTML パース時点で始まる

この挙動はプライバシーポリシーに正確に書く（§7.4）。

### 1.4 調査で判明した前提

1. **認証ページは `AppLayout` を使わない。** `src/app/auth/layout.tsx` は独自の `<main>` のみ。バナーを全ページに出すにはルートの `src/app/layout.tsx` に置く必要がある。
2. **`layout.tsx` には既にストレージ読み取りのインラインスクリプトがある。** テーマ初期化が `localStorage` を同期読みして `data-theme` を決めている。
3. **現状の CSS ではバナーを置く場所が無い。** `_global.scss` の `body` は flex ではなく `min-height: 100vh`。`appLayout.module.scss` の `.c_app_layout` は `height: 100vh` 固定で `&__main` だけが内部スクロールする。`layout.tsx` 直下にバナーを置くと 100vh の**下**に積まれ、初期表示で一度も見えない。`position: fixed` にすればフッターを永久に覆う。**どちらも成立しないため、flex ラッパーを導入する**（§8.1）。
4. **`/auth`・`not-found`・`error` も 100vh を持つ。** `auth/layout.module.scss` が `min-height: 100vh`、`not-found.tsx:11` と `error.tsx:10` がインライン `minHeight: '100vh'`。flex ラッパーを入れるならこれらも直す必要がある。
5. **トーストは画面下部固定。** `toast.module.scss` の `.c_toast__viewport { position: fixed; bottom: 0; right: 0; max-width: 100vw }`。バナーと重なる。
6. **フッターのリンクは現状 0 件。** `appLayout.tsx:128` が `<Footer />` を引数なしで描画し、`footer.tsx:61` の `links && links.length > 0` が false。`&__nav` は `lg` 未満で `display: none`。
7. **App Router は URL クエリの書き換えでも history イベントを発火する。** フィルタ・ソート・ページングを `router.replace` で URL に書いている（`useMovieFilter.ts:121,132`、`useMovieList.ts:394`、`useAwards.ts:145`、`useTheaterSelection.ts:30`）。拡張計測に任せるとジャンルを 1 つチェックするたびに page_view が 1 件増える（§5.5）。
8. **`useTheme` には「サーバー → 端末」の読み出しが無い。** `updateSettings` のみで `getSettings` を呼んでいない。マージ処理に踏襲できる前例は無い。
9. **`SessionProvider` は `refetchOnWindowFocus` を無効化していない。** effect の依存に `session` オブジェクトを入れるとタブ切替のたびに再実行される。
10. **`reactStrictMode: true`**（`next.config.mjs:41`）。dev では effect が 2 回走る。
11. **`getSettings()` は既に 3 箇所から呼ばれている**（`streamingNoticeSettings.tsx:44`、`notificationSettings.tsx:29`、`streamingSortHint.tsx:37`）。
12. **`next/script` はこのリポジトリで一度も使われていない**（0 件）。テストのモック前例が無い。
13. **本番 Vercel は cron 以外すべて 404**（`src/proxy.ts:41`）。#169 まで本番での実測も CSP 違反の収集もできない。
14. **`user_settings` は列を足すだけで保存が揃う。** `20261102045228_add_streaming_notice_scope.sql` がテンプレート。ただし既存の `created_at` / `updated_at` が naive `TIMESTAMP` なのは #160 の取りこぼしで、**踏襲してはならない**。

### 1.5 外部送信の実態（初版の誤りを訂正）

初版は外部送信先を 7 件と書いたが誤りと漏れがあった。適用法令が異なるため 2 系統に分ける。

#### ブラウザから外部へ出るもの（電気通信事業法 外部送信規律）

| 送信先                     | 根拠                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------- |
| Google（GA4）              | 本 PR で追加                                                                       |
| YouTube（iframe）          | `videoDialog.tsx`、CSP `frame-src`                                                 |
| Google / GitHub（OAuth）   | `auth.ts` のプロバイダ定義によるリダイレクト                                       |
| `image.tmdb.org`（限定的） | `dismissedMoviesList.tsx:165` の `unoptimized` 1 箇所のみ（`/settings`、認証必須） |

**`image.tmdb.org` に利用者の IP が渡るという初版の記述は誤り。** 画像はすべて `next/image` 経由で `next.config.mjs:46-52` に `remotePatterns` 登録済み。ブラウザは自ドメインの `/_next/image?url=...` を叩き、TMDb へ取りに行くのはサーバー。素の `<img>` は `twoFactorSettings.tsx:116` の 1 箇所のみで TOTP QR の data URI。

#### サーバーから外部へ出るもの（個人情報保護法 27 条・28 条）

| 送信先                              | 送信される情報                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------ |
| OpenAI                              | お気に入り作品のタイトルと評価、興味なしリスト、ウォッチリストの作品名                                 |
| **Have I Been Pwned（初版で漏れ）** | パスワードの SHA-1 ハッシュ**先頭 5 文字**（`constants/auth.ts:165`。登録・再設定確定・変更の 3 経路） |
| Resend                              | 確認コード・パスワード再設定メールの宛先                                                               |
| TMDb API                            | 作品データの取得（利用者情報は送らない）                                                               |
| GitHub API                          | 検証済みメールアドレスの取得（`githubProfile.ts`）                                                     |
| Supabase / Vercel                   | データの保管およびアプリケーションの配信                                                               |

**Supabase はブラウザ発の送信先ではない。** `createClient` はすべてサーバー側ファイルにある。CSP の `connect-src https://*.supabase.co` も現状不要の可能性が高いが、削除は別 Issue とする。

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

| #   | ファイル                                                           | 役割                                                           |
| --- | ------------------------------------------------------------------ | -------------------------------------------------------------- |
| 1   | `src/utils/cookieConsent.ts`                                       | 同意レコードの読み書き、イベント発火。SSR 安全                 |
| 2   | `src/utils/resolveConsentMerge.ts`                                 | **マージ規則の純関数**（§4.4）。副作用なし                     |
| 3   | `src/utils/analytics.ts`                                           | GA ID の検証、`window.gtag` 経由のコマンド送出、GA Cookie 削除 |
| 4   | `src/hooks/useCookieConsent.ts`                                    | 状態の購読と `grant()` / `deny()` のみ。同期は持たない         |
| 5   | `src/components/providers/analyticsProvider.tsx`                   | gtag.js の読み込み、`consent update`、page_view、サーバー同期  |
| 6   | `src/features/cookieConsent/component/cookieConsentBanner/`        | 未決定かつ GA ID 有効時のみ表示するバナー                      |
| 7   | `src/features/cookieConsent/component/cookieConsentToggle/`        | 撤回UI。設定画面とポリシーページで共有                         |
| 8   | `src/features/privacy/privacyPage/`                                | ポリシー本文                                                   |
| 9   | `src/app/privacy/page.tsx` / `layout.tsx`                          | `/privacy` ルート                                              |
| 10  | `src/app/layout.module.scss`                                       | **body 直下の flex ラッパー**（§8.1）                          |
| 11  | `src/types/gtag.d.ts`                                              | `window.gtag` / `window.dataLayer` のグローバル型（§5.3）      |
| 12  | `supabase/migrations/<ts>_add_cookie_consent_to_user_settings.sql` | 3 列を追加（§4.7）                                             |

### 3.2 変更

| #   | ファイル                                                | 内容                                                                         |
| --- | ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 13  | `src/constants/common.ts`                               | `STORAGE_KEYS` に **4 キー**、`ROUTES.PRIVACY` を追加                        |
| 14  | `src/constants/user.ts`                                 | `COOKIE_CONSENT_VALUES` / `COOKIE_CONSENT_VERSION` / `COOKIE_CONSENT_MIN_AT` |
| 15  | `src/constants/strings.ts`                              | `ARIA_LABELS` に `COOKIE_BANNER` / `FOOTER_NAV`                              |
| 16  | `src/schema/user.ts`                                    | `UserSettings` と `updateSettingsSchema` を拡張（`superRefine` 付き）        |
| 17  | `src/app/api/user/settings/route.ts`                    | GET の `select`、PUT の受け口、`DEFAULT_SETTINGS`、レート制限の位置（§4.8）  |
| 18  | `src/lib/api/user/user.ts`                              | `updateSettings` の引数型を専用型に（§4.8）                                  |
| 19  | `src/types/database.types.ts`                           | 再生成 → prettier                                                            |
| 20  | `src/lib/security/cspDirectives.mjs`                    | GA オリジンを**末尾に**追加（§6）                                            |
| 21  | `src/app/layout.tsx`                                    | flex ラッパー、`consent default` スクリプト、5 と 6 を描画                   |
| 22  | `src/components/layout/appLayout/appLayout.module.scss` | `.c_app_layout` を `height: 100vh` → `flex: 1; min-height: 0`                |
| 23  | `src/components/layout/appLayout/appLayout.tsx`         | `Footer` に `links` を渡す                                                   |
| 24  | `src/components/layout/footer/footer.tsx`               | `<nav>` に `aria-label`                                                      |
| 25  | `src/components/layout/footer/footer.module.scss`       | `&__nav` を SP でも表示（空の `@include lg` ごと削除、コメント更新）         |
| 26  | `src/components/ui/toast/toast.module.scss`             | `bottom: var(--cookie-banner-height, 0px)`（§8.1）                           |
| 27  | `src/app/auth/layout.tsx` / `layout.module.scss`        | `/privacy` リンク追加、`min-height: 100vh` を解消                            |
| 28  | `src/app/not-found.tsx` / `src/app/error.tsx`           | インライン `minHeight: '100vh'` を解消                                       |
| 29  | `src/features/settings/settingsPage/settingsPage.tsx`   | 「Cookie」セクション（§7.6 の表示条件に従う）                                |
| 30  | `playwright.config.ts`                                  | `webServer.env` に `NEXT_PUBLIC_GA_ID: ''`（§12 の限界も参照）               |
| 31  | `e2e/a11y/publicPages.spec.ts`                          | `PUBLIC_PAGES` に `/privacy` を追加                                          |

### 3.3 責務と配置の制約

**同期の責務は `analyticsProvider` のみが持つ。** `useCookieConsent` は読み書きと購読に徹する。バナー・トグル・プロバイダが同じフックを使っても API が多重に呼ばれないようにするため。

- `analyticsProvider` は **`<AppSessionProvider>` の子**として単一マウントする。`layout.tsx:50` では `<body>` 直下が `AppSessionProvider` 自身なので、「body 内なら自動的に内側」ではない
- 同期 effect の依存は `status` と `session?.user?.id` のみ。`session` オブジェクトを入れない（§1.4-9）
- マージ判定は純関数 `resolveConsentMerge`（§3.1-2）に切り出す。プロバイダ側は「関数を呼び、結果を localStorage と PUT に反映する」だけにする。全分岐のテストは純関数側で行う
- `useToast` は zustand ベースでプロバイダ階層に依存しない
- `consent default` スクリプトは `<head>`、gtag.js の `<Script>` は `<body>`。前者が必ず先に実行される
- 既存の `createPersistStore`（`src/lib/store/`）は使わない。`layout.tsx` のインラインスクリプトが生のキーを同期読みする必要があり、ストア経由では初期化タイミングに間に合わないため

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

`getServerSnapshot()` が `unknown` を返すことで SSR 出力にバナーが含まれず hydration mismatch が起きない。

**`unknown` が観測されるのはハイドレーション時にマウントされたインスタンスだけである。** クライアント遷移で後からマウントされる `/privacy` のトグルや `/settings` の Cookie セクションは一度も `unknown` にならない。`unknown` を前提にしたローディング表示をこれらの画面で当てにしてはならない。

API へ送る値は `'unset' | 'granted' | 'denied'` の 3 値。`src/constants/user.ts` の `COOKIE_CONSENT_VALUES` を zod と型で共有し、`'unknown'` が API へ流れないことを担保する。

### 4.2 購読の形

**`useSyncExternalStore` が購読するのは状態（文字列）だけ。** 時刻・所有者・版は購読対象にせず、必要な時点で直接読む。オブジェクトを返すと `getSnapshot` が毎回新しい参照を生み `Object.is` 比較で無限ループになる。

`subscribe` / `getSnapshot` / `getServerSnapshot` はモジュールスコープに置く（`useTheme.ts:36-48` に倣う。`useMediaQuery.ts` はフック内定義だがこちらには倣わない）。

### 4.3 永続化

キーは 4 本。1 本の JSON にしないのは、`layout.tsx` のインラインスクリプト（§5.2）が状態と版だけを同期読みするためで、`JSON.parse` を挟まず単純なままにしておきたいため。

| キー                               | 値                                                      |
| ---------------------------------- | ------------------------------------------------------- |
| `movie-app:cookie-consent`         | `granted` / `denied` のみ                               |
| `movie-app:cookie-consent-at`      | 同意／撤回した時刻（ISO 8601）                          |
| `movie-app:cookie-consent-owner`   | 操作時のログインユーザー ID。未ログイン時の操作は空文字 |
| `movie-app:cookie-consent-version` | 操作時のポリシー版（`COOKIE_CONSENT_VERSION`）          |

**書き込み順は「所有者 → 版 → 時刻 → 状態」に固定し、状態キーの書き込みをコミット点とする。** `setItem` は 4 回に分かれ原子的でないため、中間状態を別タブが観測しうる。この順序なら中間状態は「新しい付随情報 + 古い状態」になり、読み手は常に状態キーを基準に判断できる。購読側の通知（カスタムイベント / `storage`）も**状態キーの変化だけ**をトリガにする。

- 未知の値・読み取り失敗は `unset` として扱う
- 時刻や版が欠けている場合は `null` 扱い。版が `null` のレコードは「版違い」として扱う（§4.6）
- 同一タブ内の同期: カスタムイベント `movie-app:cookie-consent-change`
- 別タブとの同期: `storage` イベント（書き込んだタブ自身には発火しない）

#### ログアウト時

**`owner` が空でない（＝ログイン中に行われた）レコードは `unset` に戻し、`_ga` 系 Cookie も削除する。** `owner` が空文字（未認証時の同意）のレコードは残す。

第 3 版は「`useTheme` がテーマを消さないのと揃え、`_ga` も端末に残るから」として消さない方針だったが、**§5.7 で `_ga` を削除できる以上この理由は成り立たない**。また消さないと、A がログアウトした端末を未認証の第三者が使ったときに A の同意がそのまま適用される（§5.2 の head スクリプトは認証状態を知らないため、React 側で補正しても一瞬の窓が残る）。

消しても煩わしくはない。自分で再ログインすれば §4.4 の同期でサーバー値が復活し、バナーは出ない。

### 4.4 マージ規則（純関数 `resolveConsentMerge`）

#### 入力

```ts
type ConsentRecord = {
  state: 'unset' | 'granted' | 'denied';
  at: string | null;       // ISO 8601
  version: number | null;
};

resolveConsentMerge(params: {
  local: ConsentRecord & { owner: string };
  server: ConsentRecord;
  userId: string;
  currentVersion: number;
}): {
  adopted: ConsentRecord | null;  // null = 未決定（バナーを表示）
  writeLocal: boolean;
  writePut: boolean;
}
```

#### 手順

```
1. 端末レコードの有効性を判定する（localStorage は書き換えない）
     local.state === 'unset'                        → effectiveLocal = null
     local.owner !== '' && local.owner !== userId    → effectiveLocal = null  // 他人のもの
     local.version !== currentVersion                → effectiveLocal = null  // 版違い
     それ以外                                        → effectiveLocal = local

2. サーバーレコードの有効性を判定する
     server.state === 'unset'                        → effectiveServer = null
     server.version !== currentVersion               → effectiveServer = null  // 版違い
     それ以外                                        → effectiveServer = server

3. 採用値を決める
     両方 null                 → adopted = null
     片方だけ null             → 非 null の方
     両方あり                  → at が新しい方
                                 at が同値 / 双方 null → サーバーを採用（タイブレーク）

4. 書き込みの要否を決める
     writeLocal = adopted が端末の現在値（state/at/version/owner）と異なる
     writePut   = adopted !== null
                  && adopted が サーバー現在値（state/at/version）と異なる
                  // 状態だけでなく at・version の差でも PUT する
```

**手順 1 で localStorage を書き換えないことが重要。** 第 4 版は他人のレコードをここで `unset` に書き戻していたため、手順 5 の compare-and-swap が必ず不一致になり同期が永久に成立しなかった。書き込みは呼び出し側（§4.5）に一本化する。

**`writePut` に `at` と `version` の差を含めることも重要。** 第 4 版は「状態が異なるときのみ PUT」としていたため、端末が現行版・サーバーが旧版で状態が同じ場合にサーバーの版が更新されず、別端末で毎回「版違い → 未決定」と判定されてバナーが無限に再表示されていた。

`server.version > currentVersion`（古いバンドルを掴んだ端末）のときは、手順 2 で版違いとして `effectiveServer = null` になり、かつ `writePut` も行わない（**新しい版の記録を古い版で上書きしない**）。この例外を実装に明記すること。

#### 分岐の網羅表（テストはこの表を使う）

| #   | 端末 state        | 端末 owner | 端末 version | サーバー state   | サーバー version | adopted  | writeLocal  | writePut  |
| --- | ----------------- | ---------- | ------------ | ---------------- | ---------------- | -------- | ----------- | --------- |
| 1   | unset             | -          | -            | unset            | -                | null     | false       | false     |
| 2   | unset             | -          | -            | granted          | 現行             | サーバー | true        | false     |
| 3   | granted           | ''         | 現行         | unset            | -                | 端末     | true(owner) | true      |
| 4   | granted           | 自分       | 現行         | denied（新）     | 現行             | サーバー | true        | false     |
| 5   | granted（新）     | 自分       | 現行         | denied（旧）     | 現行             | 端末     | false       | true      |
| 6   | granted           | **他人**   | 現行         | unset            | -                | null     | false       | false     |
| 7   | granted           | **他人**   | 現行         | denied           | 現行             | サーバー | true        | false     |
| 8   | granted           | 自分       | **旧版**     | unset            | -                | null     | false       | false     |
| 9   | granted           | 自分       | 現行         | granted          | **旧版**         | 端末     | false       | true      |
| 10  | granted           | 自分       | 現行         | granted          | **未来版**       | 端末     | false       | **false** |
| 11  | granted（同時刻） | 自分       | 現行         | denied（同時刻） | 現行             | サーバー | true        | false     |

### 4.5 同期の実行とライフサイクル

`analyticsProvider` に effect を **2 本**置く。第 4 版は 1 本しか定義しておらず、利用者がバナーで同意してもそのページロード中に PUT されない欠陥があった。

#### effect A: 初回マージ（1 回だけ）

発火条件: `status === 'authenticated'` かつ GA ID 有効 かつ 未同期。

```
1. 端末レコードを読む（スナップショットを保持）
2. inFlight を立てる
3. GET /api/user/settings
4. resolveConsentMerge を呼ぶ
5. 書き込み直前に localStorage を再読し、1 のスナップショットと比較する
     不一致（＝応答待ちの間に利用者が操作した）→ 結果を破棄して終了
     一致 → writeLocal なら端末へ書く（owner は現在の userId）
6. writePut なら PUT
7. 成功時のみ syncedUserId を確定する。失敗時は inFlight を戻しガードを立てない
```

ガードをモジュールスコープの `syncedUserId` に持ち、**成功時のみ確定する**。GET 発行前に確定すると、失敗後に二度と再試行されず「次回ログイン時に自己修復する」が成り立たない。`reactStrictMode: true`（§1.4-10）による dev の二重実行は `inFlight` で抑える。

テストのために `__resetConsentSyncForTest()` を export する（モジュールスコープの状態は Jest のモジュールキャッシュを跨ぐため）。

`getSettings()` は `AbortSignal` を受け取らないので、クリーンアップは `cancelled` フラグ方式にする（カスタム ESLint ルール `local/require-effect-cleanup` は `warn` なので CI は落ちないが、意図を明示する）。

#### effect B: 変更の追随（毎回）

発火条件: effect A の完了後、`consent` が `unknown` 以外で変化したとき。

- 直近送信値を ref に保持し、同値なら送らない
- 未認証なら何もしない（localStorage への保存のみ）
- 失敗しても localStorage は巻き戻さない

#### 失敗時の扱い

サーバー保存が失敗しても localStorage 側の決定は巻き戻さない。同意の判断は端末側で完結しており、通信失敗で意思表示を無かったことにする方が有害なため。`useTheme` がロールバックしているのとは逆の判断なので、実装時にコメントで理由を残すこと。

ただし**黙って成功したように見せない**。失敗時はエラートーストで「この端末では反映済み。他の端末への同期に失敗しました」と伝える。

### 4.6 同意の版

`src/constants/user.ts` に `COOKIE_CONSENT_VERSION`（整数）を置く。外部送信先やポリシーの内容が変わったら定数を上げる。

**版が古い同意は「未決定として扱う」だけで、記録は消さない。** 端末の localStorage もサーバーの行もそのまま残し、再同意されたときに上書きする。第 4 版は「`unset` に戻す」としていたが、§4.7 の `CHECK (cookie_consent <> 'unset' OR cookie_consent_at IS NULL)` により同意日時が NULL になり、**証跡のために作った列が版を上げるたびに消滅していた**。

**版はサーバーが書く。クライアントからは送らせない。** 版をクライアント申告にすると、版だけ単独で送って「古い同意を現行版で同意済みに見せかける」ことでバナーの再取得を回避できてしまう。サーバーは `cookie_consent` を更新するときに自分の `COOKIE_CONSENT_VERSION` を書く。クライアントとサーバーは同じ定数を参照するのでデプロイ単位で一致する。

### 4.7 DB スキーマ

`20261102045228_add_streaming_notice_scope.sql` と同じ形で `user_settings` に 3 列を足す。

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
  '同意／撤回した日時。クライアントが申告した値であり、改ざん不能な証跡ではない。未認証で同意した場合は端末に保持された時刻がログイン時に送られる。';

COMMENT ON COLUMN public.user_settings.cookie_consent_version IS
  '同意した時点のポリシー版。サーバーが書く（クライアントからは送らせない）。現行版より古い記録は未決定として扱い、バナーを再表示する。記録自体は消さない。';
```

適用後は型を再生成し、**`npx prettier --write src/types/database.types.ts` をかける**（生出力はダブルクォートで `prettier:check` が落ちる）。マイグレーションは**デプロイより先に適用する**（未適用だと `select` に無い列を要求して PostgREST が `42703` を返し GET が 500 になる）。

### 4.8 API の変更

#### レート制限の位置を直す

現状の PUT は 認証 → レート制限 → `safeParse` の順で、バリデーションより前にレート制限がある。リポジトリの過去のレビュー指摘（不正リクエストでカウンタを消費させない）と逆であり、既存の入力が enum だけだったため顕在化していなかった。`cookieConsentAt` は端末時計という外部要因で弾かれうる初の入力なので、本 PR で「認証 → バリデーション → レート制限」に直す。

**この並べ替えで落ちる既存テストは無い**（`route.test.ts` の PUT 系はすべて valid な body か validation-only）。回帰を検知できないので、**新規に「バリデーションエラー時に `checkRateLimit` が呼ばれないこと」を追加する**。

#### 時刻は拒否せずクランプする

`cookieConsentAt` が不正でも 400 で PUT 全体を拒否しない。拒否すると「端末時計が進んでいる人は同意状態が永久に保存されず、リトライがレート制限を食い潰す」という詰みが発生する。

| 入力                                     | 扱い                                                      |
| ---------------------------------------- | --------------------------------------------------------- |
| 未来（時計ずれを見込んで +5 分まで許容） | サーバー受信時刻へクランプ                                |
| `COOKIE_CONSENT_MIN_AT` より前           | サーバー受信時刻へクランプ                                |
| 非 ISO / パース不能                      | `null` として保存                                         |
| `state` が `unset`                       | **`at` を `null` へ正規化**（§4.7 の CHECK 違反を避ける） |

いずれの場合も**同意状態そのものは必ず保存する**。`COOKIE_CONSENT_MIN_AT` は `src/constants/user.ts` に ISO 文字列で定義する（値はマイグレーション日）。

#### 状態が変わらない PUT では日時を更新しない

現行 PUT は現在値を読まない blind upsert なので、「状態が変わったか」を判定できない。**`cookieConsent` を含む PUT では、upsert の前に `select('cookie_consent').eq('user_id', ...).single()` で現在値を読み、同値なら `updateData` から `cookie_consent_at` を落とす。** PostgREST の upsert はペイロードに無い列を更新しないので既存値が保たれる。

#### スキーマ

`cookieConsent` と `cookieConsentAt` は**セットでのみ受け付ける**。片方だけ送れるようにすると、状態を変えずに同意日時だけ任意の過去値へ書き換えられる。`updateSettingsSchema` に `superRefine` を足して片方だけの送信を 400 にする（`src/schema/awardSync.ts:34` に前例）。`cookieConsentVersion` は**クライアントから受け付けない**（§4.6）。

zod は v4 なので `z.string().datetime()` ではなく **`z.iso.datetime()`**。`null` を送る経路があるため `.nullable().optional()` とし、route 側は `!== undefined` で判定する。

`src/lib/api/user/user.ts` の `updateSettings(settings: Partial<UserSettings>)` は `Partial` のままだと片方だけ渡すコードが型を通って実行時 400 になる。**専用の引数型**を用意してペアを型で強制する。

`DEFAULT_SETTINGS`（`route.ts:33-37`）にも 3 フィールドを追加する。GET は `streaming_notice_scope` と同じ形で `?? 'unset'` / `?? null` のフォールバックを置く。

## 5. GA4 と Consent Mode v2

### 5.1 測定 ID の取得と検証

`process.env.NEXT_PUBLIC_GA_ID?.trim()` が `/^G-[A-Z0-9]{6,20}$/` に一致するときだけ有効。

- 環境変数は**参照する関数の中で読む**。モジュールトップレベルで定数化すると、テストから `process.env` を差し替えるのに `jest.resetModules()` が必要になる（`auth.ts:304,305` などが関数内参照の例。同ファイル `:42` はトップレベルなので前例にしない）
- `.trim()` は、Vercel の環境変数に貼り付けた際の前後空白で不一致になる事故を防ぐため
- 引用符・バックスラッシュを通さないので、インライン補間（§5.2）の防御としても機能する
- Google の「手動インストール」が出す `GT-` 形式は意図的に弾く
- 不一致のときは dev のみ `console.warn` で理由を出す

### 5.2 `consent default` を gtag.js より前に積む

Consent Mode は `default` が gtag.js の読み込みより前に `dataLayer` へ積まれていることが前提。`layout.tsx` の `<head>` にインラインスクリプトを 1 本追加する。**GA ID が有効なときだけ出力する。**

**`window.gtag` をグローバルに確定させることが必須。** IIFE で包んで `function gtag(){}` と書くと関数スコープに閉じ、`window.gtag` が未定義になって §5.6 の `consent update` が丸ごと不発になる。

**版も読む。** 版が現行でなければ `granted` にしない。これをしないと、版を上げた直後の再訪問で React の effect が補正するまでの間に `_ga` Cookie が書かれる。

```js
// layout.tsx <head>（キーは STORAGE_KEYS と、版は COOKIE_CONSENT_VERSION と同期すること）
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

localStorage をここで読むことで、再訪問した同意済み利用者に「denied で始めて update する」往復が起きない。Google の `wait_for_update` も不要になる。

このスクリプトは既存のテーマ初期化と同じ性質（SSR で静的に埋め込むインラインスクリプト、DOM 注入 sink ではない）なので Trusted Types の対象外。

**この head スクリプトは `owner` を見ない。** 認証状態は Cookie 側にあり同期読みできないため。ログアウト時に owner 付きレコードを消す（§4.3）ことで、未認証の第三者に他人の同意が適用される経路を断つ。

### 5.3 `gtag` は Arguments オブジェクトを push する

**`src/utils/analytics.ts` は自前で `dataLayer.push` してはならない。必ず `window.gtag(...)` を呼ぶ。**

gtag.js は dataLayer の要素が **Arguments オブジェクト**のときだけコマンドとして処理し、Array は無視する。TypeScript で自然に書くと `(...args: unknown[]) => window.dataLayer.push(args)` となり、これは Array を積む。症状は「`default` は効くのに `update` だけ効かない」という最も切り分けにくい形で出る。

型は `src/types/gtag.d.ts` に置く（`src/types/next-auth.d.ts` が `.d.ts` の前例。`tsconfig.json` の `include` が拾い、`jest.config.js` の `collectCoverageFrom` は `.d.ts` を除外済み）。`dataLayer.push` を直接書けないよう `gtag` の型だけを公開する。

```ts
export {};
declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}
```

§9.1 のテストで「積まれた要素が `Object.prototype.toString.call(...) === '[object Arguments]'` であること」を assert する。

### 5.4 gtag.js の読み込み

`next/script` の `<Script strategy="afterInteractive">` を 2 本。`@next/third-parties` は入れない（公式に experimental）。

- **両方に `id` を付ける。** `node_modules/next/dist/docs/01-app/02-guides/scripts.md:258` が「インラインスクリプトには `id` が必須」と明記。重複防止キーが `id || src` で、インラインは `src` が空のため `id` が無いと再マウント時に `gtag('config')` が二重注入される
- **2 本目は `dataLayer` / `gtag` を再定義しない。** 標準スニペットをそのまま貼って `window.dataLayer = []` と書くと head で積んだ `consent default` ごと消える
- 2 本目の内容は `gtag('js', new Date())` と `gtag('config', '<ID>', { send_page_view: false })` のみ

`consent update` が gtag.js のロード前に呼ばれても問題ない。`gtag()` は `dataLayer.push` するだけで、gtag.js はロード後にキューを順に処理する。

### 5.5 page_view は手動で送る

**GA4 の拡張計測「ブラウザの履歴イベントに基づくページの変更」はオフにする**（#169 申し送り）。§1.4-7 のとおり、拡張計測に任せるとフィルタ操作のたびに page_view が増え、`page_title` も 1 つ前のページのものになる。

`analyticsProvider` で次を行う。

- `gtag('config', id, { send_page_view: false })` で自動送信を止める
- `usePathname()` を依存にした effect で `gtag('event', 'page_view', {...})` を送る。**初回マウントでも送る**（初回スキップのガードを入れない。入れるとランディングページが計上されない）
- `useSearchParams()` は依存に入れない。root layout で使うと静的プリレンダのバイルアウトを招くため。`page_location` は送信時点で `window.location.href` を読む
- `page_title` は `document.title` 確定後に読む
- `consent update` を送ってから page_view を送る（effect の宣言順で担保する）

`usePathname()` は Server Component の子である Client Component で問題なく動く。`cacheComponents` は無効（`next.config.mjs:55-58` の `experimental` は `turbopackFileSystemCacheForDev` のみ）なので Suspense 境界は不要。`src/proxy.ts` は rewrite をしないので hydration mismatch の注意にも該当しない。

dev では `reactStrictMode: true` により effect が 2 回走り page_view が二重に出る。本番ビルドでは起きない。

### 5.6 同意状態の変更を反映する

| 遷移                           | `consent update` | 追加の page_view | 備考                                                           |
| ------------------------------ | ---------------- | ---------------- | -------------------------------------------------------------- |
| `unknown` → `granted`          | 送る             | **送らない**     | 再訪問者のハイドレーション。`pathname` effect が既に送っている |
| `unknown` → `unset` / `denied` | 送る             | 送らない         | 同上                                                           |
| `unset` → `granted`            | 送る             | **送る**         | 同意成立。それまで cookieless だったため                       |
| `unset` → `denied`             | 送る             | 送らない         | 既定値と同じ                                                   |
| `granted` → `denied`           | 送る             | 送らない         | `_ga` 系 Cookie を削除（§5.7）                                 |
| `denied` → `granted`           | 送る             | 送る             |                                                                |

**追加の page_view は「直前の状態が `unset` または `denied` のとき」に限る。** `unknown → granted` を同意成立とみなすと、再訪問者の初回ロードで `pathname` effect の分と合わせて 2 件になる。

`window.gtag` が未定義のとき（GA ID 未設定で head スクリプトが出ていない）は `consent update` をスキップし、Cookie 削除のみ行う（§7.6 の「GA ID 未設定でも撤回できる」を成立させるため）。

`ga-disable-<測定ID>` は使わない。`analytics_storage: 'denied'` が役割を果たす。

### 5.7 GA Cookie の削除

`location.hostname` と `.<hostname>` の 2 通りでは消えないケースがある。

- GA の `cookie_domain` は既定 `'auto'` で **eTLD+1（登録可能ドメイン）**に Cookie を置く。`www.example.com` で配信すると Cookie は `.example.com` にあり、`www.example.com` への削除では消えない
- localhost では `cookie_domain` が `'none'` になり **domain 属性なしの host-only Cookie** になる

したがって、

1. `location.hostname` を `.` で分割し、最も具体的なものから全サフィックスを列挙する
2. 各サフィックスについて `domain=<d>` / `domain=.<d>` / **domain 属性なし** の 3 通りで `path=/; Max-Age=0` を書く
3. 対象は `document.cookie` 中の `_ga` で始まる名前すべて
4. 書き込み後に `document.cookie` を読み直し、残存がないことを確認する

Cookie 名は `_ga` と `_ga_<コンテナID>`（測定 ID から `G-` を除いた部分）。

## 6. CSP の変更

`cspDirectives.mjs` の `getCspDirectives()` に追加する。Consent Mode では同意の有無によらず gtag.js を読み込むため常時必要。

| ディレクティブ | 追加するオリジン                                                                           |
| -------------- | ------------------------------------------------------------------------------------------ |
| `script-src`   | `https://www.googletagmanager.com`                                                         |
| `connect-src`  | `https://www.googletagmanager.com` `https://*.google-analytics.com` `https://*.google.com` |
| `img-src`      | `https://www.googletagmanager.com` `https://*.google-analytics.com`                        |

[Google 公式 CSP ガイド](https://developers.google.com/tag-platform/security/guides/csp) の GA4（広告機能なし）構成に準拠。公式は `script-src-elem` に記載しているが、本リポジトリは `script-src-elem` を定義していないため `script-src` への追加で足りる。

**`img-src` に `https://*.google.com` は入れない。** 公式の広告なし構成に含まれておらず、`accounts.google.com` 等を含む広いワイルドカードを不要に開けることになる。

**追加位置は各ディレクティブの末尾。** `script-src` では `'unsafe-eval'` より前に置く（`'self' 'unsafe-inline' https://www.googletagmanager.com 'unsafe-eval'`）。`csp.test.ts` は結合文字列への部分一致なので、先頭や中間に挿入すると既存 assert が落ちる。

`https://*.analytics.google.com` は公式の列挙に無いため追加しない。違反が出てから足す方針だが、**本番が 404 で封鎖されている間は違反レポートが集まらない**（#169 へ申し送り）。

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

項目 5 は、委託であっても外国にある第三者への提供には個人情報保護法 28 条が適用される（27 条 5 項の委託の例外は 28 条に及ばない）ため。該当しうるのは Resend・OpenAI・Vercel・Google(GA4)、および Supabase（**プロジェクトのリージョンを確認し、東京なら対象外と整理する**）。個人開発の規模では各社の DPA を根拠に「移転先国は米国等で、規則で定める基準に適合する体制を整備した事業者を選定しています。詳細は請求に応じて情報提供します」で足りる。

項目 9・10 は法 32 条 1 項の公表事項。氏名・住所は「請求に応じて遅滞なく回答します」＋連絡先の明示で足り、自宅住所の掲載は不要。**公開用の連絡先メールアドレスを決める必要がある。**

### 7.3 アカウント削除機能は存在しない

API を全数確認した結果、**利用者も管理者もアカウントを削除できない**（`/api/user/profile` は PUT のみ。DELETE があるのは favorites / watchlist / dismissed-movies のみ）。項目 8 に「アカウント削除機能は未提供です。削除のご請求は窓口で受け付け、手作業で対応します」と**正直に書く**。実装は別 Issue。

`rate_limits.identifier` には `メールアドレス|IPアドレス` の平文が入り、`vercel.json` の cron 8 本に削除処理が無いため事実上無期限で残る。保持期間を決めて項目 8 に書き、定期削除は別 Issue。

### 7.4 Consent Mode の挙動を正確に書く

- 同意の有無にかかわらず、アクセス解析タグ自体は読み込まれる
- **同意しない場合、`_ga` などの識別用 Cookie は作成されないが、IP アドレス・ブラウザの種類・閲覧した URL などは Google へ送信される**
- 同意した場合に限り `_ga` / `_ga_<コンテナID>` Cookie を作成し、同一ブラウザからの再訪問を区別する

「個人を識別しない形の情報のみが送信される」とは書かない。IP アドレスは GDPR では個人データ、日本法でも少なくとも個人関連情報であり不正確。

### 7.5 Cookie とローカルストレージの列挙

- Cookie: NextAuth のセッショントークン・CSRF トークン・コールバック URL、`_ga` / `_ga_<コンテナID>`（同意時のみ）
- localStorage: `movie-app:theme`、`movie-app:movie-filters`、`movie-app:cookie-consent`（＋時刻・所有者・版）
- sessionStorage: 送信済みレコメンドイベント（`useRecommendationEvents.ts:71`）、原題提案（`storedSuggestion.ts:98`）

`STORAGE_KEYS.LANGUAGE` と `RECENT_SEARCHES` は定義のみで使用箇所がゼロなので書かない。未使用定数の削除は別 Issue。

### 7.6 撤回UI の表示条件

| 条件                                    | バナー（同意取得） | トグル（撤回） |
| --------------------------------------- | ------------------ | -------------- |
| GA ID 有効 / 状態 `unset`               | **表示**           | 非表示         |
| GA ID 有効 / 状態 `granted` or `denied` | 非表示             | **表示**       |
| GA ID 無効 / 状態 `unset`               | 非表示             | 非表示         |
| GA ID 無効 / 状態 `granted` or `denied` | 非表示             | **表示**       |

最後の行が要点。運用側が GA を止めたときに、同意済みの人の撤回手段だけが消えるのを防ぐ。このとき `window.gtag` は存在しないので、撤回操作は Cookie 削除と localStorage の更新のみを行う（§5.6）。

`settingsPage.tsx` と `privacyPage` は、トグルが非表示になる条件では **`<section>` ごと描画しない**（見出しだけの空セクションを作らない）。

**Skeleton は出さない。** 第 4 版は「`unknown` / 同期未完了の間は `Skeleton`」としていたが、§4.1 のとおりクライアント遷移でマウントされるトグルは `unknown` にならず、同期状態は `analyticsProvider` にしかないためトグルから知る手段が無い。トグルは localStorage の値だけで即描画する。

### 7.7 ダークパターンの回避

- 2 つの選択肢は**同等の視覚的重み**にする（色・サイズ・コントラストで「同意する」を目立たせない）
- バナーに閉じる `✕` を置かない。置くなら拒否と同値にする
- 同意を既定選択にしない。未決定は「拒否」でも「同意」でもないため、`RadioGroup` で 2 択にすると `aria-checked="true"` が利用者のしていない選択を報告することになる。**`role="switch"`（未決定 = off）にするか、`RadioGroup` のままなら未選択であることを可視テキストで示す**

## 8. 配置と導線

### 8.1 バナーの配置（flex ラッパー方式）

現状の CSS では `position: fixed` もフロー配置も成立しない（§1.4-3）。body 直下に flex ラッパーを導入して解決する。

| 対象                                             | 変更                                                                                               |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `src/app/layout.tsx` + 新規 `layout.module.scss` | `{children}` とバナーを包む `display: flex; flex-direction: column; min-height: 100dvh` のラッパー |
| `appLayout.module.scss` の `.c_app_layout`       | `height: 100vh` → `flex: 1; min-height: 0`                                                         |
| バナー                                           | `flex-shrink: 0`                                                                                   |
| `auth/layout.module.scss` の `.l_auth`           | `min-height: 100vh` → `flex: 1`                                                                    |
| `not-found.tsx:11` / `error.tsx:10`              | インライン `minHeight: '100vh'` を解消                                                             |

ラッパーが高さを持つので `AppLayout` 単独使用時の見た目は変わらない。バナーは常にビューポート下端に収まり、フッターを覆わない。

**z-index トークンは追加しない。** 第 4 版は `--z-index-banner: 1035` を足すとしていたが、`position: fixed` をやめた以上 static 要素に z-index は効かない。代わりに `--cookie-banner-height` を使う。

**トーストとの重なり**: バナーが `ResizeObserver` で自身の高さを `document.documentElement.style.setProperty('--cookie-banner-height', ...)` に書き、`toast.module.scss` の `.c_toast__viewport` を `bottom: var(--cookie-banner-height, 0px)` にする。バナー高さは文量と SP 幅で変わるため固定値では合わない。

### 8.2 バナーのアクセシビリティ

- `<section role="region" aria-label="Cookie の利用について">`。文言は `ARIA_LABELS` に追加
- **DOM 上は `{children}` の後**に置く。`appLayout.tsx:85-90` のスキップリンクは「DOM 上の最初のフォーカス可能要素」であることを前提にしており、`e2e/a11y/keyboard.spec.ts:30-32` が 1 回目の Tab でスキップリンクにフォーカスすることを assert している
- **スキップリンクも自動フォーカス移動も設けない。** バナーは操作を強制せず、無視しても `denied` のままなので到達性の要求は緩い。キーボード利用者はランドマークナビゲーションか Tab 順の末尾で到達する。第 4 版の「バナー先頭にスキップリンクを置く」は、DOM 末尾のバナー内に置いたリンクがバナーへの到達を助けないため論理が成立していなかった
- 初回描画のため `aria-live` は不適
- アニメーションは付けない（`.claude/rules/scss-styling.md`）

### 8.3 ポリシーへの導線

- `AppLayout` から `Footer` へ `links={[{ label: 'プライバシーポリシー', href: ROUTES.PRIVACY }]}` を渡す
- `footer.module.scss` の `&__nav` を `display: flex` にし、**空になる `@include lg { display: flex }` ブロックごと削除**、コメントも更新する
- `footer.tsx` の `<nav>` に `ARIA_LABELS.FOOTER_NAV` を付ける。本リポジトリの他の nav はすべて名前付きで、名前の無い nav を全ページに増やすと axe の `landmark-unique`（best-practice タグも有効）に対して脆くなる
- `&__custom` も `display: none` だが children が渡されていないため**今回は触らない**
- **`src/app/auth/layout.tsx` の `<main>` の内側、`{children}` の後**に `/privacy` リンクを置く。`<main>` の外に出すとどのランドマークにも属さないコンテンツになる
- 同意バナーからもポリシーページへリンクする

## 9. テスト計画

### 9.1 新規の単体テスト

| ファイル                                              | 観点                                                                                                                                                                                                                                                |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/utils/cookieConsent.test.ts`                     | 保存と読み出し / 書き込み順（所有者→版→時刻→状態）/ 途中の `setItem` が throw したときの観測結果 / 未知の値は `unset` / 時刻や版が欠けた場合 / SSR 安全 / イベント発火                                                                              |
| `src/utils/resolveConsentMerge.test.ts`               | **§4.4 の分岐表 11 ケースを全て**。純関数なので副作用の準備が不要                                                                                                                                                                                   |
| `src/utils/analytics.test.ts`                         | GA ID の検証（未設定・空文字・前後空白・不正形式・`GT-`）/ **push された要素が Arguments である** / `consent update` の内容 / `window.gtag` 未定義時のスキップ / `_ga` Cookie 削除（サブドメイン・localhost・残存確認）                             |
| `src/hooks/useCookieConsent.test.ts`                  | 初期状態 / `grant()` / `deny()` / カスタムイベントと `storage` での同期 / 同期ロジックを持たないこと                                                                                                                                                |
| `src/components/providers/analyticsProvider.test.tsx` | `<Script>` 2 本に `id` がある / `send_page_view: false` / `usePathname` 変化と初回マウントで page_view / クエリ変更では送らない / §5.6 の遷移表 6 行 / effect A が 1 回・effect B が毎回 / CAS で破棄 / 同期失敗時にトースト / 未認証では同期しない |
| `cookieConsentBanner.test.tsx`                        | 4 状態の表示可否 / GA ID 無効時に出ない / 同意・拒否の反映 / ポリシーリンク / ランドマークと `aria-label` / キーボード操作 / `✕` が無いこと                                                                                                         |
| `cookieConsentToggle.test.tsx`                        | §7.6 の表 4 行 / 未決定時に「同意する」が選択済みに見えないこと / GA ID 無効時は Cookie 削除のみ                                                                                                                                                    |
| `privacyPage.test.tsx`                                | `h1` が 1 本 / 11 項目の見出し / 2 表と送信先での利用目的 / Consent Mode の 3 点（§7.4）/ 撤回UIの存在                                                                                                                                              |
| `src/app/privacy/layout.test.tsx`                     | `AppLayout` を適用していること（`src/app/auth/layout.test.tsx` に前例）                                                                                                                                                                             |
| `src/app/layout.test.tsx`                             | **`renderToStaticMarkup` の文字列に対して** インラインスクリプトが `STORAGE_KEYS.COOKIE_CONSENT` の値を含むこと / GA ID 無効時に出力しないこと / 版が現行でないとき `granted` を出さないこと                                                        |

#### `next/script` のモック

このリポジトリは `next/script` を一度も使っておらず（§1.4-12）前例が無い。jsdom では `afterInteractive` が実際に `document.body.appendChild` してインラインスクリプトを実行してしまうため、必ずモックする。

```tsx
jest.mock('next/script', () => ({
  __esModule: true,
  default: ({
    id,
    src,
    children,
  }: {
    id?: string;
    src?: string;
    children?: string;
  }) => (
    <div data-testid='next-script' data-id={id} data-src={src}>
      {children}
    </div>
  ),
}));
```

これで「2 本に `id` がある」「`send_page_view: false` が含まれる」を DOM から検証できる。`consent` コマンドの検証は `window.dataLayer` を直接読む。

### 9.2 既存テストの更新

| ファイル                                  | 内容                                                                                                                                                                                                                    |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/security/cspDirectives.test.ts`  | `:20` `:28` の `toBe()` 完全一致が落ちる。`img-src`（`:47-49`）/ `connect-src`（`:51`）の配列も更新                                                                                                                     |
| `src/lib/security/csp.test.ts`            | 部分一致のため追記だけでは落ちない。GA オリジンを含む assert を**能動的に追加**する                                                                                                                                     |
| `src/schema/user.test.ts`                 | 3 フィールドの受理 / ペア必須（`superRefine`）/ `cookieConsentVersion` を受け付けないこと                                                                                                                               |
| `src/app/api/user/settings/route.test.ts` | **`toEqual({...})` 完全一致 3 箇所（`:75` `:99` `:151`）の期待値更新**。GET/PUT / 時刻のクランプ 4 パターン / 状態が同じなら `at` を更新しない / **バリデーションエラー時に `checkRateLimit` が呼ばれないこと（新規）** |
| `src/lib/api/user/user.test.ts`           | **`UserSettings` 型リテラル（`:55`）の追従**（`tsc --noEmit` で落ちる。jest は型検査しないので気づけない）                                                                                                              |
| `footer.test.tsx`                         | `<nav>` の `aria-label`（`links` のリンク描画テストは `:20-31` に既存）                                                                                                                                                 |
| `settingsPage.test.tsx`                   | Cookie セクション / GA ID 無効かつ `unset` のとき見出しごと出ないこと                                                                                                                                                   |

### 9.3 E2E

**「既存に影響しない」は誤りだった。** GA 連動部分は GA ID 未設定で描画されないが、**§8.1 のレイアウト変更と §8.3 のフッター変更は GA ID と無関係に全ページへ入る**。

| 対象                                  | 扱い                                                      |
| ------------------------------------- | --------------------------------------------------------- |
| `e2e/a11y/publicPages.spec.ts`        | 公開 10 ページ × light/dark の axe。**再実行して確認**    |
| `e2e/mobile/mobileResponsive.spec.ts` | 375px で `scrollWidth <= clientWidth`。**再実行して確認** |
| `e2e/a11y/keyboard.spec.ts`           | Tab 順に要素が増える。**再実行して確認**                  |
| `/privacy`                            | `PUBLIC_PAGES` に追加して**本 PR に含める**               |
| 同意バナー・撤回フロー                | GA ID が必要なため別 Issue                                |

既存 E2E は **49 ファイル / 205 テスト**。

### 9.4 カバレッジとビジュアル証跡

- `jest.config.js:52-59` の閾値（全指標 80%）を維持する
- 全ページにバナーとレイアウト変更が入るため、`.claude/rules/visual-evidence.md` に従い **SP フッターとバナーの Before/After、同意〜撤回の動画を PR に添付する**。SP 幅での重なりは jsdom で検証できないためここで担保する

## 10. 完了条件

### GA4

- [ ] GA ID 無効時は gtag.js も `consent default` もバナーも出力しない
- [ ] `window.gtag` がグローバルに定義され、push された要素が Arguments である
- [ ] `consent default` が gtag.js より前に積まれ、版が古いときは `granted` を出さない
- [ ] 同意直後のページが page_view として計上され、**再訪問者で二重計上されない**
- [ ] フィルタ・ソート・ページング操作で page_view が増えない
- [ ] `page_title` が現在のページのものになる
- [ ] 撤回で `_ga` 系 Cookie が削除される（`document.cookie` で残存ゼロを確認）
- [ ] GA ID 無効でも保存済みの同意があれば撤回できる

### 同意と同期

- [ ] `resolveConsentMerge` が §4.4 の分岐表 11 ケースすべてで期待どおり
- [ ] バナーで同意したら**そのページロード中に** PUT される（effect B）
- [ ] 初回マージ（GET）は 1 ページロードで 1 回。タブ切替で再実行されない
- [ ] 同期失敗後に再試行される（ガードが立たない）
- [ ] 同期応答の到着中にバナーを操作しても選択が覆らない
- [ ] 他人の同意レコードが現在のユーザーのサーバー記録に書かれない
- [ ] 版を上げるとバナーが再表示され、**サーバーの旧記録は消えない**
- [ ] 版を上げた後に片方の端末で再同意すると、もう一方でもバナーが出なくなる
- [ ] 端末時計がずれていても同意状態は保存される（時刻はクランプ）
- [ ] サーバー保存が失敗しても端末側の決定が巻き戻らず、エラートーストが出る
- [ ] ログアウトで owner 付きレコードが消え、再ログインでサーバーから復活する

### 実装品質

- [ ] CSP に GA オリジンが**末尾に**追加され、`img-src` に `*.google.com` が入っていない
- [ ] `cspDirectives.test.ts` の期待値更新と `csp.test.ts` への assert 追加
- [ ] `route.test.ts` / `user.test.ts` / `schema/user.test.ts` の追従
- [ ] バリデーションエラー時に `checkRateLimit` が呼ばれないテストがある
- [ ] マイグレーションを適用し、型を再生成して prettier をかけた
- [ ] カバレッジ 80% 以上を維持
- [ ] `npm run lint` / `npx tsc --noEmit` / `npm run prettier:check` が通る
- [ ] 既存 E2E 49 ファイルが通る（特に `e2e/a11y/` と `e2e/mobile/`）
- [ ] `/privacy` が `PUBLIC_PAGES` に追加され axe を通る

### レイアウト

- [ ] バナーがフッターを覆わず、初期表示で見える
- [ ] `/auth/*`・`not-found`・`error` でもバナーが画面内に収まる
- [ ] トーストとバナーが重ならない
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
| #649       | Consent Mode では gtag.js を常時読み込むため Trusted Types 違反も常時発生する。enforce 検証時に **gtag.js が実際に使うポリシー名を実測し、必要なら `TRUSTED_TYPES_POLICIES` へ追加する**。※ 第 4 版が書いた「`trustedTypes.ts:41-49` が throw する」は誤り。同関数はアプリ自身のヘルパーで gtag.js は通らない。拒否するのはブラウザ                                                                                              |
| 新規 Issue | 同意バナー・撤回フロー・マージ規則の E2E                                                                                                                                                                                                                                                                                                                                                                                         |
| 新規 Issue | アカウント削除機能（§7.3）                                                                                                                                                                                                                                                                                                                                                                                                       |
| 新規 Issue | `rate_limits` の保持期間と定期削除（§7.3）                                                                                                                                                                                                                                                                                                                                                                                       |
| 新規 Issue | CSP `connect-src https://*.supabase.co` の要否棚卸し                                                                                                                                                                                                                                                                                                                                                                             |
| 新規 Issue | 未使用定数の削除（`STORAGE_KEYS.LANGUAGE` / `RECENT_SEARCHES` / `placehold.co`）                                                                                                                                                                                                                                                                                                                                                 |
| 新規 Issue | `GET /api/user/settings` にレート制限が無い                                                                                                                                                                                                                                                                                                                                                                                      |
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

**`webServer.env` の限界を正しく理解すること。** これが効くのは「Playwright が dev サーバーを新規起動する」ローカルケースだけである。

- `reuseExistingServer: !isCI` のため、**起動済みの dev サーバーがあれば `webServer.env` は一切適用されない**
- CI は `npm start` で、`NEXT_PUBLIC_*` は `npm run build` の時点で静的置換済み。`webServer.env` はバンドルに影響しない

したがって **CI で GA が入らない根拠は `e2e.yml` の build step に渡していないことだけ**であり、ローカルでの事故防止は §10 の「本番ビルド確認後はサーバーを落としてから E2E を回す」という運用で担保する。
