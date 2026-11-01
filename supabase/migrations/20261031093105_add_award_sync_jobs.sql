-- ============================================
-- 受賞作品の手動同期ジョブ
-- ============================================
-- 管理画面から年と賞を指定して同期を実行するためのジョブ管理テーブル。
-- 設計: .claude/documents/admin-award-sync-design.md
--
-- カンヌ・ゴールデングローブは OpenAI を部門数ぶん呼ぶため分単位かかる。
-- HTTP レスポンスを待たせず、POST で行を作って after() で継続実行し、
-- 画面はこの行をポーリングして進捗を見る。
--
-- ⚠️ pending 状態を持たない。POST の INSERT 時点で running にする。
--    pending だと started_at が NULL で経過時間を判定できず、after() が
--    running への UPDATE に到達する前に落ちると失効させる手段が無くなる
--    （Next は after() の例外を握り潰すため、この経路は実在する）。
CREATE TABLE IF NOT EXISTS public.award_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  award_name VARCHAR(64) NOT NULL,
  award_year INTEGER NOT NULL,
  status VARCHAR(16) NOT NULL,
  -- 実行した admin。削除されても誰が流したかの記録は残す
  requested_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  -- 成功時のみ。UPSERT した行数
  total_upserted INTEGER,
  -- 失敗時のみ。取得0件の理由もここに入れる
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- INSERT 時に now() を入れる。失効判定の基準になるため NOT NULL
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  CONSTRAINT chk_award_sync_jobs_status
    CHECK (status IN ('running', 'succeeded', 'failed'))
);

COMMENT ON TABLE public.award_sync_jobs IS
  '受賞作品の手動同期ジョブ。pending は持たず running から始まる。';

-- ============================================
-- アクティブなジョブは全体で1件まで
-- ============================================
-- 定数式に対する一意制約。述語に合う行が同時に2つ存在できない。
--
-- 同一の賞・年だけを弾くのでは不足する。世代付き入れ替えが UPSERT と DELETE の
-- 2文に分かれるため、並走すると片方の DELETE が他方の UPSERT 結果を消す。
-- アプリ側の事前チェックは競合に負けるので DB 側に置く。
--
-- さらに賞・年をまたいで1件に絞るのは、年を1件ずつ投入する運用と、
-- 外部API負荷・dev サーバー負荷を検討対象から外すため。
--
-- ⚠️ これは手動ジョブ同士しか直列化しない。Vercel cron は本番で同じ DB を
--    触るため、cron の実行中にローカルで同じ賞・年を流すと競合しうる。
CREATE UNIQUE INDEX IF NOT EXISTS uq_award_sync_jobs_active
  ON public.award_sync_jobs ((true))
  WHERE status = 'running';

-- 履歴の新しい順に引くための索引
CREATE INDEX IF NOT EXISTS idx_award_sync_jobs_created
  ON public.award_sync_jobs (created_at DESC);

-- ============================================
-- 公開範囲
-- ============================================
-- RLS は有効にするが**ポリシーは置かない**。service_role は RLS をバイパスし、
-- anon / authenticated は GRANT が無いので到達しない。本アプリは NextAuth を
-- 使い Supabase Auth を使わないため auth.uid() が常に NULL であり、
-- auth.uid() ベースのポリシーを書いても意味のない行が残るだけになる
-- （根拠: 20261018053616_declare_table_grants.sql）。
ALTER TABLE public.award_sync_jobs ENABLE ROW LEVEL SECURITY;

-- 既定権限は環境差で効かない場合があり意図も読み取れないため、明示的に剥奪する
REVOKE ALL ON public.award_sync_jobs FROM anon, authenticated;

-- サーバー側（API Route）からのみ触る。
-- DELETE は付けない（ジョブ履歴を消さない方針）。
GRANT SELECT, INSERT, UPDATE ON public.award_sync_jobs TO service_role;
