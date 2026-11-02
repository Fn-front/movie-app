# GA4 導入と Cookie 同意UI（オプトイン）設計

- 日付: 2026-11-03
- 対象 Issue: #892（GA4 導入）、#893（プライバシー方針の判断）
- 関連 Issue: #169（デプロイ）、#649（Trusted Types enforce 昇格）

## 1. 背景と決定事項

### 1.1 #893 の決定

#893 で提示された A / B / C のうち **B（オプトインの同意UI を導入する）** を採用する。

これに伴い #892 の実装前提が変わる。GA4 の読み込みは「`NEXT_PUBLIC_GA_ID` が設定されていること」だけでなく「利用者が明示的に同意していること」を条件とする。

### 1.2 ブレインストーミングで確定した仕様

| 論点                     | 決定                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------- |
| 同意前の gtag の振る舞い | gtag.js を一切読み込まない（Consent Mode v2 は採らない）                              |
| 同意UIの表示条件         | `NEXT_PUBLIC_GA_ID` が設定されているときのみ                                          |
| E2E の扱い               | 既存 49 本には影響させない。同意UIは単体テストで担保し、E2E 未カバーは別 Issue で起票 |
| 撤回導線                 | 設定画面（`/settings`）と プライバシーポリシーページ（`/privacy`）の両方              |
| プライバシーポリシー     | 本 PR に含める                                                                        |
| PR 分割                  | 1 ブランチ 1 PR で GA4・同意UI・ポリシーをまとめて入れる                              |
| 本番での実測確認         | ローカル本番ビルドで行い、Vercel 実機確認は #169 へ申し送る                           |

### 1.3 調査で判明した前提（設計の根拠）

1. **E2E にバナーは出ない。** `NEXT_PUBLIC_GA_ID` はビルド時インライン化される。ローカル E2E は `npm run dev`、CI は `npm start`（`playwright.config.ts:135`）で、どちらも同変数を設定しない。表示条件を GA ID に紐づける限り、既存 49 本の spec は影響を受けない。#893 が懸念した「全シナリオにバナー操作が増える」は発生しない。
2. **認証ページは `AppLayout` を使わない。** `src/app/auth/layout.tsx` は独自の `<main>` のみ。バナーを全ページに出すには **ルートの `src/app/layout.tsx`** に置く必要がある。
3. **フッターのリンクは現状 0 件。** `Footer` は `links` prop を持つが、`appLayout.tsx:127` は `<Footer />` を引数なしで描画している。さらに `footer.module.scss` の `&__nav` は `lg` 未満で `display: none` のため、SP ではナビ自体が出ない。
4. **本番 Vercel は cron 以外すべて 404。** `src/proxy.ts:41` が `VERCEL_ENV === 'production'` のとき cron 以外を 404 で隠している。サイト公開（#169）まで本番 URL での実測はできない。
5. **外部送信は GA4 以前から存在する。** OpenAI（お気に入りのタイトルと評価・興味なし・ウォッチリストをプロンプトに含める / `generateRecommendations.ts:240-270`）、YouTube 埋め込み（CSP `frame-src`）、`image.tmdb.org`（CSP `img-src`、ブラウザが直接取得するため IP が渡る）、Google / GitHub OAuth（`auth.ts:303,312`）、Resend（`sendOtpEmail.ts:5`）。プライバシーポリシーは GA4 のためだけでなく、この既存の未整備を解消するものになる。

## 2. スコープ

### 2.1 含むもの

- Cookie 同意状態の管理（保存・購読・変更）
- 同意前は gtag.js を読み込まない GA4 ローダー
- 未決定時のみ表示する同意バナー
- 同意の撤回UI（設定画面 / プライバシーポリシーページで共有）
- プライバシーポリシーページと、そこへの導線
- CSP への GA オリジン追加
- 上記すべての単体テスト

### 2.2 含まないもの

- カスタムイベント計測（お気に入り追加・検索など）。計測したい指標が固まってから別 Issue で扱う
- 同意状態のサーバー保存。端末ごとの localStorage に限定する
- 同意UIの E2E。別 Issue で起票する
- Consent Mode v2
- Google Tag Manager

## 3. アーキテクチャ

同意状態がすべての起点になる。既存の `src/utils/theme.ts` + `src/hooks/useTheme.ts`（`useSyncExternalStore` による外部ストア購読）とまったく同じ形に揃える。

| #   | ファイル                                                    | 区分 | 役割                                                                  |
| --- | ----------------------------------------------------------- | ---- | --------------------------------------------------------------------- |
| 1   | `src/utils/cookieConsent.ts`                                | 新規 | 同意状態の読み書きとイベント発火。SSR 安全                            |
| 2   | `src/utils/analytics.ts`                                    | 新規 | GA ID の取得と形式検証、`ga-disable` フラグ、GA Cookie の削除         |
| 3   | `src/hooks/useCookieConsent.ts`                             | 新規 | `useSyncExternalStore` で 1 を購読し、`grant()` / `deny()` を提供     |
| 4   | `src/components/providers/analyticsProvider.tsx`            | 新規 | `granted` のときだけ gtag.js を描画。状態に応じて `ga-disable` を更新 |
| 5   | `src/features/cookieConsent/component/cookieConsentBanner/` | 新規 | 未決定時のみ表示する下部バナー                                        |
| 6   | `src/features/cookieConsent/component/cookieConsentToggle/` | 新規 | 同意する / しない の切り替えUI。設定画面とポリシーページで共有        |
| 7   | `src/features/privacy/privacyPage/`                         | 新規 | ポリシー本文                                                          |
| 8   | `src/app/privacy/page.tsx` / `layout.tsx`                   | 新規 | `/privacy` ルート（`AppLayout` を適用）                               |
| 9   | `src/constants/common.ts`                                   | 変更 | `STORAGE_KEYS.COOKIE_CONSENT` と `ROUTES.PRIVACY` を追加              |
| 10  | `src/lib/security/cspDirectives.mjs`                        | 変更 | GA オリジンを 3 ディレクティブへ追加                                  |
| 11  | `src/app/layout.tsx`                                        | 変更 | 4 と 5 を描画                                                         |
| 12  | `src/components/layout/appLayout/appLayout.tsx`             | 変更 | `Footer` に `links` を渡す                                            |
| 13  | `src/components/layout/footer/footer.module.scss`           | 変更 | `&__nav` を SP でも表示する                                           |
| 14  | `src/features/settings/settingsPage/settingsPage.tsx`       | 変更 | 「Cookie」セクションを追加                                            |

依存の向きは 1 → 3 → {4, 5, 6} の一方向で、循環しない。2 は 4 と 6 からのみ参照される。

## 4. 同意状態の設計

### 4.1 状態

```ts
export type CookieConsentState = 'unknown' | 'unset' | 'granted' | 'denied';
```

| 状態      | 意味                                                   | バナー | gtag.js  |
| --------- | ------------------------------------------------------ | ------ | -------- |
| `unknown` | SSR / ハイドレート前。まだ localStorage を読めていない | 非表示 | 読まない |
| `unset`   | 未決定                                                 | 表示   | 読まない |
| `granted` | 同意済み                                               | 非表示 | 読む     |
| `denied`  | 拒否                                                   | 非表示 | 読まない |

`unknown` を `unset` と分けるのが肝である。`getServerSnapshot()` が `unknown` を返すことで、

- SSR 出力にバナーが含まれないため hydration mismatch が起きない
- 既に同意済みの利用者に「バナーが一瞬出てから消える」チラつきが起きない

### 4.2 永続化と同期

- 保存先: `localStorage['movie-app:cookie-consent']`。値は `granted` / `denied` のみ
- 未知の値・読み取り失敗は `unset` として扱う（壊れた値で同意済み扱いにしない）
- 同一タブ内の同期: カスタムイベント `movie-app:cookie-consent-change`
- 別タブとの同期: `storage` イベント
- サーバー保存はしない。同意は端末ごとに保持する

`useTheme` が `localStorage` 書き込み → `window.dispatchEvent(new Event(THEME_CHANGE_EVENT))` で購読側へ通知している形をそのまま踏襲する。

### 4.3 検討した代替案

**Cookie に保存して Server Component で判定する案。** SSR の時点で同意状態が確定するためチラつきが構造的に起きない。しかし全ページが動的レンダリングになり、`cspDirectives.mjs` 冒頭に明記された「`'unsafe-inline'` を許容して静的プリレンダを維持する」方針に反する。不採用。

## 5. GA4 ローダー

### 5.1 描画条件

`analyticsProvider.tsx` は次をすべて満たすときだけ `<Script>` を描画する。

1. `process.env.NEXT_PUBLIC_GA_ID` が設定されている（空文字は未設定扱い）
2. GA4 測定 ID の形式（`/^G-[A-Z0-9]+$/`）に一致する
3. 同意状態が `granted`

環境変数は `src/lib/auth/auth.ts:42` や `src/lib/api/nowShowing/nowShowing.server.ts:18` と同じく**関数内で直接参照**する。モジュールトップレベルで定数化すると、テストから `process.env` を差し替えるのに `jest.resetModules()` が必要になるため。

形式検証を入れるのは、測定 ID をインライン初期化スクリプトへ文字列補間するためである。自前の環境変数であり利用者入力ではないが、設定ミスや取り違えがそのままスクリプトへ流れ込む経路を塞いでおく。

### 5.2 読み込み方法

`next/script` の `<Script strategy="afterInteractive">` を 2 本（loader と初期化インライン）。`@next/third-parties` は入れない。同パッケージは公式に experimental と明記されており、ページビュー計測の範囲では `next/script` と機能差がないため（#892 の推奨案 A）。

ページビューの自動計測は GA4 の「拡張計測機能 > ブラウザの履歴イベントに基づくページの変更」が担うため、アプリ側にルート変更フックは書かない。

### 5.3 同意状態の遷移と gtag の後始末

`next/script` はアンマウントしても、既に DOM へ挿入された `<script>` を取り除かない。撤回を正しく効かせるため、遷移ごとに次の扱いをする。

| 遷移                 | 契機                      | 挙動                                                                                                      |
| -------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------- |
| `unset` → `granted`  | バナーの「同意する」      | `<Script>` が初めてマウントされ gtag.js を読み込む。リロード不要                                          |
| `unset` → `denied`   | バナーの「同意しない」    | 何も読み込まれていないため何もしない                                                                      |
| `granted` → `denied` | 設定画面 / ポリシーページ | `window['ga-disable-<GA_ID>'] = true` で送信を即時停止し、`_ga` / `_ga_*` Cookie を削除する               |
| `denied` → `granted` | 設定画面 / ポリシーページ | `window['ga-disable-<GA_ID>'] = false` に戻す。gtag.js 未読み込みなら `<Script>` のマウントで読み込まれる |

`ga-disable-<GA_ID>` は GA4 公式のオプトアウト手段である。`analyticsProvider` の effect で `window['ga-disable-<GA_ID>'] = consent !== 'granted'` を常に反映させることで、上表の 4 遷移すべてをページリロードなしに扱える。

Cookie 削除は `_ga` で始まる名前を対象に、`path=/` かつ `location.hostname` と `.<hostname>` の両方へ `Max-Age=0` を書き込む。GA が登録可能ドメインへ Cookie を置くため、どちらか一方だけでは消えない場合がある。

## 6. CSP の変更

`src/lib/security/cspDirectives.mjs` の `getCspDirectives()` に追加する。gtag.js は同意後にしか読み込まれないが、CSP はレスポンス単位の静的ヘッダなので常に許可しておく。

| ディレクティブ | 追加するオリジン                                                                           |
| -------------- | ------------------------------------------------------------------------------------------ |
| `script-src`   | `https://www.googletagmanager.com`                                                         |
| `connect-src`  | `https://www.googletagmanager.com` `https://*.google-analytics.com` `https://*.google.com` |
| `img-src`      | `https://www.googletagmanager.com` `https://*.google-analytics.com` `https://*.google.com` |

[Google 公式 CSP ガイド](https://developers.google.com/tag-platform/security/guides/csp) の GA4 構成（広告機能なし）に準拠する。公式は `script-src-elem` に記載しているが、本リポジトリは `script-src-elem` を定義していないため `script-src` への追加で足りる。

次は意図的に追加しない。

- `https://*.analytics.google.com` — 公式の列挙に含まれない。`/api/csp-report` に違反が出てから追加する
- 広告機能・Google シグナル向けのオリジン群 — 現時点で有効化しない。有効化する場合は `frame-src` にも `https://www.googletagmanager.com` を明示追加すること（本リポジトリの `frame-src` は YouTube のみを明示指定しており `default-src` にフォールバックしない）

## 7. プライバシーポリシーページ

`/privacy` を静的ページとして追加する。`AppLayout` を適用し、ヘッダー・フッターを他ページと揃える。認証は不要（`AUTH_REQUIRED_ROUTES` に加えない）。

### 7.1 構成

1. **取得する情報** — アカウント情報（メールアドレス・ユーザー名・ハッシュ化したパスワード）、ソーシャルログインで取得するプロフィール、二段階認証の共有鍵（暗号化して保管）とリカバリコード、利用データ（お気に入り・ウォッチリスト・興味なしリスト・評価・保存フィルター・各種設定）、技術情報（IP アドレス・セッション Cookie・CSP 違反レポート）、管理操作の監査ログ
2. **利用目的** — 認証とアカウント管理、作品レコメンドの生成、不正利用防止（レート制限）、障害調査、利用状況の把握（同意時のみ）
3. **外部送信先** — 下表
4. **Cookie とローカルストレージ** — セッション Cookie（NextAuth）、`_ga` / `_ga_<測定ID>`（同意時のみ）、localStorage（テーマ・言語・検索履歴・フィルター・Cookie 同意状態）
5. **保存期間と削除** — アカウント削除時の扱い
6. **開示・訂正・削除の請求窓口**
7. **本ポリシーの改定について**

### 7.2 記載する外部送信先

| 送信先                   | 送信される情報                                                         |
| ------------------------ | ---------------------------------------------------------------------- |
| Google（GA4）            | 閲覧ページ・参照元・端末情報・`_ga` Cookie。**同意した場合のみ**       |
| OpenAI                   | お気に入り作品のタイトルと評価、興味なしリスト、ウォッチリストの作品名 |
| YouTube                  | 予告編を再生した際の IP アドレスと Cookie                              |
| TMDb（`image.tmdb.org`） | ポスター画像取得時の IP アドレス                                       |
| Google / GitHub          | ソーシャルログイン利用時の認証情報                                     |
| Resend                   | 確認コード・パスワード再設定メールの宛先メールアドレス                 |
| Supabase / Vercel        | データの保管およびアプリケーションの配信                               |

GA4 以外は既に発生している送信であり、本ページの追加によって初めて公表されることになる。

### 7.3 同意の撤回UI

ページ内に `CookieConsentToggle` を置く。設定画面（`/settings`）は認証必須（`AUTH_REQUIRED_ROUTES`）のため、**未認証の利用者が撤回する唯一の手段**がここになる。オプトインを採る以上、同意した本人が必ず撤回できる必要がある。

`NEXT_PUBLIC_GA_ID` 未設定時は、同意を求める対象が存在しないためトグルを描画しない。

## 8. 導線

- `AppLayout` から `Footer` へ `links={[{ label: 'プライバシーポリシー', href: ROUTES.PRIVACY }]}` を渡す
- `footer.module.scss` の `&__nav` を SP でも表示する。`display: none` を `display: flex` に変え、`@include lg` 内の `display: flex` を削除する（`align-items` と `gap` はそのまま）。リンクは 1 本だけなので SP の幅でも収まる
- 同意バナーからもポリシーページへリンクする

SP でフッターナビが非表示のままだと、バナーが消えた後（＝同意または拒否を選んだ後）にポリシーへ到達する手段が SP から失われるため、フッター側の変更は必須である。

## 9. テスト計画

### 9.1 単体テスト（Jest + React Testing Library）

| ファイル                                              | 観点                                                                                                                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/utils/cookieConsent.test.ts`                     | 保存と読み出し / 未知の値は `unset` / localStorage 例外時のフォールバック / SSR（`window` 未定義）安全 / イベント発火                                                    |
| `src/utils/analytics.test.ts`                         | GA ID 未設定・空文字・不正形式を弾く / 正しい形式を通す / `ga-disable` の設定 / `_ga` Cookie の削除                                                                      |
| `src/hooks/useCookieConsent.test.ts`                  | 初期状態 / `grant()` / `deny()` / カスタムイベントでの同期 / 別タブの `storage` イベントでの同期                                                                         |
| `src/components/providers/analyticsProvider.test.tsx` | GA ID 未設定で何も描画しない / 空文字で描画しない / 不正形式で描画しない / `unset`・`denied` で描画しない / `granted` で `<Script>` 2 本を描画する / `ga-disable` の反映 |
| `cookieConsentBanner.test.tsx`                        | 4 状態それぞれの表示可否 / 「同意する」「同意しない」の反映 / ポリシーへのリンク / キーボード操作 / ARIA 属性                                                            |
| `cookieConsentToggle.test.tsx`                        | 初期選択（未決定時は「同意しない」側）/ 切り替えの反映 / GA ID 未設定時は描画しない                                                                                      |
| `privacyPage.test.tsx`                                | 見出し構造 / 外部送信先 7 件の記載 / 撤回UIの存在                                                                                                                        |
| `footer.test.tsx`                                     | `links` を渡したときのリンク描画（既存テストの拡張）                                                                                                                     |
| `settingsPage.test.tsx`                               | Cookie セクションの追加（既存テストの拡張）                                                                                                                              |

### 9.2 既存テストの更新

- `src/lib/security/cspDirectives.test.ts` — `:20` と `:28` の `toBe()` による完全一致 assert が落ちるため期待値を更新する。`img-src` / `connect-src` の `toContain` も更新する
- `src/lib/security/csp.test.ts` — こちらは部分一致（`toContain`）のため**追記だけでは落ちない**。GA オリジンを含む assert を能動的に追加し、更新漏れを検知できるようにする

### 9.3 カバレッジ

`jest.config.js:52-59` の閾値（Statements / Branches / Functions / Lines すべて 80%）を維持する。

### 9.4 E2E

既存 49 本には影響しない（`NEXT_PUBLIC_GA_ID` 未設定のため同意UIが描画されない）。同意UIと `/privacy` の E2E は本 PR では追加せず、別 Issue として起票する。

## 10. 完了条件

- [ ] 同意前は gtag.js を読み込まない
- [ ] `NEXT_PUBLIC_GA_ID` 未設定時は同意UIも GA も一切描画しない
- [ ] バナーから同意 / 拒否ができる
- [ ] `/settings` と `/privacy` の両方から撤回できる
- [ ] 撤回で `ga-disable` が立ち、`_ga` Cookie が削除される
- [ ] `/privacy` に外部送信先 7 件が記載されている
- [ ] フッターから `/privacy` へ到達できる（PC・SP の両方）
- [ ] CSP に GA オリジンが追加され、`cspDirectives.test.ts` の期待値が更新されている
- [ ] `csp.test.ts` に GA オリジンを含む assert が**追加**されている
- [ ] カバレッジ 80% 以上を維持
- [ ] `npm run lint` / `npx tsc --noEmit` / `npm run prettier:check` が通る
- [ ] 既存 E2E 49 本が通る
- [ ] ローカル本番ビルド（`NEXT_PUBLIC_GA_ID` を付けて `npm run build && npm start`）で、同意後に gtag.js が読み込まれ CSP 違反が出ないことを確認する
- [ ] `.claude/documents/environment-variables.md:425` の `- [ ] **Google Analytics**: 導入する？しない？` を解消する
- [ ] `.claude/documents/roadmap/phase11-deploy.md` に項目を追加する

## 11. 申し送り

| 宛先       | 内容                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| #169       | Vercel 本番（Production スコープのみ）への `NEXT_PUBLIC_GA_ID` 登録と再デプロイ。`NEXT_PUBLIC_*` はビルド時に静的置換されるため、登録だけでは反映されない。GA4 側の「拡張計測機能 > ブラウザの履歴イベントに基づくページの変更」が有効であることの確認。実トラフィックでの `page_view` 計上確認と `/api/csp-report` の監視                                                                                         |
| #649       | gtag.js は script 要素を動的生成して `.src` を代入し、`next/script` のインライン初期化も DOM へ注入する。いずれも Trusted Types enforce 昇格時のブロッカーになる。また Google のタグが独自ポリシー名を `createPolicy` する場合、`TRUSTED_TYPES_POLICIES` に無い名前は `trustedTypes.ts:41-49` で throw する。Report-Only では報告されないため、enforce 昇格の検証は本番ビルドで実際に enforce を有効化して行うこと |
| 新規 Issue | 同意バナー・`/privacy`・撤回フローの E2E                                                                                                                                                                                                                                                                                                                                                                           |
| 新規 Issue | カスタムイベント計測（計測したい指標が固まってから）                                                                                                                                                                                                                                                                                                                                                               |

## 12. 環境変数の扱い

| 設定先                                 | 可否       | 理由                                                                                                                                               |
| -------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel Production                      | 設定する   | 本番のみ計測する                                                                                                                                   |
| Vercel Preview / Development           | 設定しない | 開発データの混入を防ぐ                                                                                                                             |
| `.env.local` / `.env.local.example`    | 追加しない | `playwright.config.ts:10` が `.env.local` を読み、ローカル E2E は `npm run dev` で動く。設定するとローカル E2E 実行中に GA4 へ開発データが混入する |
| `.github/workflows/e2e.yml`            | 追加しない | `NEXT_PUBLIC_*` はビルド時インライン化されるため、build step に渡さないことで CI での読み込みを封じる                                              |
| GitHub Secrets（Actions / Dependabot） | 登録しない | HTML に露出する公開値であり、ワークフローから参照もしない（`.claude/rules/ci-secrets.md`）                                                         |
