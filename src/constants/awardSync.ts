/**
 * 受賞作品の手動同期（管理画面）の定数
 *
 * 設計: `.claude/documents/admin-award-sync-design.md`
 */

import { AWARD_DEFINITIONS, AWARDS_EXCLUDED, type AwardName } from './awards';

/** 手動同期できる賞（cron 対象外の賞を除く） */
export type SyncableAwardName = Exclude<
  AwardName,
  (typeof AWARDS_EXCLUDED)[number]
>;

/**
 * 手動同期できる賞の一覧
 *
 * モジュールスコープで1度だけ作る。画面側で毎レンダー再計算しないため。
 * `AWARD_DEFINITIONS` / `AWARDS_EXCLUDED` を単一ソースにしているので、
 * 賞を増やすときは定数を足すだけで選択肢に反映される。
 */
export const SYNCABLE_AWARD_NAMES = (
  Object.keys(AWARD_DEFINITIONS) as AwardName[]
).filter(
  (name): name is SyncableAwardName =>
    !(AWARDS_EXCLUDED as readonly string[]).includes(name),
);

/** セレクトの選択肢 */
export const SYNCABLE_AWARD_OPTIONS = SYNCABLE_AWARD_NAMES.map((name) => ({
  value: name,
  label: AWARD_DEFINITIONS[name].label,
}));

/**
 * 賞ごとに取得できる最も古い年（授賞式の年）
 *
 * `AWARD_YEAR_RANGE`（1900〜2100）は表示用の範囲で、ここでは使わない。
 * 記事が存在しない年を指定すると OpenAI 到達前に空配列が返るため暴発は
 * しないが、記事がある年なら無駄に全部門ぶん課金してしまう。
 *
 * カンヌは `firstEditionYear` が 0（Wikipedia テンプレートが年ベースのため
 * 回数計算が不要）なので、第1回の開催年を明示する。
 */
export const AWARD_SYNC_MIN_YEAR: Record<SyncableAwardName, number> = {
  academy_awards: AWARD_DEFINITIONS.academy_awards.firstEditionYear,
  golden_globes: AWARD_DEFINITIONS.golden_globes.firstEditionYear,
  cannes: 1946,
};

/** ジョブの状態 */
export const AWARD_SYNC_STATUS = {
  RUNNING: 'running',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
} as const;

export type AwardSyncStatus =
  (typeof AWARD_SYNC_STATUS)[keyof typeof AWARD_SYNC_STATUS];

/**
 * 実行中ジョブを「停止した可能性あり」とみなすまでの分数
 *
 * 上界の導出: 最大部門数9（ゴールデングローブ） × AWARDS_MAX_RETRIES 3 ×
 * OPENAI_CONFIG.REQUEST_TIMEOUT_MS 45秒 = 1215秒 ≈ 20.25分。
 * マージンを足して25分。
 *
 * ⚠️ OPENAI_CONFIG.REQUEST_TIMEOUT_MS / MAX_RETRIES を変えたらこの値も
 *    見直すこと。SDK 既定（10分 × 2リトライ）に戻すと上界が54分になり、
 *    この閾値では正常に走っている処理を強制失効できてしまう。
 *    関係は awardSync.test.ts が検証している。
 */
export const AWARD_SYNC_STALE_MINUTES = 25;

/**
 * 進捗ポーリングの間隔（ミリ秒）
 *
 * AWARD_SYNC_STALE_MINUTES の間回すと300回。
 * RATE_LIMIT_CONFIG.ADMIN_AWARD_SYNC_STATUS（600回/30分）の半分に収まる。
 */
export const AWARD_SYNC_POLL_INTERVAL_MS = 5_000;

/** ポーリングを打ち切るまでの連続失敗回数 */
export const AWARD_SYNC_MAX_POLL_FAILURES = 3;

/** 画面・APIのメッセージ */
export const AWARD_SYNC_MESSAGES = {
  PAGE_TITLE: '受賞作品の手動同期',
  INVALID_BODY: '同期の指定が正しくありません',
  ALREADY_RUNNING: '実行中の同期があります',
  NOT_FOUND: '指定された同期ジョブが見つかりません',
  START_ERROR: '同期の開始に失敗しました',
  FETCH_ERROR: '同期の状態取得に失敗しました',
  NO_ITEMS: '受賞作品を取得できませんでした（既存データは変更していません）',
  NO_TMDB_MATCH:
    'TMDbで該当する映画を特定できませんでした（既存データは変更していません）',
  WRITE_FAILED: 'データベースへの書き込みに失敗しました',
  SUPERSEDED: '強制失効により中断されました',
  STALE_HINT: '実行中の処理自体は止まりません（OpenAI の課金は続きます）',
} as const;
