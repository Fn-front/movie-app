# 画面修正 PR のビジュアル証跡ルール

## 【必須】画面修正時の添付

見た目に変化がある UI/画面の修正は、PR に以下を必ず添付する:

- **修正前（Before）/ 修正後（After）のスクリーンショット**
- **動作保証の動画**（主要操作の一連の流れ）

対象外: ロジックのみ・非 UI（API/型/テスト等）の変更。

## 取得方法（agent-browser）

ヘルパースクリプト `scripts/pr-visual.mjs` を使う（内部で agent-browser を呼ぶ）。dev サーバー起動が前提。

```bash
# 1) 修正前: main で dev 起動 → Before を撮影
node scripts/pr-visual.mjs shot http://localhost:3000/<path> docs/tmp/<feature>-before.png

# 2) 修正後: 修正ブランチで dev 起動 → After 撮影 + 動作動画
node scripts/pr-visual.mjs shot   http://localhost:3000/<path> docs/tmp/<feature>-after.png
node scripts/pr-visual.mjs record http://localhost:3000/<path> docs/tmp/<feature>-demo.webm 10
```

## アップロード・埋め込み（GitHub Release Assets 方式）

画像/動画を **prerelease の Release Assets** としてアップし、出力された markdown を PR 本文に貼る。

```bash
# Before/After 比較表 + 動画をまとめてアップし markdown 出力（tag は一意に。PR 番号やブランチ名など）
node scripts/pr-visual.mjs beforeafter pr-visual-<feature> \
  docs/tmp/<feature>-before.png docs/tmp/<feature>-after.png docs/tmp/<feature>-demo.webm

# マージ後の後片付け（prerelease とタグを削除）
node scripts/pr-visual.mjs cleanup pr-visual-<feature>
```

- **既存の `gh auth`（PAT）だけで動作**し、session cookie 不要・CI でも動く。画像は inline 表示、動画はリンクで開ける。
- `--prerelease` で作成するためリリース一覧を汚さない。**マージ後は `cleanup` で削除**する。
- **リポ本体に画像/動画をコミットしない**（Release Assets に置くため履歴が肥大化しない）。

### なぜ gh-image を使わないか

GitHub の画像添付エンドポイント（user-attachments）は**ブラウザの `user_session` cookie 専用**で、`gh` の PAT/OAuth では利用できない（公式に "not planned"）。gh-image はブラウザセッションを再現する仕組みで CLI 完結・CI 化ができないため、本プロジェクトでは Release Assets 方式を採用する。

## 既存運用との棲み分け

- **E2E シナリオ結果**のスクショは従来どおり `docs/e2e-screenshots/` に**コミット**し、コミット SHA 固定の raw URL permalink で PR に埋め込む（`.claude/CLAUDE.md` 参照）。安定した回帰用証跡はリポに残す。
- **画面修正の Before/After ＋デモ動画**は **Release Assets 方式**を使い、リポにコミットしない（重い画像/動画でリポを肥大化させないため）。
- 一時ファイルは `docs/tmp/`（`.gitignore` 対象）に置き、アップロード後は残さない。
