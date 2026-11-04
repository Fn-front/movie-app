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

- `/admin/awards` 画面（年入力 + 賞セレクト + 実行 + 進捗表示 + 失効操作）
- `POST /api/admin/awards/sync`（起票）／ `GET /api/admin/awards/sync/[id]`（進捗取得）
- `award_sync_jobs` テーブルの追加
- 手動同期のみ **世代付き入れ替え** セマンティクス（cron は現行の UPSERT のまま）
- 選択可能な賞: アカデミー賞 / カンヌ / ゴールデングローブ
- OpenAI クライアントへの明示的なタイムアウト設定（4-8。実行時間の上界が決まらないと失効閾値を決められないため）

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

`src/proxy.ts:41-46` により、本番 Vercel は `/api/cron/*` 以外を 404 にしている。

```ts
if (process.env.VERCEL_ENV === 'production') {
  if (nextUrl.pathname.startsWith('/api/cron/')) return NextResponse.next();
  return new NextResponse(null, { status: 404 });
}
```

（厳密には `config.matcher` が `_next/static` 等を除外しているので「すべて404」ではないが、画面と API はすべて封鎖される。）

したがって本機能は `/admin/accounts` と同様 **ローカル（`npm run dev`）専用**。これは設計上2つの意味を持つ。

- **`maxDuration = 300` の制約は掛からない。** あれは Vercel サーバーレスの制限であり、ローカルの長命 Node プロセスには適用されない（Next.js 同梱ドキュメント `maxDuration.md` も「Deployment platforms *can use*」とプラットフォーム側の機能と明記）
- 背景実行を選ぶ理由は **UX のみ**（数分間ブラウザを固めない、進捗が見える、リロードしても追える）。タイムアウト回避ではない

**`next dev` は単一プロセス**で動く（`next/dist/server/lib/router-server.js` が同一プロセス内 require。fork していない）。そのため `after()` のコールバックが別プロセスへ渡ることは無く、4-4 の直列化は成立する。裏返すと **`npm run dev` を再起動すれば走行中のジョブは必ず死ぬ**。孤児ジョブは「まれな異常」ではなく**日常**として扱う。

### 3-2. 賞ごとに所要時間の桁が違う

| 賞 | 取得経路 | 外部API呼び出し |
| --- | --- | --- |
| アカデミー賞 | eiga.com（`fetchEigaOscarAwards`） | HTTP 5ページ。**0件ならWikipedia+OpenAIへフォールバック**（6部門 = 最大18回） |
| カンヌ | Wikipedia + OpenAI | Wikipedia 1回 + OpenAI 8回（部門数）〜最大24回 |
| ゴールデングローブ | Wikipedia + OpenAI | Wikipedia 1回 + OpenAI 9回（部門数）〜最大27回 |

> **この表は設計当時のもの。現在は §6 の結論のとおりカンヌ・GG とも OpenAI を使わず、いずれも数秒で終わる。**

補足（レビューで訂正した点）:

- OpenAI は**部門ごとに記事全文を送り直す**（`buildUserPrompt`）ため、部門数ぶん呼ぶ
- `AWARDS_MAX_RETRIES = 3` のリトライは**0件のときだけでなく、API呼び出し自体が失敗したときにも発火する**。`fetchAwardsFromOpenAI` はキー未設定・API例外・レスポンス形式不正・zod検証失敗のいずれでも `null` を返すため（`generateAwardMovies.ts:196-199, 253, 262, 269, 275`）。OpenAI が不調な状況では全部門が3回ずつ空振りし、**部門数×3 回を必ず消費する**
- TMDb 解決（`resolveAwardsWithTMDb`）は作品1件につき **1〜6回、典型2回**（邦題+年で一発ヒット = 検索1 + キーワード1）。TMDb は高速（50req/s）なので所要時間の支配要因にはならない
- アカデミー賞の「数秒」は eiga.com が取れた場合に限る。フォールバックすると OpenAI 経路になる

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
        │  ジョブ起票 status=running, started_at=now()
        │     └ 23505 なら 409（既にアクティブなジョブがある）
        │
        ├─ 202 + { jobId } を即返す
        │
        └─ after() で継続実行（全書き込みを status='running' 条件付きで行う）
             取得 → TMDb解決 → 世代付き入れ替え
             status=succeeded | failed

[画面] GET /api/admin/awards/sync/[id] を一定間隔でポーリング
        終端状態（succeeded/failed）で停止
```

`after()` は `next/server` から。`src/app/api/favorites/route.ts:7` に既存の使用例がある。

**ただし favorites とは責任が違う。** favorites の `after()` は失敗しても誰も困らない（レコメンド生成）。本機能は**失敗を DB に書き戻さないと孤児になる**。Next は `after()` の例外を握り潰してログに出すだけなので（`next/dist/server/after/after-context.js` の `catch (error) { this.reportTaskError(...) }`）、**コールバック全体を try/catch/finally で包んで必ず終端状態を書く責任はアプリ側にある**。favorites にその構造は無いので、パターンとして引き写さないこと。

### 4-2. ステータスと孤児ジョブ

```
running ──┬──▶ succeeded
          └──▶ failed
```

**`pending` を持たない。** POST の INSERT 時点で `status='running', started_at=now()` にする。同一リクエストが即 `after()` を予約するので `pending` の滞在は本来ミリ秒しかなく、状態として持つ利益が無い。むしろ有害で、`pending` は `started_at` が NULL のため**経過時間で失効判定できず、孤児になったとき出口が無くなる**（`after()` が `running` への UPDATE に到達する前に投げるとこれが起きる）。

**孤児ジョブの扱い:** DB 側で自動的に `failed` へ倒す仕組みは入れない。実際にはまだ動いている処理を失敗扱いにしてしまうため。ただし 4-4 の抑止と組み合わさると、孤児が残った時点で**新しいジョブを起票できなくなり機能全体が詰む**。自動失効を入れない以上、人が解ける出口を必ず用意する。

- アクティブなジョブがある間、POST は**常に 409**（4-4）。409 のボディに実行中ジョブの `id` / `award_name` / `award_year` / `started_at` を含める
- `started_at` から `AWARD_SYNC_STALE_MINUTES` を超えている場合のみ、画面に「**強制的に失敗として閉じて再実行**」を出す。閾値未満では出さない（走っている処理を誤って切らせないため）
- 強制操作は明示フラグ付きで再 POST され、旧ジョブを `failed`（`error_message` に失効の旨）にしてから新規を起票する

**強制失効は走行中のプロセスを止めない。** 旧ジョブを `failed` にした瞬間、部分ユニークインデックスの述語から外れて保護が消えるため、**旧プロセスと新プロセスが同じ賞・年に並走しうる**。これを防ぐため:

- `after()` 側の DB 書き込みはすべて `WHERE id = ? AND status = 'running'` を条件に付ける。0行更新なら失効させられたと判断し、以降の取得・書き込みを中止する（**失効の自己検知**）
- 画面の強制操作には「実行中の処理自体は止まりません（OpenAI の課金は続きます）」と明記する

### 4-3. 世代付き入れ替え（洗い替え）

手動同期は「データがおかしいからやり直す」場面が主なので、残留レコードを残さない。ただし **DELETE → INSERT の順にしてはいけない。**

supabase-js の DELETE と INSERT は別々の文でそれぞれ自動コミットされる。DELETE がコミットした後に INSERT が失敗すると、**その賞・年のデータは消えたまま復旧しない**（検証で再現済み: `before 2件 → INSERT失敗 → 0件`）。しかも高確率で起きる。cron 側は `syncAwardMoviesService.ts:181-188` で UPSERT 前に明示的に dedup している＝**重複は実際に出る**。プレーン INSERT は多行まとめて1文なので、1行でも一意制約（`uq_award_movies_entry`）に当たれば**全ロールバック**になる。

**順序を逆にする。** `award_movies` には既に `generated_at` があるので、世代で区別できる。

```
1. 取得（eiga.com or Wikipedia+OpenAI）
2. TMDb 解決
3. resolved.length === 0 → 既存に触れず failed で終了
4. dedup（cron と同じロジックを共有）
5. UPSERT（onConflict: tmdb_movie_id,award_name,award_year,category）
     ├ 今回取得できた行には新しい generated_at が入る
     └ 失敗したら ここで終了。既存データは無傷
6. DELETE WHERE award_name = ? AND award_year = ? AND category IN (削除可能な部門)
                AND generated_at < 今回の値
     └ 今回取得できなかった残留だけが消える
```

**削除範囲は部門単位で絞る（#946）。** ステップ3のガードは「全体が0件」しか見ないため、*部分*取得を素通しする。`fetchEigaOscarAwards` は取得に失敗したページを飛ばして残りを返し、`resolveAwardsWithTMDb` は TMDb が落ちた作品だけを黙って落とす（リトライ対象は 429/503/504 のみ）。賞・年まるごと消すと、取れなかったぶんの既存行が失われる。

`fetchAndResolveAward` が返す `deletableCategories`（＝今回行が取れた部門から、取りこぼしが出た部門を引いたもの）だけを削除対象にする。削除処理自体は cron と手動同期で `deleteStaleAwardRows` を共有する。

これで得られる性質:

- **データが空になる窓が開かない**（常に旧世代か新世代のどちらかが存在する）
- **UPSERT が失敗しても既存が残る**（DELETE に到達しない）
- **重複は `onConflict` が吸収する**ので、dedup 漏れが全損に直結しない
- 残留を消すという本来の目的は果たせる

ステップ3のガード（取得0件なら何もしない）も必須。これが無いと、取得が失敗するたびに「0件で UPSERT → 全部 DELETE」になる。

**副作用として解消されるもの:** 空の窓が無くなるので、`get_award_years()` から年が一時的に消える問題も起きない。

**残る注意点:** `/api/awards` は `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`（`src/constants/api.ts:54`）を返す。ローカルに共有キャッシュは無いが、`public` かつ `max-age` 無しはブラウザのヒューリスティックキャッシュ対象になりうる。**同期成功直後に受賞作品ページが古いままだと、管理者が「直っていない」と誤判断して再実行する。** 画面に「反映の確認はスーパーリロードで」と出すか、検証用リンクにキャッシュバスターを付けるかを実装時に決める。

### 4-4. 同時実行の抑止

アクティブなジョブ（`running`）は**全体で1件まで**とする。賞・年が異なっても並走させない。部分ユニークインデックスで DB 側に保証を置く。

```sql
CREATE UNIQUE INDEX uq_award_sync_jobs_active
  ON public.award_sync_jobs ((true))
  WHERE status = 'running';
```

定数式に対する一意制約なので、条件に合う行が同時に2つ存在できない。`true` は定数なので immutability 要件を満たす。PostgreSQL 16 で実測し、2件目の INSERT が 23505 で拒否されること・終端状態は何件でも共存することを確認済み。

**なぜ同一キーを弾くだけでは不足するか。** 4-3 の入れ替えが UPSERT と DELETE の2文に分かれるため、同じ賞・年が並走すると片方の DELETE が他方の UPSERT 結果を消す（`generated_at` 比較が噛み合わない）。アプリ側の事前チェックは競合に負けるので DB 側に置く。

**なぜ全体で1件に絞るか。** 運用上、年は1件ずつ投入する想定で確定した。並走を許す実益が無い一方、直列を不変条件にすると TMDb の食い合いと dev サーバー（`after()` は dev サーバーと同じプロセスで動く）の負荷を検討対象から外せる。誤って連投したときに1件ずつしか走らないので、気づいて止める余地も残る。

**直列化しても総コストは下がらない**（同じ回数を順に呼ぶだけ）。得られるのは負荷の平準化と事故時の被害抑制であって、OpenAI の課金削減ではない。

**23505 を 409 にマップする。** POST は「アクティブ有無チェック → INSERT」の2段になるため、その隙に別リクエストが INSERT すると 23505 になる。強制失効も「UPDATE → INSERT」の2文なので同じ。既存ヘルパー `isUniqueViolation`（`src/helpers/apiHelpers.ts:63`）と `conflictResponse`（同 `:75`）をそのまま使う。`src/app/api/favorites/route.ts:165-169` が同じ構造で使っている。

**このインデックスは cron を管轄しない。** `award_sync_jobs` に行を作るのは手動ジョブだけ。一方 Vercel cron は本番で同じ Supabase を触る（`vercel.json`: `0 18 28 * *`）。3月28日に cron が academy_awards を UPSERT している最中にローカルで同じ賞・年を同期すると、インデックスは何も防がない。「直列が不変条件」なのは**手動ジョブ同士に限った話**。確率は低いが、そう理解して扱う。

⚠️ **#946 以降、この競合は双方向になった。** cron も旧世代を削除するようになったため、「手動の DELETE が cron の UPSERT を消す」だけでなく「cron の DELETE が手動の UPSERT を消す」も起きうる。手動が `T1` に開始してフェッチ中、cron が `T2 (> T1)` で開始 → cron が先に UPSERT → 手動が UPSERT（行が `T1` に戻る）→ cron が `generated_at < T2` で DELETE → その行が消える。手動側は `succeeded` を返すため画面上は成功に見える。該当するのは3月28日のアカデミー賞だけで、起きても再同期で直る。

キュー（終端待ちを積んで順に消化する方式）は採用しない。複数年の一括投入が要件から外れたため、チェーン実行と停止したキューを拾う仕組みに見合う価値が無い。2件目は 409 で拒否する。

### 4-5. サービス層の切り出し

`syncAwardMoviesService.ts:99-102` の `targetAwards` 決め打ちを直接書き換えるのではなく、**1賞ぶんの同期を `syncSingleAward()` として抽出**し、cron と手動の2つの呼び出し元から使う。

```
syncSingleAward(supabase, { awardName, awardDef, year, generatedAt })
   ▲                                    ▲
   │                                    │
executeSyncAwardMoviesCron        executeManualAwardSync
  （月ベース判定・UPSERT）           （指定賞・世代付き入れ替え）
   = 挙動を一切変えない                = 新規
```

抽出対象は `syncAwardMoviesService.ts:121-208` のループ本体。設計上決めておくべき点が3つある。

1. **`generatedAt` は引数で渡す。** 現行はループ外で1回だけ計算される（`:94`）。関数内で `new Date()` すると cron の `generated_at` が賞ごとにずれ、「挙動を一切変えない」が崩れる。4-3 の DELETE 条件もこの値を基準にする
2. **戻り値で4つの結果を区別する。** 現行ループは「取得0件」「TMDb解決0件」「UPSERTエラー」「例外」を**すべて `skippedAwards.push()` に潰して** `continue` している（`:149, :158, :198, :206`）。cron はそれで足りるが、手動側は 4-3 のステップ3（取得0件なら既存に触らない）と `error_message` の出し分けのため4つの区別が要る。判別可能な結果型を返し、cron 側はそれを従来どおり `skippedAwards` に潰す
3. **try/catch は `syncSingleAward` の外に出す。** 中に残すと手動側が例外を `error_message` に書けない。外に出したうえで、cron 側の呼び出しループで握り潰して「エラーでも他の賞は続行」を維持する

既存テスト（`syncAwardMoviesService.test.ts` 全16ケース）は `executeSyncAwardMoviesCron` 越しに検証しているため、内部を関数に割っても回帰検知の網は残る。

**dedup（`:181-188`）は `syncSingleAward` 側に寄せて両経路で共有する。** 重複が実際に出ることは cron 側の実装が証明しており、手動側で落とすと 4-3 の UPSERT で一意制約に当たる。

### 4-6. 権限

二層で守る。既存の admin 機能と同じ構造。

| 層 | 実装 | 役割 |
| --- | --- | --- |
| 画面 | `src/proxy.ts` の `ADMIN_REQUIRED_ROUTES` に `/admin/awards` を追加 | 入口の体裁。未認証→ログイン、権限不足→ホーム |
| API | `withAdminAuth` | **最終判定。** role は JWT ではなく毎回DBから読む |

`/api/*` は proxy の判定を素通りする（`src/proxy.ts:49-51`）ため、API 側の `withAdminAuth` が実質的な防御線。`withAdminAuth` のシグネチャはメソッド非依存で、動的ルート `[id]` でも使える（`src/app/api/admin/accounts/[id]/reissue/route.ts:38,52` に実績あり。`params` が型上 optional なので non-null assertion が要る点も同じ）。

**強制失効は監査ログに記録する。** 他 admin の実行中ジョブを潰せる操作なので、`admin_audit_logs`（append-only 化済み: `20261030101000_make_admin_audit_logs_append_only.sql`）に残す。アカウント再発行が `recordReissueAudit`（`src/lib/auth/adminAccount.ts:187-198`）で記録しているのと揃える。

### 4-7. レスポンス形式とレート制限

**統一エラーレスポンス形式**（`.claude/rules/api-route.md`）に従う。`{ success, error: { code, message } }` と `ERROR_CODE` の割り当ては既存パターンに倣う。

| 状況 | ステータス | コード |
| --- | --- | --- |
| 正常起票 | 202 | — （`{ success: true, data: { jobId } }`） |
| 入力不正 | 400 | `VALIDATION_ERROR`（`parseAndValidate`） |
| 未認証 | 401 | `withAdminAuth` が返す |
| 権限不足 | 403 | `withAdminAuth` が返す |
| アクティブなジョブあり | 409 | `ERROR_CODE.CONFLICT` / `HTTP_STATUS.CONFLICT`（`src/constants/api.ts:42,84`）。`conflictResponse` を使う |
| レート制限超過 | 429 | `rateLimitExceededResponse`（`src/helpers/apiHelpers.ts`） |

admin 系なので `CACHE_CONTROL.PRIVATE_NO_STORE` を付ける（`src/app/api/admin/accounts/route.ts` と同じ）。**ポーリング GET では特に必須。**

**レート制限は POST と GET の両方に要る。**

- **POST**: `admin_award_sync`（ユーザー単位）。`ADMIN_ACCOUNT_ISSUE` と同じ理屈（admin セッション奪取時の被害上限）に加え、**OpenAI の課金が実際に発生する**ため本機能ではより重要。`maxAttempts` / `windowMinutes` の具体値を定数に置く
- **GET**: ポーリングで最も多く叩かれる。一定間隔で数分〜数十分ポーリングすると1ジョブ数百回に達するため、既存の読み取り系カウンタに相乗りさせると即枯れる。**専用アクションを切るか、対象外にするかを実装時に決め、上限値とポーリング間隔を定数で揃える**

`FAIL_CLOSED_ACTIONS`（`src/constants/rateLimit.ts:113`）には**入れない**。認証・本人確認に関わるアクションではないため。課金を伴う操作ではあるが、DB 不調時に admin 自身の復旧手段まで塞ぐ不利益のほうが大きい。

`RATE_LIMIT_ACTION` への追加と、DB 側 `chk_action_type` CHECK 制約への追加は**同じ PR で必ず両方行う**。片方だけだと 23514 で失敗して制限が無言で機能しなくなる（`src/constants/rateLimit.ts:62-69` に #546 / #659 の2度の事故として記録あり）。

### 4-8. OpenAI クライアントのタイムアウト設定

`createOpenAIClient()` はオプション無しでクライアントを作っている（`src/lib/openai/client.ts:22`）。openai SDK の既定値は **`DEFAULT_TIMEOUT = 600000`（10分）・`maxRetries = 2`**。つまり `fetchAwardsFromOpenAI` 1回が最大30分ブロックしうる。さらに外側で `AWARDS_MAX_RETRIES = 3` が回り、GG は9部門ある。

このままでは **4-2 の失効閾値を決める根拠が無い**（正常に走っている処理が平然と15分を超えるので、「閾値未満なら強制操作を出さない」というガードが機能しない）。

したがって本機能では**先に実行時間の上界を確定させる**。

1. `createOpenAIClient()` に明示的な `timeout` / `maxRetries` を設定する
2. 上界 = 部門数 × 外側リトライ × (timeout × (maxRetries + 1)) から `AWARD_SYNC_STALE_MINUTES` を導く
3. 両方を `src/constants/` に定数として置き、関係をコメントで残す

cron も同じクライアントを使うため、設定値は cron の実行時間にも影響する。cron 側が現状どれだけ掛かっているかを確認したうえで決めること。

---

## 5. 変更対象

### 5-1. DB（マイグレーション）

**`award_sync_jobs` テーブル**

| カラム | 型 | 備考 |
| --- | --- | --- |
| `id` | uuid PK | `gen_random_uuid()` |
| `award_name` | text NOT NULL | |
| `award_year` | int NOT NULL | |
| `status` | text NOT NULL | `running`/`succeeded`/`failed` の CHECK |
| `requested_by` | uuid NOT NULL | `users(id)` 参照。**`ON DELETE` を明示する**（先例 `admin_audit_logs` は RESTRICT/CASCADE を明示）。admin 削除時にジョブ履歴をどうするかを決めて書く |
| `total_upserted` | int | 成功時のみ |
| `error_message` | text | 失敗時のみ。取得0件もここに理由を入れる |
| `created_at` | timestamptz NOT NULL | `now()` |
| `started_at` | timestamptz NOT NULL | INSERT 時に `now()`（4-2 で `pending` を廃したため NOT NULL） |
| `finished_at` | timestamptz | |

+ 4-4 の部分ユニークインデックス
+ `ENABLE ROW LEVEL SECURITY`。**ポリシーは置かない。** service_role は RLS をバイパスし、anon/authenticated は GRANT が無いので到達しない。NextAuth 環境では `auth.uid()` が常に NULL なので `auth.uid()` ベースのポリシーは無意味な行が残るだけになる。**その旨をマイグレーションのコメントに書く**（`/db-schema` skill の「RLS必須」だけを見た実装者が無用なポリシーを足すのを防ぐ）
+ 論理削除（`deleted_at`）は持たせない。`admin_audit_logs` と同じ扱い

**GRANT**

```sql
REVOKE ALL ON public.award_sync_jobs FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.award_sync_jobs TO service_role;
```

`service_role` のみでよい根拠は `.claude/rules/supabase-db.md` の一般則ではなく、`supabase/migrations/20261018053616_declare_table_grants.sql` にある。**本アプリは NextAuth を使い Supabase Auth を使わないため `auth.uid()` が常に NULL で、`authenticated` は出番が無い。** 同ファイルが `ALTER DEFAULT PRIVILEGES ... REVOKE ALL ON TABLES FROM anon, authenticated` で既定も閉じているが、「既定権限は環境差で効かない場合があり、意図も読み取れない」ため `REVOKE` を明示する（先例 `20261030100000_add_users_username.sql`）。

`DELETE` は付けない（ジョブ履歴を消さないため）。

**`chk_action_type` に `admin_award_sync`（+ ポーリング用アクションを切る場合はそれも）を追加**（別マイグレーション）

**運用:** `supabase migration new <name>` で作成し `npx supabase db push` で適用。「リモートにあるがローカルに無い」で拒否されても **`supabase migration repair --status reverted` は実行しない**（`.claude/rules/supabase-db.md` の ⛔ 節。安全な回避手順もそこにある）。

**型再生成:** `supabase gen types typescript --project-id <id> > src/types/database.types.ts`

### 5-2. アプリケーション

| 区分 | ファイル |
| --- | --- |
| API | `src/app/api/admin/awards/sync/route.ts`（POST）<br>`src/app/api/admin/awards/sync/[id]/route.ts`（GET）<br>`src/schema/awardSync.ts`（zod） |
| サービス | `src/lib/awards/syncAwardMoviesService.ts`（`syncSingleAward` 抽出 + dedup 共有）<br>`src/lib/awards/manualAwardSync.ts`（世代付き入れ替え + ジョブ更新）<br>`src/lib/awards/awardSyncJob.ts`（ジョブ CRUD。全書き込みに `status='running'` 条件） |
| 既存改修 | `src/lib/openai/client.ts`（4-8 のタイムアウト設定） |
| 画面 | `src/app/admin/awards/page.tsx` / `loader.tsx`<br>`src/features/admin/awardsSyncPage/awardsSyncPage.tsx` / `.module.scss`<br>`src/features/admin/awardsSyncPage/hooks/useAwardSync.ts` |
| 定数 | `common.ts`（`ROUTES.ADMIN_AWARDS`、`ADMIN_REQUIRED_ROUTES`）<br>`rateLimit.ts`（`ADMIN_AWARD_SYNC` と上限値）<br>`awards.ts`（画面メッセージ、選択可能な賞、`AWARD_SYNC_STALE_MINUTES`、ポーリング間隔、OpenAI タイムアウト関連）<br>`navigation.ts`（`MENU_LABELS`）<br>`apiEndpoints.ts` |

**画面の実装方針**（`.claude/rules/` 準拠）

- `src/features/admin/accountsPage/accountsPage.tsx` に倣う。`React.memo` + `useCallback`、`memo(function Xxx ...)` の名前付き関数で `displayName` を満たす
- **賞セレクトは既存の `src/components/ui/select/select.tsx` を使う**（`@radix-ui/react-select` ベース。`label`/`options`/`onValueChange`/`error` 対応）。独自 `<select>` を作らない
- クラス名結合は `cn()`（`@/utils/cn`）。ステータスでクラスを出し分けるため必ず該当する
- SCSS Modules。**デザインシステム変数を使う**（`.claude/documents/design-system.md`。カラー・スペーシングのハードコード禁止）。進捗表現の**アニメーションは opacity / transform に収める**
- `robots: { index: false, follow: false }`
- 賞の選択肢は `AWARD_DEFINITIONS` から `AWARDS_EXCLUDED` を除いて生成するが、**`src/constants/awards.ts` のモジュールスコープで1度だけ**作る（毎レンダー再計算しない）

**`useAwardSync` の責務**（`.claude/rules/custom-hook.md`）

- ポーリングの開始・停止。終端状態で停止、**アンマウント時に必ず `clearInterval`**、多重起動防止、連続失敗時の打ち切り
- ジョブIDの持ち回り。「全体で1件」なので**最新ジョブを返す API** が素直（localStorage や URL クエリより状態がずれにくい）
- 409 のボディから実行中ジョブ情報を取り出し、`started_at` と閾値を比較して強制操作の出し分けを決める

---

## 6. カンヌ・GGの取得ロジック（実装済み）

> **結論（2026-11-03 追記）**
>
> | 賞 | 採用した取得元 | 実装 |
> | --- | --- | --- |
> | アカデミー賞 | eiga.com（`/official/oscar` の旧レイアウト） | `fetchEigaOscarAwards.ts` |
> | ゴールデングローブ賞 | **eiga.com**（`/award/golden-globe`） | `fetchEigaGoldenGlobes.ts`（#924） |
> | カンヌ | **Wikipedia wikitext** | `parseCannesAwards.ts`（#921） |
>
> **OpenAI を通る賞は無くなった。** 残っているのはアカデミー賞が eiga.com の
> 取得に失敗したときのフォールバックのみ。
>
> カンヌを Wikipedia にしたのは §6-2 のとおり eiga.com が不利なため。GG は
> 一度 Wikipedia で実装した（#919）が、日本語Wikipediaの記事自体にノミネートの
> 欠落と誤リンクがあり、eiga.com へ移した（#924）。本節の調査は当時から
> 存在したのに参照されていなかった。
>
> 以下の調査結果には**実測で判明した訂正**がある。6-1 を参照。

以下は調査当時の記録。**レビューで実測し直した値**で、初版に書いた範囲は過小だった。

eiga.com に `<EIGA_AWARD_BASE_URL>/<slug>/<year>/` という全賞共通レイアウトのページ群がある（実URLは env。6-3 の注意を参照）。

| 賞 | slug | 取得できる年 | `/official/` へ飛ぶ年（旧レイアウト） |
| --- | --- | --- | --- |
| アカデミー賞 | `oscar` | 1928〜2026 | **2008〜2024（17年）** |
| 日本アカデミー賞 | `japan-academy` | 1978〜2026 | なし |
| カンヌ | `cannes` | 1946〜2026 | **2012〜2016（5年）** |
| ゴールデングローブ | `golden-globe` | 1944〜2026 | なし |
| ベルリン | `berlin` | 1951〜 | 未調査 |
| ベネチア | `venice` | 1946〜 | 未調査 |

いずれも各賞の第1回から最新回まで揃っている。上限はどれも2026で、2027は404。

### 6-1. oscar / golden-globe の構造（素直に取れる）

```html
<div class="award-wrapper cannes">
  <h2><strong>作品賞</strong><span>BEST PICTURE</span></h2>
  <table class="_a">
    <tr class="prize">  <!-- 受賞 -->
      <th><a href="/movie/101587/">ANORA アノーラ</a></th> <td>&nbsp;</td>
    </tr>
    <tr>                <!-- ノミネート -->
      <th><a href="/movie/102150/">ブルータリスト</a></th> <td>&nbsp;</td>
    </tr>
  </table>
```

- `tr.prize` = 受賞 / 素の `<tr>` = ノミネート が**成立する**
- `/movie/` と `/person/` の href で機械的に判別できる（リンク欠落はほぼ0%）
- 補助シグナル: `th` が映画のテーブルは `<table class="_a">`、`th` が人名のテーブルは素の `<table>`（oscar/GG で一貫）
- **OpenAI が不要になる**（ハルシネーション消滅・コストゼロ・分単位→数秒）

**実装時の訂正（#924）。この調査で見落としていた点が2つある。**

1. **`tr.prize` は100%付かない。** 第72回（2015年）の最優秀主演女優賞（コメディ／ミュージカル）は、実際の受賞者（エイミー・アダムス『ビッグ・アイズ』）がいるのに `prize` クラスが無い。14部門中1部門。本節の調査は「受賞行数」の件数しか見ておらず、**受賞0件の部門があることを検出できていなかった**。受賞0件でもノミネートとして取り込み、件数を警告に出す実装にしている
2. **部門名は完全一致で引けない。** 括弧内の語順が年で入れ替わる。

   ```
   2025年: 最優秀作品賞（ミュージカル／コメディ）  Best Motion Picture - Musical Or Comedy
   2015年: 最優秀作品賞（コメディ／ミュージカル）  Best Motion Picture - Comedy Or Musical
   ```

   日本語・英語とも入れ替わるため、括弧を除いた基本名と括弧内のキーワードで判定する

**`class="award-wrapper cannes"` の `cannes` は全賞共通のリテラル**で、カンヌ固有ではない。賞の識別には使えない。

### 6-2. カンヌは別物（ここが難所）

初版で「全賞共通」と書いたが、カンヌだけ構造が違う。

- **テーブルが2種類に分かれる。** `h2` 直下に `<table class="list-all"><caption>出品作品</caption>` があり、ここの行はすべて素の `<tr>`。これは**部門別ノミネートではなく、セクション全体の出品作品リスト**。受賞は `h3` ごとに別テーブル `<table class="prize">` が立ち、中身は `tr.prize` のみ。**「素の `<tr>` = ノミネート」は成立しない**（部門別ノミネートという概念が無い）
- **href 判別が3割前後で破綻する。** 日本未公開作品はリンクが無い素テキストで入る

  | ページ | 受賞行数 | `/movie/` リンク無し |
  | --- | --- | --- |
  | cannes/2025 | 17 | **5（29%）** |
  | cannes/2024 | 18 | **6（33%）** |
  | cannes/2005 | 12 | **4（33%）** |
  | golden-globe（2025/2019/2005） | 15/14/13 | **0** |

  例: `<th scope="row"> La Misteriosa Mirada del Flamenco </th> <td> ディエゴ・セスペデス </td>`（両セルともリンク無し）
- **2階層。** `h2` = コンペティション部門 / ある視点部門 / カメラドール、`h3` = 部門。「審査員賞」「監督賞」「男優賞」「女優賞」「脚本賞」が両部門に重複するため `h2` の文脈が要る。ただし「カメラドール（新人監督賞）」は `h2` でありながら配下に `h3` を持つので、「h2 = 必ず部門グループ」とも言い切れない
- **2012〜2016 の5年が取得不可**（`/official/` の旧レイアウト）

**したがって②では、GG は想定どおり素直に実装できるが、カンヌは素テキスト行の TMDb 解決フォールバックを別途設計する必要がある。** 着手時に改めて設計する。

### 6-3. その他の差分

- 英語部門名の markup が違う。oscar / golden-globe は `<span>` で囲む、cannes / berlin / venice は `</strong>` 直後の裸テキスト、japan-academy は英語名が無い
- 日本アカデミー賞は全行が `tr.prize`（ノミネート行が無く、`優秀○○賞`＝ノミネート相当 / `最優秀○○賞`＝受賞 が別見出しで並ぶ）
- `th`/`td` の中身は部門で入れ替わる（作品賞系は `th`=映画、演技賞系は `th`=人名）
- カンヌ2020は受賞ゼロが正常（コロナで中止、出品作56行のみ）。空振りをエラー扱いしない
- 見出しテキスト → `AWARD_DEFINITIONS` の `category.key` のマッピング表が賞ごとに必要

現行のアカデミー賞スクレイパが見ているのは別物（`EIGA_OSCAR_BASE_URL` は `getRequiredEnv` で読む必須 env。旧レイアウトの特集ページで `nominate_ctb` を含むことを実測確認）。動いているので触らない。GG が使う `/award/<slug>/<year>/` はパスが違うため、`EIGA_AWARD_BASE_URL` を別に持つ。

⚠️ 実URLをこのドキュメントに書かないこと（`.claude/documents/environment-variables.md` の方針）。初版はここに実URLを書いてしまっていた。

検証したのは **HTML 構造と件数まで**で、全部門・全年で正しく抽出できるかの実地検証は未実施。

---

## 7. テスト

`.claude/rules/testing.md` の観点チェックリストを照合した結果。

| 観点 | テスト内容 |
| --- | --- |
| 正常系 | 年+賞を指定 → 202 + jobId → ポーリング → succeeded、`award_movies` が入れ替わる |
| 入力バリデーション | 年が範囲外 / 未入力・非数値 / 賞キーが `AWARD_DEFINITIONS` に無い / `AWARDS_EXCLUDED` の賞を直接指定 / `[id]` が UUID でない |
| 認証・認可 | 未認証 → 401、ログイン済み非admin → 403、画面は proxy でリダイレクト |
| 空状態・0件表示 | ジョブ履歴が無い初回表示（`EmptyState` の出し分け） |
| 期限切れ・試行上限 | `started_at` が閾値未満 → 強制操作を出さない。超過 → 出す。強制フラグ付き再POST → 旧ジョブが `failed` になり新規が起票される。レート制限超過 → 429 |
| エラー応答 | 取得0件 → **既存データを消さない**、`failed` + 理由。TMDb失敗・DB失敗 → `failed` に遷移し `error_message` が入る。**UPSERT 失敗時に DELETE へ進まない**（4-3 の肝） |
| 重複・競合 | アクティブなジョブがある状態で起票 → 409（賞・年が違っても拒否）。23505 が 500 ではなく 409 になる。**失効済みジョブの `after()` が書き込みを中止する**（4-2 の自己検知） |
| 状態保持・遷移 | ポーリング中にリロード → 進捗を復元。未認証で `/admin/awards` → サインイン → `callbackUrl` で元画面に戻る |
| セキュリティ | admin 以外は他人のジョブを参照できない。`error_message` を画面表示する際に外部APIのレスポンス文字列・URL・キーが漏れないサニタイズ |
| レスポンシブ / a11y | SP ドロワーからの導線（`MENU_LABELS` を触るため必須）、ラベル紐付け、キーボードのみで実行完了、進捗の `aria-live` 通知 |

**テスト手法**（規約の必須事項）: テストファイルは対象と同じディレクトリに `<filename>.test.ts(x)`。アクセシビリティ優先クエリ（`getByRole` / `getByLabelText`）。ユーザーイベントは `@testing-library/user-event`。5-2 の新規ファイル（API 2本 / `manualAwardSync` / `awardSyncJob` / `useAwardSync` / `awardsSyncPage`）すべてに対応するテストを作る。

**退行テスト**: 4-5 の `syncSingleAward` 抽出は cron 側のリファクタ。既存 `syncAwardMoviesService.test.ts`（16ケース）が通ることを完了条件にし、`generated_at` が賞をまたいで同一であることを明示的に検証するケースを足す。

カバレッジは全指標 80% 以上を維持する。

### 7-1. E2E は外部APIをモックする

`.github/workflows/e2e.yml` の `run-e2e-tests` の `env:` に **`OPENAI_API_KEY` が無い**。カンヌ/GG の同期は CI で実行できない。アカデミー賞も eiga.com への実 HTTP（外部依存・不安定）。

したがって E2E は **Playwright の `page.route` で外部通信をモックするか、ジョブ行を直接 DB 投入して画面側だけを検証する**方針を取る。検証対象は進捗表示・409・強制失効・SP/PC の導線。

この方針なら `e2e.yml` にシークレット追加は不要。**追加する場合は Dependabot 側のストアにも同じ値を登録すること**（`.claude/rules/ci-secrets.md`。忘れると依存更新PRだけ E2E が落ちる）。

---

## 8. 決定事項（2026-10-31 確定）

| 論点 | 決定 | 理由 |
| --- | --- | --- |
| サブプロジェクトの順序 | 管理画面を先、取得ロジックを後 | 画面が先にあると取得ロジックの検証が楽。依存は一方向 |
| 画面の入力項目 | 年 + 賞の選択 | 取得ロジック完了後も定数変更だけで追従できる |
| 実行方式 | 背景実行（ジョブテーブル + `after()` + ポーリング） | カンヌ/GG の分単位の待ちをブラウザに押し付けない |
| 既存データの扱い | **UPSERT → 旧世代 DELETE**（`generated_at` 基準） | DELETE→INSERT は INSERT 失敗時に恒久的全損になる。順序を逆にすると窓も全損も消える |
| 投入単位 | 年を1件ずつ | 複数年の一括投入は要件から外れた。キュー方式を採らない根拠 |
| 同時実行 | アクティブなジョブは全体で1件 | 投入単位が1件ずつなら並走を許す実益が無く、直列を不変条件にできる |
| ジョブの状態 | `pending` を持たず `running` から始める | `pending` は `started_at` が NULL で失効判定できず、孤児になると出口が無い |
| 孤児ジョブ | 自動失効させず、閾値超過時に人の明示操作で失効させる。`after()` 側は条件付き書き込みで失効を自己検知する | 自動で倒すと実行中の処理と矛盾する。一方で出口が無いと詰む。強制失効はプロセスを止めないため自己検知が要る |
| 失効閾値 | OpenAI クライアントにタイムアウトを設定してから、その上界から導く | SDK 既定は10分×2リトライで、正常実行が平然と15分を超える |
| 日本アカデミー賞 | 選択肢に出さない | `AWARDS_EXCLUDED` の意図を維持 |
| cron の `?year=` | 残す | 画面が使えない状況での逃げ道 |
| 取得ロジックのスコープ | 共通パーサでカンヌ・GGの2賞のみ | アカデミー賞の動いている経路を置き換えるリスクを取らない |
| カンヌの素テキスト問題 | 事実を記録し、②着手時に設計する | ①のスコープを広げない |
| E2E | 外部APIをモックし、画面側を検証する | CI に `OPENAI_API_KEY` が無く、実通信では実行できない |
| `FAIL_CLOSED_ACTIONS` | 入れない | 認証系ではない。DB不調時に復旧手段を塞ぐ不利益のほうが大きい |

---

## 9. 実装の分割

`admin-account-design.md` の §6 に倣い、1関心事ずつに割る。各PRの完了条件を満たしてから次へ進む。

| # | 範囲 | 完了条件 | ビジュアル証跡 |
| --- | --- | --- | --- |
| 1 | マイグレーション2本（`award_sync_jobs` / `chk_action_type`）+ `RATE_LIMIT_ACTION` 追加 + 型再生成 | `db push` が通り、型が生成され、インデックスが2件目を拒否する | 対象外 |
| 2 | `syncSingleAward` 抽出 + dedup 共有 + OpenAI タイムアウト設定 | 既存 `syncAwardMoviesService.test.ts` 16ケースが無改修で通る | 対象外 |
| 3 | API 2本 + zod + ジョブCRUD + `manualAwardSync` | route/サービスの単体テストが通り、409・自己検知・UPSERT失敗時の非DELETEを検証済み | 対象外 |
| 4 | 画面 + hook + E2E | 画面・hookのテストとE2Eが通る | **対象** |

**ビジュアル証跡**（`.claude/rules/visual-evidence.md`）: `/admin/awards` は新規画面なので PR 4 が対象。ただし Before が存在しないため、**After のスクリーンショットと動作動画**（年+賞選択 → 実行 → 進捗 → 完了、409、強制失効）を `gh-image` で user-attachments にアップして PR 本文に貼る。リポにはコミットしない（一時ファイルは `docs/tmp/`）。PR 1〜3 は UI 変化が無いので対象外。

E2E のシナリオ結果スクショは別運用で、`docs/e2e-screenshots/` に**コミット**し、コミットSHA固定の permalink で埋め込む。

**Issue とロードマップ**: 受賞作品機能は `.claude/documents/roadmap/phase12-future.md` が `#237` → `#276〜#281` の親子構造で管理している。本機能も同じ階層に Issue 番号付きで追加し、各PRの本文に `Closes #xxx` を書く。

---

## 10. 実装前に決めること

設計として方向は決まっているが、値や細部は実装時に確定させる。

1. **`AWARD_SYNC_STALE_MINUTES` の具体値**（4-8 の上界から導く）と、OpenAI の `timeout` / `maxRetries` の値
2. **`RATE_LIMIT_CONFIG.ADMIN_AWARD_SYNC` の `maxAttempts` / `windowMinutes`**、およびポーリング GET のレート制限方針と間隔
3. **`requested_by` の `ON DELETE`**（RESTRICT か CASCADE か）
4. **`award_sync_jobs` の保持期間**（終端ジョブを溜め続けるか、古い行を落とすか）
5. **`/api/awards` のキャッシュ対策**（画面に注意書きを出すか、検証リンクにキャッシュバスターを付けるか）
6. **洗い替えの対象範囲**（賞・年単位で揃える。`AWARD_DEFINITIONS` から部門を外した場合、旧部門の行は賞・年単位でしか消えない）
7. **年の入力範囲の絞り方** — `AWARD_YEAR_RANGE`（1900〜2100）は表示用の範囲。記事が無ければ OpenAI 到達前に `[]` が返るので暴発はしないが、記事が存在する年なら無駄に全部門ぶん課金する。賞ごとの `firstEditionYear` 〜 当年+1 に絞るか
8. **進捗の粒度** — 5-1 のカラムは `status` しか持たないため「8部門中3部門完了」は出せない。status だけで足りるか
