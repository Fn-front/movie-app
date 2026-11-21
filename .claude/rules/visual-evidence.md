# PR のビジュアル証跡ルール

## 【必須】画面修正時の添付

見た目に変化がある UI/画面の修正は、PR に以下を必ず添付する:

- **修正前（Before）/ 修正後（After）のスクリーンショット**
- **動作保証の動画**（主要操作の一連の流れ）

対象外: ロジックのみ・非 UI（API/型/テスト等）の変更。

> E2E のシナリオ結果スクショは画面修正でなくても添付する。置き場所は
> 下の「既存運用との棲み分け」を参照。

## 取得方法（agent-browser）

ヘルパースクリプト `scripts/pr-visual.mjs` を使う（内部で agent-browser を呼ぶ）。dev サーバー起動が前提。

```bash
# 1) 修正前: main で dev 起動 → Before を撮影
node scripts/pr-visual.mjs shot http://localhost:3000/<path> docs/tmp/<feature>-before.png

# 2) 修正後: 修正ブランチで dev 起動 → After 撮影 + 動作動画
node scripts/pr-visual.mjs shot   http://localhost:3000/<path> docs/tmp/<feature>-after.png
node scripts/pr-visual.mjs record http://localhost:3000/<path> docs/tmp/<feature>-demo.webm 10
```

## アップロード・埋め込み（gh-image / user-attachments）

`gh-image`（drogers0/gh-image）で GitHub の **user-attachments** にアップし、出力された markdown を PR 本文に貼る。**動画は user-attachments だと `<video>` でインライン再生される**（Release Assets のリンク止まりと違う）。

```bash
# Before/After 比較表 + 動画（インライン再生）をまとめて出力
node scripts/pr-visual.mjs beforeafter \
  docs/tmp/<feature>-before.png docs/tmp/<feature>-after.png docs/tmp/<feature>-demo.webm
```

- 画像は `![](url)`、**動画は生 URL を単独行**で貼る（GitHub が自動で動画プレーヤーに変換）。
- **リポ本体に画像/動画をコミットしない**（user-attachments に置くため履歴が肥大化しない）。アップ後は削除不要（リポを汚さない）。

### 既に撮れている複数枚をまとめて上げる（E2E はこちら）

`beforeafter` は before/after の2枚が必須なので、E2E の結果スクショには使えない。
`upload` を使う。

```bash
node scripts/pr-visual.mjs upload docs/tmp/e2e-screenshots/*.png
```

出力された markdown を PR 本文に貼る。


### 認証（session token）

user-attachments のアップロードは GitHub の **web セッション cookie（`user_session`）** を使う（PAT/OAuth 不可＝ GitHub 仕様）。次のいずれかで用意する:

1. **対応ブラウザ（Chrome/Safari/Firefox/Edge/Brave/Opera）で github.com にログイン済み** → gh-image が cookie から自動取得。`gh image check-token` で `Token is valid` を確認。
2. CI/headless では `.env.local` に `GH_SESSION_TOKEN=<user_session>` を設定（`gh image extract-token` で取得した値）。

- token は一度用意すれば期限切れまで使い回せる（毎回ログイン不要）。
- ⚠️ `user_session` は**アカウント全権限**の cookie。パスワード同様に厳重管理し、リポ・ログに出さない。CI で使うなら**専用 bot アカウント**を推奨。

## 既存運用との棲み分け

- **E2E シナリオ結果**のスクショも、**画面修正の Before/After ＋デモ動画**も、どちらも **gh-image（user-attachments）** を使い、**リポにコミットしない**。
- 一時ファイルは `docs/tmp/`（`.gitignore` 対象）に置き、アップロード後は残さない。E2E の出力先は `docs/tmp/e2e-screenshots/`。

> ⛔ **かつては E2E のスクショだけ `docs/e2e-screenshots/` へコミットしていた**
> （「安定した回帰用証跡はリポに残す」という理由）。#433 で廃止した。
>
> 受賞一覧・検索結果・ウォッチリスト等のスクショには TMDb のポスターと
> タイトルが写っており、public リポジトリへコミットすると **TMDb 利用規約
> Section 1.C（6ヶ月を超えてキャッシュしない）に対して更新もエビクションも
> 効かない**置き場所になる。
>
> 回帰用の証跡は **PR に貼った user-attachments の URL** に移る。
>
> ⚠️ **旧運用と等価ではない。** 旧は `git checkout <sha> -- docs/e2e-screenshots/`
> で手元に取り出して差分が取れたが、新は本文の URL を人が開くだけで、
> 本文を編集すると辿れない。アップロードに `user_session`（アカウント全権限の
> cookie）が要る点も頻度が上がる分だけ重い。**TMDb 規約を優先して受け入れる**
> トレードオフであり、等価な代替ではない。
