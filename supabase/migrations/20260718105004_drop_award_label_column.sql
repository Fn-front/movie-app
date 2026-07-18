-- ============================================
-- award_movies.award_label カラムを廃止
-- ============================================
-- 部門ラベルは AWARD_DEFINITIONS（アプリ定数）を単一ソースとし、/api/awards は
-- そちらからラベルを取得している。DB の award_label は同期処理が AWARD_DEFINITIONS
-- の値を非正規化して複製・書き込むだけで、読み取り側は存在しなかった（書き込み専用の
-- dead column）。ラベルの二重管理を解消するため削除する。
-- 値は AWARD_DEFINITIONS から完全に再構築可能なため固有データの損失はない。

ALTER TABLE public.award_movies DROP COLUMN IF EXISTS award_label;
