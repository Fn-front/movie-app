# データベース設計

## プラットフォーム

**Supabase (PostgreSQL)**
- Supabase SDK for データアクセス
- Row Level Security (RLS) でセキュリティ管理
- UUID生成: `gen_random_uuid()`
- タイムスタンプ: `now()`

## テーブル設計

### users（ユーザー）
ユーザーアカウント情報を管理

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | UUID | NOT NULL | gen_random_uuid() | ユーザーID（主キー） |
| email | VARCHAR(255) | NOT NULL | - | メールアドレス（ユニーク） |
| password_hash | VARCHAR(255) | NULL | - | ハッシュ化されたパスワード（ソーシャルログインユーザーはNULL） |
| name | VARCHAR(100) | NULL | - | ユーザー名 |
| avatar_url | TEXT | NULL | - | アバター画像URL |
| role | VARCHAR(20) | NOT NULL | 'user' | ユーザー権限（user / admin） |
| is_verified | BOOLEAN | NOT NULL | false | メール認証済みフラグ |
| password_changed_at | TIMESTAMPTZ | NULL | - | パスワード最終変更日時 |
| last_login_at | TIMESTAMPTZ | NULL | - | 最終ログイン日時（signIn時 + セッション更新時に1時間間隔で更新） |
| created_at | TIMESTAMPTZ | NOT NULL | now() | 作成日時 |
| updated_at | TIMESTAMPTZ | NOT NULL | now() | 更新日時 |

**インデックス:**
- `email` (UNIQUE)

**RLS (Row Level Security):**
- SELECT: 自分のレコードのみ閲覧可能
- UPDATE: 自分のレコードのみ更新可能
- DELETE: 自分のレコードのみ削除可能
- INSERT: 公開（新規登録用）

---

### accounts（ソーシャルログインアカウント）
OAuthプロバイダーとのアカウント連携情報を管理（NextAuth.jsアダプター準拠）

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | UUID | NOT NULL | gen_random_uuid() | レコードID（主キー） |
| user_id | UUID | NOT NULL | - | ユーザーID（外部キー） |
| provider | VARCHAR(50) | NOT NULL | - | プロバイダー名（google / github） |
| provider_account_id | VARCHAR(255) | NOT NULL | - | プロバイダー側のアカウントID |
| type | VARCHAR(20) | NOT NULL | 'oauth' | アカウント種別（oauth） |
| access_token | TEXT | NULL | - | アクセストークン |
| refresh_token | TEXT | NULL | - | リフレッシュトークン |
| expires_at | INTEGER | NULL | - | トークン有効期限（UNIX timestamp） |
| token_type | VARCHAR(50) | NULL | - | トークン種別 |
| scope | VARCHAR(255) | NULL | - | スコープ |
| id_token | TEXT | NULL | - | IDトークン |
| created_at | TIMESTAMP | NOT NULL | now() | 作成日時 |
| updated_at | TIMESTAMP | NOT NULL | now() | 更新日時 |

**インデックス:**
- `provider, provider_account_id` (UNIQUE) - プロバイダー内での一意性
- `user_id` - ユーザー別アカウント取得用

**外部キー:**
- `user_id` -> `users(id)` ON DELETE CASCADE

**RLS (Row Level Security):**
- SELECT: 自分のレコードのみ閲覧可能
- INSERT: サーバー側のみ（service role）
- UPDATE: サーバー側のみ（service role）
- DELETE: 自分のレコードのみ削除可能

**NextAuth.jsからの操作方法:**
- NextAuth.jsのカスタムアダプターではなく、signInコールバック内でSupabase service roleクライアントを使用してaccountsテーブルを直接操作する
- OAuth認証成功時にsignInコールバックでアカウントリンク処理を実行し、service roleキーでINSERT/UPDATEを行う

---

### otp_codes（OTP検証コード）
メール認証用の6桁ワンタイムコードを管理

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | UUID | NOT NULL | gen_random_uuid() | レコードID（主キー） |
| email | VARCHAR(255) | NOT NULL | - | 送信先メールアドレス |
| code_hash | TEXT | NOT NULL | - | OTPコードの HMAC-SHA256（鍵は `OTP_HASH_PEPPER`） |
| action_type | VARCHAR(50) | NOT NULL | - | アクション種別（registration / login / password_change / two_factor） |
| attempts | INTEGER | NOT NULL | 0 | 検証試行回数 |
| expires_at | TIMESTAMPTZ | NOT NULL | - | 有効期限（作成時刻 + 10分） |
| verified_at | TIMESTAMPTZ | NULL | - | 検証完了日時 |
| verification_token_hash | TEXT | NULL | - | 検証済みトークンの SHA-256（ログイン・パスワード変更の本人確認に使う） |
| created_at | TIMESTAMPTZ | NOT NULL | now() | 作成日時 |

**インデックス:**
- `email, action_type, created_at` - メール・アクション・日時での検索用
- `expires_at` - 期限切れレコードのクリーンアップ用
- `verification_token_hash` - 検証済みトークンでの照合用

**制約:**
- `action_type` は 'registration', 'login', 'password_change', 'two_factor' のいずれか（CHECK制約）
- ⚠️ `two_factor`（二段階認証の第2要素）は**公開ルートからは作れない**。
  `src/schema/otp.ts` の `PUBLIC_OTP_ACTIONS` に入れていないため、
  `/api/auth/otp/send` と `/verify` は 400 で拒否する。発行できるのは
  サーバー側の `sendSecondFactorCode` だけ（#1261）
- `attempts` は 0〜5 の範囲（CHECK制約）

**設計判断 — 平文を保存しない理由（#640 / #698）:**
- OTPは6桁 = 100万通りしかなく、ソルト付きSHA-256でも特定の行を狙った総当たりは1秒未満で終わる
- 鍵（`OTP_HASH_PEPPER`）をDBの外に置くことで、DBだけを手に入れた攻撃者がHMACを計算できないようにする
- 移行期間は `code`（平文）と `code_hash` を並行させていたが、全レコードが新方式になった時点で `code` を削除し、`code_hash` に `NOT NULL` を付けた（#698）

**設計判断 — user_id FKを持たない理由:**
- 現在の設計では新規登録時にユーザーが先に作成される（is_verified = false）ため、user_id FKを持たせることは可能
- しかし、emailベースにすることで以下のメリットがある:
  - OTPテーブルがusersテーブルに依存しないシンプルな設計
  - 将来的にユーザー作成前にメール到達確認を行うフローに変更しやすい
  - RLSを使わずservice roleでの操作に統一できる（OTPはサーバー側でのみ操作）

**クリーンアップ:**
- 検証成功時のレコードは即座に削除
- ⚠️ **有効期限切れレコードの定期削除は未実装（#978）。** かつて「rate_limits と同一ジョブで削除」と書かれていたが、そのようなジョブは存在しなかった。rate_limits 側は #933 で `/api/cron/cleanup-rate-limits` を用意したが、otp_codes は対象外

---

### password_reset_tokens（パスワードリセット）
パスワードを忘れた利用者に送るワンタイムトークンを管理

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | UUID | NOT NULL | gen_random_uuid() | レコードID（主キー） |
| user_id | UUID | NOT NULL | - | ユーザーID（users.id への外部キー） |
| token_hash | TEXT | NOT NULL | - | トークンの SHA-256（hex）。平文はメールのリンクにのみ載せる |
| expires_at | TIMESTAMPTZ | NOT NULL | - | 有効期限（発行から30分） |
| used_at | TIMESTAMPTZ | NULL | - | 使用済みの日時 |
| created_at | TIMESTAMPTZ | NOT NULL | now() | 作成日時 |

**インデックス:**
- `token_hash`（UNIQUE） - 照合はハッシュ値の一致で行う
- `user_id`（`used_at IS NULL` の部分インデックス） - 発行時に既存の未使用トークンを無効化する用途
- `expires_at` - 期限切れレコードの削除用

**設計判断 — 平文を保存しない理由:**
- トークンはパスワードをバイパスできる資格情報。DBが漏れた時点で有効なリンクを作られると意味がない
- 256bit の乱数なので総当たりは成立せず、bcrypt のようなストレッチは不要（`src/lib/otp/verificationToken.ts` と同じ方式）

**設計判断 — 使用済みの行を削除しない理由:**
- 使い回しを「見つからない」ではなく「使用済み」として判定できるようにするため

**GRANT:**
- `service_role` のみ。`anon` / `authenticated` には一切付与しない
- RLS は有効だがポリシーを作らない

---

### user_totp（二段階認証の設定）
第2要素の方式と、TOTP の共有鍵を管理

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| user_id | UUID | NOT NULL | - | ユーザーID（主キー / users.id への外部キー） |
| method | VARCHAR(20) | NOT NULL | 'totp' | 第2要素の方式（`totp` / `email_otp`） |
| encrypted_secret | TEXT | NULL | - | AES-256-GCM で暗号化した共有鍵（`iv:authTag:暗号文`、base64）。`email_otp` では NULL |
| confirmed_at | TIMESTAMPTZ | NULL | - | 初回コード入力で所持確認が取れた日時。NULL は設定途中 |
| last_used_counter | BIGINT | NULL | - | 最後に検証を通した時間ステップ（使い回し防止）。`email_otp` では使わない |
| created_at | TIMESTAMPTZ | NOT NULL | now() | 作成日時 |
| updated_at | TIMESTAMPTZ | NOT NULL | now() | 更新日時 |

**制約:**
- `chk_second_factor_method`: `method IN ('totp', 'email_otp')`
- `chk_secret_matches_method`: `method='totp'` なら鍵が必須、`method='email_otp'` なら NULL

**設計判断 — 1行で方式を表す理由（#1261）:**
- `user_id` が主キーなので、**「どちらか1つだけ」がDB側で保証される**。アプリ側の整合チェックが要らない
- メールOTP のコードは `otp_codes`（`action_type='two_factor'`）に持つ。このテーブルには鍵もカウンタも無い

> ⚠️ **テーブル名は `user_totp` のまま据え置いている。** メールOTP も扱うので
> 名前は実態とずれるが、リネームすると旧コードが動いている本番DBに先に当たり、
> `from('user_totp')` が 42P01 を返して**全ログインが落ちる**
> （`getSecondFactorMethod` は二段階認証を設定していない利用者も含め全ログインで
> 呼ばれ、DBエラーで fail-closed に throw するため）。
> 同じ理由で `totp_recovery_codes` も据え置き（リカバリーコードは方式を問わず使う）。

**設計判断 — user_settings に置かない理由:**
- `user_settings` は `authenticated` に SELECT を付与しているため、RLS をすり抜ける経路が1つでも生まれると共有鍵が読まれる
- 二段階認証の資格情報は「サーバー（service_role）だけが触れる」境界に置く

**設計判断 — 共有鍵を暗号化して保存する理由:**
- TOTP はパスワードと違いハッシュ化できない（検証のたびに鍵そのものが必要）
- 暗号鍵は環境変数（`TOTP_ENCRYPTION_KEY`）側にあるため、DB だけが漏れても復号できない
- 改ざんを検知するため、認証付き暗号（GCM）を使う

**設計判断 — confirmed_at を持つ理由:**
- QR を表示しただけで有効化すると、認証アプリへの登録に失敗した利用者がログインできなくなる
- 初回コードの入力で所持確認が取れてから有効化する

**GRANT:**
- `service_role` のみ。`anon` / `authenticated` には一切付与しない（Data API から到達不可）
- RLS は有効だがポリシーを作らない（GRANT が誤って追加された場合の二重の歯止め）

---

### totp_recovery_codes（リカバリーコード）
認証アプリを失った利用者の復旧手段。使い捨て

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | UUID | NOT NULL | gen_random_uuid() | レコードID（主キー） |
| user_id | UUID | NOT NULL | - | ユーザーID（users.id への外部キー） |
| code_hash | TEXT | NOT NULL | - | HMAC-SHA256（サーバー側の鍵付き） |
| used_at | TIMESTAMPTZ | NULL | - | 使用済みの日時 |
| created_at | TIMESTAMPTZ | NOT NULL | now() | 作成日時 |

**インデックス:**
- `user_id, code_hash`（UNIQUE） - 同じユーザーに同じコードが2つ存在しないようにする
- `user_id`（`used_at IS NULL` の部分インデックス） - 未使用コードの照合用

**設計判断 — bcrypt ではなく HMAC を使う理由:**
- コードは人間が選ぶものではなく約48bitの乱数なので、総当たりを遅くするストレッチより「鍵が無ければ照合できない」ほうが効く
- 10件を bcrypt(cost=12) で扱うと発行・照合にそれぞれ数秒かかる

**設計判断 — 使用済みの行を削除しない理由:**
- 利用者が「残り何個か」を確認できるようにするため

**GRANT:**
- `user_totp` と同じく `service_role` のみ

---

### watchlist（見たい映画リスト）
ユーザーの見たい映画を管理（映画IDと画像URLを保存）

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | UUID | NOT NULL | uuid_generate_v4() | レコードID（主キー） |
| user_id | UUID | NOT NULL | - | ユーザーID（外部キー） |
| tmdb_movie_id | INTEGER | NOT NULL | - | TMDb映画ID |
| title | VARCHAR(255) | NOT NULL | - | 映画タイトル |
| poster_path | VARCHAR(255) | NULL | - | ポスター画像パス |
| backdrop_path | VARCHAR(255) | NULL | - | 背景画像パス |
| release_date | DATE | NULL | - | 公開日 |
| added_at | TIMESTAMP | NOT NULL | NOW() | 追加日時 |
| deleted_at | TIMESTAMP | NULL | - | 削除日時（論理削除） |
| notes | TEXT | NULL | - | メモ（将来的に使用） |

**インデックス:**
- `user_id, tmdb_movie_id` (UNIQUE, WHERE deleted_at IS NULL) - 重複登録防止（論理削除済みは対象外、再追加可能）
- `user_id` - ユーザー検索の高速化
- `added_at` - 追加日順ソート用（カーソルベースページングのカーソル）
- `deleted_at` - 論理削除フィルタ用

**外部キー:**
- `user_id` -> `users(id)` ON DELETE CASCADE

**削除方式: 論理削除**
- ユーザーが削除した場合、`deleted_at`に現在時刻を設定
- 取得時は`WHERE deleted_at IS NULL`でフィルタ
- データは物理的には残る（復元・分析用）

---

### movie_cache（映画情報キャッシュ）
TMDb APIから取得した映画一覧情報をキャッシュ（ホーム画面用）

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | INTEGER | NOT NULL | - | TMDb映画ID（主キー） |
| title | VARCHAR(255) | NOT NULL | - | 映画タイトル |
| poster_path | VARCHAR(255) | NULL | - | ポスター画像パス |
| backdrop_path | VARCHAR(255) | NULL | - | 背景画像パス |
| release_date | DATE | NULL | - | 公開日 |
| overview | TEXT | NULL | - | 概要 |
| vote_average | DECIMAL(3,1) | NULL | - | 評価平均 |
| popularity | DECIMAL(10,3) | NULL | - | 人気度 |
| genre_ids | JSONB | NULL | - | ジャンルID配列 |
| release_type | VARCHAR(20) | NOT NULL | 'theatrical' | リリースタイプ（theatrical / streaming） |
| is_revival | BOOLEAN | NOT NULL | false | リバイバル上映フラグ |
| is_now_playing | BOOLEAN | NOT NULL | false | TMDb now_playing リスト掲載フラグ |
| cached_at | TIMESTAMP | NOT NULL | NOW() | 初回キャッシュ日時 |
| updated_at | TIMESTAMP | NOT NULL | NOW() | 最終更新日時 |

> ⚠️ 上の列の一覧は実体から遅れている。実体は21列で、`vote_count` /
> `original_language` / `digital_release_date` / `is_currently_streaming` /
> `watch_provider_flatrate` / `watch_provider_rent` / `watch_provider_buy` が
> 未記載。列の追従は #1209 の範囲。
> 下の索引の一覧は 2026-11-19 に実DBと突き合わせ済み。

**インデックス（10本。2026-11-20 時点の実体）:**
- `id, release_type` (UNIQUE) - 複合主キー
- `release_date` - 公開日順ソート用
- `is_now_playing` - Now Playing フィルタ用
- `release_type` - タブ絞り込み用
- `release_type, release_date DESC` - タブ＋公開日順
- `release_type, cached_at DESC` - 差分取得用
- `is_currently_streaming` (部分索引 `WHERE is_currently_streaming = true`) - 配信中フィルタ用
- `watch_provider_flatrate` (GIN) - 配信プロバイダー絞り込み用
- `watch_provider_rent` (GIN) - 同上
- `watch_provider_buy` (GIN) - 同上

#### 落とした索引と、HOT 更新（#1327・2026-11-20）

14本 → 10本。**目的は HOT 更新を取り戻すこと**で、実際に戻った。

| 索引 | スキャン | 落とした理由 |
|---|---|---|
| `idx_movie_cache_updated_at` | 2回 | トリガーが**毎回書き換える**のに**読み取りに一度も使われていない**（src/ では代入にしか現れない） |
| `idx_movie_cache_popularity` | 6回 | 複合索引と重複。並び替えは `applyMovieCacheFilters` が必ず `.eq('release_type', ...)` を付ける |
| `movie_cache_release_type_popularity_idx` | **0回** | **アプリの ORDER BY に使えない**（下記） |
| `idx_movie_cache_cached_at` | 380回 | 唯一の読み手は `.eq('release_type', ...)` 付きで、複合索引のほうが選ばれる（実測で Index Only Scan） |

##### HOT が戻った根拠（実測）

支配的な UPDATE（`updateMoviesCacheByBatch.ts:157-168`、79,034回 / WAL 111 MB）が書くのは
`vote_average` / `vote_count` / `popularity` / `original_language` / 表示列 / `updated_at` で、
**`cached_at` と `release_date` は書かない**（後者は `buildDisplayColumns` がリバイバル補正を
守るため意図的に除外）。したがって索引付き列との交差は **`popularity` ただ1つ**だった。

| | n_tup_upd | n_tup_hot_upd |
|---|---|---|
| 削除前 | 172,326 | **4**（累積 0.002%） |
| 削除後（30回更新） | 172,356 | **20**（+16 が HOT） |

##### ⛔ `popularity` の索引は ORDER BY に使えなかった

アプリは `.order(sortColumn, { nullsFirst: false })`（`movies/route.ts:439`）＝
`popularity DESC NULLS LAST` を投げるが、索引は `popularity DESC`（＝既定の NULLS FIRST）。
順序が一致しないため走査順を提供できない。`enable_seqscan=off` で切り分けた実測:

```
ORDER BY popularity DESC            → Index Scan using ..._popularity_idx
ORDER BY popularity DESC NULLS LAST → Sort（索引を使えない）← アプリの形
```

**行数が増えても永久に使われない。** 戻すなら `(release_type, popularity DESC NULLS LAST, id)`
にしないと同じことになる。

#### ⛔ スキャン0回でも落としてはいけない索引

`watch_provider_flatrate` / `_rent` / `_buy`（GIN）はスキャン0回だが**配信サービスの
絞り込みを支えている**（`movieCacheFilters.ts:160` が `watch_provider_<形態>.cs.[id]` の
containment で引く）。0回なのは 1,259行・2 MB でプランナが seq scan を選ぶためで、
カタログが育てば効いてくる。**「スキャン0回＝不要」で機械的に判断しない。**

> ⚠️ ただし上の `movie_cache_release_type_popularity_idx` は、スキャン0回**かつ**
> 原理的に使えないことを実測で確かめたうえで落としている。0回の索引は
> 「使われていないだけか」「使えないのか」を切り分けること。

#### 索引を追加しない判断（#1279・2026-11-19 実測）

`genre_ids` / `vote_average` / `digital_release_date` には索引が無い。
**測ったうえで追加していない。**

本番の行数: **1,258行**（theatrical 1,104 / streaming 154）。
増加は **約133行/月**（最古の `cached_at` 2026-02-08 からの実測）。

##### `/api/movies` が実際に投げるクエリでは Seq Scan が起きない

`applyMovieCacheFilters` は**必ず** `original_language` の除外 OR を付ける
（`getExcludedLanguages` は未指定でも13言語を返す）。さらに `movies/route.ts`
のタブ分岐で `release_date >= 今日` / `is_now_playing = true` /
`is_currently_streaming` のいずれかが必ず入る。この3つのどれかが既存索引に
当たるため、**実クエリは1本も全件走査しない。**

`EXPLAIN (ANALYZE, BUFFERS)` の定常値（2回目以降。1回目はキャッシュが冷えて
十数ms〜40ms になるが、索引の有無と関係ない）:

| 実クエリ | 実行時間 | 使われた索引 |
|---|---|---|
| upcoming ＋ ジャンル2件 ＋ 公開日順 | 0.34 ms | `release_type_release_date_idx`（逆方向） |
| 同・件数クエリ（`count exact`） | 0.36 ms | 同上 |
| upcoming ＋ 評価順 | 0.39 ms | 同上 ＋ top-N ソート |
| now_showing ＋ ジャンル | 0.23 ms | `idx_movie_cache_is_now_playing` |
| 配信予定タブ（`digital_release_date` の `gt` ＋同列ソート） | 0.29 ms | `idx_movie_cache_release_type` |

##### 候補索引を張った場合との差

条件を素にした（`original_language` とタブ絞り込みを外した）クエリでのみ
Seq Scan になり、そこで初めて候補索引が効く。**実クエリでの差ではない**
ことに注意:

| 条件を素にしたクエリ | 索引なし | 候補索引あり | プランナの選択 |
|---|---|---|---|
| `release_type` ＋ ジャンル ＋ 公開日順 | 1.05 ms | 0.46 ms | GIN を使う（Bitmap Index Scan） |
| `release_type` ＋ 評価順 | 0.99 ms | 0.99 ms（**同値**） | **索引を使わない**（Seq Scan のまま） |
| `release_type='streaming'` ＋ `digital_release_date` | 0.29 ms | 0.07 ms | 部分索引を使う |

実クエリに候補索引（GIN）を足した場合の改善幅は **0.35 ms → 0.17 ms**
程度で、上の表の 0.6 ms よりさらに小さい。

検証は `BEGIN` → `CREATE INDEX` → `ANALYZE` → `EXPLAIN` → `ROLLBACK` で行い、
索引は残していない（確認済み: 実行後も14本のまま）。

##### 判断の根拠

- **実クエリは最も遅いもので 0.4 ms。** Supabase はネットワーク越しなので、
  API 1本の往復（数十ms）に埋もれて体感に出ない
- `(release_type, vote_average DESC)` は**張っても使われない**。この規模では
  Seq Scan のほうが安いとプランナが判断する。張るだけ無駄になる
- `movie_cache` は `sync-movies`（映画.com iCal）/ `sync-now-playing` /
  `sync-streaming` / `update-movies` の4つの CRON と `/api/movies` の Discover
  分岐が一括 UPSERT するテーブルで、索引を増やすと書き込みが重くなる。
  既に14本ある

##### 再検討のきっかけ

**総行数ではなく「1クエリが触る範囲」を見ること。** 総行数が増えても、
実クエリが触るのは以下だけで、これらは時間とともに伸びる量ではない。

| タブ | 対象行数（2026-11-19） | 性質 |
|---|---|---|
| theatrical / upcoming | 145 | 「今日以降」の移動窓。過去作は自動的に外れる |
| theatrical / now_showing | 57 | `sync-now-playing` が入れ替える |
| streaming | 154 | `sync-streaming` が入れ替える |

`movie_cache` に DELETE の経路が無いため総行数は単調増加するが、増えるのは
**公開日が過去の行**で、上の対象には入らない。したがって「1万行を超えたら」
のような総行数の線では発火しない。

次のどちらかが起きたら測り直す。

- いずれかの対象行数が **1,000 を超えた**とき（移動窓の幅や CRON の取得範囲を
  広げると起こりうる）
- 上の実クエリの `EXPLAIN` で **Seq Scan が現れた**とき（絞り込み条件を増減
  させると、既存索引に当たらない組み合わせができる）

`/api/movies` は件数クエリとデータクエリで同じ条件を2回走らせているので、
先に #1272 を片付けるほうが効く。

**キャッシュ戦略:**
- 初回取得: 今日から3ヶ月先の映画を取得
- 差分取得: MAX(cached_at)以降の新作映画のみ取得
- バッチ更新: 1日1回、全件の評価・人気度を更新
- 詳細画面: キャッシュを使わず都度TMDb APIから取得

---

### user_settings（ユーザー設定）
ユーザーのテーマ・通知などのアプリ設定を管理

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | UUID | NOT NULL | gen_random_uuid() | レコードID（主キー） |
| user_id | UUID | NOT NULL | - | ユーザーID（外部キー、ユニーク） |
| theme | VARCHAR(10) | NOT NULL | 'light' | テーマ（light / dark） |
| notification_enabled | BOOLEAN | NOT NULL | false | 通知有効フラグ |
| created_at | TIMESTAMP | NOT NULL | now() | 作成日時 |
| updated_at | TIMESTAMP | NOT NULL | now() | 更新日時 |

**インデックス:**
- `user_id` (UNIQUE)

**外部キー:**
- `user_id` -> `users(id)` ON DELETE CASCADE

**RLS (Row Level Security):**
- SELECT: 自分のレコードのみ閲覧可能
- INSERT: 自分のレコードのみ作成可能
- UPDATE: 自分のレコードのみ更新可能
- DELETE: 自分のレコードのみ削除可能

---

### user_preferences（ユーザー嗜好データ）
将来的なOpenAIレコメンド機能用のユーザー嗜好データ

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | UUID | NOT NULL | uuid_generate_v4() | レコードID（主キー） |
| user_id | UUID | NOT NULL | - | ユーザーID（外部キー） |
| favorite_genres | JSONB | NULL | - | お気に入りジャンル |
| preferred_languages | JSONB | NULL | - | 優先言語 |
| analysis_data | JSONB | NULL | - | AI分析用データ |
| created_at | TIMESTAMP | NOT NULL | NOW() | 作成日時 |
| updated_at | TIMESTAMP | NOT NULL | NOW() | 更新日時 |

**インデックス:**
- `user_id` (UNIQUE)

**外部キー:**
- `user_id` -> `users(id)` ON DELETE CASCADE

---

### reviews（レビュー・評価）
将来的なレビュー機能用のユーザーレビューデータ

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | UUID | NOT NULL | uuid_generate_v4() | レコードID（主キー） |
| user_id | UUID | NOT NULL | - | ユーザーID（外部キー） |
| tmdb_movie_id | INTEGER | NOT NULL | - | TMDb映画ID |
| rating | DECIMAL(2,1) | NOT NULL | - | 評価（0.5-5.0） |
| comment | TEXT | NULL | - | レビューコメント（500文字以内） |
| created_at | TIMESTAMP | NOT NULL | NOW() | 投稿日時 |
| updated_at | TIMESTAMP | NOT NULL | NOW() | 更新日時 |

**インデックス:**
- `tmdb_movie_id` - 映画別レビュー取得用
- `user_id, tmdb_movie_id` (UNIQUE) - 重複投稿防止
- `created_at` - 新着順ソート用

**外部キー:**
- `user_id` -> `users(id)` ON DELETE CASCADE

**制約:**
- `rating` は 0.5 から 5.0 の範囲（CHECK制約）
- `comment` は 500文字以内

---

### rate_limits（レート制限管理）
ログイン試行、OTP検証などのレート制限を管理

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | UUID | NOT NULL | gen_random_uuid() | レコードID（主キー） |
| identifier | VARCHAR(255) | NOT NULL | - | 識別子（IPアドレス or ユーザーID） |
| action_type | VARCHAR(50) | NOT NULL | - | アクション種別（login / otp_verify） |
| attempts | INTEGER | NOT NULL | 0 | 試行回数 |
| locked_until | TIMESTAMPTZ | NULL | - | ロック解除時刻（20260628111105 で naive から変換） |
| last_attempt_at | TIMESTAMPTZ | NOT NULL | now() | 最終試行時刻（20261019012324 で naive から変換） |
| created_at | TIMESTAMP | NOT NULL | now() | 作成日時（naive のまま。JS 側で時刻比較していない） |
| updated_at | TIMESTAMP | NOT NULL | now() | 更新日時（同上） |

**インデックス:**
- `identifier, action_type` (UNIQUE) - 重複防止
- `locked_until` - ロック解除チェック用

> ⛔ **`last_attempt_at` に索引を張らないこと（#1326）。** #933 で保持期間切れ DELETE 用に張っていたが、Supabase の Disk IO Budget 枯渇警告を受けて実測し、外した。
>
> `consume_rate_limit` は `last_attempt_at = now()` を書く。更新対象の列に btree 索引があると Postgres は HOT 更新を選べず、1回ごとに新しいヒープタプルに加えて**全索引**へ新エントリを書く。
>
> ⚠️ 「呼ばれるたび」ではない。ロック中（`locked_until > now()`）は `last_attempt_at` を更新しない分岐があり、その間は HOT が成立する。累積の HOT 率が 0% ではなく 13.5% だったのはこれが理由で、通常経路に限れば 0% だった。
>
> 本番で PostgREST 経由（1回=1トランザクション）に 200 回ずつ流した実測:
>
> | | 索引あり | 索引なし |
> |---|---|---|
> | HOT 更新率 | **0%**（197回中0回） | **100%**（197回中197回） |
> | WAL | 575.7 bytes/call | **253.7 bytes/call** |
> | WAL レコード | 7.05 件/call | **3.0 件/call** |
>
> 索引の肥大もここから来ていた。外して REINDEX した結果、索引合計は **7,696 kB → 184 kB**（ヒープは 544 kB / 68 ページ）。ただし 184 kB は REINDEX 直後の値で、`rate_limits` は INSERT/DELETE の回転が激しいため定常状態では 280 kB 前後に戻る。いずれにせよ 96% 減。
>
> **部分索引は代替にならない。** HOT の判定に WHERE 句は関係せず、`last_attempt_at` が btree 索引に含まれる時点で HOT は死ぬ。
>
> ⚠️ **BRIN は「HOT を殺すから」では落とせない。** PostgreSQL 16 以降、BRIN のような summarizing index の列だけを更新する場合は HOT が成立する（PG17 ドキュメント `storage-hot.html`「not including summarizing indexes. The only summarizing index method in the core PostgreSQL distribution is BRIN」）。本番は PostgreSQL 17.6。
>
> `rate_limits` で BRIN を採らないのは**サイズが理由**。ヒープが 68 ページしかなく、BRIN の既定 `pages_per_range = 128` では表全体が1レンジに収まるため枝刈りが一切効かない（`last_attempt_at` の correlation は 0.809 と良好なので、相関が理由ではない）。**大きいテーブルで同じ問題を扱うとき（#1327 の `movie_cache` など）は BRIN が有効な選択肢になりうるので、ここの結論をそのまま持ち出さないこと。**
>
> 日次 DELETE はヒープ 68 ページの seq scan になる（実測 0.324 ms）。行は `(identifier, action_type)` の upsert で再利用されるため**試行回数には比例しない**が、上限は「異なる識別子の数 × 異なる action_type の数」であって識別子の数ではない（実測: 1,234行 / 識別子 899 / action_type 22）。識別子の数自体に上限が無いので**時間に対しては緩やかに増える**（実測 約 617 行/日）。掃除が1年止まっても約 225k 行 ≒ 100 MB で日次1回の seq scan としては許容範囲だが、行数が小さいままという前提は無条件には成り立たない。掃除が大きいテーブルでも完走すること（#1330 の分割削除）で担保する。

**制約:**
- `action_type` は 'login', 'change_password', 'otp_verify' 等（CHECK制約）

**レート制限ルール:**
- **login**: 3回失敗で30分ロック
- **change_password**: 3回失敗で30分ロック
- **otp_verify**: 5回失敗で該当OTP無効化

**クリーンアップ（#933）:**
- 日次 Cron `/api/cron/cleanup-rate-limits` が `delete_expired_rate_limits` RPC を呼ぶ
- **1回500件ずつの分割削除**（#1330 / #1342）。この RPC は PostgREST 経由で呼ぶため
  `authenticator` ロールの `statement_timeout = 8s` が効く。一括 DELETE だと行が
  増えたとき全ロールバックして**1行も消えず、翌日さらに悪化して回復しない**
  - ループは**クライアント側**（`cleanupRateLimits.ts`）。plpgsql 内のループでは
    `statement_timeout` が RPC 全体に掛かるため分割にならない
  - **0件を見るまで**続ける。「上限未満＝消し切った」で止めると、同時更新で
    `ROW_COUNT` が減ったときに滞留を残したまま終了する
  - 時間予算 35秒（`maxDuration` は 60）。超えたら打ち切り、**1回の run が
    未完で終わりうる**。残りは翌日のCRONが続きから消す
  - 打ち切りはレスポンスの `completed: false` で観測できる。200 を返すため
    ステータスコードだけ見る監視からは完走と区別がつかない
- 保持期間は **48時間**（`RATE_LIMIT_RETENTION_HOURS`）。最長ウィンドウ（`OTP_SEND_DAILY` = 1440分）がちょうど24時間のため、24時間では足りない
- 削除条件は「`last_attempt_at` が保持期間より古い **かつ** ロックが明けている」
  - `created_at` は使えない。行は upsert で再利用され初回作成時刻のままなので、カウント中の行まで消える
  - `last_attempt_at` だけでも足りない。ロック中は `last_attempt_at` を更新しないため、ロックが早期解除される
- 回復（ロック明けのリセット）は削除とは別で、`consume_rate_limit` が行取得時に判定する

---

### recommendations（AIレコメンド）
OpenAI APIによるレコメンド映画を管理（日次Cronで全件入れ替え）

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | UUID | NOT NULL | gen_random_uuid() | レコードID（主キー） |
| user_id | UUID | NOT NULL | - | ユーザーID（FK → users.id） |
| tmdb_movie_id | INTEGER | NOT NULL | - | TMDb映画ID |
| title | VARCHAR(255) | NOT NULL | - | 映画タイトル |
| poster_path | VARCHAR(255) | NULL | - | ポスター画像パス |
| release_date | DATE | NULL | - | 公開日 |
| vote_average | NUMERIC(3,1) | NULL | - | TMDb評価 |
| genre_ids | INTEGER[] | NULL | - | ジャンルID配列 |
| reason | TEXT | NOT NULL | - | 推薦理由 |
| display_order | INTEGER | NOT NULL | - | 表示順序（1〜10） |
| generated_at | TIMESTAMPTZ | NOT NULL | now() | 生成日時 |
| created_at | TIMESTAMPTZ | NOT NULL | now() | 作成日時 |

**インデックス:**
- `user_id` - ユーザー別一覧取得用
- `user_id, display_order ASC` - 表示順ソート用

**制約:**
- `uq_recommendations_user_order` (UNIQUE: user_id, display_order)
- `uq_recommendations_user_movie` (UNIQUE: user_id, tmdb_movie_id)
- `display_order BETWEEN 1 AND 10` (CHECK)

**RLSポリシー:**
- SELECT: 自分のレコメンドのみ参照可能（`auth.uid() = user_id`）
- INSERT/UPDATE/DELETE: service_roleのみ（Cron API経由、RLSバイパス）

**特徴:**
- 論理削除なし（日次で全件入れ替えのため）
- ON DELETE CASCADE（ユーザー削除時に自動削除）

---

### favorites（お気に入り映画）
ユーザーが独自の評価（1〜10点）を付けてお気に入り登録した映画を管理

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | UUID | NOT NULL | gen_random_uuid() | レコードID（主キー） |
| user_id | UUID | NOT NULL | - | ユーザーID（外部キー） |
| tmdb_movie_id | INTEGER | NOT NULL | - | TMDb映画ID |
| title | VARCHAR(255) | NOT NULL | - | 映画タイトル |
| poster_path | VARCHAR(255) | NULL | - | ポスター画像パス |
| release_date | DATE | NULL | - | 公開日 |
| rating | INTEGER | NOT NULL | - | ユーザー評価（1〜10点） |
| added_at | TIMESTAMPTZ | NOT NULL | now() | 登録日時 |
| updated_at | TIMESTAMPTZ | NOT NULL | now() | 更新日時 |
| deleted_at | TIMESTAMPTZ | NULL | - | 削除日時（論理削除） |

**インデックス:**
- `user_id, tmdb_movie_id` (UNIQUE, WHERE deleted_at IS NULL) - 重複登録防止（論理削除済みは対象外、再追加可能）
- `user_id` - ユーザー別一覧取得用
- `user_id, added_at DESC` (WHERE deleted_at IS NULL) - 登録日順ソート用
- `user_id, rating DESC` (WHERE deleted_at IS NULL) - 評価順ソート用

**外部キー:**
- `user_id` -> `users(id)` ON DELETE CASCADE

**制約:**
- `rating` は 1〜10 の範囲（CHECK制約）

**トリガー:**
- `update_favorites_updated_at`: UPDATE時に `updated_at` を自動更新（`update_updated_at_column()` 関数を使用）

**削除方式: 論理削除**
- ユーザーが削除した場合、`deleted_at` に現在時刻を設定
- 取得時は `WHERE deleted_at IS NULL` でフィルタ

**RLS (Row Level Security):**
- SELECT: 自分のお気に入りのみ閲覧可能（`auth.uid() = user_id AND deleted_at IS NULL`）
- INSERT: 自分のお気に入りのみ追加可能（`auth.uid() = user_id`）
- UPDATE: 自分のお気に入りのみ更新可能（`auth.uid() = user_id`）
- DELETE: 自分のお気に入りのみ削除可能（`auth.uid() = user_id`）

---

### dismissed_movies（興味なし映画）
ユーザーが「興味なし」とした映画を管理（レコメンド精度向上用）

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | UUID | NOT NULL | gen_random_uuid() | レコードID（主キー） |
| user_id | UUID | NOT NULL | - | ユーザーID（FK → users.id） |
| tmdb_movie_id | INTEGER | NOT NULL | - | TMDb映画ID |
| title | VARCHAR(255) | NOT NULL | - | 映画タイトル |
| poster_path | VARCHAR(255) | NULL | - | ポスター画像パス（設定ページの興味なし一覧でサムネイル表示用） |
| genre_ids | INTEGER[] | NULL | - | ジャンルID配列（傾向分析用） |
| created_at | TIMESTAMPTZ | NOT NULL | now() | 作成日時 |
| updated_at | TIMESTAMPTZ | NOT NULL | now() | 更新日時 |
| deleted_at | TIMESTAMPTZ | NULL | - | 論理削除 |

**インデックス:**
- `user_id, tmdb_movie_id` (UNIQUE, WHERE deleted_at IS NULL) - 重複登録防止
- `user_id` - ユーザー別一覧取得用
- `user_id, created_at DESC` (WHERE deleted_at IS NULL) - 作成日順ソート用

**トリガー:**
- `update_dismissed_movies_updated_at`: UPDATE時に `updated_at` を自動更新

**外部キー:**
- `user_id` -> `users(id)` ON DELETE CASCADE

**RLSポリシー:**
- SELECT/INSERT/UPDATE/DELETE: 自分のレコードのみ操作可能（`auth.uid() = user_id`）

**用途:**
- レコメンド生成時に除外IDとして使用
- ジャンル傾向分析でAIプロンプトに「避けるべきジャンル傾向」を含める
- 将来的に映画一覧でもフィルタに利用可能

---

### award_movies（受賞作品）
映画賞の受賞作品・ノミネート作品を管理（月次Cronで同期）

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | UUID | NOT NULL | gen_random_uuid() | レコードID（主キー） |
| tmdb_movie_id | INTEGER | NOT NULL | - | TMDb映画ID |
| title | VARCHAR(255) | NOT NULL | - | 映画タイトル |
| poster_path | VARCHAR(255) | NULL | - | ポスター画像パス |
| release_date | DATE | NULL | - | 公開日 |
| vote_average | NUMERIC(3,1) | NULL | - | TMDb評価 |
| genre_ids | INTEGER[] | NULL | - | ジャンルID配列 |
| person_name | VARCHAR(255) | NULL | - | 人名（監督賞・演技賞などで使用） |
| award_name | VARCHAR(100) | NOT NULL | - | 賞名キー（academy_awards等） |
| award_year | INTEGER | NOT NULL | - | 授賞年度 |
| category | VARCHAR(100) | NOT NULL | - | 部門キー（best_picture等） |
| award_label | VARCHAR(255) | NOT NULL | - | 部門表示名（作品賞等） |
| is_winner | BOOLEAN | NOT NULL | false | 受賞フラグ |
| display_order | INTEGER | NOT NULL | 0 | 表示順序 |
| generated_at | TIMESTAMPTZ | NOT NULL | now() | 生成日時 |
| created_at | TIMESTAMPTZ | NOT NULL | now() | 作成日時 |

**インデックス（4本。2026-11-19 に実DBと突き合わせ済み）:**
- `id` (UNIQUE) - 主キー（`award_movies_pkey`）
- `tmdb_movie_id, award_name, award_year, category, person_name` (UNIQUE NULLS NOT DISTINCT) - 重複防止・UPSERT用。演技賞で同じ作品から複数人がノミネートされるため人名まで含める。`NULLS NOT DISTINCT` は作品賞系（`person_name` が NULL）の重複を防ぐため
- `award_name, award_year`（`idx_award_movies_name_year`） - admin の `/api/admin/awards/existing` 用。**`award_year` 単独では使えない**（B-tree は先頭列の条件が要る）
- `award_year, display_order`（`idx_award_movies_year_display_order`） - 公開API `/api/awards` の絞り込みと並び替え、および `get_award_years()` 用（#1276）

> ⚠️ `is_winner` の単独索引は #1276 で**削除済み**。`is_winner` を WHERE / ORDER BY に
> 使うクエリはアプリにもDB関数にもRLSポリシーにも無く、統計上も3 scans しか
> 無かった。boolean 単独は選択性が低く、受賞同期の UPSERT で書き込みコストだけ乗る。

**RLSポリシー:**
- SELECT: 全ユーザー参照可能（公開データ）
- INSERT/UPDATE/DELETE: service_roleのみ（Cron API経由、RLSバイパス）

**特徴:**
- ユーザーに紐付かない公開データ（FKなし）
- 月次Cronで対象月の賞を OpenAI + TMDb で取得・UPSERT
- 論理削除なし

---

## ER図（概念図）

```
users (1) ----< (N) watchlist
  |
  +----< (N) accounts
  |
  +---- (1) user_settings
  |
  +---- (1) user_preferences
  |
  +----< (N) favorites
  |
  +----< (N) recommendations
  |
  +----< (N) reviews
  |
  +----< (N) dismissed_movies

otp_codes（usersと直接FKなし、emailで紐付け）
award_movies（usersと紐付かない公開データ）
```

---

## Row Level Security (RLS) ポリシー

すべてのテーブルでRLSを有効化し、`auth.uid()`ベースのアクセス制御を実装します。

### 基本方針

- **ユーザーデータ**: 自分のデータのみアクセス可能（`auth.uid() = user_id`）
- **公開データ**: 全員閲覧可能（例: movie_cache）
- **認証なしINSERT**: 新規登録で必要な場合のみ許可

詳細なRLS SQL実装は `.claude/skills/db-schema` skillを参照してください。

## 確認事項

- [x] **キャッシュ取得範囲**: 初回は今日から3ヶ月先 - 確定
- [x] **バッチ更新頻度**: 1日1回 - 確定
- [x] **ページネーション**: 20件/ページ - 確定
- [x] **watchlistテーブル**: 映画IDと画像URLを保存 - 確定
- [ ] **インデックス追加**: 他に必要なインデックスは？

### データ管理
- [x] **watchlist削除方式**: 論理削除 - 確定
  - deleted_atカラムで管理
  - 復元・分析用にデータ保持
- [ ] **データバックアップ**: 未定（将来的に検討）

### 将来的な拡張
- [ ] **watched（見た映画）テーブル**: 必要？
- [ ] **ratings（評価）テーブル**: ユーザー独自の評価機能は必要？
- [ ] **reviews（レビュー）テーブル**: レビュー機能は必要？
