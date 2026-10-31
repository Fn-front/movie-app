# 受賞作品の手動同期（管理画面）設計

対象: admin ロールの管理画面から、年と賞を指定して受賞作品データを同期する機能。

関連: [admin-account-design.md](./admin-account-design.md)（admin 認可の土台）

---

## 1. 目的

受賞作品データは毎月28日の Vercel Cron（`/api/cron/sync-award-movies`）でのみ同期される。同期対象は **「実行月に該当する賞」の当年ぶんだけ** で、過去年を入れる手段も、取得結果がおかしかったときにやり直す手段も画面上に無い。

現状の逃げ道は `?year=` パラメータ（`src/app/api/cron/sync-award-movies/route.ts:43`）だが、

- `CRON_SECRET` を手で用意して API を直叩きする必要がある
- **アカデミー賞に決め打ち**（`src/lib/awards/syncAwardMoviesService.ts:101`）で賞を選べない
- 失敗しても画面に何も残らない

管理画面から年と賞を選んで実行し、進捗と結果を確認できるようにする。

---

## 2. スコープ

### やること

- `/admin/awards` 画面（年入力 + 賞セレクト + 実行 + 進捗表示）
- `POST /api/admin/awards/sync`（起票）／ `GET /api/admin/awards/sync/[id]`（進捗取得）
- `award_sync_jobs` テーブルの追加
- 手動同期のみ **洗い替え** セマンティクス（cron は現行の UPSERT のまま）
- 選択可能な賞: アカデミー賞 / カンヌ / ゴールデングローブ

### やらないこと

| 項目 | 理由 |
| --- | --- |
| カンヌ・ゴールデングローブの取得ロジック刷新 | 別サブプロジェクト。[6. 次のサブプロジェクト](#6-次のサブプロジェクトカンヌggの取得ロジック) に調査結果のみ残す |
| 日本アカデミー賞の選択肢追加 | `AWARDS_EXCLUDED` の意図を維持する |
| ベルリン・ベネチア | `AWARD_DEFINITIONS` に定義が無い |
| cron ルートの `?year=` 削除 | 画面が使えない状況（サーバー未起動・CI）での逃げ道として残す |
| cron の月ベース判定・UPSERT 挙動の変更 | 日次/月次同期を壊さない |

---

## 3. 前提と制約（調査で確定した事実）

### 3-1. この画面は本番では動かない

`src/proxy.ts:41-46` により、本番 Vercel は `/api/cron/*` 以外を**すべて 404** にしている。

```ts
if (process.env.VERCEL_ENV === 'production') {
  if (nextUrl.pathname.startsWith('/api/cron/')) return NextResponse.next();
  return new NextResponse(null, { status: 404 });
}
```

したがって本機能は `/admin/accounts` と同様 **ローカル（`npm run dev`）専用**。これは設計上2つの意味を持つ。

- **`maxDuration = 300` の制約は掛からない。** あれは Vercel サーバーレスの制限であり、ローカルの長命 Node プロセスには適用されない
- 背景実行を選ぶ理由は **UX のみ**（数分間ブラウザを固めない、進捗が見える、リロードしても追える）。タイムアウト回避ではない

### 3-2. 賞ごとに所要時間の桁が違う

| 賞 | 取得経路 | 外部API呼び出し | 体感 |
| --- | --- | --- | --- |
| アカデミー賞 | eiga.com（`fetchEigaOscarAwards`） | HTTP 5ページ | 数秒 |
| カンヌ | Wikipedia + OpenAI | Wikipedia 1回 + OpenAI **8回**（部門数。0件時のみ最大24回） | 分単位 |
| ゴールデングローブ | Wikipedia + OpenAI | Wikipedia 1回 + OpenAI **9回**（同、最大27回） | 分単位 |

OpenAI は**部門ごとに記事全文を送り直す**実装（`buildUserPrompt`）のため、部門数ぶん呼ぶ。`AWARDS_MAX_RETRIES = 3` のリトライは「結果が0件だったときだけ」発火するので、通常は部門数と同じ回数で収まる。

加えて TMDb 解決（`resolveAwardsWithTMDb`）が作品1件につき 3〜6回走るが、TMDb は高速（50req/s）のため所要時間の支配要因は OpenAI 側。

カンヌ・GG の分単位の待ちは**①の時点に限った話**で、次のサブプロジェクトで解消する。

---

## 4. 確定した設計

### 4-1. データフロー

```
[画面] 年 + 賞を選択
   │
   └─ POST /api/admin/awards/sync
        │  withAdminAuth（DBからrole確認）
        │  zod 検証（年の範囲・賞キー）
        │  レート制限（admin_award_sync）
        │  ジョブ起票 status=pending
        │
        ├─ 202 + { jobId } を即返す
        │
        └─ after() で継続実行
             status=running
             取得 → TMDb解決 → 洗い替え
             status=succeeded | failed

[画面] GET /api/admin/awards/sync/[id] を数秒間隔でポーリング
        終端状態（succeeded/failed）で停止
```

`after()` は `next/server` から。`src/app/api/favorites/route.ts:7` に既存の使用例がある。

### 4-2. ステータス遷移

```
pending ──▶ running ──┬──▶ succeeded
                      └──▶ failed
```

**孤児ジョブの扱い:** `after()` の実行中にプロセスが落ちると `running` のまま残る。DB 側で自動的に `failed` へ倒す仕組みは**入れない**。実際にはまだ動いている処理を失敗扱いにしてしまうため。代わりに画面側で、`started_at` から一定時間経過した `running` を「停止している可能性があります」と表示し、再実行の判断を人に委ねる。

### 4-3. 洗い替えの安全策

手動同期は「データがおかしいからやり直す」場面が主なので、残留レコードを残さない。ただし無条件の DELETE は危険なので、**取得が成功し TMDb 解決が1件以上できた場合に限る**。

```
1. 取得（eiga.com or Wikipedia+OpenAI）
2. TMDb 解決
3. resolved.length === 0 → 既存に触れず failed で終了   ← ここが要
4. resolved.length > 0  → DELETE WHERE award_name=? AND award_year=?
                        → INSERT
```

ステップ3のガードが無いと、取得が失敗するたびに正常なデータが消える。

**既知のトレードオフ:** DELETE と INSERT の間に、受賞作品ページが一瞬空になる窓が開く。ローカル専用かつ管理者が意図して実行する操作であり、全消し→全入れは数百ms で終わるため許容する。トランザクションで閉じたい場合は RPC（`SECURITY INVOKER` + `SET search_path`）が必要になるが、現状の supabase-js 呼び出しでは複数文を跨げない。必要になった時点で追加する。

### 4-4. 同時実行の抑止

同じ `(award_name, award_year)` に対するジョブは、`pending` / `running` の間は1件までとする。**部分ユニークインデックスで DB 側に保証を置く。**

理由は洗い替えとの組み合わせ。同一キーのジョブが並走すると、片方の DELETE がもう片方の INSERT を消す。アプリ側のチェックだけでは競合に負ける。

```sql
CREATE UNIQUE INDEX uq_award_sync_jobs_active
  ON public.award_sync_jobs (award_name, award_year)
  WHERE status IN ('pending', 'running');
```

異なる賞・異なる年の並走は許可する（データ上は独立しており、ローカル単一利用者なので外部API負荷も問題にならない）。

### 4-5. サービス層の切り出し

`syncAwardMoviesService.ts:99-102` の `targetAwards` 決め打ちを直接書き換えるのではなく、**1賞ぶんの同期を `syncSingleAward()` として抽出**し、cron と手動の2つの呼び出し元から使う。

```
syncSingleAward(supabase, awardName, awardDef, year, { mode })
   ▲                                    ▲
   │                                    │
executeSyncAwardMoviesCron        executeManualAwardSync
  （月ベース判定・UPSERT）           （指定賞・洗い替え）
   = 挙動を一切変えない                = 新規
```

cron 側の挙動（月ベース判定・UPSERT・`?year=` のアカデミー賞決め打ち）は**変更しない**。日次で回っている同期を壊すリスクを取らないため。洗い替えセマンティクスは手動側にのみ入れる。

### 4-6. 権限

二層で守る。既存の admin 機能と同じ構造。

| 層 | 実装 | 役割 |
| --- | --- | --- |
| 画面 | `src/proxy.ts` の `ADMIN_REQUIRED_ROUTES` に `/admin/awards` を追加 | 入口の体裁。未認証→ログイン、権限不足→ホーム |
| API | `withAdminAuth` | **最終判定。** role は JWT ではなく毎回DBから読む |

`/api/*` は proxy の判定を素通りする（`src/proxy.ts:49-51`）ため、API 側の `withAdminAuth` が実質的な防御線。

### 4-7. レート制限

`admin_award_sync` をユーザー単位で掛ける。`ADMIN_ACCOUNT_ISSUE` と同じ理屈（admin セッションを奪われた場合の被害上限）に加え、**OpenAI の課金が実際に発生する**ため本機能ではより重要。

`RATE_LIMIT_ACTION` への追加と、DB 側 `chk_action_type` CHECK 制約への追加を**同じ PR で必ず両方行う**。片方だけだと 23514 で失敗して制限が無言で機能しなくなる（`src/constants/rateLimit.ts:62-69` に過去2回の事故として記録あり）。

---

## 5. 変更対象

### 5-1. DB（マイグレーション）

**`award_sync_jobs` テーブル**

| カラム | 型 | 備考 |
| --- | --- | --- |
| `id` | uuid PK | `gen_random_uuid()` |
| `award_name` | text NOT NULL | |
| `award_year` | int NOT NULL | |
| `status` | text NOT NULL | `pending`/`running`/`succeeded`/`failed` の CHECK |
| `requested_by` | uuid NOT NULL | `users(id)` 参照 |
| `total_upserted` | int | 成功時のみ |
| `error_message` | text | 失敗時のみ。取得0件もここに理由を入れる |
| `created_at` | timestamptz NOT NULL | `now()` |
| `started_at` | timestamptz | |
| `finished_at` | timestamptz | |

+ 4-4 の部分ユニークインデックス
+ `ENABLE ROW LEVEL SECURITY`
+ **GRANT は `service_role` のみ。** クライアントは必ず API 経由で触るため `anon` / `authenticated` には付与しない（`.claude/rules/supabase-db.md`）

**`chk_action_type` に `admin_award_sync` を追加**（別マイグレーション）

**型再生成:** `supabase gen types typescript --project-id <id> > src/types/database.types.ts`

### 5-2. アプリケーション

| 区分 | ファイル |
| --- | --- |
| API | `src/app/api/admin/awards/sync/route.ts`（POST）<br>`src/app/api/admin/awards/sync/[id]/route.ts`（GET）<br>`src/schema/awardSync.ts`（zod） |
| サービス | `src/lib/awards/syncAwardMoviesService.ts`（`syncSingleAward` 抽出）<br>`src/lib/awards/manualAwardSync.ts`（洗い替え + ジョブ更新）<br>`src/lib/awards/awardSyncJob.ts`（ジョブ CRUD） |
| 画面 | `src/app/admin/awards/page.tsx` / `loader.tsx`<br>`src/features/admin/awardsSyncPage/awardsSyncPage.tsx` / `.module.scss`<br>`src/features/admin/awardsSyncPage/hooks/useAwardSync.ts` |
| 定数 | `common.ts`（`ROUTES.ADMIN_AWARDS`、`ADMIN_REQUIRED_ROUTES`）<br>`rateLimit.ts`（`ADMIN_AWARD_SYNC`）<br>`awards.ts`（画面メッセージ、選択可能な賞）<br>`navigation.ts`（`MENU_LABELS`）<br>`apiEndpoints.ts` |

画面は `src/features/admin/accountsPage/accountsPage.tsx` に倣う（`React.memo` + `useCallback`、`@/components/ui/` の `Input`/`Button`/`Heading`、SCSS Modules、`robots: { index: false }`）。

賞の選択肢は `AWARD_DEFINITIONS` から `AWARDS_EXCLUDED` を除いて**動的に生成**する。定数を変えるだけで選択肢が追従し、画面側の改修が不要になる。

---

## 6. 次のサブプロジェクト（カンヌ・GGの取得ロジック）

本設計の対象外だが、調査で判明した事実を失わないよう記録する。

eiga.com に `https://eiga.com/award/<slug>/<year>/` という**全賞共通レイアウト**のページ群がある。

| 賞 | slug | 確認できた年 |
| --- | --- | --- |
| アカデミー賞 | `oscar` | 1929〜2026 |
| 日本アカデミー賞 | `japan-academy` | 2005〜2026 |
| カンヌ | `cannes` | 2000〜2026 |
| ゴールデングローブ | `golden-globe` | 2000〜2026 |
| ベルリン | `berlin` | 2025 確認 |
| ベネチア | `venice` | 2025 確認 |

```html
<div class="award-wrapper cannes">
  <h2><strong>作品賞</strong><span>BEST PICTURE</span></h2>
  <table>
    <tr class="prize">  <!-- 受賞 -->
      <th><a href="/movie/101587/">ANORA アノーラ</a></th> <td>&nbsp;</td>
    </tr>
    <tr>                <!-- ノミネート -->
      <th><a href="/movie/102150/">ブルータリスト</a></th> <td>&nbsp;</td>
    </tr>
  </table>
```

受賞/ノミネートが `tr` のクラスで、映画と人名が `/movie/` と `/person/` の href で機械的に判別できる。**OpenAI が不要になる**（ハルシネーション消滅・コストゼロ・分単位→数秒）。

実装時に効く差分:

- **カンヌだけ2階層** — `h2`=部門グループ、`h3`=部門。他は `h2` が直接部門。「審査員賞」「監督賞」はコンペ部門とある視点部門の両方に出るため、`h2` の文脈なしに区別できない
- **日本アカデミー賞は全行が `tr.prize`** — ノミネート行が無く、`優秀○○賞`（ノミネート相当）と `最優秀○○賞`（受賞）が別見出しで並ぶ
- **`th`/`td` の中身が部門で入れ替わる** — 作品賞系は `th`=映画、演技賞系は `th`=人名。位置ではなく href で判定する
- **一部の年が `/official/` へリダイレクトして旧レイアウトになる** — oscar 2010、cannes 2015 が該当。`award-wrapper` の有無で検知し「取得不可」として扱う
- **カンヌ2020は受賞ゼロが正常** — コロナで中止、出品作のみ。空振りをエラー扱いしない
- 見出しテキスト → `AWARD_DEFINITIONS` の `category.key` のマッピング表が賞ごとに必要

現行のアカデミー賞スクレイパが見ているのは別物（`EIGA_OSCAR_BASE_URL` = `https://eiga.com/official/oscar`、`nominate_ctb` を使う旧特集レイアウト）。動いているので今回も次回も触らない。

検証したのは **HTML 構造と件数まで**で、全部門・全年で正しく抽出できるかの実地検証は未実施。

---

## 7. テスト

`.claude/rules/testing.md` の観点チェックリストを照合した結果。

| 観点 | テスト内容 |
| --- | --- |
| 正常系 | 年+賞を指定 → 202 + jobId → ポーリング → succeeded、`award_movies` が入れ替わる |
| 入力バリデーション | 年が `AWARD_YEAR_RANGE` 外 / 年が未入力・非数値 / 賞キーが `AWARD_DEFINITIONS` に無い / `AWARDS_EXCLUDED` の賞を直接指定 |
| 認証・認可 | 未認証 → 401、ログイン済み非admin → 403、画面は proxy でリダイレクト |
| 空状態・0件 | 取得0件 → **既存データを消さない**、`failed` + 理由表示 |
| エラー応答 | 取得失敗・TMDb失敗・DB失敗 → `failed` に遷移し `error_message` が入る |
| 重複・競合 | 同一 `(賞, 年)` のジョブが実行中 → 二重起動を拒否。レート制限超過 → 429 |
| 状態保持・遷移 | ポーリング中にリロード → ジョブIDから進捗を復元。`running` が長時間続く場合の表示 |
| セキュリティ | 他ユーザーのジョブIDを指定しても admin 以外は参照不可 |
| アクセシビリティ | セレクト・入力のラベル紐付け、キーボードのみで実行完了、進捗の `aria-live` 通知 |

カバレッジは全指標 80% 以上を維持する。

---

## 8. 決定事項（2026-10-31 確定）

| 論点 | 決定 | 理由 |
| --- | --- | --- |
| サブプロジェクトの順序 | 管理画面を先、取得ロジックを後 | 画面が先にあると取得ロジックの検証が楽。依存は一方向 |
| 画面の入力項目 | 年 + 賞の選択 | 取得ロジック完了後も定数変更だけで追従できる |
| 実行方式 | 背景実行（ジョブテーブル + `after()` + ポーリング） | カンヌ/GG の分単位の待ちをブラウザに押し付けない |
| 既存データの扱い | 洗い替え（取得成功かつ1件以上のときのみ） | 手動再同期は「やり直し」が主目的。残留を残さない |
| 日本アカデミー賞 | 選択肢に出さない | `AWARDS_EXCLUDED` の意図を維持 |
| cron の `?year=` | 残す | 画面が使えない状況での逃げ道 |
| 取得ロジックのスコープ | 共通パーサでカンヌ・GGの2賞のみ | アカデミー賞の動いている経路を置き換えるリスクを取らない |
