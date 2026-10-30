# CI シークレット管理ルール

## 【必須】Dependabot は専用のシークレットストアを使う

GitHub には**シークレットの保管場所が3つ**あり、Dependabot が起動したワークフローは
**専用ストアだけ**を参照する。Actions 側（リポジトリ・環境とも）は一切見ない。
同期もされない。

```
Settings → Secrets and variables → Actions
  Repository secrets      ← 通常のワークフロー
  Environments → <名前>    ← environment: <名前> を指定したジョブ

Settings → Secrets and variables → Dependabot
  Dependabot secrets      ← Dependabot が起動した run だけがこれを見る
```

### 守ること

- **`.github/workflows/e2e.yml` にシークレットを足したら、Dependabot 側にも同じ値を登録する。**
  忘れると**依存更新PRだけ E2E が落ちる**。他のPRでは再現しないため原因に辿り着きにくい
- 逆に、Actions 側から消したシークレットは Dependabot 側からも消す。
  実際に `SUPABASE_ACCESS_TOKEN`（Supabase Management API のアカウント権限）を
  Actions から削除した後、Dependabot 側に残っていた
- Dependabot ストアに置くのは `e2e.yml` が実際に参照するものだけに絞る

### 症状の見分け方

ワークフローのログに env の一覧が出る。**値が空のものが渡っていないシークレット**。

```
SUPABASE_SERVICE_ROLE_KEY: ***   ← 渡っている
OTP_HASH_PEPPER:                 ← 渡っていない
```

`OTP_HASH_PEPPER` のように長さ要件の無い値は、**不正な値でも run 内で一貫していれば
テストが通ってしまう**ため、落ちたテストだけを見ると原因を誤る。env 一覧を必ず確認する。

## 【必須】`gh secret set` の `--body` は値そのもの

`--body -` は「標準入力から読む」ではなく、**リテラルの `-` を保存する**。

```bash
# ✕ 値が "-" になる
printf "%s" "$val" | gh secret set NAME --app dependabot --body -

# ◯ --body を付けなければ標準入力から読む
printf "%s" "$val" | gh secret set NAME --app dependabot --repo <owner>/<repo>
```

シークレットは読み戻せないため、誤った値を入れても**次の CI 実行まで気づけない**。
`printf "%s"` を使い、末尾の改行を混入させないこと。

### 混入に気づける失敗例

`TOTP_ENCRYPTION_KEY` は `src/lib/totp/keys.ts:50` で
**base64 デコード後 32 バイト**を検査している。不正な値だと
`/api/user/totp/setup` が 500 になり、E2E では「二段階認証のQRコードが表示されない」
という形で落ちる。

## 【必須】E2E が参照するシークレットの一覧

`e2e.yml` の `env:` に書いたものだけがテストプロセスへ渡る。
**GitHub は自動で環境変数に入れない。**

アプリが使っていても、ワークフローに書かなければ CI では `undefined` になる。
逆に言えば、ワークフローに書いていないシークレットは**保管していても無意味**なので
削除してよい（漏洩面を減らせる）。

```bash
# ワークフローが参照しているシークレット一覧
grep -rho "secrets\.[A-Z_0-9]*" .github/workflows/ | sed 's/secrets\.//' | sort -u
```
